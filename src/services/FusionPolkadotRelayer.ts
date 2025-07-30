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
  Signer,
  Contract,
  formatUnits
} from 'ethers'
import { createHash, randomBytes } from 'crypto'

// Enhanced wallet types
export type EthereumWalletType = 'metamask' | 'walletconnect' | 'private-key' | 'injected'
export type PolkadotWalletType = 'polkadot-js' | 'talisman' | 'subwallet' | 'mnemonic' | 'injected'

export interface RelayerConfig {
  safetyDeposit: bigint
  privateWithdrawalDelay: number
  publicWithdrawalDelay: number
  cancellationDelay: number
  confirmations: number
}

export interface WalletConfig {
  ethereum: {
    type: EthereumWalletType
    rpcUrl: string
    privateKey?: string
    chainId: number
    fusionFactoryAddress: string
    resolverAddress: string
  }
  polkadot: {
    type: PolkadotWalletType
    wsUrl: string
    mnemonic?: string
    escrowContractAddress: string
    resolverContractAddress: string
  }
  relayer: RelayerConfig
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

export interface CreateOrderParams {
  direction: 'EthereumToPolkadot' | 'PolkadotToEthereum'
  maker: string
  srcToken: string
  dstToken: string
  srcAmount: bigint
  dstAmount: bigint
  deadline: number
}

export interface EscrowInfo {
  orderHash: string
  escrowAddress: string
  hashLock: string
  amount: bigint
  deployed: boolean
  deployedAt?: number
}

export interface ChainBalances {
  native: string
  tokens: Record<string, string>
}

export interface RelayerBalances {
  ethereum: ChainBalances
  polkadot: ChainBalances
}

// Helper function to check if we're in a browser environment
const isBrowser = (): boolean => {
  return typeof globalThis !== 'undefined' && 
         typeof (globalThis as any).window !== 'undefined'
}

// Helper function to get ethereum provider safely
const getEthereumProvider = (): any => {
  if (!isBrowser()) {
    return null
  }
  return (globalThis as any).window?.ethereum
}

export class FusionPolkadotRelayer extends EventEmitter {
  private ethWallet?: EthereumWallet
  private polkadotWallet?: PolkadotWallet
  
  private orders = new Map<string, SwapOrder>()
  private secrets = new Map<string, string>()
  private ethereumEscrows = new Map<string, EscrowInfo>()
  private polkadotEscrows = new Map<string, EscrowInfo>()
  
  private isRunning = false
  private intervalId?: NodeJS.Timeout
  
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
    const ethereum = getEthereumProvider()
    
    if (!ethereum) {
      throw new Error('MetaMask not detected. Please install MetaMask or run in browser environment.')
    }

    try {
      await ethereum.request({ method: 'eth_requestAccounts' })
      
      const provider = new BrowserProvider(ethereum)
      const signer = await provider.getSigner()
      const address = await signer.getAddress()
      
      await this.switchEthereumNetwork(ethereum)
      
      console.log(`✅ MetaMask connected: ${address}`)
      
      return {
        signer,
        address,
        provider,
        disconnect: async () => {
          console.log('MetaMask disconnection requested by user')
        }
      }
    } catch (error) {
      throw new Error(`Failed to connect MetaMask: ${error}`)
    }
  }

  private async connectWalletConnect(): Promise<EthereumWallet> {
    try {
      // Note: This is a simplified implementation
      // In a real app, you'd use @walletconnect/ethereum-provider
      throw new Error('WalletConnect implementation requires additional dependencies')
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
    const ethereum = getEthereumProvider()
    
    if (!ethereum) {
      throw new Error('No injected Ethereum provider found. Please run in browser environment.')
    }

    const provider = new BrowserProvider(ethereum)
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
    if (!isBrowser()) {
      throw new Error('Polkadot.js extension only works in browser environment')
    }

    try {
      // This would require @polkadot/extension-dapp in a real implementation
      throw new Error('Polkadot.js extension requires browser environment and additional dependencies')
    } catch (error) {
      throw new Error(`Failed to connect Polkadot.js: ${error}`)
    }
  }

  private async connectTalisman(): Promise<PolkadotWallet> {
    if (!isBrowser()) {
      throw new Error('Talisman connection requires browser environment')
    }
    throw new Error('Talisman connection requires browser environment and additional setup')
  }

  private async connectSubWallet(): Promise<PolkadotWallet> {
    if (!isBrowser()) {
      throw new Error('SubWallet connection requires browser environment')
    }
    throw new Error('SubWallet connection requires browser environment and additional setup')
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
    if (!isBrowser()) {
      throw new Error('Injected Polkadot wallet requires browser environment')
    }
    throw new Error('Injected Polkadot wallet requires browser environment and additional setup')
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

  // === Main Initialization ===

  async initialize(): Promise<void> {
    console.log('🚀 Initializing Enhanced Fusion+ Polkadot Relayer...')
    
    // Connect wallets
    this.ethWallet = await this.connectEthereumWallet()
    this.polkadotWallet = await this.connectPolkadotWallet()
    
    console.log('✅ Enhanced relayer initialized successfully')
    console.log(`📍 Ethereum address: ${this.ethWallet.address}`)
    console.log(`📍 Polkadot address: ${this.polkadotWallet.address}`)
  }

  // === Service Methods ===

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('⚠️ Relayer is already running')
      return
    }

    console.log('🚀 Starting relayer service...')
    this.isRunning = true

    // Start monitoring loop
    this.intervalId = setInterval(async () => {
      await this.monitorOrders()
    }, 10000) // Check every 10 seconds

    this.emit('started')
    console.log('✅ Relayer service started')
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      console.log('⚠️ Relayer is not running')
      return
    }

    console.log('🛑 Stopping relayer service...')
    this.isRunning = false

    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = undefined
    }

    this.emit('stopped')
    console.log('✅ Relayer service stopped')
  }

  async createOrder(params: CreateOrderParams): Promise<string> {
    console.log('📝 Creating new order...')
    
    // Generate order hash
    const orderData = `${params.maker}-${params.srcToken}-${params.dstToken}-${params.srcAmount}-${params.dstAmount}-${params.deadline}`
    const orderHash = createHash('sha256').update(orderData).digest('hex')
    
    // Generate secret and hash lock
    const secret = randomBytes(32).toString('hex')
    const hashLock = createHash('sha256').update(Buffer.from(secret, 'hex')).digest('hex')
    
    const order: SwapOrder = {
      orderHash,
      direction: params.direction,
      maker: params.maker,
      srcToken: params.srcToken,
      dstToken: params.dstToken,
      srcAmount: params.srcAmount,
      dstAmount: params.dstAmount,
      deadline: params.deadline,
      status: 'pending',
      secret,
      hashLock,
      createdAt: Date.now()
    }

    this.orders.set(orderHash, order)
    this.secrets.set(orderHash, secret)

    this.emit('orderCreated', order)
    console.log(`✅ Order created: ${orderHash}`)
    
    return orderHash
  }

  getOrder(orderHash: string): SwapOrder | undefined {
    return this.orders.get(orderHash)
  }

  getAllOrders(): SwapOrder[] {
    return Array.from(this.orders.values())
  }

  async getBalances(): Promise<RelayerBalances> {
    const balances: RelayerBalances = {
      ethereum: {
        native: '0',
        tokens: {}
      },
      polkadot: {
        native: '0',
        tokens: {}
      }
    }

    try {
      // Get Ethereum balances
      if (this.ethWallet) {
        const ethBalance = await this.ethWallet.provider.getBalance(this.ethWallet.address)
        balances.ethereum.native = formatEther(ethBalance)
      }

      // Get Polkadot balances
      if (this.polkadotWallet) {
        const { data: balance } = await this.polkadotWallet.api.query.system.account(this.polkadotWallet.address) as any
        const free = balance.free.toString()
        balances.polkadot.native = formatUnits(free, 10) // DOT has 10 decimals
      }
    } catch (error) {
      console.error('Error getting balances:', error)
    }

    return balances
  }

  async executeSwap(orderHash: string): Promise<void> {
    const order = this.orders.get(orderHash)
    if (!order) {
      throw new Error(`Order not found: ${orderHash}`)
    }

    console.log(`⚡ Executing swap for order: ${orderHash}`)
    
    // Implementation would depend on the specific swap logic
    // This is a placeholder
    order.status = 'executed'
    this.orders.set(orderHash, order)
    
    this.emit('swapExecuted', order)
    console.log(`✅ Swap executed: ${orderHash}`)
  }

  async deployEscrows(orderHash: string): Promise<void> {
    const order = this.orders.get(orderHash)
    if (!order) {
      throw new Error(`Order not found: ${orderHash}`)
    }

    console.log(`🏗️ Deploying escrows for order: ${orderHash}`)
    
    // This would deploy the actual escrow contracts
    // Placeholder implementation
    order.status = 'locked'
    this.orders.set(orderHash, order)
    
    this.emit('escrowsDeployed', order)
    console.log(`✅ Escrows deployed: ${orderHash}`)
  }

  // === Additional Helper Methods ===

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

  private async monitorOrders(): Promise<void> {
    // Monitor active orders and handle state transitions
    for (const [orderHash, order] of this.orders.entries()) {
      if (order.status === 'pending') {
        // Check if order needs to be processed
        console.log(`🔍 Monitoring order: ${orderHash}`)
      }
    }
  }

  private setupEventListeners(): Promise<void> {
    this.on('orderCreated', (order) => {
      console.log(`📝 Order created event: ${order.orderHash}`)
    })
    
    this.on('escrowsDeployed', (order) => {
      console.log(`🏗️ Escrows deployed event: ${order.orderHash}`)
    })
    
    this.on('swapExecuted', (order) => {
      console.log(`⚡ Swap executed event: ${order.orderHash}`)
    })

    return Promise.resolve()
  }
}