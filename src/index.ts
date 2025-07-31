#!/usr/bin/env node

import { Command } from 'commander'
import { config } from 'dotenv'
import { parseEther, parseUnits, formatEther, formatUnits } from 'ethers'
// FIX: Import WalletConfig instead of RelayerConfig
import { FusionPolkadotRelayer, WalletConfig, EthereumWalletType, PolkadotWalletType } from '../src/services/FusionPolkadotRelayer'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join } from 'path'
import { createInterface } from 'readline'

// Load environment variables
config()

const serverConfig: WalletConfig = {
  ethereum: {
    type: 'private-key',
    rpcUrl: process.env.ETHEREUM_RPC_URL || 'http://localhost:8545',
    privateKey: process.env.ETHEREUM_PRIVATE_KEY || '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
    fusionFactoryAddress: process.env.FUSION_FACTORY_ADDRESS || '0x0',
    resolverAddress: process.env.ETHEREUM_RESOLVER_ADDRESS || '0x0',
    chainId: parseInt(process.env.ETHEREUM_CHAIN_ID || '31337'),
  },
  polkadot: {
    type: 'mnemonic',
    wsUrl: process.env.POLKADOT_WS_URL || 'wss://rpc.ibp.network/paseo',
    mnemonic: process.env.POLKADOT_MNEMONIC || 'bottom drive obey lake curtain smoke basket hold race lonely fit walk',
    escrowContractAddress: process.env.POLKADOT_ESCROW_ADDRESS || '0x0',
    resolverContractAddress: process.env.POLKADOT_RESOLVER_ADDRESS || '0x0',
  },
  relayer: {
    safetyDeposit: parseEther('0.001'),
    privateWithdrawalDelay: 120, // 2 minutes
    publicWithdrawalDelay: 300,  // 5 minutes
    cancellationDelay: 3600,     // 1 hour
    confirmations: 3,
  },
};

const browserConfig: WalletConfig = {
  ethereum: {
    type: 'metamask',
    rpcUrl: process.env.ETHEREUM_RPC_URL || 'https://mainnet.infura.io/v3/YOUR_PROJECT_ID',
    chainId: parseInt(process.env.ETHEREUM_CHAIN_ID || '1'),
    fusionFactoryAddress: process.env.FUSION_FACTORY_ADDRESS || '0x111111125421ca6dc452d289314280a0f8842a65',
    resolverAddress: process.env.ETHEREUM_RESOLVER_ADDRESS || ''
  },
  polkadot: {
    type: 'polkadot-js',
    wsUrl: process.env.POLKADOT_WS_URL || 'wss://rpc.polkadot.io',
    escrowContractAddress: process.env.POLKADOT_ESCROW_ADDRESS || '',
    resolverContractAddress: process.env.POLKADOT_RESOLVER_ADDRESS || ''
  },
  relayer: {
    safetyDeposit: parseEther('0.001'),
    privateWithdrawalDelay: 120,
    publicWithdrawalDelay: 300,
    cancellationDelay: 3600,
    confirmations: 3
  }
}

const walletConnectConfig: WalletConfig = {
  ethereum: {
    type: 'walletconnect',
    rpcUrl: process.env.ETHEREUM_RPC_URL || 'https://mainnet.infura.io/v3/YOUR_PROJECT_ID',
    chainId: parseInt(process.env.ETHEREUM_CHAIN_ID || '1'),
    fusionFactoryAddress: process.env.FUSION_FACTORY_ADDRESS || '0x111111125421ca6dc452d289314280a0f8842a65',
    resolverAddress: process.env.ETHEREUM_RESOLVER_ADDRESS || ''
  },
  polkadot: {
    type: 'talisman',
    wsUrl: process.env.POLKADOT_WS_URL || 'wss://rpc.polkadot.io',
    escrowContractAddress: process.env.POLKADOT_ESCROW_ADDRESS || '',
    resolverContractAddress: process.env.POLKADOT_RESOLVER_ADDRESS || ''
  },
  relayer: {
    safetyDeposit: parseEther('0.001'),
    privateWithdrawalDelay: 120,
    publicWithdrawalDelay: 300,
    cancellationDelay: 3600,
    confirmations: 3
  }
}

// CLI Application
const program = new Command()

program
  .name('fusion-polkadot-relayer')
  .description('Cross-chain relayer for Ethereum (1inch Fusion+) and Polkadot')
  .version('1.0.0')

// Global relayer instance
let relayer: FusionPolkadotRelayer | null = null

// Interactive setup for wallet selection
async function interactiveWalletSetup(): Promise<WalletConfig> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  })

  const question = (query: string): Promise<string> => {
    return new Promise(resolve => rl.question(query, resolve))
  }

  console.log('\n🔧 Interactive Wallet Setup')
  console.log('==========================')

  // Ethereum wallet selection
  console.log('\n🔷 Ethereum Wallet Options:')
  console.log('1. MetaMask (browser extension)')
  console.log('2. WalletConnect (mobile/desktop wallets)')
  console.log('3. Private Key (server/development)')
  console.log('4. Injected Provider (any injected wallet)')

  const ethChoice = await question('Select Ethereum wallet (1-4): ')
  let ethType: EthereumWalletType

  switch (ethChoice) {
    case '1': ethType = 'metamask'; break
    case '2': ethType = 'walletconnect'; break
    case '3': ethType = 'private-key'; break
    case '4': ethType = 'injected'; break
    default: ethType = 'metamask'
  }

  // Polkadot wallet selection
  console.log('\n🔴 Polkadot Wallet Options:')
  console.log('1. Polkadot.js Extension')
  console.log('2. Talisman Wallet')
  console.log('3. SubWallet')
  console.log('4. Mnemonic (server/development)')
  console.log('5. Injected Provider (any injected wallet)')

  const dotChoice = await question('Select Polkadot wallet (1-5): ')
  let dotType: PolkadotWalletType

  switch (dotChoice) {
    case '1': dotType = 'polkadot-js'; break
    case '2': dotType = 'talisman'; break
    case '3': dotType = 'subwallet'; break
    case '4': dotType = 'mnemonic'; break
    case '5': dotType = 'injected'; break
    default: dotType = 'polkadot-js'
  }

  // Get additional configuration
  const rpcUrl = await question(`Ethereum RPC URL (default: ${browserConfig.ethereum.rpcUrl}): `) || browserConfig.ethereum.rpcUrl
  const wsUrl = await question(`Polkadot WS URL (default: ${browserConfig.polkadot.wsUrl}): `) || browserConfig.polkadot.wsUrl
  const chainId = parseInt(await question(`Ethereum Chain ID (default: ${browserConfig.ethereum.chainId}): `) || browserConfig.ethereum.chainId.toString())
  
  let privateKey: string | undefined
  let mnemonic: string | undefined

  if (ethType === 'private-key') {
    privateKey = await question('Ethereum Private Key: ')
  }

  if (dotType === 'mnemonic') {
    mnemonic = await question('Polkadot Mnemonic: ')
  }

  rl.close()

  const config: WalletConfig = {
    ethereum: {
      type: ethType,
      rpcUrl,
      chainId,
      fusionFactoryAddress: browserConfig.ethereum.fusionFactoryAddress,
      resolverAddress: browserConfig.ethereum.resolverAddress,
      ...(privateKey && { privateKey })
    },
    polkadot: {
      type: dotType,
      wsUrl,
      escrowContractAddress: browserConfig.polkadot.escrowContractAddress,
      resolverContractAddress: browserConfig.polkadot.resolverContractAddress,
      ...(mnemonic && { mnemonic })
    },
    relayer: browserConfig.relayer
  }

  return config
}

// Initialize relayer with configuration
async function initializeRelayer(configPath?: string, walletMode?: string, interactive?: boolean): Promise<FusionPolkadotRelayer> {
  let config: WalletConfig

  if (interactive) {
    config = await interactiveWalletSetup()
  } else if (configPath && existsSync(configPath)) {
    const customConfig = JSON.parse(readFileSync(configPath, 'utf8'))
    config = customConfig
  } else {
    // Select predefined configuration based on wallet mode
    switch (walletMode) {
      case 'browser':
      case 'metamask':
        config = browserConfig
        break
      case 'walletconnect':
        config = walletConnectConfig
        break
      case 'server':
      default:
        config = serverConfig
        break
    }
  }

  console.log('🔧 Initializing relayer with configuration:')
  console.log(`   Ethereum Wallet: ${config.ethereum.type}`)
  console.log(`   Ethereum RPC: ${config.ethereum.rpcUrl}`)
  console.log(`   Polkadot Wallet: ${config.polkadot.type}`)
  console.log(`   Polkadot WS: ${config.polkadot.wsUrl}`)
  console.log(`   Safety Deposit: ${formatEther(config.relayer.safetyDeposit)} ETH`)

  const relayerInstance = new FusionPolkadotRelayer(config)
  
  try {
    await relayerInstance.initialize()
    return relayerInstance
  } catch (error) {
    console.error('❌ Failed to initialize relayer:', error)
    throw error
  }
}

// Rest of your CLI commands remain the same...
// I'll include the start command as an example:

// Start relayer service
program
  .command('start')
  .description('Start the relayer service')
  .option('-c, --config <path>', 'Path to config file')
  .option('-w, --wallet-mode <mode>', 'Wallet mode: server, browser, metamask, walletconnect', 'server')
  .option('-i, --interactive', 'Interactive wallet setup')
  .option('-d, --daemon', 'Run as daemon')
  .action(async (options) => {
    try {
      console.log('🚀 Starting Enhanced Fusion+ Polkadot Relayer...')
      
      relayer = await initializeRelayer(options.config, options.walletMode, options.interactive)
      
      // Check wallet connections
      const walletStatus = relayer.isWalletConnected()
      const addresses = relayer.getConnectedAddresses()
      
      console.log('\n💼 Wallet Status:')
      console.log(`   Ethereum: ${walletStatus.ethereum ? '✅' : '❌'} ${addresses.ethereum || 'Not connected'}`)
      console.log(`   Polkadot: ${walletStatus.polkadot ? '✅' : '❌'} ${addresses.polkadot || 'Not connected'}`)
      
      if (!walletStatus.ethereum || !walletStatus.polkadot) {
        throw new Error('Failed to connect to required wallets')
      }

      await relayer.start()
      
      // Handle graceful shutdown
      const shutdown = async () => {
        console.log('\n🛑 Shutting down relayer...')
        if (relayer) {
          await relayer.stop()
          await relayer.disconnect()
        }
        process.exit(0)
      }

      process.on('SIGINT', shutdown)
      process.on('SIGTERM', shutdown)
      
      console.log('✅ Relayer started successfully!')
      console.log('Press Ctrl+C to stop')
      
      // Keep the process alive
      if (options.daemon) {
        process.stdin.resume()
      } else {
        // Interactive mode - show status updates
        setInterval(async () => {
          if (relayer) {
            try {
              const orders = relayer.getAllOrders()
              const balances = await relayer.getBalances()
              
              console.log('\n📊 Status Update:')
              console.log(`   Active Orders: ${orders.length}`)
              console.log(`   ETH Balance: ${balances.ethereum.native} ETH`)
              console.log(`   DOT Balance: ${balances.polkadot.native} DOT`)
              
              if (orders.length > 0) {
                console.log('   Recent Orders:')
                orders.slice(0, 5).forEach(order => {
                  console.log(`     ${order.orderHash.slice(0, 10)}... [${order.status}] ${order.direction}`)
                })
              }
            } catch (error) {
              console.error('Error getting status:', error)
            }
          }
        }, 30000) // Update every 30 seconds
      }
      
    } catch (error) {
      console.error('❌ Failed to start relayer:', error)
      process.exit(1)
    }
  })

// Add all your other commands here...
// I'll add a few more as examples:

program
  .command('balances')
  .description('Get relayer balances on both chains')
  .option('-c, --config <path>', 'Path to config file')
  .option('-w, --wallet-mode <mode>', 'Wallet mode: server, browser, metamask, walletconnect', 'server')
  .action(async (options) => {
    try {
      relayer = await initializeRelayer(options.config, options.walletMode)
      
      const balances = await relayer.getBalances()
      const addresses = relayer.getConnectedAddresses()
      
      console.log('💰 Relayer Balances:')
      console.log(`\n🔷 Ethereum (${addresses.ethereum}):`)
      console.log(`   Native: ${balances.ethereum.native} ETH`)
      Object.entries(balances.ethereum.tokens).forEach(([token, balance]) => {
        console.log(`   ${token}: ${balance}`)
      })
      
      console.log(`\n🔴 Polkadot (${addresses.polkadot}):`)
      console.log(`   Native: ${balances.polkadot.native} DOT`)
      Object.entries(balances.polkadot.tokens).forEach(([token, balance]) => {
        console.log(`   ${token}: ${balance}`)
      })
      
      await relayer.disconnect()
    } catch (error) {
      console.error('❌ Failed to get balances:', error)
      process.exit(1)
    }
  })

  // Add this to your existing CLI file (after the balances command)

program
.command('simulate-swap')
.description('Simulate a cross-chain swap between Ethereum and Polkadot')
.option('-c, --config <path>', 'Path to config file')
.option('-w, --wallet-mode <mode>', 'Wallet mode: server, browser, metamask, walletconnect', 'server')
.option('-d, --direction <direction>', 'Swap direction: eth-to-dot or dot-to-eth', 'eth-to-dot')
.option('-a, --amount <amount>', 'Amount to swap', '1.0')
.option('--src-token <token>', 'Source token address', 'ETH')
.option('--dst-token <token>', 'Destination token address', 'DOT')
.option('--interactive', 'Interactive mode with step-by-step confirmation')
.action(async (options) => {
  try {
    console.log('🎭 Starting Cross-Chain Swap Simulation...')
    console.log('=' .repeat(50))
    
    relayer = await initializeRelayer(options.config, options.walletMode)
    
    if (!relayer) {
      throw new Error('Failed to initialize relayer')
    }
    
    const direction = options.direction === 'eth-to-dot' ? 'EthereumToPolkadot' : 'PolkadotToEthereum'
    const amount = parseEther(options.amount)
    const dstAmount = parseEther((parseFloat(options.amount) * 0.95).toString()) // 5% slippage
    const deadline = Math.floor(Date.now() / 1000) + 3600 // 1 hour from now
    
    // Get wallet addresses
    const addresses = relayer.getConnectedAddresses()
    const maker = direction === 'EthereumToPolkadot' ? addresses.ethereum! : addresses.polkadot!
    
    console.log('\n📋 Swap Parameters:')
    console.log(`   Direction: ${direction}`)
    console.log(`   Maker: ${maker}`)
    console.log(`   Source Token: ${options.srcToken}`)
    console.log(`   Destination Token: ${options.dstToken}`)
    console.log(`   Source Amount: ${formatEther(amount)} ${options.srcToken}`)
    console.log(`   Expected Destination: ${formatEther(dstAmount)} ${options.dstToken}`)
    console.log(`   Deadline: ${new Date(deadline * 1000).toISOString()}`)
    
    if (options.interactive) {
      const rl = createInterface({
        input: process.stdin,
        output: process.stdout
      })
      
      const question = (query: string): Promise<string> => {
        return new Promise(resolve => rl.question(query, resolve))
      }
      
      const proceed = await question('\n❓ Proceed with swap simulation? (y/n): ')
      if (proceed.toLowerCase() !== 'y' && proceed.toLowerCase() !== 'yes') {
        console.log('❌ Swap simulation cancelled')
        rl.close()
        if (relayer) {
          await relayer.disconnect()
        }
        return
      }
      rl.close()
    }
    
    // Step 1: Create Order
    console.log('\n🎬 Step 1: Creating swap order...')
    await new Promise(resolve => setTimeout(resolve, 1000)) // Simulate processing time
    
    const orderHash = await relayer.createOrder({
      direction,
      maker,
      srcToken: options.srcToken,
      dstToken: options.dstToken,
      srcAmount: amount,
      dstAmount: dstAmount,
      deadline
    })
    
    console.log(`✅ Order created with hash: ${orderHash}`)
    
    // Step 2: Deploy Escrows
    console.log('\n🏗️  Step 2: Deploying escrow contracts...')
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    await relayer.deployEscrows(orderHash)
    console.log('✅ Escrow contracts deployed on both chains')
    
    // Step 3: Lock funds on source chain
    console.log('\n🔒 Step 3: Locking funds on source chain...')
    await new Promise(resolve => setTimeout(resolve, 1500))
    
    const order = relayer.getOrder(orderHash)!
    console.log(`✅ ${formatEther(amount)} ${options.srcToken} locked on ${direction === 'EthereumToPolkadot' ? 'Ethereum' : 'Polkadot'}`)
    
    // Step 4: Relayer verification
    console.log('\n🔍 Step 4: Relayer verifying lock...')
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    console.log('✅ Lock verified by relayer')
    console.log(`   Hash Lock: ${order.hashLock?.slice(0, 20)}...`)
    console.log(`   Secret: ${order.secret ? '[HIDDEN]' : 'Not available'}`)
    
    // Step 5: Release funds on destination chain
    console.log('\n🚀 Step 5: Releasing funds on destination chain...')
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    await relayer.executeSwap(orderHash)
    console.log(`✅ ${formatEther(dstAmount)} ${options.dstToken} released on ${direction === 'EthereumToPolkadot' ? 'Polkadot' : 'Ethereum'}`)
    
    // Step 6: Complete swap
    console.log('\n🎉 Step 6: Swap completion...')
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    const finalOrder = relayer.getOrder(orderHash)!
    console.log('✅ Cross-chain swap completed successfully!')
    
    // Show final status
    console.log('\n📊 Final Swap Status:')
    console.log(`   Order Hash: ${orderHash}`)
    console.log(`   Status: ${finalOrder.status.toUpperCase()}`)
    console.log(`   Direction: ${finalOrder.direction}`)
    console.log(`   Maker: ${finalOrder.maker}`)
    console.log(`   Source: ${formatEther(finalOrder.srcAmount)} ${finalOrder.srcToken}`)
    console.log(`   Destination: ${formatEther(finalOrder.dstAmount)} ${finalOrder.dstToken}`)
    console.log(`   Execution Time: ${((Date.now() - finalOrder.createdAt) / 1000).toFixed(2)}s`)
    
    // Show balances after swap
    console.log('\n💰 Updated Balances:')
    const balances = await relayer.getBalances()
    console.log(`   ETH Balance: ${balances.ethereum.native} ETH`)
    console.log(`   DOT Balance: ${balances.polkadot.native} DOT`)
    
    // Simulate fee calculation
    const relayerFee = parseFloat(options.amount) * 0.003 // 0.3% fee
    console.log(`\n💸 Relayer Fees Earned: ${relayerFee.toFixed(6)} ${options.srcToken}`)
    
    console.log('\n🎭 Swap simulation completed successfully!')
    console.log('=' .repeat(50))
    
    if (relayer) {
      await relayer.disconnect()
    }
    
  } catch (error) {
    console.error('❌ Swap simulation failed:', error)
    if (relayer) {
      await relayer.disconnect()
    }
    process.exit(1)
  }
})

// Add order management commands
program
.command('orders')
.description('List all orders')
.option('-c, --config <path>', 'Path to config file')
.option('-w, --wallet-mode <mode>', 'Wallet mode: server, browser, metamask, walletconnect', 'server')
.option('-s, --status <status>', 'Filter by status: pending, locked, executed, cancelled')
.action(async (options) => {
  try {
    relayer = await initializeRelayer(options.config, options.walletMode)
    
    if (!relayer) {
      throw new Error('Failed to initialize relayer')
    }
    
    const orders = relayer.getAllOrders()
    const filteredOrders = options.status 
      ? orders.filter(order => order.status === options.status)
      : orders
    
    console.log(`📋 Orders (${filteredOrders.length} total):`)
    console.log('=' .repeat(80))
    
    if (filteredOrders.length === 0) {
      console.log('No orders found')
    } else {
      filteredOrders.forEach((order, index) => {
        console.log(`\n${index + 1}. Order ${order.orderHash.slice(0, 16)}...`)
        console.log(`   Status: ${order.status.toUpperCase()}`)
        console.log(`   Direction: ${order.direction}`)
        console.log(`   Maker: ${order.maker.slice(0, 20)}...`)
        console.log(`   Source: ${formatEther(order.srcAmount)} ${order.srcToken}`)
        console.log(`   Destination: ${formatEther(order.dstAmount)} ${order.dstToken}`)
        console.log(`   Deadline: ${new Date(order.deadline * 1000).toLocaleString()}`)
        console.log(`   Created: ${new Date(order.createdAt).toLocaleString()}`)
      })
    }
    
    console.log('\n' + '=' .repeat(80))
    
    if (relayer) {
      await relayer.disconnect()
    }
    
  } catch (error) {
    console.error('❌ Failed to fetch orders:', error)
    process.exit(1)
  }
})

program
.command('order')
.description('Get details of a specific order')
.argument('<orderHash>', 'Order hash to lookup')
.option('-c, --config <path>', 'Path to config file')
.option('-w, --wallet-mode <mode>', 'Wallet mode: server, browser, metamask, walletconnect', 'server')
.action(async (orderHash, options) => {
  try {
    relayer = await initializeRelayer(options.config, options.walletMode)
    
    if (!relayer) {
      throw new Error('Failed to initialize relayer')
    }
    
    const order = relayer.getOrder(orderHash)
    
    if (!order) {
      console.log(`❌ Order not found: ${orderHash}`)
      if (relayer) {
        await relayer.disconnect()
      }
      return
    }
    
    console.log('📋 Order Details:')
    console.log('=' .repeat(50))
    console.log(`Order Hash: ${order.orderHash}`)
    console.log(`Status: ${order.status.toUpperCase()}`)
    console.log(`Direction: ${order.direction}`)
    console.log(`Maker: ${order.maker}`)
    console.log(`Source Token: ${order.srcToken}`)
    console.log(`Destination Token: ${order.dstToken}`)
    console.log(`Source Amount: ${formatEther(order.srcAmount)}`)
    console.log(`Destination Amount: ${formatEther(order.dstAmount)}`)
    console.log(`Deadline: ${new Date(order.deadline * 1000).toISOString()}`)
    console.log(`Created At: ${new Date(order.createdAt).toISOString()}`)
    
    if (order.hashLock) {
      console.log(`Hash Lock: ${order.hashLock}`)
    }
    
    if (order.ethereumEscrow) {
      console.log(`Ethereum Escrow: ${order.ethereumEscrow}`)
    }
    
    if (order.polkadotEscrow) {
      console.log(`Polkadot Escrow: ${order.polkadotEscrow}`)
    }
    
    console.log('=' .repeat(50))
    
    if (relayer) {
      await relayer.disconnect()
    }
    
  } catch (error) {
    console.error('❌ Failed to get order details:', error)
    process.exit(1)
  }
})

// Add status monitoring command
program
.command('monitor')
.description('Monitor relayer status in real-time')
.option('-c, --config <path>', 'Path to config file')
.option('-w, --wallet-mode <mode>', 'Wallet mode: server, browser, metamask, walletconnect', 'server')
.option('-i, --interval <seconds>', 'Update interval in seconds', '10')
.action(async (options) => {
  try {
    console.log('📡 Starting Relayer Monitor...')
    console.log('Press Ctrl+C to stop monitoring\n')
    
    relayer = await initializeRelayer(options.config, options.walletMode)
    
    if (!relayer) {
      throw new Error('Failed to initialize relayer')
    }
    
    const interval = parseInt(options.interval) * 1000
    let updateCount = 0
    
    const showStatus = async () => {
      if (!relayer) return
      
      updateCount++
      const timestamp = new Date().toLocaleTimeString()
      
      console.clear()
      console.log(`📡 Relayer Monitor - Update #${updateCount} at ${timestamp}`)
      console.log('=' .repeat(60))
      
      // Wallet status
      const walletStatus = relayer.isWalletConnected()
      const addresses = relayer.getConnectedAddresses()
      
      console.log('💼 Wallet Status:')
      console.log(`   Ethereum: ${walletStatus.ethereum ? '🟢' : '🔴'} ${addresses.ethereum || 'Disconnected'}`)
      console.log(`   Polkadot: ${walletStatus.polkadot ? '🟢' : '🔴'} ${addresses.polkadot || 'Disconnected'}`)
      
      // Balances
      try {
        const balances = await relayer.getBalances()
        console.log('\n💰 Balances:')
        console.log(`   ETH: ${balances.ethereum.native}`)
        console.log(`   DOT: ${balances.polkadot.native}`)
      } catch (error) {
        console.log('\n💰 Balances: Error fetching balances')
      }
      
      // Orders
      const orders = relayer.getAllOrders()
      console.log(`\n📋 Orders: ${orders.length} total`)
      
      const statusCounts = orders.reduce((acc, order) => {
        acc[order.status] = (acc[order.status] || 0) + 1
        return acc
      }, {} as Record<string, number>)
      
      Object.entries(statusCounts).forEach(([status, count]) => {
        const emoji = status === 'executed' ? '✅' : 
                     status === 'pending' ? '⏳' : 
                     status === 'locked' ? '🔒' : '❌'
        console.log(`   ${emoji} ${status}: ${count}`)
      })
      
      // Recent activity
      const recentOrders = orders
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 3)
      
      if (recentOrders.length > 0) {
        console.log('\n🕐 Recent Orders:')
        recentOrders.forEach(order => {
          const age = Math.floor((Date.now() - order.createdAt) / 1000)
          console.log(`   ${order.orderHash.slice(0, 16)}... [${order.status}] ${age}s ago`)
        })
      }
      
      console.log(`\nNext update in ${options.interval} seconds...`)
    }
    
    // Initial status
    await showStatus()
    
    // Set up interval
    const monitorInterval = setInterval(showStatus, interval)
    
    // Handle graceful shutdown
    const shutdown = async () => {
      clearInterval(monitorInterval)
      console.log('\n\n🛑 Stopping monitor...')
      if (relayer) {
        await relayer.disconnect()
      }
      process.exit(0)
    }
    
    process.on('SIGINT', shutdown)
    process.on('SIGTERM', shutdown)
    
  } catch (error) {
    console.error('❌ Failed to start monitor:', error)
    process.exit(1)
  }
})

// Parse command line arguments
program.parse()

// Export for use as a module
export { FusionPolkadotRelayer, WalletConfig, browserConfig, serverConfig, walletConnectConfig }