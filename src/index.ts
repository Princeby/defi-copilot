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

// Default configurations for different wallet types
const serverConfig: WalletConfig = {
  ethereum: {
    type: 'private-key',
    rpcUrl: process.env.ETHEREUM_RPC_URL || 'http://localhost:8545',
    privateKey: process.env.ETHEREUM_PRIVATE_KEY || '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
    fusionFactoryAddress: process.env.FUSION_FACTORY_ADDRESS || '0x111111125421ca6dc452d289314280a0f8842a65',
    resolverAddress: process.env.ETHEREUM_RESOLVER_ADDRESS || '',
    chainId: parseInt(process.env.ETHEREUM_CHAIN_ID || '1')
  },
  polkadot: {
    type: 'mnemonic',
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

// Parse command line arguments
program.parse()

// Export for use as a module
export { FusionPolkadotRelayer, WalletConfig, browserConfig, serverConfig, walletConnectConfig }