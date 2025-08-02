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
  formatUnits,
  parseUnits,
  MaxUint256,
  Interface
} from 'ethers'
import { createHash, randomBytes } from 'crypto'
import Sdk from '@1inch/cross-chain-sdk'
import { CrossChainOrder, HashLock, Address, TimeLocks, AuctionDetails, randBigInt } from '@1inch/cross-chain-sdk'
import { uint8ArrayToHex, UINT_40_MAX } from '@1inch/byte-utils'

import ERC20_ABI from '../abi/ERC20.sol/ERC20.json'
import ESCROW_FACTORY_ABI from '../abi/TestEscrowFactory.sol/TestEscrowFactory.json'
import ESCROW_ABI from '../abi/EscrowSrc.sol/EscrowSrc.json'
import RESOLVER_ABI from '../abi/Resolver.sol/Resolver.json'
import POLKADOT_ESCROW_METADATA from '../abi/fusion_polkadot_escrow.json'
import POLKADOT_RESOLVER_METADATA from '../abi/polkadot_resolver.json'

// Add type declarations for window.ethereum
declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: any[] }) => Promise<any>;
      isMetaMask?: boolean;
      isConnected?: () => boolean;
    };
  }
}

// Enhanced wallet config
export interface EthereumWalletConfig {
  type: 'metamask' | 'walletconnect' | 'private-key' | 'injected'
  rpcUrl: string
  privateKey?: string
  chainId: number
  escrowFactoryAddress: string
  resolverAddress: string
  limitOrderProtocolAddress: string
}

export interface PolkadotWalletConfig {
  type: 'polkadot-js' | 'talisman' | 'subwallet' | 'mnemonic' | 'injected'
  wsUrl: string
  mnemonic?: string
  escrowContractAddress: string
  resolverContractAddress: string
  parachainId?: number
}

export interface EnhancedWalletConfig {
  ethereum: EthereumWalletConfig
  polkadot: PolkadotWalletConfig
  relayer: {
    safetyDeposit: bigint
    privateWithdrawalDelay: number
    publicWithdrawalDelay: number
    cancellationDelay: number
    confirmations: number
  }
}

// Cross-chain order parameters
export interface CrossChainOrderParams {
  direction: 'EthereumToPolkadot' | 'PolkadotToEthereum'
  salt: bigint
  maker: string
  makingAmount: bigint
  takingAmount: bigint
  makerAsset: string
  takerAsset: string
  hashLock?: string
  allowPartialFills?: boolean
  allowMultipleFills?: boolean
  auction?: {
    initialRateBump: number
    duration: bigint
    startTime: bigint
    points?: Array<{ coefficient: number; delay: number }>
  }
  whitelist?: Array<{
    address: string
    allowFrom: bigint
  }>
  timeLocks?: {
    srcWithdrawal: bigint
    srcPublicWithdrawal: bigint
    srcCancellation: bigint
    srcPublicCancellation: bigint
    dstWithdrawal: bigint
    dstPublicWithdrawal: bigint
    dstCancellation: bigint
  }
}

// Enhanced swap order
export interface EnhancedSwapOrder {
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
  executedAt?: number
  crossChainOrder?: any
  signature?: string
  srcChainId: number
  dstChainId: number
  deployBlockHash?: string
  srcEscrowEvent?: [any, any]
  polkadotEscrowTx?: string
  immutables?: any
}


export class NewFusionPolkadotRelayer extends EventEmitter {
  private ethWallet?: {
    signer: Signer
    address: string
    provider: JsonRpcProvider | BrowserProvider
  }
  private polkadotWallet?: {
    account: KeyringPair
    address: string
    api: ApiPromise
  }
  
  // Contract instances
  private escrowFactory?: any
  private ethereumResolver?: Contract
  private polkadotEscrowContract?: ContractPromise
  private polkadotResolverContract?: ContractPromise
  
  private orders = new Map<string, EnhancedSwapOrder>()
  private secrets = new Map<string, string>()
  
  private isRunning = false
  private intervalId?: NodeJS.Timeout

  constructor(private config: EnhancedWalletConfig) {
    super()
  }

  // === Initialization ===
  
  async initialize(): Promise<void> {
    console.log('🚀 Initializing Integrated Fusion+ Polkadot Relayer...')
    
    await this.connectEthereumWallet()
    await this.connectPolkadotWallet()
    await this.initializeContracts()
    
    console.log('✅ Relayer initialized successfully')
    console.log(`📍 Ethereum address: ${this.ethWallet?.address}`)
    console.log(`📍 Polkadot address: ${this.polkadotWallet?.address}`)
  }

  private async connectEthereumWallet(): Promise<void> {
    console.log(`🔗 Connecting to Ethereum wallet: ${this.config.ethereum.type}`)
    
    let provider: JsonRpcProvider | BrowserProvider
    let signer: Signer

    switch (this.config.ethereum.type) {
      case 'private-key':
        if (!this.config.ethereum.privateKey) {
          throw new Error('Private key not provided')
        }
        provider = new JsonRpcProvider(this.config.ethereum.rpcUrl)
        signer = new Wallet(this.config.ethereum.privateKey, provider)
        break
        
      case 'metamask':
        if (typeof window === 'undefined' || !window.ethereum) {
          throw new Error('MetaMask not available')
        }
        await window.ethereum.request({ method: 'eth_requestAccounts' })
        provider = new BrowserProvider(window.ethereum)
        signer = await provider.getSigner()
        break
        
      default:
        throw new Error(`Unsupported Ethereum wallet type: ${this.config.ethereum.type}`)
    }

    const address = await signer.getAddress()
    this.ethWallet = { signer, address, provider }
    
    console.log(`✅ Ethereum wallet connected: ${address}`)
  }

  private async connectPolkadotWallet(): Promise<void> {
    console.log(`🔗 Connecting to Polkadot wallet: ${this.config.polkadot.type}`)
    
    const wsProvider = new WsProvider(this.config.polkadot.wsUrl)
    const api = await ApiPromise.create({ provider: wsProvider })
    
    let account: KeyringPair

    switch (this.config.polkadot.type) {
      case 'mnemonic':
        if (!this.config.polkadot.mnemonic) {
          throw new Error('Mnemonic not provided')
        }
        const keyring = new Keyring({ type: 'sr25519' })
        account = keyring.addFromMnemonic(this.config.polkadot.mnemonic)
        break
        
      default:
        throw new Error(`Unsupported Polkadot wallet type: ${this.config.polkadot.type}`)
    }

    this.polkadotWallet = { account, address: account.address, api }
    console.log(`✅ Polkadot wallet connected: ${account.address}`)
  }

  private async initializeContracts(): Promise<void> {
    console.log('🏗️ Initializing contract instances...')
    
    if (!this.ethWallet || !this.polkadotWallet) {
      throw new Error('Wallets not connected')
    }

    // Initialize Ethereum contracts
    this.escrowFactory = new Contract(
      this.config.ethereum.escrowFactoryAddress,
      ESCROW_FACTORY_ABI.abi,
      this.ethWallet.signer
    )

    this.ethereumResolver = new Contract(
      this.config.ethereum.resolverAddress,
      RESOLVER_ABI.abi,
      this.ethWallet.signer
    )

    // Initialize Polkadot contracts
    this.polkadotEscrowContract = new ContractPromise(
      this.polkadotWallet.api,
      POLKADOT_ESCROW_METADATA,
      this.config.polkadot.escrowContractAddress
    )

    this.polkadotResolverContract = new ContractPromise(
      this.polkadotWallet.api,
      POLKADOT_RESOLVER_METADATA,
      this.config.polkadot.resolverContractAddress
    )

    console.log('✅ Contract instances initialized')
  }

  // === Cross-Chain Swap Implementation ===

  /**
   * Creates a cross-chain order and returns the order hash
   */
 /**
 * Fixed createCrossChainOrder method with proper whitelist handling
 */
 async createCrossChainOrder(params: CrossChainOrderParams): Promise<string> {
    console.log('📝 Creating CrossChain order...')
    
    if (!this.ethWallet || !this.polkadotWallet) {
      throw new Error('Wallets not connected')
    }
  
    // Generate secret and hashlock
    const secret = params.hashLock || uint8ArrayToHex(randomBytes(32))
    const hashLock = HashLock.forSingleFill(secret)
  
    try {
      const currentTimestamp = BigInt(Math.floor(Date.now() / 1000))
      
      // Ensure whitelist timestamps are valid and within reasonable bounds
      const whitelist = params.whitelist && params.whitelist.length > 0 
        ? params.whitelist.map((w, index) => {
            // Ensure allowFrom is not too far in the past or future
            let allowFrom = w.allowFrom
            
            // If allowFrom is 0 (genesis), keep it as is
            if (allowFrom === BigInt(0)) {
              allowFrom = BigInt(0)
            } else {
              // Ensure allowFrom is within 1 hour of current time (past or future)
              const maxDiff = BigInt(3600) // 1 hour in seconds
              const minAllowFrom = currentTimestamp - maxDiff
              const maxAllowFrom = currentTimestamp + maxDiff
              
              if (allowFrom < minAllowFrom) {
                allowFrom = currentTimestamp // Use current time if too far in past
              } else if (allowFrom > maxAllowFrom) {
                allowFrom = currentTimestamp + BigInt(60 * index) // Stagger by 1 minute per entry
              }
            }
            
            return {
              address: new Address(w.address),
              allowFrom: allowFrom
            }
          })
        : [
            {
              address: new Address(this.ethWallet.address), // Add relayer as default resolver
              allowFrom: BigInt(0) // Genesis time is always safe
            }
          ]
  
      // Ensure auction points have reasonable timing
      const auctionStartTime = params.auction?.startTime || currentTimestamp
      const auctionDuration = params.auction?.duration || BigInt(3600)
      
      // Create auction points with validated timing
      const auctionPoints = params.auction?.points || [
        { coefficient: 0, delay: 0 }, // Start immediately
        { coefficient: 25, delay: 15 }, // 25% premium after 15 seconds
        { coefficient: 50, delay: 30 }, // 50% premium after 30 seconds
        { coefficient: 100, delay: 60 } // 100% premium after 60 seconds
      ]
  
      // Validate that auction points don't exceed duration
      const validatedPoints = auctionPoints.map(point => ({
        coefficient: point.coefficient,
        delay: Math.min(point.delay, Number(auctionDuration))
      }))
  
      // Create TimeLocks with reasonable values
      const timeLocks = params.timeLocks || {
        srcWithdrawal: BigInt(10),
        srcPublicWithdrawal: BigInt(120),
        srcCancellation: BigInt(121),
        srcPublicCancellation: BigInt(122),
        dstWithdrawal: BigInt(10),
        dstPublicWithdrawal: BigInt(100),
        dstCancellation: BigInt(101)
      }
  
      console.log('🕐 Using timestamps:')
      console.log(`   Current: ${currentTimestamp}`)
      console.log(`   Auction start: ${auctionStartTime}`)
      console.log(`   Whitelist entries: ${whitelist.length}`)
      whitelist.forEach((w, i) => {
        console.log(`     ${i + 1}. ${w.address.toString()}: allowFrom=${w.allowFrom}`)
      })
  
      // Create 1inch CrossChainOrder with validated timestamps
      const crossChainOrder = CrossChainOrder.new(
        new Address(this.config.ethereum.escrowFactoryAddress),
        {
          salt: params.salt,
          maker: new Address(params.maker),
          makingAmount: params.makingAmount,
          takingAmount: params.takingAmount,
          makerAsset: new Address(params.makerAsset),
          takerAsset: new Address(params.takerAsset)
        },
        {
          hashLock,
          timeLocks: TimeLocks.new(timeLocks),
          srcChainId: this.config.ethereum.chainId,
          dstChainId: this.config.polkadot.parachainId || 1000,
          srcSafetyDeposit: this.config.relayer.safetyDeposit,
          dstSafetyDeposit: this.config.relayer.safetyDeposit
        },
        {
          auction: new AuctionDetails({
            initialRateBump: params.auction?.initialRateBump || 0,
            points: validatedPoints,
            duration: auctionDuration,
            startTime: auctionStartTime
          }),
          whitelist: whitelist,
          resolvingStartTime: BigInt(0)
        },
        {
          nonce: randBigInt(UINT_40_MAX),
          allowPartialFills: params.allowPartialFills || false,
          allowMultipleFills: params.allowMultipleFills || false
        }
      )
  
      const orderHash = crossChainOrder.getOrderHash(this.config.ethereum.chainId)
      
      // Create order record
      const order: EnhancedSwapOrder = {
        orderHash,
        direction: params.direction,
        maker: params.maker,
        srcToken: params.makerAsset,
        dstToken: params.takerAsset,
        srcAmount: params.makingAmount,
        dstAmount: params.takingAmount,
        deadline: Date.now() + 3600000,
        status: 'pending',
        secret,
        hashLock: hashLock.toString(),
        createdAt: Date.now(),
        crossChainOrder,
        srcChainId: this.config.ethereum.chainId,
        dstChainId: this.config.polkadot.parachainId || 1000
      }
  
      this.orders.set(orderHash, order)
      this.secrets.set(orderHash, secret)
  
      this.emit('orderCreated', order)
      console.log(`✅ CrossChain order created: ${orderHash}`)
      
      return orderHash
  
    } catch (error) {
      console.error('❌ Failed to create CrossChain order:', error)
      throw error
    }
  }

  /**
   * Complete Ethereum to Polkadot swap implementation
   */
  async executeEthereumToPolkadotSwap(orderHash: string, fillAmount?: bigint): Promise<void> {
    console.log(`⚡ Executing Ethereum → Polkadot swap: ${orderHash}`)
    
    const order = this.orders.get(orderHash)
    if (!order || !order.crossChainOrder) {
      throw new Error(`Order not found: ${orderHash}`)
    }

    if (order.direction !== 'EthereumToPolkadot') {
      throw new Error('Invalid direction for this method')
    }

    try {
      // Phase 1: Deploy source escrow on Ethereum via resolver
      console.log('🏗️ Phase 1: Deploying Ethereum source escrow...')
      await this.deployEthereumSourceEscrow(order, fillAmount)

      // Phase 2: Create corresponding order on Polkadot
      console.log('🏗️ Phase 2: Creating Polkadot destination order...')
      await this.createPolkadotDestinationOrder(order)

      // Phase 3: Deploy Polkadot escrow via resolver
      console.log('🏗️ Phase 3: Deploying Polkadot destination escrow...')
      await this.deployPolkadotDestinationEscrow(order)

      // Phase 4: Execute atomic swap
      console.log('💎 Phase 4: Executing atomic swap...')
      await this.executeAtomicSwap(order)

      console.log('✅ Ethereum → Polkadot swap completed successfully!')

    } catch (error) {
      console.error('❌ Ethereum → Polkadot swap failed:', error)
      
      // Attempt cleanup
      try {
        await this.cleanupFailedSwap(order)
      } catch (cleanupError) {
        console.error('❌ Cleanup also failed:', cleanupError)
      }
      
      throw error
    }
  }

  /**
   * Complete Polkadot to Ethereum swap implementation
   */
  async executePolkadotToEthereumSwap(orderHash: string, fillAmount?: bigint): Promise<void> {
    console.log(`⚡ Executing Polkadot → Ethereum swap: ${orderHash}`)
    
    const order = this.orders.get(orderHash)
    if (!order || !order.crossChainOrder) {
      throw new Error(`Order not found: ${orderHash}`)
    }

    if (order.direction !== 'PolkadotToEthereum') {
      throw new Error('Invalid direction for this method')
    }

    try {
      // Phase 1: Create order on Polkadot escrow
      console.log('🏗️ Phase 1: Creating Polkadot source order...')
      await this.createPolkadotSourceOrder(order)

      // Phase 2: Deploy Polkadot source escrow via resolver
      console.log('🏗️ Phase 2: Deploying Polkadot source escrow...')
      await this.deployPolkadotSourceEscrow(order, fillAmount)

      // Phase 3: Deploy Ethereum destination escrow
      console.log('🏗️ Phase 3: Deploying Ethereum destination escrow...')
      await this.deployEthereumDestinationEscrow(order)

      // Phase 4: Execute atomic swap (Polkadot first)
      console.log('💎 Phase 4: Executing atomic swap...')
      await this.executeReverseAtomicSwap(order)

      console.log('✅ Polkadot → Ethereum swap completed successfully!')

    } catch (error) {
      console.error('❌ Polkadot → Ethereum swap failed:', error)
      
      // Attempt cleanup
      try {
        await this.cleanupFailedSwap(order)
      } catch (cleanupError) {
        console.error('❌ Cleanup also failed:', cleanupError)
      }
      
      throw error
    }
  }

  // === Ethereum Operations ===

  private async deployEthereumSourceEscrow(order: EnhancedSwapOrder, fillAmount?: bigint): Promise<void> {
    if (!this.ethWallet || !this.ethereumResolver) {
      throw new Error('Ethereum wallet or resolver not connected')
    }

    // Sign the order
    const signature = await this.signCrossChainOrder(order.crossChainOrder)
    order.signature = signature

    const actualFillAmount = fillAmount || order.srcAmount
    const takerTraits = Sdk.TakerTraits.default()
      .setExtension(order.crossChainOrder.extension)
      .setAmountMode(Sdk.AmountMode.maker)
      .setAmountThreshold(order.dstAmount)

    // Deploy source escrow via Ethereum resolver
    const tx = await this.ethereumResolver.deploySrc(
      BigInt(order.srcChainId),
      order.crossChainOrder,
      signature,
      takerTraits,
      actualFillAmount,
      HashLock.fromString(order.hashLock!)
    )

    const receipt = await tx.wait()
    console.log(`✅ Ethereum source escrow deployed: ${receipt?.hash}`)

    // Store deployment info
    order.deployBlockHash = receipt?.blockHash
    order.status = 'locked'

    // Get escrow address and immutables
    if (receipt?.blockHash && this.escrowFactory) {
      const srcEscrowEvent = await this.escrowFactory.getSrcDeployEvent(receipt.blockHash)
      order.srcEscrowEvent = srcEscrowEvent
      
      const ESCROW_SRC_IMPLEMENTATION = await this.escrowFactory.getSourceImpl()
      const srcEscrowAddress = this.escrowFactory.getSrcEscrowAddress(
        srcEscrowEvent[0],
        ESCROW_SRC_IMPLEMENTATION
      )
      
      order.ethereumEscrow = srcEscrowAddress
      order.immutables = srcEscrowEvent[0] // Store immutables
    }

    this.orders.set(order.orderHash, order)
    this.emit('ethereumEscrowDeployed', { order, txHash: receipt?.hash })
  }

  private async deployEthereumDestinationEscrow(order: EnhancedSwapOrder): Promise<void> {
    if (!this.ethWallet || !this.ethereumResolver || !order.immutables) {
      throw new Error('Required components not available')
    }

    // Deploy destination escrow using immutables from Polkadot source
    const tx = await this.ethereumResolver.deployDst(order.immutables)
    const receipt = await tx.wait()
    
    console.log(`✅ Ethereum destination escrow deployed: ${receipt?.hash}`)
    
    order.ethereumEscrow = receipt?.contractAddress || order.ethereumEscrow
    this.orders.set(order.orderHash, order)
    this.emit('ethereumDestEscrowDeployed', { order, txHash: receipt?.hash })
  }

  // === Polkadot Operations ===

  private async createPolkadotSourceOrder(order: EnhancedSwapOrder): Promise<void> {
    if (!this.polkadotWallet || !this.polkadotEscrowContract) {
      throw new Error('Polkadot wallet or escrow contract not connected')
    }

    // Create order parameters for Polkadot escrow
    const createOrderParams = {
      direction: { PolkadotToEthereum: null },
      src_token: this.polkadotWallet.account.address, // Simplified - would be actual token address
      dst_token: Array.from(Buffer.from(order.dstToken.slice(2), 'hex')), // Convert hex to byte array
      src_amount: order.srcAmount,
      min_dst_amount: order.dstAmount,
      fill_deadline: BigInt(order.deadline),
      ethereum_recipient: Array.from(Buffer.from(order.maker.slice(2), 'hex')),
      max_resolver_fee: parseEther('0.01') // 0.01 DOT fee
    }

    // Call create_order on Polkadot escrow
    const gasLimit = this.polkadotWallet.api.registry.createType('WeightV2', {
      refTime: BigInt(1_000_000_000),
      proofSize: BigInt(64 * 1024)
    }) as any // Cast to any to avoid type issues

    const tx = this.polkadotEscrowContract.tx.createOrder(
      { gasLimit, storageDepositLimit: null, value: order.srcAmount },
      createOrderParams
    )

    const result = await new Promise<any>((resolve, reject) => {
      tx.signAndSend(this.polkadotWallet!.account, (result: any) => {
        if (result.status.isInBlock) {
          console.log(`✅ Polkadot order created in block: ${result.status.asInBlock}`)
          resolve(result)
        } else if (result.status.isFinalized) {
          console.log(`✅ Polkadot order finalized in block: ${result.status.asFinalized}`)
        } else if (result.isError) {
          reject(new Error(`Polkadot transaction failed: ${result}`))
        }
      })
    })

    order.polkadotEscrowTx = result.txHash?.toString()
    this.orders.set(order.orderHash, order)
    this.emit('polkadotOrderCreated', { order, txHash: order.polkadotEscrowTx })
  }

  private async createPolkadotDestinationOrder(order: EnhancedSwapOrder): Promise<void> {
    if (!this.polkadotWallet || !this.polkadotEscrowContract) {
      throw new Error('Polkadot wallet or escrow contract not connected')
    }

    // Create destination order parameters
    const createOrderParams = {
      direction: { EthereumToPolkadot: null },
      src_token: Array.from(Buffer.from(order.srcToken.slice(2), 'hex')), // Ethereum token as bytes
      dst_token: this.polkadotWallet.account.address, // Polkadot token (DOT)
      src_amount: order.srcAmount,
      min_dst_amount: order.dstAmount,
      fill_deadline: BigInt(order.deadline),
      ethereum_recipient: Array.from(Buffer.from(order.maker.slice(2), 'hex')),
      max_resolver_fee: parseEther('0.01')
    }

    // Note: For destination orders, we don't send tokens yet - they'll be provided when deploying escrow
    const gasLimit = this.polkadotWallet.api.registry.createType('WeightV2', {
      refTime: BigInt(1_000_000_000),
      proofSize: BigInt(64 * 1024)
    }) as any // Cast to any to avoid type issues

    const tx = this.polkadotEscrowContract.tx.createOrder(
      { gasLimit, storageDepositLimit: null, value: 0 }, // No value for destination order creation
      createOrderParams
    )

    const result = await new Promise<any>((resolve, reject) => {
      tx.signAndSend(this.polkadotWallet!.account, (result: any) => {
        if (result.status.isInBlock) {
          console.log(`✅ Polkadot destination order created in block: ${result.status.asInBlock}`)
          resolve(result)
        } else if (result.isError) {
          reject(new Error(`Polkadot transaction failed: ${result}`))
        }
      })
    })

    order.polkadotEscrowTx = result.txHash?.toString()
    this.orders.set(order.orderHash, order)
    this.emit('polkadotDestOrderCreated', { order, txHash: order.polkadotEscrowTx })
  }

  private async deployPolkadotSourceEscrow(order: EnhancedSwapOrder, fillAmount?: bigint): Promise<void> {
    if (!this.polkadotWallet || !this.polkadotResolverContract) {
      throw new Error('Polkadot wallet or resolver contract not connected')
    }

    const actualFillAmount = fillAmount || order.srcAmount

    // Create immutables for Polkadot source escrow
    const immutables = {
      order_hash: Array.from(Buffer.from(order.orderHash.slice(2), 'hex')),
      hash_lock: Array.from(Buffer.from(order.hashLock!.slice(2), 'hex')),
      maker: order.maker, // Will be converted to AccountId format
      taker: this.polkadotWallet.account.address, // Resolver as taker
      token: this.polkadotWallet.account.address, // DOT token
      amount: actualFillAmount,
      safety_deposit: this.config.relayer.safetyDeposit,
      timelocks: {
        fill_deadline: BigInt(order.deadline),
        private_cancellation: BigInt(order.deadline - 30 * 60 * 1000) // 30 min before deadline
      },
      deployed_at: null // Will be set by contract
    }

    // Mock order structure for resolver compatibility
    const mockOrder = {
      salt: BigInt(Date.now()),
      maker: order.maker,
      receiver: order.maker,
      maker_asset: this.polkadotWallet.account.address,
      taker_asset: Array.from(Buffer.from(order.dstToken.slice(2), 'hex')),
      making_amount: order.srcAmount,
      taking_amount: order.dstAmount,
      maker_traits: Array(32).fill(0) // Empty traits
    }

    // Mock signature (in real implementation, this would be properly signed)
    const mockSignature = Array(65).fill(0)

    // Mock taker traits
    const mockTakerTraits = {
      traits: Array(32).fill(0)
    }

    const gasLimit = this.polkadotWallet.api.registry.createType('WeightV2', {
      refTime: BigInt(2_000_000_000),
      proofSize: BigInt(128 * 1024)
    }) as any // Cast to any to avoid type issues

    // Deploy source escrow via Polkadot resolver
    const tx = this.polkadotResolverContract.tx.deploySrc(
      { gasLimit, storageDepositLimit: null, value: this.config.relayer.safetyDeposit },
      immutables,
      mockOrder,
      mockSignature,
      actualFillAmount,
      mockTakerTraits,
      [] // empty args
    )

    const result = await new Promise<any>((resolve, reject) => {
      tx.signAndSend(this.polkadotWallet!.account, (result: any) => {
        if (result.status.isInBlock) {
          console.log(`✅ Polkadot source escrow deployed in block: ${result.status.asInBlock}`)
          resolve(result)
        } else if (result.isError) {
          reject(new Error(`Polkadot escrow deployment failed: ${result}`))
        }
      })
    })

    // Store deployment info
    order.polkadotEscrow = this.polkadotWallet.account.address 
    order.immutables = immutables
    order.status = 'locked'

    this.orders.set(order.orderHash, order)
    this.emit('polkadotSrcEscrowDeployed', { order, txHash: result.txHash?.toString() })
  }

  private async deployPolkadotDestinationEscrow(order: EnhancedSwapOrder): Promise<void> {
    if (!this.polkadotWallet || !this.polkadotResolverContract || !order.immutables) {
      throw new Error('Required Polkadot components not available')
    }

    // Create destination immutables using data from Ethereum source
    const dstImmutables = {
      ...order.immutables,
      taker: this.polkadotWallet.account.address, // Resolver becomes taker on destination
      amount: order.dstAmount, // Amount user should receive
      token: this.polkadotWallet.account.address // DOT on Polkadot
    }

    const gasLimit = this.polkadotWallet.api.registry.createType('WeightV2', {
      refTime: BigInt(2_000_000_000),
      proofSize: BigInt(128 * 1024)
    }) as any // Cast to any to avoid type issues

    // Deploy destination escrow with resolver providing liquidity
    const tx = this.polkadotResolverContract.tx.deployDst(
      { gasLimit, storageDepositLimit: null, value: order.dstAmount }, // Resolver provides the DOT
      dstImmutables,
      BigInt(Date.now() + 30 * 60 * 1000) // Cancellation timestamp
    )

    const result = await new Promise<any>((resolve, reject) => {
      tx.signAndSend(this.polkadotWallet!.account, (result: any) => {
        if (result.status.isInBlock) {
          console.log(`✅ Polkadot destination escrow deployed in block: ${result.status.asInBlock}`)
          resolve(result)
        } else if (result.isError) {
          reject(new Error(`Polkadot destination escrow deployment failed: ${result}`))
        }
      })
    })

    order.polkadotEscrow = this.polkadotWallet.account.address // Simplified
    this.orders.set(order.orderHash, order)
    this.emit('polkadotDstEscrowDeployed', { order, txHash: result.txHash?.toString() })
  }

  // === Atomic Swap Execution ===

  private async executeAtomicSwap(order: EnhancedSwapOrder): Promise<void> {
    if (!order.secret || !order.ethereumEscrow || !order.polkadotEscrow) {
      throw new Error('Missing required swap components')
    }

    console.log('💎 Executing atomic swap - revealing secret on Polkadot first...')

    // Step 1: User reveals secret on Polkadot to get their DOT
    await this.executePolkadotSwap(order)

    // Step 2: Relayer uses revealed secret to claim USDC on Ethereum
    await this.executeEthereumWithdrawal(order)

    // Update final status
    order.status = 'executed'
    order.executedAt = Date.now()
    this.orders.set(order.orderHash, order)

    this.emit('atomicSwapCompleted', { order })
  }

  private async executeReverseAtomicSwap(order: EnhancedSwapOrder): Promise<void> {
    if (!order.secret || !order.ethereumEscrow || !order.polkadotEscrow) {
      throw new Error('Missing required swap components')
    }

    console.log('💎 Executing reverse atomic swap - revealing secret on Ethereum first...')

    // Step 1: User reveals secret on Ethereum to get their tokens
    await this.executeEthereumWithdrawal(order)

    // Step 2: Relayer uses revealed secret to claim DOT on Polkadot
    await this.executePolkadotSwap(order)

    // Update final status
    order.status = 'executed'
    order.executedAt = Date.now()
    this.orders.set(order.orderHash, order)

    this.emit('reverseAtomicSwapCompleted', { order })
  }

  private async executePolkadotSwap(order: EnhancedSwapOrder): Promise<void> {
    if (!this.polkadotWallet || !this.polkadotEscrowContract || !order.secret) {
      throw new Error('Polkadot components or secret not available')
    }

    console.log('🔓 Executing Polkadot swap with secret reveal...')

    // Convert order hash and secret to byte arrays
    const orderHashBytes = Array.from(Buffer.from(order.orderHash.slice(2), 'hex'))
    const secretBytes = Array.from(Buffer.from(order.secret.slice(2), 'hex'))

    const gasLimit = this.polkadotWallet.api.registry.createType('WeightV2', {
      refTime: BigInt(1_000_000_000),
      proofSize: BigInt(64 * 1024)
    }) as any // Cast to any to avoid type issues

    // Execute swap on Polkadot escrow contract
    const tx = this.polkadotEscrowContract.tx.executeSwap(
      { gasLimit, storageDepositLimit: null },
      orderHashBytes,
      secretBytes
    )

    const result = await new Promise<any>((resolve, reject) => {
      tx.signAndSend(this.polkadotWallet!.account, (result: any) => {
        if (result.status.isInBlock) {
          console.log(`✅ Polkadot swap executed in block: ${result.status.asInBlock}`)
          resolve(result)
        } else if (result.isError) {
          reject(new Error(`Polkadot swap execution failed: ${result}`))
        }
      })
    })

    this.emit('polkadotSwapExecuted', { order, txHash: result.txHash?.toString() })
  }

  private async executeEthereumWithdrawal(order: EnhancedSwapOrder): Promise<void> {
    if (!this.ethWallet || !this.ethereumResolver || !order.secret || !order.immutables) {
      throw new Error('Ethereum components not available')
    }

    console.log('🔓 Executing Ethereum withdrawal...')

    // Use resolver to withdraw from Ethereum escrow
    const tx = await this.ethereumResolver.withdraw(
      'src', // source side
      order.ethereumEscrow,
      order.secret,
      order.immutables
    )

    const receipt = await tx.wait()
    console.log(`✅ Ethereum withdrawal completed: ${receipt?.hash}`)

    this.emit('ethereumWithdrawalExecuted', { order, txHash: receipt?.hash })
  }

  // === Utility Methods ===

  private async signCrossChainOrder(crossChainOrder: any): Promise<string> {
    if (!this.ethWallet) {
      throw new Error('Ethereum wallet not connected')
    }

    const orderHash = crossChainOrder.getOrderHash(this.config.ethereum.chainId)
    const signature = await this.ethWallet.signer.signMessage(orderHash)
    
    return signature
  }

  private async cleanupFailedSwap(order: EnhancedSwapOrder): Promise<void> {
    console.log('🧹 Cleaning up failed swap...')

    try {
      // Cancel Ethereum escrow if deployed
      if (order.ethereumEscrow && order.immutables) {
        const tx = await this.ethereumResolver?.cancel('src', order.ethereumEscrow, order.immutables)
        await tx?.wait()
        console.log('✅ Ethereum escrow cancelled')
      }

      // Cancel Polkadot escrow if deployed
      if (order.polkadotEscrow && this.polkadotEscrowContract) {
        const orderHashBytes = Array.from(Buffer.from(order.orderHash.slice(2), 'hex'))
        
        const gasLimit = this.polkadotWallet!.api.registry.createType('WeightV2', {
          refTime: BigInt(1_000_000_000),
          proofSize: BigInt(64 * 1024)
        }) as any // Cast to any to avoid type issues

        const tx = this.polkadotEscrowContract.tx.cancelOrder(
          { gasLimit, storageDepositLimit: null },
          orderHashBytes
        )

        await new Promise<void>((resolve, reject) => {
          tx.signAndSend(this.polkadotWallet!.account, (result: any) => {
            if (result.status.isInBlock) {
              console.log('✅ Polkadot escrow cancelled')
              resolve()
            } else if (result.isError) {
              reject(new Error(`Polkadot cancellation failed: ${result}`))
            }
          })
        })
      }

      // Update order status
      order.status = 'cancelled'
      this.orders.set(order.orderHash, order)

    } catch (error) {
      console.error('❌ Cleanup failed:', error)
      throw error
    }
  }

  // === Token Operations ===

  async approveToken(tokenAddress: string, spenderAddress: string, amount: bigint): Promise<void> {
    if (!this.ethWallet) {
      throw new Error('Ethereum wallet not connected')
    }

    const tokenContract = new Contract(tokenAddress, ERC20_ABI.abi, this.ethWallet.signer)
    const tx = await tokenContract.approve(spenderAddress, amount)
    await tx.wait()
    
    console.log(`✅ Token approved: ${tokenAddress} for ${spenderAddress}`)
  }

  async getTokenBalance(tokenAddress: string, address?: string): Promise<bigint> {
    if (!this.ethWallet) {
      throw new Error('Ethereum wallet not connected')
    }

    const tokenContract = new Contract(tokenAddress, ERC20_ABI.abi, this.ethWallet.provider)
    const balance = await tokenContract.balanceOf(address || this.ethWallet.address)
    return BigInt(balance)
  }

  async getPolkadotBalance(address?: string): Promise<bigint> {
    if (!this.polkadotWallet) {
      throw new Error('Polkadot wallet not connected')
    }

    const account = address || this.polkadotWallet.address
    const accountData = await this.polkadotWallet.api.query.system.account(account)
    // Fix the type issue by properly accessing the account data
    const accountInfo = accountData as any
    return BigInt(accountInfo.data.free.toString())
  }

  // === Monitoring and Management ===

  async startMonitoring(): Promise<void> {
    if (this.isRunning) {
      console.log('⚠️ Monitoring already running')
      return
    }

    console.log('👀 Starting cross-chain monitoring...')
    this.isRunning = true

    // Monitor Ethereum events
    this.setupEthereumEventListeners()

    // Monitor Polkadot events
    this.setupPolkadotEventListeners()

    // Health check interval
    this.intervalId = setInterval(() => {
      this.performHealthCheck()
    }, 30000)

    console.log('✅ Cross-chain monitoring started')
  }

  private setupEthereumEventListeners(): void {
    if (!this.escrowFactory || !this.ethereumResolver) return

    // Listen for source escrow creation events
    this.escrowFactory.on('SrcEscrowCreated', (immutables: any, complement: any, event: any) => {
      console.log('📢 Ethereum SrcEscrow created:', event.transactionHash)
      this.emit('ethereumSrcEscrowCreated', { immutables, complement, txHash: event.transactionHash })
    })

    // Listen for destination escrow creation events
    this.escrowFactory.on('DstEscrowCreated', (escrow: string, orderHash: string, event: any) => {
      console.log('📢 Ethereum DstEscrow created:', event.transactionHash)
      this.emit('ethereumDstEscrowCreated', { escrow, orderHash, txHash: event.transactionHash })
    })
  }

  private setupPolkadotEventListeners(): void {
    if (!this.polkadotWallet) return

    // Listen for system events
    this.polkadotWallet.api.query.system.events((events: any) => {
      events.forEach((record: any) => {
        const { event } = record
        
        if (event.section === 'contracts') {
          console.log('📢 Polkadot contract event:', event.method, event.data.toString())
          
          // Handle specific contract events
          if (event.method === 'ContractEmitted') {
            this.handlePolkadotContractEvent(event)
          }
        }
      })
    })
  }

  private handlePolkadotContractEvent(event: any): void {
    try {
      // Decode contract event data
      const [contractAddress, eventData] = event.data
      
      // Check if it's from our contracts
      if (contractAddress.toString() === this.config.polkadot.escrowContractAddress ||
          contractAddress.toString() === this.config.polkadot.resolverContractAddress) {
        
        console.log('📢 Our contract emitted event:', eventData.toHex())
        this.emit('polkadotContractEvent', { contractAddress: contractAddress.toString(), data: eventData.toHex() })
      }
    } catch (error) {
      console.error('❌ Error handling Polkadot contract event:', error)
    }
  }

  async stopMonitoring(): Promise<void> {
    console.log('🛑 Stopping cross-chain monitoring...')
    this.isRunning = false

    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = undefined
    }

    // Remove Ethereum listeners
    if (this.escrowFactory) {
      this.escrowFactory.removeAllListeners()
    }
    if (this.ethereumResolver) {
      this.ethereumResolver.removeAllListeners()
    }

    console.log('✅ Cross-chain monitoring stopped')
  }

  private async performHealthCheck(): Promise<void> {
    try {
      // Check Ethereum connection
      if (this.ethWallet?.provider) {
        const blockNumber = await this.ethWallet.provider.getBlockNumber()
        console.log(`🔍 Health check - Ethereum block: ${blockNumber}`)
      }

      // Check Polkadot connection
      if (this.polkadotWallet?.api) {
        const header = await this.polkadotWallet.api.rpc.chain.getHeader()
        console.log(`🔍 Health check - Polkadot block: ${header.number}`)
      }

      // Check pending orders
      const pendingOrders = Array.from(this.orders.values())
        .filter(order => order.status === 'pending' || order.status === 'locked')
      
      if (pendingOrders.length > 0) {
        console.log(`🔍 Health check - ${pendingOrders.length} orders pending/locked`)
        
        // Check for expired orders
        const now = Date.now()
        for (const order of pendingOrders) {
          if (now > order.deadline) {
            console.log(`⚠️ Order ${order.orderHash} expired, attempting cleanup`)
            try {
              await this.cleanupFailedSwap(order)
            } catch (error) {
              console.error(`❌ Failed to cleanup expired order ${order.orderHash}:`, error)
            }
          }
        }
      }

    } catch (error) {
      console.error('❌ Health check failed:', error)
      this.emit('healthCheckFailed', error)
    }
  }

  // === Order Management ===

  async getOrderStatus(orderHash: string): Promise<EnhancedSwapOrder | null> {
    return this.orders.get(orderHash) || null
  }

  async getActiveOrders(): Promise<EnhancedSwapOrder[]> {
    return Array.from(this.orders.values())
      .filter(order => order.status === 'pending' || order.status === 'locked')
  }

  async getCompletedOrders(): Promise<EnhancedSwapOrder[]> {
    return Array.from(this.orders.values())
      .filter(order => order.status === 'executed' || order.status === 'cancelled')
  }

  async getAllOrders(): Promise<EnhancedSwapOrder[]> {
    return Array.from(this.orders.values())
  }

  // === High-level convenience methods ===

  /**
   * Execute a complete cross-chain swap based on order direction
   */
  async executeCrossChainSwap(orderHash: string, fillAmount?: bigint): Promise<void> {
    const order = this.orders.get(orderHash)
    if (!order) {
      throw new Error(`Order not found: ${orderHash}`)
    }

    switch (order.direction) {
      case 'EthereumToPolkadot':
        await this.executeEthereumToPolkadotSwap(orderHash, fillAmount)
        break
      case 'PolkadotToEthereum':
        await this.executePolkadotToEthereumSwap(orderHash, fillAmount)
        break
      default:
        throw new Error(`Unsupported swap direction: ${order.direction}`)
    }
  }

  /**
   * Create and immediately execute a cross-chain swap
   */
  async createAndExecuteSwap(params: CrossChainOrderParams, fillAmount?: bigint): Promise<string> {
    const orderHash = await this.createCrossChainOrder(params)
    await this.executeCrossChainSwap(orderHash, fillAmount)
    return orderHash
  }

  // === Cleanup ===

  async shutdown(): Promise<void> {
    console.log('🔄 Shutting down integrated relayer...')
    
    await this.stopMonitoring()
    
    if (this.polkadotWallet?.api) {
      await this.polkadotWallet.api.disconnect()
    }
    
    this.orders.clear()
    this.secrets.clear()
    this.removeAllListeners()
    
    console.log('✅ Integrated relayer shutdown complete')
  }
}

// === Example usage ===

async function createIntegratedTestRelayer(): Promise<NewFusionPolkadotRelayer> {
  const config: EnhancedWalletConfig = {
    ethereum: {
      type: 'private-key',
      rpcUrl: 'http://localhost:8545',
      privateKey: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
      chainId: 1,
      escrowFactoryAddress: '0x1234567890123456789012345678901234567890', // Your deployed EscrowFactory
      resolverAddress: '0x2345678901234567890123456789012345678901', // Your deployed Ethereum Resolver
      limitOrderProtocolAddress: '0x3456789012345678901234567890123456789012' // Your LOP address
    },
    polkadot: {
      type: 'mnemonic',
      wsUrl: 'ws://localhost:9944',
      mnemonic: 'bottom drive obey lake curtain smoke basket hold race lonely fit walk',
      escrowContractAddress: '5GHwPt7xm4kNwF1nJBDzJhgWP3e3QJe6k2TkYt9aZ2wX3yBf', // Your Polkadot Escrow
      resolverContractAddress: '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty', // Your Polkadot Resolver
      parachainId: 1000
    },
    relayer: {
      safetyDeposit: parseEther('0.001'),
      privateWithdrawalDelay: 120,
      publicWithdrawalDelay: 100,
      cancellationDelay: 122,
      confirmations: 1
    }
  }

  const relayer = new NewFusionPolkadotRelayer(config)
  await relayer.initialize()
  await relayer.startMonitoring()

  // Set up event listeners for demo
  relayer.on('orderCreated', (order) => {
    console.log('🎯 Order created:', order.orderHash)
  })

  relayer.on('ethereumEscrowDeployed', ({ order, txHash }) => {
    console.log('🏗️ Ethereum escrow deployed:', txHash)
  })

  relayer.on('polkadotSrcEscrowDeployed', ({ order, txHash }) => {
    console.log('🏗️ Polkadot source escrow deployed:', txHash)
  })

  relayer.on('polkadotDstEscrowDeployed', ({ order, txHash }) => {
    console.log('🏗️ Polkadot destination escrow deployed:', txHash)
  })

  relayer.on('atomicSwapCompleted', ({ order }) => {
    console.log('✅ Atomic swap completed:', order.orderHash)
  })

  relayer.on('reverseAtomicSwapCompleted', ({ order }) => {
    console.log('✅ Reverse atomic swap completed:', order.orderHash)
  })

  return relayer
}

// Export the factory function
export { createIntegratedTestRelayer }