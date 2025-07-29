#!/usr/bin/env node

import { Command } from 'commander'
import { config } from 'dotenv'
import { parseEther, parseUnits, formatEther, formatUnits } from 'ethers'
import { FusionPolkadotRelayer, RelayerConfig } from '../src/services/FusionPolkadotRelayer'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

// Load environment variables
config()

// Configuration
const defaultConfig: RelayerConfig = {
  ethereum: {
    rpcUrl: process.env.ETHEREUM_RPC_URL || 'http://localhost:8545',
    privateKey: process.env.ETHEREUM_PRIVATE_KEY || '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
    fusionFactoryAddress: process.env.FUSION_FACTORY_ADDRESS || '0x111111125421ca6dc452d289314280a0f8842a65',
    resolverAddress: process.env.ETHEREUM_RESOLVER_ADDRESS || '',
    chainId: parseInt(process.env.ETHEREUM_CHAIN_ID || '1')
  },
  polkadot: {
    wsUrl: process.env.POLKADOT_WS_URL || 'ws://localhost:9944',
    mnemonic: process.env.POLKADOT_MNEMONIC || 'bottom drive obey lake curtain smoke basket hold race lonely fit walk',
    escrowContractAddress: process.env.POLKADOT_ESCROW_ADDRESS || '',
    resolverContractAddress: process.env.POLKADOT_RESOLVER_ADDRESS || ''
  },
  relayer: {
    safetyDeposit: parseEther('0.001'),
    privateWithdrawalDelay: 120, // 2 minutes
    publicWithdrawalDelay: 300,  // 5 minutes
    cancellationDelay: 3600,     // 1 hour
    confirmations: 3
  }
}

// CLI Application
const program = new Command()

program
  .name('fusion-polkadot-relayer')
  .description('Cross-chain relayer for Ethereum (1inch Fusion+) and Polkadot')
  .version('1.0.0')

// Global relater instance
let relayer: FusionPolkadotRelayer | null = null

// Initialize relayer
async function initializeRelayer(configPath?: string): Promise<FusionPolkadotRelayer> {
  let config = defaultConfig
  
  // Load custom config if provided
  if (configPath && existsSync(configPath)) {
    const customConfig = JSON.parse(readFileSync(configPath, 'utf8'))
    config = { ...defaultConfig, ...customConfig }
  }
  
  console.log('🔧 Initializing relayer with config:')
  console.log(`   Ethereum RPC: ${config.ethereum.rpcUrl}`)
  console.log(`   Polkadot WS: ${config.polkadot.wsUrl}`)
  console.log(`   Safety Deposit: ${formatEther(config.relayer.safetyDeposit)} ETH`)
  
  const relayerInstance = new FusionPolkadotRelayer(config)
  await relayerInstance.initialize()
  
  return relayerInstance
}

// Start relayer service
program
  .command('start')
  .description('Start the relayer service')
  .option('-c, --config <path>', 'Path to config file')
  .option('-d, --daemon', 'Run as daemon')
  .action(async (options) => {
    try {
      console.log('🚀 Starting Fusion+ Polkadot Relayer...')
      
      relayer = await initializeRelayer(options.config)
      await relayer.start()
      
      // Handle graceful shutdown
      process.on('SIGINT', async () => {
        console.log('\n🛑 Shutting down relayer...')
        if (relayer) {
          await relayer.stop()
        }
        process.exit(0)
      })
      
      process.on('SIGTERM', async () => {
        console.log('\n🛑 Shutting down relayer...')
        if (relayer) {
          await relayer.stop()
        }
        process.exit(0)
      })
      
      console.log('✅ Relayer started successfully!')
      console.log('Press Ctrl+C to stop')
      
      // Keep the process alive
      if (options.daemon) {
        // Run as daemon
        process.stdin.resume()
      } else {
        // Interactive mode - show status updates
        setInterval(async () => {
          if (relayer) {
            const orders = relayer.getAllOrders()
            const balances = await relayer.getBalances()
            
            console.log('\n📊 Status Update:')
            console.log(`   Active Orders: ${orders.length}`)
            console.log(`   ETH Balance: ${balances.ethereum.native} ETH`)
            console.log(`   DOT Balance: ${balances.polkadot.native} DOT`)
            
            if (orders.length > 0) {
              console.log('   Orders:')
              orders.slice(0, 5).forEach(order => {
                console.log(`     ${order.orderHash.slice(0, 10)}... [${order.status}] ${order.direction}`)
              })
            }
          }
        }, 30000) // Update every 30 seconds
      }
      
    } catch (error) {
      console.error('❌ Failed to start relayer:', error)
      process.exit(1)
    }
  })

// Create a new swap order
program
  .command('create-order')
  .description('Create a new cross-chain swap order')
  .requiredOption('-d, --direction <direction>', 'Swap direction: EthereumToPolkadot or PolkadotToEthereum')
  .requiredOption('-m, --maker <address>', 'Maker address')
  .requiredOption('--src-token <address>', 'Source token address')
  .requiredOption('--dst-token <address>', 'Destination token address')
  .requiredOption('--src-amount <amount>', 'Source amount (in token units)')
  .requiredOption('--dst-amount <amount>', 'Destination amount (in token units)')
  .option('--deadline <seconds>', 'Order deadline in seconds from now', '3600')
  .option('-c, --config <path>', 'Path to config file')
  .action(async (options) => {
    try {
      relayer = await initializeRelayer(options.config)
      
      const orderHash = await relayer.createOrder({
        direction: options.direction as 'EthereumToPolkadot' | 'PolkadotToEthereum',
        maker: options.maker,
        srcToken: options.srcToken,
        dstToken: options.dstToken,
        srcAmount: BigInt(options.srcAmount),
        dstAmount: BigInt(options.dstAmount),
        deadline: Math.floor(Date.now() / 1000) + parseInt(options.deadline)
      })
      
      console.log(`✅ Order created successfully!`)
      console.log(`Order Hash: ${orderHash}`)
      console.log(`Direction: ${options.direction}`)
      console.log(`Source: ${options.srcAmount} ${options.srcToken}`)
      console.log(`Destination: ${options.dstAmount} ${options.dstToken}`)
      
      await relayer.stop()
    } catch (error) {
      console.error('❌ Failed to create order:', error)
      process.exit(1)
    }
  })

// Get order status
program
  .command('status')
  .description('Get status of an order or all orders')
  .option('-o, --order <hash>', 'Order hash to check')
  .option('-c, --config <path>', 'Path to config file')
  .action(async (options) => {
    try {
      relayer = await initializeRelayer(options.config)
      
      if (options.order) {
        const order = relayer.getOrder(options.order)
        if (order) {
          console.log('📋 Order Details:')
          console.log(`   Hash: ${order.orderHash}`)
          console.log(`   Direction: ${order.direction}`)
          console.log(`   Status: ${order.status}`)
          console.log(`   Maker: ${order.maker}`)
          console.log(`   Source: ${order.srcAmount} ${order.srcToken}`)
          console.log(`   Destination: ${order.dstAmount} ${order.dstToken}`)
          console.log(`   Created: ${new Date(order.createdAt).toISOString()}`)
          
          if (order.ethereumEscrow) {
            console.log(`   Ethereum Escrow: ${order.ethereumEscrow}`)
          }
          if (order.polkadotEscrow) {
            console.log(`   Polkadot Escrow: ${order.polkadotEscrow}`)
          }
        } else {
          console.log('❌ Order not found')
        }
      } else {
        const orders = relayer.getAllOrders()
        console.log(`📋 All Orders (${orders.length}):`)
        
        if (orders.length === 0) {
          console.log('   No orders found')
        } else {
          orders.forEach(order => {
            console.log(`   ${order.orderHash} [${order.status}] ${order.direction}`)
          })
        }
      }
      
      await relayer.stop()
    } catch (error) {
      console.error('❌ Failed to get status:', error)
      process.exit(1)
    }
  })

// Get balances
program
  .command('balances')
  .description('Get relayer balances on both chains')
  .option('-c, --config <path>', 'Path to config file')
  .action(async (options) => {
    try {
      relayer = await initializeRelayer(options.config)
      
      const balances = await relayer.getBalances()
      
      console.log('💰 Relayer Balances:')
      console.log('\n🔷 Ethereum:')
      console.log(`   Native: ${balances.ethereum.native} ETH`)
      Object.entries(balances.ethereum.tokens).forEach(([token, balance]) => {
        console.log(`   ${token}: ${balance}`)
      })
      
      console.log('\n🔴 Polkadot:')
      console.log(`   Native: ${balances.polkadot.native} DOT`)
      Object.entries(balances.polkadot.tokens).forEach(([token, balance]) => {
        console.log(`   ${token}: ${balance}`)
      })
      
      await relayer.stop()
    } catch (error) {
      console.error('❌ Failed to get balances:', error)
      process.exit(1)
    }
  })

// Execute a swap manually
program
  .command('execute')
  .description('Manually execute a swap')
  .requiredOption('-o, --order <hash>', 'Order hash to execute')
  .option('-c, --config <path>', 'Path to config file')
  .action(async (options) => {
    try {
      relayer = await initializeRelayer(options.config)
      
      console.log(`⚡ Executing order: ${options.order}`)
      await relayer.executeSwap(options.order)
      console.log('✅ Order executed successfully!')
      
      await relayer.stop()
    } catch (error) {
      console.error('❌ Failed to execute order:', error)
      process.exit(1)
    }
  })

// Deploy escrows manually
program
  .command('deploy-escrows')
  .description('Manually deploy escrows for an order')
  .requiredOption('-o, --order <hash>', 'Order hash')
  .option('-c, --config <path>', 'Path to config file')
  .action(async (options) => {
    try {
      relayer = await initializeRelayer(options.config)
      
      console.log(`🏗️ Deploying escrows for order: ${options.order}`)
      await relayer.deployEscrows(options.order)
      console.log('✅ Escrows deployed successfully!')
      
      await relayer.stop()
    } catch (error) {
      console.error('❌ Failed to deploy escrows:', error)
      process.exit(1)
    }
  })

// Test connection to both chains
program
  .command('test')
  .description('Test connections to both chains')
  .option('-c, --config <path>', 'Path to config file')
  .action(async (options) => {
    try {
      console.log('🧪 Testing connections...')
      
      relayer = await initializeRelayer(options.config)
      
      // Test Ethereum connection
      console.log('🔷 Testing Ethereum connection...')
      const balances = await relayer.getBalances()
      console.log(`   ✅ Connected! Balance: ${balances.ethereum.native} ETH`)
      
      // Test Polkadot connection
      console.log('🔴 Testing Polkadot connection...')
      console.log(`   ✅ Connected! Balance: ${balances.polkadot.native} DOT`)
      
      console.log('✅ All connections successful!')
      
      await relayer.stop()
    } catch (error) {
      console.error('❌ Connection test failed:', error)
      process.exit(1)
    }
  })

// Create example config file
program
  .command('init-config')
  .description('Create an example configuration file')
  .option('-o, --output <path>', 'Output path for config file', './relayer-config.json')
  .action((options) => {
    const exampleConfig = {
      ethereum: {
        rpcUrl: 'https://mainnet.infura.io/v3/YOUR_PROJECT_ID',
        privateKey: 'YOUR_PRIVATE_KEY',
        fusionFactoryAddress: '0x111111125421ca6dc452d289314280a0f8842a65',
        resolverAddress: 'YOUR_DEPLOYED_RESOLVER_ADDRESS',
        chainId: 1
      },
      polkadot: {
        wsUrl: 'wss://rpc.polkadot.io',
        mnemonic: 'YOUR_POLKADOT_MNEMONIC',
        escrowContractAddress: 'YOUR_DEPLOYED_ESCROW_ADDRESS',
        resolverContractAddress: 'YOUR_DEPLOYED_RESOLVER_ADDRESS'
      },
      relayer: {
        safetyDeposit: '1000000000000000', // 0.001 ETH in wei
        privateWithdrawalDelay: 120,
        publicWithdrawalDelay: 300,
        cancellationDelay: 3600,
        confirmations: 3
      }
    }
    
    try {
      require('fs').writeFileSync(options.output, JSON.stringify(exampleConfig, null, 2))
      console.log(`✅ Example config file created at: ${options.output}`)
      console.log('📝 Please edit the file with your actual values before using')
    } catch (error) {
      console.error('❌ Failed to create config file:', error)
      process.exit(1)
    }
  })

// Error handling
program.exitOverride((err) => {
  if (err.code === 'commander.help') {
    process.exit(0)
  }
  if (err.code === 'commander.version') {
    process.exit(0)
  }
  console.error('❌', err.message)
  process.exit(1)
})

// Parse command line arguments
program.parse()

// Export for use as a module
export { FusionPolkadotRelayer, RelayerConfig, defaultConfig }