import { EventEmitter } from 'events'
import { ApiPromise, WsProvider, Keyring } from '@polkadot/api'
import { KeyringPair } from '@polkadot/keyring/types'
import { ContractPromise } from '@polkadot/api-contract'
import { 
  JsonRpcProvider, 
  BrowserProvider, 
  Wallet, 
  parseEther, 
  formatEther,
  Signer 
} from 'ethers'
import { createHash, randomBytes } from 'crypto'
import Sdk from '@1inch/cross-chain-sdk'
import { uint8ArrayToHex, hexToUint8Array } from '@1inch/byte-utils'

// Enhanced wallet types
export type EthereumWalletType = 'metamask' | 'walletconnect' | 'private-key' | 'injected'
export type PolkadotWalletType = 'polkadot-js' | 'talisman' | 'subwallet' | 'mnemonic' | 'injected'

export interface WalletConfig {
  ethereum: {
    type: EthereumWalletType
    rpcUrl: string
    privateKey?: string // Only for 'private-key' type
    chainId: number
    fusionFactoryAddress: string
    resolverAddress: string
  }
  polkadot: {
    type: PolkadotWalletType
    wsUrl: string
    mnemonic?: string // Only for 'mnemonic' type
    escrowContractAddress: string
    resolverContractAddress: string
  }
  relayer: {
    safetyDeposit: bigint
    privateWithdrawalDelay: number
    publicWithdrawalDelay: number
    cancellationDelay: number
    confirmations: number
  }
}

// Wallet connection interfaces
export interface EthereumWallet {
  signer: Signer
  address: string
  provider: JsonRpcProvider | BrowserProvider
  disconnect?: () => Promise<void>
}

export interface PolkadotWallet {
  account: KeyringPair
  address: string
  api: ApiPromise
  disconnect?: () => Promise<void>
}

// Rest of the existing interfaces remain the same...
export interface SwapOrder {
  orderHash: string
  direction: 'EthereumToPolkadot' | 'PolkadotToEthereum'
  maker: string
  srcToken: string
  dstToken: string
  srcAmount: bigint
  dstAmount: bigint
  deadline: number
  status: 'pending' | 'locked' | 'executed' | 'cancelled'
  secret?: string
  hashLock?: string
  ethereumEscrow?: string
  polkadotEscrow?: string
  createdAt: number
}

export interface EscrowInfo {
  orderHash: string
  escrowAddress: string
  hashLock: string
  amount: bigint
  deployed: boolean
  deployedAt?: number
}

export class FusionPolkadotRelayer extends EventEmitter {
  private ethWallet?: EthereumWallet
  private polkadotWallet?: PolkadotWallet
  
  private orders = new Map<string, SwapOrder>()
  private secrets = new Map<string, string>()
  private ethereumEscrows = new Map<string, EscrowInfo>()
  private polkadotEscrows = new Map<string, EscrowInfo>()
  
  private isRunning = false
  
  constructor(private config: WalletConfig) {
    super()
    this.setupEventListeners()
  }

  // === Wallet Connection Methods ===

  async connectEthereumWallet(): Promise<EthereumWallet> {
    console.log(`🔗 Connecting to Ethereum wallet: ${this.config.ethereum.type}`)
    
    switch (this.config.ethereum.type) {
      case 'metamask':
        return await this.connectMetaMask()
      
      case 'walletconnect':
        return await this.connectWalletConnect()
      
      case 'private-key':
        return await this.connectEthereumPrivateKey()
      
      case 'injected':
        return await this.connectInjectedEthereum()
      
      default:
        throw new Error(`Unsupported Ethereum wallet type: ${this.config.ethereum.type}`)
    }
  }

  async connectPolkadotWallet(): Promise<PolkadotWallet> {
    console.log(`🔗 Connecting to Polkadot wallet: ${this.config.polkadot.type}`)
    
    switch (this.config.polkadot.type) {
      case 'polkadot-js':
        return await this.connectPolkadotJS()
      
      case 'talisman':
        return await this.connectTalisman()
      
      case 'subwallet':
        return await this.connectSubWallet()
      
      case 'mnemonic':
        return await this.connectPolkadotMnemonic()
      
      case 'injected':
        return await this.connectInjectedPolkadot()
      
      default:
        throw new Error(`Unsupported Polkadot wallet type: ${this.config.polkadot.type}`)
    }
  }

  // === Ethereum Wallet Implementations ===

  private async connectMetaMask(): Promise<EthereumWallet> {
    if (typeof window === 'undefined' || !window.ethereum) {
      throw new Error('MetaMask not detected. Please install MetaMask.')
    }

    try {
      // Request account access
      await window.ethereum.request({ method: 'eth_requestAccounts' })
      
      // Create provider and signer
      const provider = new BrowserProvider(window.ethereum)
      const signer = await provider.getSigner()
      const address = await signer.getAddress()
      
      // Switch to correct network if needed
      await this.switchEthereumNetwork(window.ethereum)
      
      console.log(`✅ MetaMask connected: ${address}`)
      
      return {
        signer,
        address,
        provider,
        disconnect: async () => {
          // MetaMask doesn't have a programmatic disconnect
          console.log('MetaMask disconnection requested by user')
        }
      }
    } catch (error) {
      throw new Error(`Failed to connect MetaMask: ${error}`)
    }
  }

  private async connectWalletConnect(): Promise<EthereumWallet> {
    // Note: You'll need to install @walletconnect/ethereum-provider
    // npm install @walletconnect/ethereum-provider
    
    try {
      const { EthereumProvider } = await import('@walletconnect/ethereum-provider')
      
      const provider = await EthereumProvider.init({
        chains: [this.config.ethereum.chainId],
        showQrModal: true,
        projectId: process.env.WALLETCONNECT_PROJECT_ID || 'your-project-id',
        rpcMap: {
          [this.config.ethereum.chainId]: this.config.ethereum.rpcUrl
        }
      })

      await provider.connect()
      
      const ethersProvider = new BrowserProvider(provider)
      const signer = await ethersProvider.getSigner()
      const address = await signer.getAddress()
      
      console.log(`✅ WalletConnect connected: ${address}`)
      
      return {
        signer,
        address,
        provider: ethersProvider,
        disconnect: async () => {
          await provider.disconnect()
        }
      }
    } catch (error) {
      throw new Error(`Failed to connect WalletConnect: ${error}`)
    }
  }

  private async connectEthereumPrivateKey(): Promise<EthereumWallet> {
    if (!this.config.ethereum.privateKey) {
      throw new Error('Private key not provided in config')
    }
    
    const provider = new JsonRpcProvider(this.config.ethereum.rpcUrl)
    const signer = new Wallet(this.config.ethereum.privateKey, provider)
    const address = await signer.getAddress()
    
    console.log(`✅ Ethereum private key wallet connected: ${address}`)
    
    return {
      signer,
      address,
      provider
    }
  }

  private async connectInjectedEthereum(): Promise<EthereumWallet> {
    if (typeof window === 'undefined' || !window.ethereum) {
      throw new Error('No injected Ethereum provider found')
    }

    const provider = new BrowserProvider(window.ethereum)
    const signer = await provider.getSigner()
    const address = await signer.getAddress()
    
    console.log(`✅ Injected Ethereum wallet connected: ${address}`)
    
    return {
      signer,
      address,
      provider
    }
  }

  // === Polkadot Wallet Implementations ===

  private async connectPolkadotJS(): Promise<PolkadotWallet> {
    if (typeof window === 'undefined') {
      throw new Error('Polkadot.js extension only works in browser environment')
    }

    try {
      // Wait for extension to be ready
      const { web3Accounts, web3Enable, web3FromAddress } = await import('@polkadot/extension-dapp')
      
      // Enable the extension
      const extensions = await web3Enable('Fusion Polkadot Relayer')
      if (extensions.length === 0) {
        throw new Error('No Polkadot.js extension found')
      }

      // Get accounts
      const accounts = await web3Accounts()
      if (accounts.length === 0) {
        throw new Error('No accounts found in Polkadot.js extension')
      }

      // Use first account (or let user choose)
      const account = accounts[0]
      const injector = await web3FromAddress(account.address)
      
      // Connect to Polkadot API
      const wsProvider = new WsProvider(this.config.polkadot.wsUrl)
      const api = await ApiPromise.create({ 
        provider: wsProvider,
        signer: injector.signer
      })

      console.log(`✅ Polkadot.js connected: ${account.address}`)
      
      return {
        account: account as any, // Type assertion for compatibility
        address: account.address,
        api,
        disconnect: async () => {
          await api.disconnect()
        }
      }
    } catch (error) {
      throw new Error(`Failed to connect Polkadot.js: ${error}`)
    }
  }

  private async connectTalisman(): Promise<PolkadotWallet> {
    if (typeof window === 'undefined' || !window.talismanEth) {
      throw new Error('Talisman wallet not detected')
    }

    try {
      // Similar to Polkadot.js but using Talisman's interface
      const { web3Accounts, web3Enable } = await import('@polkadot/extension-dapp')
      
      await web3Enable('Fusion Polkadot Relayer')
      const accounts = await web3Accounts()
      
      const talismanAccounts = accounts.filter(account => 
        account.meta.source === 'talisman'
      )
      
      if (talismanAccounts.length === 0) {
        throw new Error('No Talisman accounts found')
      }

      const account = talismanAccounts[0]
      const wsProvider = new WsProvider(this.config.polkadot.wsUrl)
      const api = await ApiPromise.create({ provider: wsProvider })

      console.log(`✅ Talisman connected: ${account.address}`)
      
      return {
        account: account as any,
        address: account.address,
        api,
        disconnect: async () => {
          await api.disconnect()
        }
      }
    } catch (error) {
      throw new Error(`Failed to connect Talisman: ${error}`)
    }
  }

  private async connectSubWallet(): Promise<PolkadotWallet> {
    // Similar implementation to Talisman but for SubWallet
    if (typeof window === 'undefined') {
      throw new Error('SubWallet only works in browser environment')
    }

    try {
      const { web3Accounts, web3Enable } = await import('@polkadot/extension-dapp')
      
      await web3Enable('Fusion Polkadot Relayer')
      const accounts = await web3Accounts()
      
      const subwalletAccounts = accounts.filter(account => 
        account.meta.source === 'subwallet-js'
      )
      
      if (subwalletAccounts.length === 0) {
        throw new Error('No SubWallet accounts found')
      }

      const account = subwalletAccounts[0]
      const wsProvider = new WsProvider(this.config.polkadot.wsUrl)
      const api = await ApiPromise.create({ provider: wsProvider })

      console.log(`✅ SubWallet connected: ${account.address}`)
      
      return {
        account: account as any,
        address: account.address,
        api,
        disconnect: async () => {
          await api.disconnect()
        }
      }
    } catch (error) {
      throw new Error(`Failed to connect SubWallet: ${error}`)
    }
  }

  private async connectPolkadotMnemonic(): Promise<PolkadotWallet> {
    if (!this.config.polkadot.mnemonic) {
      throw new Error('Mnemonic not provided in config')
    }
    
    const wsProvider = new WsProvider(this.config.polkadot.wsUrl)
    const api = await ApiPromise.create({ provider: wsProvider })
    
    const keyring = new Keyring({ type: 'sr25519' })
    const account = keyring.addFromMnemonic(this.config.polkadot.mnemonic)
    
    console.log(`✅ Polkadot mnemonic wallet connected: ${account.address}`)
    
    return {
      account,
      address: account.address,
      api,
      disconnect: async () => {
        await api.disconnect()
      }
    }
  }

  private async connectInjectedPolkadot(): Promise<PolkadotWallet> {
    // Generic injected wallet connection
    try {
      const { web3Accounts, web3Enable } = await import('@polkadot/extension-dapp')
      
      await web3Enable('Fusion Polkadot Relayer')
      const accounts = await web3Accounts()
      
      if (accounts.length === 0) {
        throw new Error('No injected Polkadot accounts found')
      }

      const account = accounts[0]
      const wsProvider = new WsProvider(this.config.polkadot.wsUrl)
      const api = await ApiPromise.create({ provider: wsProvider })

      console.log(`✅ Injected Polkadot wallet connected: ${account.address}`)
      
      return {
        account: account as any,
        address: account.address,
        api,
        disconnect: async () => {
          await api.disconnect()
        }
      }
    } catch (error) {
      throw new Error(`Failed to connect injected Polkadot wallet: ${error}`)
    }
  }

  // === Helper Methods ===

  private async switchEthereumNetwork(ethereum: any): Promise<void> {
    const chainId = `0x${this.config.ethereum.chainId.toString(16)}`
    
    try {
      await ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId }],
      })
    } catch (switchError: any) {
      // Chain not added to wallet
      if (switchError.code === 4902) {
        try {
          await ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId,
              chainName: `Chain ${this.config.ethereum.chainId}`,
              rpcUrls: [this.config.ethereum.rpcUrl],
            }],
          })
        } catch (addError) {
          throw new Error(`Failed to add network: ${addError}`)
        }
      } else {
        throw new Error(`Failed to switch network: ${switchError}`)
      }
    }
  }

  // === Modified Initialize Method ===

  async initialize(): Promise<void> {
    console.log('🚀 Initializing Enhanced Fusion+ Polkadot Relayer...')
    
    // Connect wallets
    this.ethWallet = await this.connectEthereumWallet()
    this.polkadotWallet = await this.connectPolkadotWallet()
    
    // Load contract metadata
    const escrowMetadata = await import('../../polkadot_contracts/fusion_polkadot_escrow/target/ink/fusion_polkadot_escrow.json')
    const resolverMetadata = await import('../../polkadot_contracts/polkadot_resolver/target/ink/polkadot_resolver.json')
    
    // Initialize contracts (using the connected wallet's API)
    const escrowContract = new ContractPromise(
      this.polkadotWallet.api,
      escrowMetadata,
      this.config.polkadot.escrowContractAddress
    )
    
    const resolverContract = new ContractPromise(
      this.polkadotWallet.api,
      resolverMetadata,
      this.config.polkadot.resolverContractAddress
    )
    
    console.log('✅ Enhanced relayer initialized successfully')
    console.log(`📍 Ethereum address: ${this.ethWallet.address}`)
    console.log(`📍 Polkadot address: ${this.polkadotWallet.address}`)
  }

  // === Disconnect Methods ===

  async disconnect(): Promise<void> {
    console.log('🔌 Disconnecting wallets...')
    
    if (this.ethWallet?.disconnect) {
      await this.ethWallet.disconnect()
    }
    
    if (this.polkadotWallet?.disconnect) {
      await this.polkadotWallet.disconnect()
    }
    
    this.ethWallet = undefined
    this.polkadotWallet = undefined
    
    console.log('✅ Wallets disconnected')
  }

  // === Wallet Status ===

  isWalletConnected(): { ethereum: boolean; polkadot: boolean } {
    return {
      ethereum: !!this.ethWallet,
      polkadot: !!this.polkadotWallet
    }
  }

  getConnectedAddresses(): { ethereum?: string; polkadot?: string } {
    return {
      ethereum: this.ethWallet?.address,
      polkadot: this.polkadotWallet?.address
    }
  }

  // === Modified Transaction Methods ===

  private async sendEthereumTransaction(params: any): Promise<any> {
    if (!this.ethWallet) {
      throw new Error('Ethereum wallet not connected')
    }
    
    return await this.ethWallet.signer.sendTransaction(params)
  }

  private async signAndSendPolkadot(tx: any): Promise<void> {
    if (!this.polkadotWallet) {
      throw new Error('Polkadot wallet not connected')
    }
    
    return new Promise((resolve, reject) => {
      tx.signAndSend(this.polkadotWallet!.account, (result: any) => {
        if (result.status.isInBlock) {
          resolve()
        } else if (result.isError) {
          reject(new Error('Transaction failed'))
        }
      })
    })
  }

  // Rest of the original methods would be updated to use this.ethWallet and this.polkadotWallet
  // instead of the old this.ethWallet and this.polkadotAccount...

  private setupEventListeners(): void {
    this.on('orderCreated', (order) => {
      console.log(`📝 Order created event: ${order.orderHash}`)
    })
    
    this.on('escrowsDeployed', (order) => {
      console.log(`🏗️ Escrows deployed event: ${order.orderHash}`)
    })
    
    this.on('swapExecuted', (order) => {
      console.log(`⚡ Swap executed event: ${order.orderHash}`)
    })
  }
}