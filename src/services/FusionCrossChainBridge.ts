import { ApiPromise, WsProvider, Keyring } from '@polkadot/api';
import { ContractPromise } from '@polkadot/api-contract';
import { BN } from '@polkadot/util';
import { JsonRpcProvider, Wallet as EthWallet } from 'ethers';
import { randomBytes, createHash } from 'crypto';
import Sdk from '@1inch/cross-chain-sdk';

// Types for our Fusion+ extension
export interface FusionOrderParams {
    direction: 'EthereumToPolkadot' | 'PolkadotToEthereum';
    srcToken: string;  // AccountId for Polkadot, address for Ethereum
    dstToken: string;  // Address for Ethereum, AccountId for Polkadot
    srcAmount: string;
    minDstAmount: string;
    fillDeadline: number;
    ethereumRecipient?: string; // For Polkadot->Ethereum swaps
    polkadotRecipient?: string; // For Ethereum->Polkadot swaps
    maxResolverFee: string;
}

export interface HTLCSecret {
    secret: Uint8Array;
    hashLock: Uint8Array;
}

export interface CrossChainSwapResult {
    orderHash: string;
    txHash: string;
    blockHash?: string;
    secret?: Uint8Array;
}

/**
 * Main Fusion+ Cross-Chain Bridge Controller
 * Coordinates swaps between Ethereum (1inch) and Polkadot
 */
export class FusionCrossChainBridge {
    private polkadotApi: ApiPromise;
    private polkadotContract: ContractPromise;
    private ethereumProvider: JsonRpcProvider;
    private resolver: any; // Your existing Resolver class
    private polkadotSigner: any;
    private ethereumSigner: EthWallet;

    constructor(
        polkadotWsUrl: string,
        polkadotContractAddress: string,
        polkadotContractAbi: any,
        ethereumRpcUrl: string,
        resolverAddresses: {src: string, dst: string},
        signers: {polkadot: any, ethereum: string}
    ) {
        // Initialize connections (async setup needed)
        this.initializeConnections(
            polkadotWsUrl, 
            polkadotContractAddress, 
            polkadotContractAbi,
            ethereumRpcUrl,
            resolverAddresses,
            signers
        );
    }

    private async initializeConnections(
        polkadotWsUrl: string,
        polkadotContractAddress: string,
        polkadotContractAbi: any,
        ethereumRpcUrl: string,
        resolverAddresses: {src: string, dst: string},
        signers: {polkadot: any, ethereum: string}
    ) {
        // Connect to Polkadot
        const provider = new WsProvider(polkadotWsUrl);
        this.polkadotApi = await ApiPromise.create({ provider });
        
        this.polkadotContract = new ContractPromise(
            this.polkadotApi,
            polkadotContractAbi,
            polkadotContractAddress
        );

        // Connect to Ethereum
        this.ethereumProvider = new JsonRpcProvider(ethereumRpcUrl);
        this.ethereumSigner = new EthWallet(signers.ethereum, this.ethereumProvider);
        
        // Initialize resolver
        this.resolver = new Resolver(resolverAddresses.src, resolverAddresses.dst);
        this.polkadotSigner = signers.polkadot;
    }

    /**
     * Create HTLC secret and hash lock
     */
    private generateHTLCSecret(): HTLCSecret {
        const secret = randomBytes(32);
        const hashLock = createHash('blake2b512').update(secret).digest().slice(0, 32);
        
        return {
            secret,
            hashLock
        };
    }

    /**
     * Execute Polkadot -> Ethereum swap
     */
    async executePolkadotToEthereum(params: FusionOrderParams): Promise<CrossChainSwapResult> {
        if (params.direction !== 'PolkadotToEthereum') {
            throw new Error('Invalid direction for this method');
        }

        // Step 1: Create order on Polkadot
        const polkadotOrderHash = await this.createPolkadotOrder(params);
        
        // Step 2: Generate HTLC secret
        const htlcSecret = this.generateHTLCSecret();
        
        // Step 3: Deploy escrow on Polkadot with hash lock
        await this.deployPolkadotEscrow(polkadotOrderHash, htlcSecret.hashLock);
        
        // Step 4: Create corresponding order on Ethereum
        const ethereumOrder = await this.createEthereumOrder(params, htlcSecret.hashLock);
        
        // Step 5: Deploy Ethereum escrow
        const ethereumTx = await this.deployEthereumEscrow(ethereumOrder, htlcSecret.hashLock);
        
        // Step 6: Execute Polkadot side (reveal secret)
        await this.executePolkadotSwap(polkadotOrderHash, htlcSecret.secret);
        
        // Step 7: Use revealed secret to claim funds on Ethereum
        const finalTx = await this.claimEthereumFunds(ethereumOrder.orderHash, htlcSecret.secret);

        return {
            orderHash: polkadotOrderHash,
            txHash: finalTx.hash,
            secret: htlcSecret.secret
        };
    }

    /**
     * Execute Ethereum -> Polkadot swap  
     */
    async executeEthereumToPolkadot(params: FusionOrderParams): Promise<CrossChainSwapResult> {
        if (params.direction !== 'EthereumToPolkadot') {
            throw new Error('Invalid direction for this method');
        }

        // Step 1: Generate HTLC secret
        const htlcSecret = this.generateHTLCSecret();
        
        // Step 2: Create and sign Ethereum order
        const ethereumOrder = await this.createEthereumOrder(params, htlcSecret.hashLock);
        
        // Step 3: Deploy Ethereum escrow (lock funds)
        const ethereumTx = await this.deployEthereumEscrow(ethereumOrder, htlcSecret.hashLock);
        
        // Step 4: Create corresponding order on Polkadot
        const polkadotOrderHash = await this.createPolkadotOrder(params);
        
        // Step 5: Deploy Polkadot escrow
        await this.deployPolkadotEscrow(polkadotOrderHash, htlcSecret.hashLock);
        
        // Step 6: Execute Ethereum side (reveal secret)
        const ethereumExecuteTx = await this.executeEthereumSwap(ethereumOrder.orderHash, htlcSecret.secret);
        
        // Step 7: Use revealed secret to claim funds on Polkadot
        const polkadotTx = await this.executePolkadotSwap(polkadotOrderHash, htlcSecret.secret);

        return {
            orderHash: polkadotOrderHash,
            txHash: polkadotTx.txHash,
            secret: htlcSecret.secret
        };
    }

    /**
     * Create order on Polkadot side
     */
    private async createPolkadotOrder(params: FusionOrderParams): Promise<string> {
        const createOrderParams = {
            direction: params.direction,
            srcToken: params.srcToken,
            dstToken: Array.from(Buffer.from(params.dstToken.slice(2), 'hex')), // Convert hex to bytes
            srcAmount: new BN(params.srcAmount),
            minDstAmount: new BN(params.minDstAmount),
            fillDeadline: params.fillDeadline,
            ethereumRecipient: params.ethereumRecipient ? 
                Array.from(Buffer.from(params.ethereumRecipient.slice(2), 'hex')) : 
                new Array(20).fill(0),
            maxResolverFee: new BN(params.maxResolverFee)
        };

        // Call contract
        const result = await this.polkadotContract.tx.createOrder(
            { 
                value: new BN(params.srcAmount),
                gasLimit: this.polkadotApi.registry.createType('WeightV2', {
                    refTime: new BN('10000000000'),
                    proofSize: new BN('131072'),
                }) 
            },
            createOrderParams
        ).signAndSend(this.polkadotSigner);

        // Extract order hash from events
        return this.extractOrderHashFromEvents(result);
    }

    /**
     * Deploy escrow on Polkadot with hash lock
     */
    private async deployPolkadotEscrow(orderHash: string, hashLock: Uint8Array): Promise<void> {
        const resolverParams = {
            resolver: this.polkadotSigner.address,
            hashLock: Array.from(hashLock),
            ethereumEscrowAddress: new Array(20).fill(0), // Will be set after Ethereum deployment
            resolverFee: new BN('1000') // 1000 units resolver fee
        };

        const safetyDeposit = new BN('10000'); // Minimum safety deposit

        await this.polkadotContract.tx.deployEscrow(
            { 
                value: safetyDeposit,
                gasLimit: this.polkadotApi.registry.createType('WeightV2', {
                    refTime: new BN('10000000000'),
                    proofSize: new BN('131072'),
                })
            },
            Array.from(Buffer.from(orderHash.slice(2), 'hex')),
            resolverParams
        ).signAndSend(this.polkadotSigner);
    }

    /**
     * Execute swap on Polkadot (reveal secret)
     */
    private async executePolkadotSwap(orderHash: string, secret: Uint8Array): Promise<{txHash: string}> {
        const result = await this.polkadotContract.tx.executeSwap(
            {
                gasLimit: this.polkadotApi.registry.createType('WeightV2', {
                    refTime: new BN('10000000000'),
                    proofSize: new BN('131072'),
                })
            },
            Array.from(Buffer.from(orderHash.slice(2), 'hex')),
            Array.from(secret)
        ).signAndSend(this.polkadotSigner);

        return { txHash: result.toString() };
    }

    /**
     * Create order on Ethereum side (using existing 1inch infrastructure)
     */
    private async createEthereumOrder(params: FusionOrderParams, hashLock: Uint8Array): Promise<any> {
        // Create 1inch CrossChainOrder
        const order = new Sdk.CrossChainOrder({
            makerAsset: params.direction === 'EthereumToPolkadot' ? params.srcToken : params.dstToken,
            takerAsset: params.direction === 'EthereumToPolkadot' ? params.dstToken : params.srcToken,
            makingAmount: params.direction === 'EthereumToPolkadot' ? params.srcAmount : params.minDstAmount,
            takingAmount: params.direction === 'EthereumToPolkadot' ? params.minDstAmount : params.srcAmount,
            maker: await this.ethereumSigner.getAddress(),
            // Add Fusion+ specific escrow extension
            escrowExtension: {
                hashLockInfo: {
                    hashLock: '0x' + Buffer.from(hashLock).toString('hex')
                },
                srcSafetyDeposit: BigInt('10000'),
                dstSafetyDeposit: BigInt('10000')
            }
        });

        return order;
    }

    /**
     * Deploy escrow on Ethereum using existing resolver
     */
    private async deployEthereumEscrow(order: any, hashLock: Uint8Array) {
        // Sign the order
        const signature = await this.ethereumSigner.signTypedData(
            order.domain,
            order.types,
            order.message
        );

        // Create taker traits
        const takerTraits = new Sdk.TakerTraits({
            // Configure traits as needed
        });

        // Deploy source escrow
        const deployTx = this.resolver.deploySrc(
            1, // Ethereum chain ID
            order,
            signature,
            takerTraits,
            BigInt(order.makingAmount)
        );

        return await this.ethereumSigner.sendTransaction(deployTx);
    }

    /**
     * Execute Ethereum swap (reveal secret)
     */
    private async executeEthereumSwap(orderHash: string, secret: Uint8Array) {
        // This would use the existing resolver.withdraw method
        const immutables = await this.getEthereumImmutables(orderHash);
        const escrowAddress = await this.getEthereumEscrowAddress(orderHash);
        
        const withdrawTx = this.resolver.withdraw(
            'src',
            new Sdk.Address(escrowAddress),
            '0x' + Buffer.from(secret).toString('hex'),
            immutables
        );

        return await this.ethereumSigner.sendTransaction(withdrawTx);
    }

    /**
     * Claim funds on Ethereum using revealed secret
     */
    private async claimEthereumFunds(orderHash: string, secret: Uint8Array) {
        const immutables = await this.getEthereumImmutables(orderHash);
        const escrowAddress = await this.getEthereumEscrowAddress(orderHash);
        
        const withdrawTx = this.resolver.withdraw(
            'dst',
            new Sdk.Address(escrowAddress),
            '0x' + Buffer.from(secret).toString('hex'),
            immutables
        );

        return await this.ethereumSigner.sendTransaction(withdrawTx);
    }

    /**
     * Bidirectional swap with automatic direction detection
     */
    async executeSwap(params: FusionOrderParams): Promise<CrossChainSwapResult> {
        if (params.direction === 'PolkadotToEthereum') {
            return this.executePolkadotToEthereum(params);
        } else {
            return this.executeEthereumToPolkadot(params);
        }
    }

    /**
     * Cancel order (emergency function)
     */
    async cancelOrder(orderHash: string, chain: 'ethereum' | 'polkadot'): Promise<void> {
        if (chain === 'polkadot') {
            await this.polkadotContract.tx.cancelOrder(
                {
                    gasLimit: this.polkadotApi.registry.createType('WeightV2', {
                        refTime: new BN('10000000000'),
                        proofSize: new BN('131072'),
                    })
                },
                Array.from(Buffer.from(orderHash.slice(2), 'hex'))
            ).signAndSend(this.polkadotSigner);
        } else {
            // Cancel on Ethereum using resolver
            const immutables = await this.getEthereumImmutables(orderHash);
            const escrowAddress = await this.getEthereumEscrowAddress(orderHash);
            
            const cancelTx = this.resolver.cancel('src', new Sdk.Address(escrowAddress), immutables);
            await this.ethereumSigner.sendTransaction(cancelTx);
        }
    }

    /**
     * Get order status from Polkadot
     */
    async getPolkadotOrderStatus(orderHash: string): Promise<any> {
        const result = await this.polkadotContract.query.getOrder(
            this.polkadotSigner.address,
            { gasLimit: -1, storageDepositLimit: null },
            Array.from(Buffer.from(orderHash.slice(2), 'hex'))
        );

        return result.output?.toJSON();
    }

    /**
     * Monitor cross-chain completion
     */
    async monitorSwapCompletion(orderHash: string): Promise<boolean> {
        return new Promise((resolve) => {
            const checkCompletion = async () => {
                const polkadotOrder = await this.getPolkadotOrderStatus(orderHash);
                
                if (polkadotOrder && polkadotOrder.status === 'Executed') {
                    resolve(true);
                    return;
                }

                // Check again in 5 seconds
                setTimeout(checkCompletion, 5000);
            };

            checkCompletion();
        });
    }

    // Helper methods
    private extractOrderHashFromEvents(result: any): string {
        // Extract order hash from Polkadot events
        // Implementation depends on the specific event structure
        return '0x' + 'placeholder_hash';
    }

    private async getEthereumImmutables(orderHash: string): Promise<any> {
        // Get immutables from Ethereum events or contract state
        // This would integrate with your existing EscrowFactory
        return {};
    }

    private async getEthereumEscrowAddress(orderHash: string): Promise<string> {
        // Get escrow address from Ethereum
        return '0x0000000000000000000000000000000000000000';
    }
}

/**
 * Usage Example and Demo Script
 */
export class FusionDemo {
    private bridge: FusionCrossChainBridge;

    constructor(bridge: FusionCrossChainBridge) {
        this.bridge = bridge;
    }

    /**
     * Demo: Polkadot DOT -> Ethereum USDC swap
     */
    async demoDotToUsdc(): Promise<void> {
        console.log('🚀 Starting DOT -> USDC cross-chain swap...');

        const swapParams: FusionOrderParams = {
            direction: 'PolkadotToEthereum',
            srcToken: 'DOT_TOKEN_ACCOUNT_ID', // Polkadot DOT token
            dstToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // Ethereum USDC
            srcAmount: '1000000000000', // 1 DOT (12 decimals)
            minDstAmount: '950000', // 0.95 USDC (6 decimals)
            fillDeadline: Date.now() + 3600000, // 1 hour from now
            ethereumRecipient: '0x742d35Cc6600Bc1e0F4BFEa5d7d4123e6A5c5c63',
            maxResolverFee: '1000000000' // 0.001 DOT
        };

        try {
            const result = await this.bridge.executeSwap(swapParams);
            console.log('✅ Swap completed!');
            console.log('Order Hash:', result.orderHash);
            console.log('Transaction:', result.txHash);
            console.log('Secret:', result.secret ? Buffer.from(result.secret).toString('hex') : 'N/A');

            // Monitor completion
            const completed = await this.bridge.monitorSwapCompletion(result.orderHash);
            console.log('🎉 Cross-chain swap fully completed:', completed);
        } catch (error) {
            console.error('❌ Swap failed:', error);
        }
    }

    /**
     * Demo: Ethereum USDC -> Polkadot DOT swap
     */
    async demoUsdcToDot(): Promise<void> {
        console.log('🚀 Starting USDC -> DOT cross-chain swap...');

        const swapParams: FusionOrderParams = {
            direction: 'EthereumToPolkadot',
            srcToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // Ethereum USDC
            dstToken: 'DOT_TOKEN_ACCOUNT_ID', // Polkadot DOT
            srcAmount: '1000000', // 1 USDC (6 decimals)
            minDstAmount: '950000000000', // 0.95 DOT (12 decimals)
            fillDeadline: Date.now() + 3600000, // 1 hour from now
            polkadotRecipient: 'POLKADOT_RECIPIENT_ACCOUNT_ID',
            maxResolverFee: '10000' // 0.01 USDC
        };

        try {
            const result = await this.bridge.executeSwap(swapParams);
            console.log('✅ Swap completed!');
            console.log('Order Hash:', result.orderHash);
            console.log('Transaction:', result.txHash);

            const completed = await this.bridge.monitorSwapCompletion(result.orderHash);
            console.log('🎉 Cross-chain swap fully completed:', completed);
        } catch (error) {
            console.error('❌ Swap failed:', error);
        }
    }

    /**
     * Run full bidirectional demo
     */
    async runFullDemo(): Promise<void> {
        console.log('🌉 Starting Fusion+ Cross-Chain Demo');
        console.log('=====================================');

        // Demo 1: DOT -> USDC
        await this.demoDotToUsdc();
        
        console.log('\n⏱️  Waiting 30 seconds before reverse swap...\n');
        await new Promise(resolve => setTimeout(resolve, 30000));

        // Demo 2: USDC -> DOT  
        await this.demoUsdcToDot();

        console.log('\n🎊 Demo completed! Both directions tested.');
    }
}