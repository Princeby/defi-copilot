#!/usr/bin/env node

import { Command } from 'commander'
import { config } from 'dotenv'
import { parseEther, parseUnits, formatEther, formatUnits } from 'ethers'
import { NewFusionPolkadotRelayer, EnhancedWalletConfig, CrossChainOrderParams } from '../src/services/NewFusionPolkadotRelayer'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join } from 'path'
import { createInterface } from 'readline'

// Load environment variables
config()

const demoConfig: EnhancedWalletConfig = {
  ethereum: {
    type: 'private-key',
    rpcUrl: process.env.ETHEREUM_RPC_URL || 'http://localhost:8545',
    privateKey: process.env.ETHEREUM_PRIVATE_KEY || '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
    chainId: parseInt(process.env.ETHEREUM_CHAIN_ID || '31337'),
    escrowFactoryAddress: process.env.ESCROW_FACTORY_ADDRESS || '0x1234567890123456789012345678901234567890',
    resolverAddress: process.env.ETHEREUM_RESOLVER_ADDRESS || '0x2345678901234567890123456789012345678901',
    limitOrderProtocolAddress: process.env.LIMIT_ORDER_PROTOCOL_ADDRESS || '0x3456789012345678901234567890123456789012'
  },
  polkadot: {
    type: 'mnemonic',
    wsUrl: process.env.POLKADOT_WS_URL || 'wss://rpc.shibuya.astar.network',
    mnemonic: process.env.POLKADOT_MNEMONIC || 'bottom drive obey lake curtain smoke basket hold race lonely fit walk',
    escrowContractAddress: process.env.POLKADOT_ESCROW_ADDRESS || 'XR2RVPmdBABfZNEWrQRLTzj7NGqiUfQqJqtRpnRtRbpGWBP',
    resolverContractAddress: process.env.POLKADOT_RESOLVER_ADDRESS || 'W4tVmiw832T4b5116n2J9EQybV36q8hwJSxg2gcKgAWVuEH',
    parachainId: parseInt(process.env.POLKADOT_PARACHAIN_ID || '1000')
  },
  relayer: {
    safetyDeposit: parseEther('0.001'),
    privateWithdrawalDelay: 120,
    publicWithdrawalDelay: 100,
    cancellationDelay: 122,
    confirmations: 1
  }
}

// CLI Application
const program = new Command()

program
  .name('integrated-fusion-polkadot-demo')
  .description('Demo CLI for Integrated Fusion+ Polkadot Cross-Chain Relayer')
  .version('1.0.0')

// Global relayer instance
let relayer: NewFusionPolkadotRelayer | null = null

// Event tracking
interface EventLog {
  timestamp: number
  event: string
  data: any
  details: string
}

const eventLogs: EventLog[] = []

// Utility functions
function logEvent(event: string, data: any, details: string) {
  const log: EventLog = {
    timestamp: Date.now(),
    event,
    data,
    details
  }
  eventLogs.push(log)
  
  const timestamp = new Date(log.timestamp).toLocaleTimeString()
  console.log(`📅 [${timestamp}] 🎯 ${event}: ${details}`)
  
  if (data.txHash) {
    console.log(`   📋 Transaction: ${data.txHash}`)
  }
  if (data.orderHash) {
    console.log(`   🔗 Order Hash: ${data.orderHash}`)
  }
  if (data.order) {
    console.log(`   💰 Amount: ${formatEther(data.order.srcAmount)} → ${formatEther(data.order.dstAmount)}`)
    console.log(`   🔄 Direction: ${data.order.direction}`)
  }
}

// Initialize relayer with comprehensive event listeners
async function initializeRelayer(): Promise<NewFusionPolkadotRelayer> {
  console.log('🚀 Initializing Integrated Fusion+ Polkadot Relayer Demo...')
  console.log('=' .repeat(80))
  
  const relayerInstance = new NewFusionPolkadotRelayer(demoConfig)
  
  // Set up comprehensive event listeners
  setupEventListeners(relayerInstance)
  
  try {
    await relayerInstance.initialize()
    await relayerInstance.startMonitoring()
    
    console.log('✅ Demo relayer initialized successfully!')
    console.log('📡 Event monitoring started')
    console.log('=' .repeat(80))
    
    return relayerInstance
  } catch (error) {
    console.error('❌ Failed to initialize demo relayer:', error)
    throw error
  }
}

function setupEventListeners(relayer: NewFusionPolkadotRelayer) {
  console.log('🎧 Setting up comprehensive event listeners...')
  
  // Order lifecycle events
  relayer.on('orderCreated', (order) => {
    logEvent('ORDER_CREATED', { order }, 
      `New ${order.direction} order created for ${formatEther(order.srcAmount)} ${order.srcToken}`)
  })

  // Ethereum events
  relayer.on('ethereumEscrowDeployed', ({ order, txHash }) => {
    logEvent('ETHEREUM_ESCROW_DEPLOYED', { order, txHash }, 
      `Ethereum escrow deployed for order ${order.orderHash.slice(0, 16)}...`)
  })

  relayer.on('ethereumDestEscrowDeployed', ({ order, txHash }) => {
    logEvent('ETHEREUM_DEST_ESCROW_DEPLOYED', { order, txHash }, 
      `Ethereum destination escrow deployed for order ${order.orderHash.slice(0, 16)}...`)
  })

  relayer.on('ethereumSrcEscrowCreated', ({ immutables, complement, txHash }) => {
    logEvent('ETHEREUM_SRC_ESCROW_CREATED', { immutables, complement, txHash }, 
      `Ethereum source escrow creation event detected`)
  })

  relayer.on('ethereumDstEscrowCreated', ({ escrow, orderHash, txHash }) => {
    logEvent('ETHEREUM_DST_ESCROW_CREATED', { escrow, orderHash, txHash }, 
      `Ethereum destination escrow creation event for order ${orderHash.slice(0, 16)}...`)
  })

  relayer.on('ethereumWithdrawalExecuted', ({ order, txHash }) => {
    logEvent('ETHEREUM_WITHDRAWAL_EXECUTED', { order, txHash }, 
      `Ethereum withdrawal completed for order ${order.orderHash.slice(0, 16)}...`)
  })

  // Polkadot events
  relayer.on('polkadotOrderCreated', ({ order, txHash }) => {
    logEvent('POLKADOT_ORDER_CREATED', { order, txHash }, 
      `Polkadot order created for ${order.direction} swap`)
  })

  relayer.on('polkadotDestOrderCreated', ({ order, txHash }) => {
    logEvent('POLKADOT_DEST_ORDER_CREATED', { order, txHash }, 
      `Polkadot destination order created for ${order.direction} swap`)
  })

  relayer.on('polkadotSrcEscrowDeployed', ({ order, txHash }) => {
    logEvent('POLKADOT_SRC_ESCROW_DEPLOYED', { order, txHash }, 
      `Polkadot source escrow deployed for order ${order.orderHash.slice(0, 16)}...`)
  })

  relayer.on('polkadotDstEscrowDeployed', ({ order, txHash }) => {
    logEvent('POLKADOT_DST_ESCROW_DEPLOYED', { order, txHash }, 
      `Polkadot destination escrow deployed for order ${order.orderHash.slice(0, 16)}...`)
  })

  relayer.on('polkadotSwapExecuted', ({ order, txHash }) => {
    logEvent('POLKADOT_SWAP_EXECUTED', { order, txHash }, 
      `Polkadot swap executed with secret reveal for order ${order.orderHash.slice(0, 16)}...`)
  })

  relayer.on('polkadotContractEvent', ({ contractAddress, data }) => {
    logEvent('POLKADOT_CONTRACT_EVENT', { contractAddress, data }, 
      `Contract event from ${contractAddress.slice(0, 16)}...`)
  })

  // Atomic swap completion events
  relayer.on('atomicSwapCompleted', ({ order }) => {
    logEvent('ATOMIC_SWAP_COMPLETED', { order }, 
      `🎉 Ethereum→Polkadot atomic swap completed! Order ${order.orderHash.slice(0, 16)}...`)
  })

  relayer.on('reverseAtomicSwapCompleted', ({ order }) => {
    logEvent('REVERSE_ATOMIC_SWAP_COMPLETED', { order }, 
      `🎉 Polkadot→Ethereum atomic swap completed! Order ${order.orderHash.slice(0, 16)}...`)
  })

  // Health and monitoring events
  relayer.on('healthCheckFailed', (error) => {
    logEvent('HEALTH_CHECK_FAILED', { error }, 
      `⚠️ Health check failed: ${error.message}`)
  })

  console.log('✅ Event listeners configured')
}

// Demo commands

program
  .command('full-demo')
  .description('Run complete demo showcasing all events')
  .option('--direction <direction>', 'Swap direction: eth-to-dot or dot-to-eth', 'eth-to-dot')
  .option('--amount <amount>', 'Amount to swap', '100')
  .option('--interactive', 'Interactive mode with step confirmations')
  .action(async (options) => {
    try {
      console.log('🎭 Starting Complete Integrated Relayer Demo')
      console.log('🌟 This demo showcases ALL events in the cross-chain swap lifecycle')
      console.log('=' .repeat(80))
      
      relayer = await initializeRelayer()
      
      const direction = options.direction === 'eth-to-dot' ? 'EthereumToPolkadot' : 'PolkadotToEthereum'
      const amount = parseUnits(options.amount, 6) // USDC has 6 decimals
      const dstAmount = parseUnits((parseFloat(options.amount) * 0.95).toString(), 10) // DOT has 10 decimals, 5% slippage
      
      console.log('\n📋 Demo Configuration:')
      console.log(`   Direction: ${direction}`)
      console.log(`   Source Amount: ${options.amount} ${direction === 'EthereumToPolkadot' ? 'USDC' : 'DOT'}`)
      console.log(`   Expected Destination: ${(parseFloat(options.amount) * 0.95).toFixed(2)} ${direction === 'EthereumToPolkadot' ? 'DOT' : 'USDC'}`)
      console.log(`   Ethereum Chain ID: ${demoConfig.ethereum.chainId}`)
      console.log(`   Polkadot Parachain ID: ${demoConfig.polkadot.parachainId}`)
      
      if (options.interactive) {
        const rl = createInterface({
          input: process.stdin,
          output: process.stdout
        })
        
        const question = (query: string): Promise<string> => {
          return new Promise(resolve => rl.question(query, resolve))
        }
        
        const proceed = await question('\n❓ Start the demo? (y/n): ')
        if (proceed.toLowerCase() !== 'y' && proceed.toLowerCase() !== 'yes') {
          console.log('❌ Demo cancelled')
          rl.close()
          return
        }
        rl.close()
      }
      
      console.log('\n🎬 PHASE 1: Cross-Chain Order Creation')
      console.log('-' .repeat(50))
      
      const orderParams: CrossChainOrderParams = {
        direction,
        salt: BigInt(Date.now()),
        maker: direction === 'EthereumToPolkadot' ? 
          '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' : // Ethereum address
          '5DfhGyQdFobKM8NsWvEeAKk5EQQgYe9AydgJ7rMB6E1EqRzV', // Polkadot address
        makingAmount: amount,
        takingAmount: dstAmount,
        makerAsset: direction === 'EthereumToPolkadot' ? 
          '0x0000000000000000000000000000000000000001' : // USDC address
          '0x0000000000000000000000000000000000000001', // DOT placeholder
        takerAsset: direction === 'EthereumToPolkadot' ? 
          '0x0000000000000000000000000000000000000001' : // DOT placeholder
          '0x0000000000000000000000000000000000000001', // USDC address
        allowPartialFills: false,
        allowMultipleFills: false,
        auction: {
          initialRateBump: 0,
          duration: 3600n,
          startTime: BigInt(Math.floor(Date.now() / 1000)),
          points: [
            { coefficient: 0, delay: 0 }, // Start point
            { coefficient: 50, delay: 30 }, // Mid point
            { coefficient: 100, delay: 60 } // End point
          ]
        },
        whitelist: [
          {
            address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', // Relayer address
            allowFrom: BigInt(0) // Allow from genesis
          },
          {
            address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', // Another resolver address
            allowFrom: BigInt(Math.floor(Date.now() / 1000)) // Allow from now
          }
        ],
        timeLocks: {
          srcWithdrawal: BigInt(10),
          srcPublicWithdrawal: BigInt(120),
          srcCancellation: BigInt(121),
          srcPublicCancellation: BigInt(122),
          dstWithdrawal: BigInt(10),
          dstPublicWithdrawal: BigInt(100),
          dstCancellation: BigInt(101)
        }
      }
      
      await delay(1000)
      const orderHash = await relayer.createCrossChainOrder(orderParams)
      
      console.log('\n🎬 PHASE 2: Cross-Chain Swap Execution')
      console.log('-' .repeat(50))
      
      await delay(2000)
      await relayer.executeCrossChainSwap(orderHash)
      
      console.log('\n🎬 PHASE 3: Event Summary')
      console.log('-' .repeat(50))
      
      await delay(1000)
      displayEventSummary()
      
      console.log('\n🎉 DEMO COMPLETED SUCCESSFULLY!')
      console.log('All cross-chain relayer events have been demonstrated')
      console.log('=' .repeat(80))
      
    } catch (error) {
      console.error('❌ Demo failed:', error)
      displayEventSummary()
    } finally {
      if (relayer) {
        await relayer.shutdown()
      }
    }
  })

program
  .command('event-showcase')
  .description('Showcase specific event types')
  .option('--event-type <type>', 'Event type to showcase: ethereum, polkadot, atomic, health, all', 'all')
  .action(async (options) => {
    try {
      console.log(`🎪 Event Showcase: ${options.eventType.toUpperCase()}`)
      console.log('=' .repeat(60))
      
      relayer = await initializeRelayer()
      
      switch (options.eventType) {
        case 'ethereum':
          await showcaseEthereumEvents()
          break
        case 'polkadot':
          await showcasePolkadotEvents()
          break
        case 'atomic':
          await showcaseAtomicSwapEvents()
          break
        case 'health':
          await showcaseHealthEvents()
          break
        case 'all':
        default:
          await showcaseAllEvents()
          break
      }
      
      displayEventSummary()
      
    } catch (error) {
      console.error('❌ Event showcase failed:', error)
    } finally {
      if (relayer) {
        await relayer.shutdown()
      }
    }
  })

program
  .command('stress-test')
  .description('Stress test with multiple concurrent swaps')
  .option('--count <count>', 'Number of concurrent swaps', '3')
  .action(async (options) => {
    try {
      console.log(`🏋️ Stress Test: ${options.count} Concurrent Swaps`)
      console.log('=' .repeat(60))
      
      relayer = await initializeRelayer()
      
      const swapCount = parseInt(options.count)
      const swapPromises: Promise<string>[] = []
      
      for (let i = 0; i < swapCount; i++) {
        const direction = i % 2 === 0 ? 'EthereumToPolkadot' : 'PolkadotToEthereum'
        const amount = parseUnits((50 + i * 10).toString(), 6)
        const dstAmount = parseUnits((47.5 + i * 9.5).toString(), 10)
        
        const orderParams: CrossChainOrderParams = {
          direction,
          salt: BigInt(Date.now() + i),
          maker: direction === 'EthereumToPolkadot' ? 
            '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' : 
            '5DfhGyQdFobKM8NsWvEeAKk5EQQgYe9AydgJ7rMB6E1EqRzV',
          makingAmount: amount,
          takingAmount: dstAmount,
          makerAsset: direction === 'EthereumToPolkadot' ? 
            '0xA0b86a33E6441E8c0Ec9cA7EB2fBe3Ed8c93De2f' : 'DOT',
          takerAsset: direction === 'EthereumToPolkadot' ? 
            'DOT' : '0xA0b86a33E6441E8c0Ec9cA7EB2fBe3Ed8c93De2f',
          allowPartialFills: false,
          allowMultipleFills: false
        }
        
        swapPromises.push(relayer.createAndExecuteSwap(orderParams))
        
        // Stagger the starts slightly
        await delay(500)
      }
      
      console.log(`🚀 Executing ${swapCount} concurrent swaps...`)
      const results = await Promise.allSettled(swapPromises)
      
      console.log('\n📊 Stress Test Results:')
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          console.log(`   ✅ Swap ${index + 1}: SUCCESS (${result.value.slice(0, 16)}...)`)
        } else {
          console.log(`   ❌ Swap ${index + 1}: FAILED (${result.reason.message})`)
        }
      })
      
      displayEventSummary()
      
    } catch (error) {
      console.error('❌ Stress test failed:', error)
    } finally {
      if (relayer) {
        await relayer.shutdown()
      }
    }
  })

program
  .command('monitor-events')
  .description('Real-time event monitoring')
  .option('--duration <seconds>', 'Monitoring duration in seconds', '60')
  .option('--interval <seconds>', 'Status update interval', '10')
  .action(async (options) => {
    try {
      console.log('📡 Real-Time Event Monitoring')
      console.log('=' .repeat(50))
      
      relayer = await initializeRelayer()
      
      const duration = parseInt(options.duration) * 1000
      const interval = parseInt(options.interval) * 1000
      
      console.log(`👀 Monitoring for ${options.duration} seconds...`)
      console.log('Press Ctrl+C to stop early\n')
      
      // Create some background activity
      setTimeout(async () => {
        if (relayer) {
          console.log('🎭 Creating background activity...')
          const orderParams: CrossChainOrderParams = {
            direction: 'EthereumToPolkadot',
            salt: BigInt(Date.now()),
            maker: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
            makingAmount: parseUnits('75', 6),
            takingAmount: parseUnits('71.25', 10),
            makerAsset: '0xA0b86a33E6441E8c0Ec9cA7EB2fBe3Ed8c93De2f',
            takerAsset: 'DOT',
            allowPartialFills: false,
            allowMultipleFills: false
          }
          
          try {
            await relayer.createAndExecuteSwap(orderParams)
          } catch (error) {
            console.log('Background activity completed with simulation')
          }
        }
      }, 5000)
      
      // Status updates
      const statusInterval = setInterval(() => {
        console.log(`\n📊 Event Summary (${eventLogs.length} events logged):`)
        const eventCounts = eventLogs.reduce((acc, log) => {
          acc[log.event] = (acc[log.event] || 0) + 1
          return acc
        }, {} as Record<string, number>)
        
        Object.entries(eventCounts).forEach(([event, count]) => {
          console.log(`   ${getEventEmoji(event)} ${event}: ${count}`)
        })
      }, interval)
      
      // Stop monitoring after duration
      setTimeout(() => {
        clearInterval(statusInterval)
        console.log('\n⏰ Monitoring duration completed')
        displayEventSummary()
        
        if (relayer) {
          relayer.shutdown()
        }
      }, duration)
      
      // Handle early exit
      process.on('SIGINT', () => {
        clearInterval(statusInterval)
        console.log('\n🛑 Monitoring stopped early')
        displayEventSummary()
        
        if (relayer) {
          relayer.shutdown()
        }
        process.exit(0)
      })
      
    } catch (error) {
      console.error('❌ Event monitoring failed:', error)
      if (relayer) {
        await relayer.shutdown()
      }
    }
  })

// Showcase functions
async function showcaseEthereumEvents() {
  console.log('🔷 Showcasing Ethereum Events')
  
  const orderParams: CrossChainOrderParams = {
    direction: 'EthereumToPolkadot',
    salt: BigInt(Date.now()),
    maker: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    makingAmount: parseUnits('100', 6),
    takingAmount: parseUnits('95', 10),
    makerAsset: '0xA0b86a33E6441E8c0Ec9cA7EB2fBe3Ed8c93De2f',
    takerAsset: 'DOT'
  }
  
  const orderHash = await relayer!.createCrossChainOrder(orderParams)
  await delay(1000)
  await relayer!.executeEthereumToPolkadotSwap(orderHash)
}

async function showcasePolkadotEvents() {
  console.log('🔴 Showcasing Polkadot Events')
  
  const orderParams: CrossChainOrderParams = {
    direction: 'PolkadotToEthereum',
    salt: BigInt(Date.now()),
    maker: '5DfhGyQdFobKM8NsWvEeAKk5EQQgYe9AydgJ7rMB6E1EqRzV',
    makingAmount: parseUnits('50', 10),
    takingAmount: parseUnits('47.5', 6),
    makerAsset: 'DOT',
    takerAsset: '0xA0b86a33E6441E8c0Ec9cA7EB2fBe3Ed8c93De2f'
  }
  
  const orderHash = await relayer!.createCrossChainOrder(orderParams)
  await delay(1000)
  await relayer!.executePolkadotToEthereumSwap(orderHash)
}

async function showcaseAtomicSwapEvents() {
  console.log('💎 Showcasing Atomic Swap Events')
  
  // Create both directions
  await showcaseEthereumEvents()
  await delay(2000)
  await showcasePolkadotEvents()
}

async function showcaseHealthEvents() {
  console.log('🏥 Showcasing Health Events')
  
  // Force a health check
  if (relayer) {
    // Simulate some orders to check
    const orderParams: CrossChainOrderParams = {
      direction: 'EthereumToPolkadot',
      salt: BigInt(Date.now()),
      maker: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
      makingAmount: parseUnits('25', 6),
      takingAmount: parseUnits('23.75', 10),
      makerAsset: '0xA0b86a33E6441E8c0Ec9cA7EB2fBe3Ed8c93De2f',
      takerAsset: 'DOT'
    }
    
    await relayer.createCrossChainOrder(orderParams)
    await delay(2000)
    
    // Health checks happen automatically via monitoring
    console.log('Health events will be triggered by the monitoring system')
  }
}

async function showcaseAllEvents() {
  console.log('🌟 Showcasing ALL Event Types')
  
  await showcaseEthereumEvents()
  await delay(2000)
  await showcasePolkadotEvents()
  await delay(2000)
  await showcaseHealthEvents()
}

// Utility functions
function displayEventSummary() {
  console.log('\n📊 EVENT SUMMARY')
  console.log('=' .repeat(80))
  
  if (eventLogs.length === 0) {
    console.log('No events logged during this session')
    return
  }
  
  // Group events by type
  const eventsByType = eventLogs.reduce((acc, log) => {
    if (!acc[log.event]) {
      acc[log.event] = []
    }
    acc[log.event].push(log)
    return acc
  }, {} as Record<string, EventLog[]>)
  
  // Display summary
  console.log(`Total Events: ${eventLogs.length}`)
  console.log(`Event Types: ${Object.keys(eventsByType).length}`)
  console.log(`Time Span: ${formatDuration(Math.max(...eventLogs.map(l => l.timestamp)) - Math.min(...eventLogs.map(l => l.timestamp)))}`)
  
  console.log('\n📋 Events by Type:')
  Object.entries(eventsByType).forEach(([eventType, logs]) => {
    console.log(`\n${getEventEmoji(eventType)} ${eventType} (${logs.length} events):`)
    logs.forEach((log, index) => {
      const time = new Date(log.timestamp).toLocaleTimeString()
      console.log(`   ${index + 1}. [${time}] ${log.details}`)
    })
  })
  
  console.log('\n⏱️  Timeline:')
  eventLogs
    .sort((a, b) => a.timestamp - b.timestamp)
    .forEach((log, index) => {
      const time = new Date(log.timestamp).toLocaleTimeString()
      console.log(`${String(index + 1).padStart(2)}. [${time}] ${getEventEmoji(log.event)} ${log.event}`)
    })
}

function getEventEmoji(event: string): string {
  const emojiMap: Record<string, string> = {
    'ORDER_CREATED': '📝',
    'ETHEREUM_ESCROW_DEPLOYED': '🏗️',
    'ETHEREUM_DEST_ESCROW_DEPLOYED': '🏢',
    'ETHEREUM_SRC_ESCROW_CREATED': '🔷',
    'ETHEREUM_DST_ESCROW_CREATED': '💎',
    'ETHEREUM_WITHDRAWAL_EXECUTED': '💸',
    'POLKADOT_ORDER_CREATED': '📄',
    'POLKADOT_DEST_ORDER_CREATED': '📋',
    'POLKADOT_SRC_ESCROW_DEPLOYED': '🏭',
    'POLKADOT_DST_ESCROW_DEPLOYED': '🏪',
    'POLKADOT_SWAP_EXECUTED': '⚡',
    'POLKADOT_CONTRACT_EVENT': '📡',
    'ATOMIC_SWAP_COMPLETED': '🎉',
    'REVERSE_ATOMIC_SWAP_COMPLETED': '✨',
    'HEALTH_CHECK_FAILED': '⚠️'
  }
  return emojiMap[event] || '📌'
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60000).toFixed(1)}m`
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Parse command line arguments
program.parse()

export { relayer, eventLogs, demoConfig }