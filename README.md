# 1inch Fusion+ Polkadot Extension

💸 **Enabling secure, bidirectional token swaps between Ethereum and Polkadot**

This project extends the 1inch Fusion+ cross-chain swap protocol to enable seamless, trustless token swaps between Ethereum and Polkadot blockchains. It preserves the core hashlock and timelock mechanisms of Fusion+, supports bidirectional swaps, and includes features like partial fills and a relayer/resolver system. The implementation is designed for the 1inch Fusion+ Hackathon, with a demo showcasing on-chain USDC swaps on Ethereum Sepolia and Polkadot Rococo testnets.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Usage](#usage)
- [Testing](#testing)
- [Demo](#demo)
- [Contributing](#contributing)
- [License](#license)

## Overview

The 1inch Fusion+ Polkadot Extension bridges Ethereum's EVM-based ecosystem with Polkadot's Substrate-based blockchain, enabling secure cross-chain token swaps (e.g., **USDC on Ethereum ↔ USDC on Polkadot**). The project leverages a custom Ink! smart contract on Polkadot (`intent_escrow`) and integrates with 1inch's Fusion+ SDK on Ethereum. Key features include hashlock/timelock security, support for single and partial fills, and a relayer/resolver system for cross-chain coordination. A minimal UI enhances user interaction, and the implementation is tested on testnets with on-chain execution.

## Features

- **Bidirectional Swaps**: Swap tokens between Ethereum and Polkadot (e.g., Ethereum USDC to Polkadot USDC and vice versa).
- **Hashlock and Timelock Security**: Uses cryptographic hashlocks (Blake2x256 on Polkadot, 1inch SDK on Ethereum) and timelocks for trustless swaps.
- **Partial Fills**: Supports partial order fills using Merkle tree-based hashlocks for flexible swap execution.
- **Relayer and Resolver System**: Coordinates cross-chain swaps via a relayer and resolver contracts, ensuring efficient order matching.
- **On-Chain Execution**: Demonstrated on Ethereum Sepolia and Polkadot Rococo testnets with USDC transfers.
- **Minimal UI**: A React-based interface for viewing order status and triggering withdrawals.
- **Error Handling**: Comprehensive error management for paused contracts, invalid orders, expired timelocks, and insufficient funds.

## Architecture

The project integrates Polkadot and Ethereum ecosystems using the following components:

### Polkadot Smart Contract (`intent_escrow`)

- Written in Ink! (Rust) for Substrate compatibility.
- Manages orders with states (`Pending`, `Locked`, `PartiallyFilled`, `Executed`, `Refunded`, `Disputed`).
- Supports functions like `submit_fusion_intent`, `assign_resolver`, `execute_swap`, and `refund_order`.
- Uses `Mapping` for order storage and Blake2x256 for hashlocks.

### Ethereum Components

- Leverages 1inch's Cross-Chain SDK (`@1inch/cross-chain-sdk`) for order creation, signing, and escrow management.
- Uses `Wallet`, `Resolver`, and `EscrowFactory` classes to handle token approvals, order filling, and escrow deployment.
- Supports single and multiple fills with `TakerTraits` and `HashLock` for secure transactions.

### Cross-Chain Coordination

- A relayer monitors events (`FusionOrderCreated`, `ResolverAssigned`) and relays data between chains.
- Resolvers deploy source (`deploySrc`) and destination (`deployDst`) escrows, handling withdrawals and cancellations.
- Address compatibility is achieved by mapping Ethereum's 20-byte addresses to Polkadot's 32-byte `AccountId`.

### Testing Framework

- Jest-based tests simulate single fills, multiple fills (100% and 50%), and cancellations.
- Uses Anvil (prool) for forked testnets (Ethereum Sepolia, Polkadot Rococo).

### ENV
ETHEREUM_RPC_URL=http://localhost:8545
POLKADOT_WS_URL=wss://rpc.shibuya.astar.network

ETHEREUM_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
POLKADOT_MNEMONIC=bottom drive obey lake curtain smoke basket hold race lonely fit walk
LIMIT_ORDER_PROTOCOL_ADDRESS=0x3456789012345678901234567890123456789012

ETHEREUM_CHAIN_ID=31337

FUSION_FACTORY_ADDRESS=0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
ETHEREUM_RESOLVER_ADDRESS=0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9

POLKADOT_ESCROW_ADDRESS=XR2RVPmdBABfZNEWrQRLTzj7NGqiUfQqJqtRpnRtRbpGWBP
POLKADOT_RESOLVER_ADDRESS=W4tVmiw832T4b5116n2J9EQybV36q8hwJSxg2gcKgAWVuEH

SRC_CHAIN_CREATE_FORK=false
DST_CHAIN_CREATE_FORK=false
## Prerequisites

- **Node.js** (v18 or higher)
- **Rust and Cargo** (for Ink! contract compilation)
- **Polkadot.js** (for interacting with Polkadot nodes)
- **Anvil (prool)** for testnet forking
- **Docker** (optional, for running testnet nodes)

### Environment Variables

- `SRC_CHAIN_RPC`: Ethereum RPC URL (e.g., Sepolia)
- `DST_CHAIN_RPC`: Polkadot RPC URL (e.g., Rococo)
- `SRC_CHAIN_CREATE_FORK`: Set to `true` for forked Ethereum testnet
- `DST_CHAIN_CREATE_FORK`: Set to `true` for forked Polkadot testnet

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/your-repo/1inch-fusion-polkadot.git
cd 1inch-fusion-polkadot
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Install Rust and Ink!

```bash
rustup update
rustup install nightly
rustup target add wasm32-unknown-unknown --toolchain nightly
cargo install cargo-contract --force --locked
```

### 4. Set Up Environment Variables

Create a `.env` file in the root directory:

```env
SRC_CHAIN_RPC=https://sepolia.infura.io/v3/your-infura-key
DST_CHAIN_RPC=wss://rococo-rpc.polkadot.io
SRC_CHAIN_CREATE_FORK=true
DST_CHAIN_CREATE_FORK=true
```

### 5. Build the Project

```bash
npm run build
```

### 6. Compile Polkadot Contract

```bash
cd contracts/intent_escrow
cargo contract build
cd ../..
```

### 7. Deploy Contracts

- Deploy the `intent_escrow` contract on a Polkadot testnet (e.g., Rococo) using `cargo-contract`.
- Deploy Ethereum contracts (`EscrowFactory`, `Resolver`) using the deployment script:

```bash
npm run deploy:testnet
```

## Usage

### 1. Start Development Environment

For Ethereum (Local fork):
anvil \
  --host 0.0.0.0 \
  --port 8545 \
  --accounts 10 \
  --balance 100 \
  --chain-id 31337

For Polkadot (Shibuya testnest :


### 2. Run the Relayer

Start the relayer to monitor and relay events between chains:

```bash
npm run dev
```

### 3. Create a Cross-Chain Order

Use the CLI to create an order:

```bash
npm run create-order
```

Or programmatically using the `Wallet` class:

```javascript
const order = Sdk.CrossChainOrder.new(
  new Address(srcEscrowFactory),
  {
    salt: Sdk.randBigInt(1000n),
    maker: new Address(await srcChainUser.getAddress()),
    makingAmount: parseUnits('100', 6),
    takingAmount: parseUnits('99', 6),
    makerAsset: new Address(config.chain.source.tokens.USDC.address),
    takerAsset: new Address(config.chain.destination.tokens.USDC.address)
  },
  {
    hashLock: Sdk.HashLock.forSingleFill(uint8ArrayToHex(randomBytes(32))),
    timeLocks: Sdk.TimeLocks.new({
      srcWithdrawal: 10n,
      srcPublicWithdrawal: 120n,
      srcCancellation: 121n,
      srcPublicCancellation: 122n,
      dstWithdrawal: 10n,
      dstPublicWithdrawal: 100n,
      dstCancellation: 101n
    }),
    srcChainId: config.chain.source.chainId,
    dstChainId: config.chain.destination.chainId,
    srcSafetyDeposit: parseEther('0.001'),
    dstSafetyDeposit: parseEther('0.001')
  },
  {
    auction: new Sdk.AuctionDetails({
      initialRateBump: 0,
      points: [],
      duration: 120n,
      startTime: srcTimestamp
    }),
    whitelist: [{ address: new Address(srcResolver), allowFrom: 0n }],
    resolvingStartTime: 0n
  },
  {
    nonce: Sdk.randBigInt(UINT_40_MAX),
    allowPartialFills: true,
    allowMultipleFills: true
  }
);
const signature = await srcChainUser.signOrder(srcChainId, order);
```

### 4. Fill the Order

Use the `Resolver` class to fill the order:

```javascript
const resolverContract = new Resolver(srcResolver, dstResolver);
await srcChainResolver.send(
  resolverContract.deploySrc(
    srcChainId,
    order,
    signature,
    Sdk.TakerTraits.default()
      .setExtension(order.extension)
      .setAmountMode(Sdk.AmountMode.maker)
      .setAmountThreshold(order.takingAmount),
    order.makingAmount
  )
);
```

### 5. Run Demos

Run bidirectional swap demos:

```bash
# Run complete bidirectional demo
npx ts-node src/services/demo.ts full-demo



### Test Scenarios

- **Single Fill**: Swaps 100 USDC (Ethereum) → 99 USDC (Polkadot).
- **Multiple Fills (100%)**: Fills entire order using Merkle-based hashlocks.
- **Multiple Fills (50%)**: Fills half the order, calculating proportional amounts.
- **Cancellation**: Cancels escrows after timelock expiration, refunding funds.

### Test Setup

- Uses Anvil to fork Ethereum Local and Polkadot Shibuya testnets.
- Configures USDC balances via donor accounts for testing.
- Validates balances using `expect` assertions.


## Contributing

Contributions are welcome! To contribute:

1. Fork the repository.
2. Create a feature branch (`git checkout -b feature/your-feature`).
3. Commit changes (`git commit -m "Add your feature"`).
4. Push to the branch (`git push origin feature/your-feature`).
5. Open a pull request.

Please ensure code follows the project's style guide and includes tests.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.