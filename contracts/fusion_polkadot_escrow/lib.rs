#![cfg_attr(not(feature = "std"), no_std, no_main)]

use ink::storage::Mapping;
use scale::{Decode, Encode};

/// Main Fusion+ Cross-Chain Escrow Contract for Polkadot - Compatible with Resolver
#[ink::contract]
mod fusion_polkadot_escrow {
    use super::*;
    use ink::prelude::vec::Vec; // Import Vec for no_std environment

    // --- Core Types (Aligned with Resolver) ---

    /// Cross-chain swap direction
    #[derive(Debug, Clone, PartialEq, Eq, Encode, Decode)]
    #[cfg_attr(feature = "std", derive(scale_info::TypeInfo, ink::storage::traits::StorageLayout))]
    pub enum SwapDirection {
        EthereumToPolkadot,
        PolkadotToEthereum,
    }

    /// Order status following 1inch Fusion+ pattern  
    #[derive(Debug, Clone, PartialEq, Eq, Encode, Decode)]
    #[cfg_attr(feature = "std", derive(scale_info::TypeInfo, ink::storage::traits::StorageLayout))]
    pub enum OrderStatus {
        Pending,      // Order created, waiting for resolver
        Locked,       // HTLC created with hashlock/timelock
        PartialFill,  // Partially executed (stretch goal)
        Executed,     // Successfully completed
        Cancelled,    // Cancelled before execution
        Refunded,     // Refunded after timelock expiry
    }

    /// Time locks structure (matches resolver)
    #[derive(Debug, Clone, PartialEq, Eq, Encode, Decode)]
    #[cfg_attr(feature = "std", derive(scale_info::TypeInfo, ink::storage::traits::StorageLayout))]
    pub struct TimeLocks {
        pub fill_deadline: Timestamp,      // When order expires
        pub private_cancellation: Timestamp, // Early cancellation period
    }

    /// Hash lock information
    #[derive(Debug, Clone, PartialEq, Eq, Encode, Decode)]
    #[cfg_attr(feature = "std", derive(scale_info::TypeInfo, ink::storage::traits::StorageLayout))]
    pub struct HashLockInfo {
        pub hash_lock: [u8; 32],
        pub secret: Option<[u8; 32]>,
    }

    /// Ethereum escrow details
    #[derive(Debug, Clone, PartialEq, Eq, Encode, Decode)]
    #[cfg_attr(feature = "std", derive(scale_info::TypeInfo, ink::storage::traits::StorageLayout))]
    pub struct EthereumEscrowInfo {
        pub escrow_address: [u8; 20],    // Ethereum escrow contract
        pub tx_hash: Option<[u8; 32]>,   // Creation transaction
        pub block_number: Option<u64>,   // Block confirmation
    }

    /// Cross-chain fusion order (compatible with resolver)
    #[derive(Debug, Clone, PartialEq, Eq, Encode, Decode)]
    #[cfg_attr(feature = "std", derive(scale_info::TypeInfo, ink::storage::traits::StorageLayout))]
    pub struct FusionOrder {
        // Core order data
        pub order_hash: [u8; 32],
        pub maker: AccountId,
        pub taker: Option<AccountId>,
        
        // Token details
        pub src_token: AccountId,        // Source token (Polkadot)
        pub dst_token: [u8; 20],        // Dest token (Ethereum address)
        pub src_amount: Balance,         // Amount to swap from
        pub dst_amount: Balance,         // Minimum amount to receive
        
        // Cross-chain info
        pub direction: SwapDirection,
        pub ethereum_escrow: Option<EthereumEscrowInfo>,
        
        // HTLC components
        pub hash_lock_info: HashLockInfo,
        pub time_locks: TimeLocks,
        
        // State
        pub status: OrderStatus,
        pub filled_amount: Balance,      // For partial fills
        pub safety_deposit: Balance,     // Resolver stake
        
        // Fees and resolver
        pub resolver: Option<AccountId>,
        pub resolver_fee: Balance,
        pub created_at: Timestamp,
    }

    /// Order creation parameters (matches resolver interface)
    #[derive(Debug, PartialEq, Eq, Encode, Decode)]
    #[cfg_attr(feature = "std", derive(scale_info::TypeInfo))]
    pub struct CreateOrderParams {
        pub direction: SwapDirection,
        pub src_token: AccountId,
        pub dst_token: [u8; 20],         // Ethereum token address
        pub src_amount: Balance,
        pub min_dst_amount: Balance,
        pub fill_deadline: Timestamp,
        pub ethereum_recipient: [u8; 20], // Where to send tokens on Ethereum
        pub max_resolver_fee: Balance,
    }

    /// Resolver assignment parameters (matches resolver interface)
    #[derive(Debug, PartialEq, Eq, Encode, Decode)]
    #[cfg_attr(feature = "std", derive(scale_info::TypeInfo))]
    pub struct ResolverParams {
        pub resolver: AccountId,
        pub hash_lock: [u8; 32],
        pub ethereum_escrow_address: [u8; 20],
        pub resolver_fee: Balance,
    }

    /// Immutable escrow parameters for resolver compatibility
    #[derive(Debug, Clone, PartialEq, Eq, Encode, Decode)]
    #[cfg_attr(feature = "std", derive(scale_info::TypeInfo, ink::storage::traits::StorageLayout))]
    pub struct EscrowImmutables {
        pub order_hash: [u8; 32],
        pub hash_lock: [u8; 32],
        pub maker: AccountId,
        pub taker: AccountId,
        pub token: AccountId,
        pub amount: Balance,
        pub safety_deposit: Balance,
        pub timelocks: TimeLocks,
        pub deployed_at: Option<Timestamp>,
    }

    // --- Events (Compatible with Resolver expectations) ---

    #[ink(event)]
    pub struct OrderCreated {
        #[ink(topic)]
        pub order_hash: [u8; 32],
        #[ink(topic)]
        pub maker: AccountId,
        pub direction: SwapDirection,
        pub src_amount: Balance,
        pub dst_amount: Balance,
        pub fill_deadline: Timestamp,
    }

    #[ink(event)]
    pub struct EscrowDeployed {
        #[ink(topic)]
        pub order_hash: [u8; 32],
        #[ink(topic)]
        pub resolver: AccountId,
        pub hash_lock: [u8; 32],
        pub ethereum_escrow: [u8; 20],
        pub safety_deposit: Balance,
    }

    #[ink(event)]
    pub struct SwapExecuted {
        #[ink(topic)]
        pub order_hash: [u8; 32],
        #[ink(topic)]
        pub resolver: AccountId,
        pub secret: [u8; 32],
        pub amount_filled: Balance,
    }

    #[ink(event)]
    pub struct OrderCancelled {
        #[ink(topic)]
        pub order_hash: [u8; 32],
        pub refund_amount: Balance,
        pub reason: CancelReason,
    }

    #[ink(event)]
    pub struct PartialFillExecuted {
        #[ink(topic)]
        pub order_hash: [u8; 32],
        pub filled_amount: Balance,
        pub remaining_amount: Balance,
    }

    // Resolver-compatible events
    #[ink(event)]
    pub struct SrcEscrowDeployed {
        #[ink(topic)]
        pub order_hash: [u8; 32],
        #[ink(topic)]  
        pub escrow_address: AccountId,
        pub immutables: EscrowImmutables,
        pub safety_deposit: Balance,
    }

    #[ink(event)]
    pub struct DstEscrowDeployed {
        #[ink(topic)]
        pub order_hash: [u8; 32],
        #[ink(topic)]
        pub escrow_address: AccountId,
        pub immutables: EscrowImmutables,
        pub src_cancellation_timestamp: Timestamp,
    }

    #[ink(event)]
    pub struct EscrowWithdrawal {
        #[ink(topic)]
        pub order_hash: [u8; 32],
        #[ink(topic)]
        pub escrow_address: AccountId,
        pub secret: [u8; 32],
        pub amount: Balance,
    }

    #[ink(event)]
    pub struct EscrowCancellation {
        #[ink(topic)]
        pub order_hash: [u8; 32],
        #[ink(topic)]
        pub escrow_address: AccountId,
        pub refund_amount: Balance,
    }

    /// Cancellation reasons
    #[derive(Debug, Clone, PartialEq, Eq, Encode, Decode)]
    #[cfg_attr(feature = "std", derive(scale_info::TypeInfo))]
    pub enum CancelReason {
        MakerCancellation,
        TimelockExpired,
        ResolverTimeout,
        EmergencyStop,
    }

    /// Contract errors
    #[derive(Debug, PartialEq, Eq, Encode, Decode)]
    #[cfg_attr(feature = "std", derive(scale_info::TypeInfo))]
    pub enum Error {
        // Order errors
        OrderNotFound,
        OrderAlreadyExists,
        InvalidOrderStatus,
        InvalidOrderHash,
        
        // Authorization
        Unauthorized,
        OnlyMaker,
        OnlyResolver,
        OnlyOwner,
        
        // Timing
        DeadlineExpired,
        TimelockNotExpired,
        PrivateCancellationExpired,
        
        // HTLC
        InvalidSecret,
        InvalidHashLock,
        HashLockAlreadyUsed,
        InvalidImmutables,
        
        // Amounts
        InsufficientFunds,
        InsufficientDeposit,
        InvalidAmount,
        
        // System
        ContractPaused,
        ArithmeticOverflow,
        TransferFailed,
        NativeTokenSendingFailure,
        
        // Cross-chain
        EthereumEscrowNotSet,
        InvalidEthereumAddress,
        UnsupportedDirection,
        EscrowNotFound,
        
        // General
        LengthMismatch,
        InvalidLength,
    }

    /// Main contract storage
    #[ink(storage)]
    pub struct FusionPolkadotEscrow {
        // Core storage
        orders: Mapping<[u8; 32], FusionOrder>,
        active_hash_locks: Mapping<[u8; 32], [u8; 32]>, // hash_lock -> order_hash
        escrow_addresses: Mapping<[u8; 32], AccountId>, // order_hash -> escrow_address
        
        // Configuration
        owner: AccountId,
        paused: bool,
        protocol_fee_bps: u32,          // Basis points (100 = 1%)
        min_safety_deposit: Balance,     // Minimum resolver stake
        
        // Resolver management
        approved_resolvers: Mapping<AccountId, bool>,
        resolver_stakes: Mapping<AccountId, Balance>,
        
        // Cross-chain coordination (resolver compatibility)
        ethereum_resolver: [u8; 20],     // Ethereum counterpart address
        trusted_relayers: Mapping<AccountId, bool>,
        ethereum_chain_id: u32,
        
        // Metrics
        order_nonce: u64,
        total_volume: Balance,
        total_escrows_created: u64,
    }

    impl FusionPolkadotEscrow {
        /// Constructor
        #[ink(constructor)]
        pub fn new(
            protocol_fee_bps: u32,
            min_safety_deposit: Balance,
            ethereum_chain_id: u32,
            ethereum_resolver: [u8; 20],
        ) -> Self {
            Self {
                orders: Mapping::default(),
                active_hash_locks: Mapping::default(),
                escrow_addresses: Mapping::default(),
                owner: Self::env().caller(),
                paused: false,
                protocol_fee_bps,
                min_safety_deposit,
                approved_resolvers: Mapping::default(),
                resolver_stakes: Mapping::default(),
                ethereum_resolver,
                trusted_relayers: Mapping::default(),
                ethereum_chain_id,
                order_nonce: 0,
                total_volume: 0,
                total_escrows_created: 0,
            }
        }

        // --- Admin Functions ---

        #[ink(message)]
        pub fn set_paused(&mut self, paused: bool) -> Result<(), Error> {
            self.ensure_owner()?;
            self.paused = paused;
            Ok(())
        }

        #[ink(message)]
        pub fn approve_resolver(&mut self, resolver: AccountId) -> Result<(), Error> {
            self.ensure_owner()?;
            self.approved_resolvers.insert(resolver, &true);
            Ok(())
        }

        #[ink(message)]
        pub fn add_trusted_relayer(&mut self, relayer: AccountId) -> Result<(), Error> {
            self.ensure_owner()?;
            self.trusted_relayers.insert(relayer, &true);
            Ok(())
        }

        #[ink(message)]
        pub fn transfer_ownership(&mut self, new_owner: AccountId) -> Result<(), Error> {
            self.ensure_owner()?;
            self.owner = new_owner;
            Ok(())
        }

        // --- Core Order Functions ---

        /// Create a new cross-chain fusion order
        #[ink(message, payable)]
        pub fn create_order(&mut self, params: CreateOrderParams) -> Result<[u8; 32], Error> {
            self.ensure_not_paused()?;
            
            let caller = self.env().caller();
            let current_time = self.env().block_timestamp();
            let transferred = self.env().transferred_value();

            // Validate timing
            if params.fill_deadline <= current_time {
                return Err(Error::DeadlineExpired);
            }

            // Validate payment
            if transferred < params.src_amount {
                return Err(Error::InsufficientFunds);
            }

            // Calculate private cancellation time (30 minutes grace period)
            let private_cancellation = current_time
                .checked_add(30u64.saturating_mul(60).saturating_mul(1000))
                .ok_or(Error::ArithmeticOverflow)?;

            // Generate order hash (similar to 1inch)
            let order_data = (
                &caller,
                params.src_token,
                params.dst_token,
                params.src_amount,
                params.min_dst_amount,
                params.fill_deadline,
                self.order_nonce,
                current_time,
            );
            let encoded = scale::Encode::encode(&order_data);
            let order_hash = self.env().hash_bytes::<ink::env::hash::Blake2x256>(&encoded);

            // Check for duplicate
            if self.orders.contains(order_hash) {
                return Err(Error::OrderAlreadyExists);
            }

            // Create order
            let order = FusionOrder {
                order_hash,
                maker: caller,
                taker: None,
                src_token: params.src_token,
                dst_token: params.dst_token,
                src_amount: params.src_amount,
                dst_amount: params.min_dst_amount,
                direction: params.direction.clone(),
                ethereum_escrow: None,
                hash_lock_info: HashLockInfo {
                    hash_lock: [0u8; 32],
                    secret: None,
                },
                time_locks: TimeLocks {
                    fill_deadline: params.fill_deadline,
                    private_cancellation,
                },
                status: OrderStatus::Pending,
                filled_amount: 0,
                safety_deposit: 0,
                resolver: None,
                resolver_fee: params.max_resolver_fee,
                created_at: current_time,
            };

            self.orders.insert(order_hash, &order);
            self.order_nonce = self.order_nonce.checked_add(1).ok_or(Error::ArithmeticOverflow)?;

            self.env().emit_event(OrderCreated {
                order_hash,
                maker: caller,
                direction: params.direction,
                src_amount: params.src_amount,
                dst_amount: params.min_dst_amount,
                fill_deadline: params.fill_deadline,
            });

            Ok(order_hash)
        }

        /// Deploy source escrow (resolver-compatible interface)
        #[ink(message, payable)]
        pub fn deploy_src(
            &mut self,
            immutables: EscrowImmutables,
            order_hash: [u8; 32],
            _signature: [u8; 65], // r(32) + s(32) + v(1) - prefixed with underscore
            _amount: Balance,     // prefixed with underscore
            _args: Vec<u8>,       // prefixed with underscore
        ) -> Result<AccountId, Error> {
            self.ensure_not_paused()?;
            
            let safety_deposit = self.env().transferred_value();
            if safety_deposit < self.min_safety_deposit {
                return Err(Error::InsufficientDeposit);
            }

            // Get and validate order
            let mut order = self.orders.get(order_hash).ok_or(Error::OrderNotFound)?;
            
            if order.status != OrderStatus::Pending {
                return Err(Error::InvalidOrderStatus);
            }

            // Update immutables with deployment timestamp
            let mut immutables_mem = immutables.clone();
            immutables_mem.deployed_at = Some(self.env().block_timestamp());
            immutables_mem.safety_deposit = safety_deposit;

            // Compute escrow address deterministically 
            let escrow_address = self.compute_escrow_address(&immutables_mem)?;

            // Update order
            order.status = OrderStatus::Locked;
            order.safety_deposit = safety_deposit;
            order.hash_lock_info.hash_lock = immutables.hash_lock;
            order.resolver = Some(immutables.taker); // taker is resolver in this context

            // Store escrow data
            self.orders.insert(order_hash, &order);
            self.escrow_addresses.insert(order_hash, &escrow_address);
            self.active_hash_locks.insert(immutables.hash_lock, &order_hash);
            
            self.total_escrows_created = self.total_escrows_created.saturating_add(1);

            self.env().emit_event(SrcEscrowDeployed {
                order_hash: immutables_mem.order_hash,
                escrow_address,
                immutables: immutables_mem,
                safety_deposit,
            });

            Ok(escrow_address)
        }

        /// Deploy destination escrow (resolver-compatible interface)
        #[ink(message, payable)]
        pub fn deploy_dst(
            &mut self,
            dst_immutables: EscrowImmutables,
            src_cancellation_timestamp: Timestamp,
        ) -> Result<AccountId, Error> {
            self.ensure_not_paused()?;
            
            let _deposit_amount = self.env().transferred_value(); // prefixed with underscore
            let order_hash = dst_immutables.order_hash;
            
            // Get and validate order
            let mut order = self.orders.get(order_hash).ok_or(Error::OrderNotFound)?;
            
            // Compute escrow address
            let escrow_address = self.compute_escrow_address(&dst_immutables)?;
            
            // Update order with destination escrow info
            order.ethereum_escrow = Some(EthereumEscrowInfo {
                escrow_address: [0u8; 20], // Will be set by resolver
                tx_hash: None,
                block_number: None,
            });

            // Store escrow data
            self.orders.insert(order_hash, &order);
            self.escrow_addresses.insert(order_hash, &escrow_address);

            self.env().emit_event(DstEscrowDeployed {
                order_hash,
                escrow_address,
                immutables: dst_immutables,
                src_cancellation_timestamp,
            });

            Ok(escrow_address)
        }

        /// Deploy escrow with resolver (primary interface)
        #[ink(message, payable)]
        pub fn deploy_escrow(
            &mut self,
            order_hash: [u8; 32],
            params: ResolverParams,
        ) -> Result<(), Error> {
            self.ensure_not_paused()?;
            
            let caller = self.env().caller();
            let safety_deposit = self.env().transferred_value();

            // Validate resolver stake
            if safety_deposit < self.min_safety_deposit {
                return Err(Error::InsufficientDeposit);
            }

            // Get and validate order
            let mut order = self.orders.get(order_hash).ok_or(Error::OrderNotFound)?;
            
            if order.status != OrderStatus::Pending {
                return Err(Error::InvalidOrderStatus);
            }

            // Validate hash lock uniqueness
            if self.active_hash_locks.contains(params.hash_lock) {
                return Err(Error::HashLockAlreadyUsed);
            }

            // Create immutables for escrow address computation
            let immutables = EscrowImmutables {
                order_hash,
                hash_lock: params.hash_lock,
                maker: order.maker,
                taker: params.resolver,
                token: order.src_token,
                amount: order.src_amount,
                safety_deposit,
                timelocks: order.time_locks.clone(),
                deployed_at: Some(self.env().block_timestamp()),
            };

            let escrow_address = self.compute_escrow_address(&immutables)?;

            // Update order with escrow info
            order.resolver = Some(params.resolver);
            order.hash_lock_info.hash_lock = params.hash_lock;
            order.safety_deposit = safety_deposit;
            order.resolver_fee = params.resolver_fee;
            order.status = OrderStatus::Locked;
            order.taker = Some(caller);
            order.ethereum_escrow = Some(EthereumEscrowInfo {
                escrow_address: params.ethereum_escrow_address,
                tx_hash: None,
                block_number: None,
            });

            // Store updates
            self.orders.insert(order_hash, &order);
            self.escrow_addresses.insert(order_hash, &escrow_address);
            self.active_hash_locks.insert(params.hash_lock, &order_hash);
            self.resolver_stakes.insert(params.resolver, &safety_deposit);

            self.env().emit_event(EscrowDeployed {
                order_hash,
                resolver: params.resolver,
                hash_lock: params.hash_lock,
                ethereum_escrow: params.ethereum_escrow_address,
                safety_deposit,
            });

            Ok(())
        }

        /// Withdraw from escrow (resolver-compatible interface)
        #[ink(message)]
        pub fn withdraw(
            &mut self,
            order_hash: [u8; 32],
            secret: [u8; 32],
            _immutables: EscrowImmutables, // prefixed with underscore
        ) -> Result<(), Error> {
            let escrow_address = self.escrow_addresses.get(order_hash)
                .ok_or(Error::EscrowNotFound)?;

            // Get order
            let order = self.orders.get(order_hash).ok_or(Error::OrderNotFound)?;

            // Verify secret against hash lock
            let computed_hash = self.env().hash_bytes::<ink::env::hash::Blake2x256>(&secret);
            if computed_hash != order.hash_lock_info.hash_lock {
                return Err(Error::InvalidSecret);
            }

            // Check timelock constraints
            let current_time = self.env().block_timestamp();
            self.check_withdrawal_timelock(&order, current_time)?;

            // Execute the swap logic
            self.execute_swap_internal(order_hash, secret)?;

            self.env().emit_event(EscrowWithdrawal {
                order_hash,
                escrow_address,
                secret,
                amount: order.src_amount,
            });

            Ok(())
        }

        /// Execute swap with secret reveal (primary interface)
        #[ink(message)]
        pub fn execute_swap(
            &mut self,
            order_hash: [u8; 32],
            secret: [u8; 32],
        ) -> Result<(), Error> {
            self.execute_swap_internal(order_hash, secret)
        }

        /// Internal swap execution logic
        fn execute_swap_internal(
            &mut self,
            order_hash: [u8; 32],
            secret: [u8; 32],
        ) -> Result<(), Error> {
            self.ensure_not_paused()?;
            
            let caller = self.env().caller();
            let current_time = self.env().block_timestamp();

            let mut order = self.orders.get(order_hash).ok_or(Error::OrderNotFound)?;

            // Validate order state
            if order.status != OrderStatus::Locked {
                return Err(Error::InvalidOrderStatus);
            }

            // Check timelock
            if current_time > order.time_locks.fill_deadline {
                return Err(Error::DeadlineExpired);
            }

            // Verify secret against hash lock
            let computed_hash = self.env().hash_bytes::<ink::env::hash::Blake2x256>(&secret);
            if computed_hash != order.hash_lock_info.hash_lock {
                return Err(Error::InvalidSecret);
            }

            // Verify Ethereum escrow is deployed (for PolkadotToEthereum)
            if order.direction == SwapDirection::PolkadotToEthereum 
                && order.ethereum_escrow.is_none() {
                return Err(Error::EthereumEscrowNotSet);
            }

            // Calculate amounts with overflow protection
            let total_amount = order.src_amount;
            let protocol_fee = self.calculate_protocol_fee(total_amount)?;
            let remaining_after_protocol = total_amount.checked_sub(protocol_fee).ok_or(Error::ArithmeticOverflow)?;
            let resolver_fee = order.resolver_fee.min(remaining_after_protocol);
            let net_amount = remaining_after_protocol.checked_sub(resolver_fee).ok_or(Error::ArithmeticOverflow)?;

            // Execute transfers based on direction
            match order.direction {
                SwapDirection::PolkadotToEthereum => {
                    // Resolver gets the funds to provide liquidity on Ethereum
                    let resolver_address = order.resolver.ok_or(Error::OnlyResolver)?;
                    
                    // Transfer net amount + resolver fee to resolver
                    let total_to_resolver = net_amount.checked_add(resolver_fee).ok_or(Error::ArithmeticOverflow)?;
                    self.env().transfer(resolver_address, total_to_resolver)
                        .map_err(|_| Error::TransferFailed)?;
                    
                    // Pay protocol fee
                    if protocol_fee > 0 {
                        self.env().transfer(self.owner, protocol_fee)
                            .map_err(|_| Error::TransferFailed)?;
                    }
                },
                SwapDirection::EthereumToPolkadot => {
                    // User receives funds from resolver's deposit
                    self.env().transfer(order.maker, net_amount)
                        .map_err(|_| Error::TransferFailed)?;
                        
                    // Pay resolver fee
                    if resolver_fee > 0 {
                        let resolver_address = order.resolver.ok_or(Error::OnlyResolver)?;
                        self.env().transfer(resolver_address, resolver_fee)
                            .map_err(|_| Error::TransferFailed)?;
                    }
                    
                    // Pay protocol fee
                    if protocol_fee > 0 {
                        self.env().transfer(self.owner, protocol_fee)
                            .map_err(|_| Error::TransferFailed)?;
                    }
                }
            }

            // Update order state
            order.status = OrderStatus::Executed;
            order.filled_amount = total_amount;
            order.hash_lock_info.secret = Some(secret);
            
            self.orders.insert(order_hash, &order);
            self.active_hash_locks.remove(order.hash_lock_info.hash_lock);
            self.total_volume = self.total_volume.checked_add(total_amount).ok_or(Error::ArithmeticOverflow)?;

            self.env().emit_event(SwapExecuted {
                order_hash,
                resolver: caller,
                secret,
                amount_filled: total_amount,
            });

            Ok(())
        }

        /// Cancel escrow (resolver-compatible interface)
        #[ink(message)]
        pub fn cancel(
            &mut self,
            order_hash: [u8; 32],
            _immutables: EscrowImmutables, // prefixed with underscore
        ) -> Result<(), Error> {
            let escrow_address = self.escrow_addresses.get(order_hash)
                .ok_or(Error::EscrowNotFound)?;

            let mut order = self.orders.get(order_hash).ok_or(Error::OrderNotFound)?;

            // Check cancellation timelock
            let current_time = self.env().block_timestamp();
            self.check_cancellation_timelock(&order, current_time)?;

            // Calculate refund
            let refund_amount = order.src_amount.checked_sub(order.filled_amount).ok_or(Error::ArithmeticOverflow)?;
            
            // Execute refund
            if refund_amount > 0 {
                self.env().transfer(order.maker, refund_amount)
                    .map_err(|_| Error::TransferFailed)?;
            }

            // Refund resolver stake
            if order.safety_deposit > 0 && order.resolver.is_some() {
                self.env().transfer(order.resolver.unwrap(), order.safety_deposit)
                    .map_err(|_| Error::TransferFailed)?;
            }

            // Update state
            order.status = OrderStatus::Cancelled;
            self.orders.insert(order_hash, &order);
            
            if !order.hash_lock_info.hash_lock.is_empty() {
                self.active_hash_locks.remove(order.hash_lock_info.hash_lock);
            }

            self.env().emit_event(EscrowCancellation {
                order_hash,
                escrow_address,
                refund_amount,
            });

            Ok(())
        }

        /// Cancel order (primary interface)
        #[ink(message)]
        pub fn cancel_order(&mut self, order_hash: [u8; 32]) -> Result<(), Error> {
            self.ensure_not_paused()?;
            
            let caller = self.env().caller();
            let current_time = self.env().block_timestamp();

            let mut order = self.orders.get(order_hash).ok_or(Error::OrderNotFound)?;

            let (can_cancel, reason) = match order.status {
                OrderStatus::Pending => {
                    // Maker can cancel during private cancellation period
                    if caller == order.maker && current_time <= order.time_locks.private_cancellation {
                        (true, CancelReason::MakerCancellation)
                    } else {
                        (false, CancelReason::MakerCancellation)
                    }
                },
                OrderStatus::Locked | OrderStatus::PartialFill => {
                    // Anyone can cancel after timelock expiry
                    if current_time > order.time_locks.fill_deadline {
                        (true, CancelReason::TimelockExpired)
                    } else if caller == order.maker {
                        (true, CancelReason::MakerCancellation)
                    } else {
                        (false, CancelReason::ResolverTimeout)
                    }
                },
                _ => (false, CancelReason::EmergencyStop),
            };

            if !can_cancel {
                return Err(Error::Unauthorized);
            }

            // Calculate refund
            let refund_amount = order.src_amount.checked_sub(order.filled_amount).ok_or(Error::ArithmeticOverflow)?;
            
            // Execute refund
            if refund_amount > 0 {
                self.env().transfer(order.maker, refund_amount)
                    .map_err(|_| Error::TransferFailed)?;
            }

            // Refund resolver stake
            if order.safety_deposit > 0 && order.resolver.is_some() {
                self.env().transfer(order.resolver.unwrap(), order.safety_deposit)
                    .map_err(|_| Error::TransferFailed)?;
            }

            // Update state
            order.status = OrderStatus::Cancelled;
            self.orders.insert(order_hash, &order);
            
            if !order.hash_lock_info.hash_lock.is_empty() {
                self.active_hash_locks.remove(order.hash_lock_info.hash_lock);
            }

            self.env().emit_event(OrderCancelled {
                order_hash,
                refund_amount,
                reason,
            });

            Ok(())
        }
        
        /// Partial fill execution (stretch goal)
        #[ink(message)]
        pub fn execute_partial_fill(
            &mut self,
            order_hash: [u8; 32],
            fill_amount: Balance,
            secret: [u8; 32],
        ) -> Result<(), Error> {
            self.ensure_not_paused()?;
            
            let mut order = self.orders.get(order_hash).ok_or(Error::OrderNotFound)?;

            if order.status != OrderStatus::Locked && order.status != OrderStatus::PartialFill {
                return Err(Error::InvalidOrderStatus);
            }

            // Verify secret
            let computed_hash = self.env().hash_bytes::<ink::env::hash::Blake2x256>(&secret);
            if computed_hash != order.hash_lock_info.hash_lock {
                return Err(Error::InvalidSecret);
            }

            let remaining = order.src_amount.checked_sub(order.filled_amount).ok_or(Error::ArithmeticOverflow)?;
            if fill_amount > remaining {
                return Err(Error::InvalidAmount);
            }

            // Execute partial fill
            order.filled_amount = order.filled_amount.checked_add(fill_amount).ok_or(Error::ArithmeticOverflow)?;
            
            if order.filled_amount >= order.src_amount {
                order.status = OrderStatus::Executed;
                self.active_hash_locks.remove(order.hash_lock_info.hash_lock);
            } else {
                order.status = OrderStatus::PartialFill;
            }

            self.orders.insert(order_hash, &order);

            let remaining_amount = order.src_amount.checked_sub(order.filled_amount).ok_or(Error::ArithmeticOverflow)?;

            self.env().emit_event(PartialFillExecuted {
                order_hash,
                filled_amount: order.filled_amount,
                remaining_amount,
            });

            Ok(())
        }

        /// Arbitrary calls (resolver compatibility)
        #[ink(message)]
        pub fn arbitrary_calls(
            &mut self,
            targets: Vec<AccountId>,
            arguments: Vec<Vec<u8>>,
        ) -> Result<(), Error> {
            self.ensure_owner()?;
            
            if targets.len() != arguments.len() {
                return Err(Error::LengthMismatch);
            }

            for (target, args) in targets.iter().zip(arguments.iter()) {
                // Execute cross-contract call (simplified)
                let _result = self.execute_arbitrary_call(*target, args);
                // Continue even if one call fails
            }

            Ok(())
        }

        // --- View Functions ---

        #[ink(message)]
        pub fn get_order(&self, order_hash: [u8; 32]) -> Option<FusionOrder> {
            self.orders.get(order_hash)
        }

        #[ink(message)]
        pub fn get_order_by_hash_lock(&self, hash_lock: [u8; 32]) -> Option<[u8; 32]> {
            self.active_hash_locks.get(hash_lock)
        }

        #[ink(message)]
        pub fn get_escrow_address(&self, order_hash: [u8; 32]) -> Option<AccountId> {
            self.escrow_addresses.get(order_hash)
        }

        #[ink(message)]
        pub fn get_escrow_immutables(&self, order_hash: [u8; 32]) -> Option<EscrowImmutables> {
            let order = self.orders.get(order_hash)?;
            
            Some(EscrowImmutables {
                order_hash,
                hash_lock: order.hash_lock_info.hash_lock,
                maker: order.maker,
                taker: order.taker.unwrap_or(order.maker),
                token: order.src_token,
                amount: order.src_amount,
                safety_deposit: order.safety_deposit,
                timelocks: order.time_locks,
                deployed_at: Some(order.created_at),
            })
        }

        #[ink(message)]
        pub fn is_resolver_approved(&self, resolver: AccountId) -> bool {
            self.approved_resolvers.get(resolver).unwrap_or(false)
        }

        #[ink(message)]
        pub fn get_total_volume(&self) -> Balance {
            self.total_volume
        }

        #[ink(message)]
        pub fn get_total_escrows_created(&self) -> u64 {
            self.total_escrows_created
        }

        #[ink(message)]
        pub fn is_paused(&self) -> bool {
            self.paused
        }

        #[ink(message)]
        pub fn get_owner(&self) -> AccountId {
            self.owner
        }

        #[ink(message)]
        pub fn get_ethereum_resolver(&self) -> [u8; 20] {
            self.ethereum_resolver
        }

        // --- Helper Functions ---

        fn ensure_owner(&self) -> Result<(), Error> {
            if self.env().caller() != self.owner {
                return Err(Error::OnlyOwner);
            }
            Ok(())
        }

        fn ensure_not_paused(&self) -> Result<(), Error> {
            if self.paused {
                return Err(Error::ContractPaused);
            }
            Ok(())
        }

        fn calculate_protocol_fee(&self, amount: Balance) -> Result<Balance, Error> {
            amount.checked_mul(self.protocol_fee_bps as u128)
                .and_then(|v| v.checked_div(10000))
                .ok_or(Error::ArithmeticOverflow)
        }

        fn compute_escrow_address(&self, immutables: &EscrowImmutables) -> Result<AccountId, Error> {
            // Deterministic address computation similar to 1inch CREATE2
            let seed_data = (
                &immutables.order_hash,
                &immutables.hash_lock,
                &immutables.maker,
                &immutables.taker,
                immutables.amount,
                immutables.deployed_at.unwrap_or(0),
            );
            let encoded = scale::Encode::encode(&seed_data);
            let hash = self.env().hash_bytes::<ink::env::hash::Blake2x256>(&encoded);
            
            // Convert hash to AccountId (simplified)
            let mut account_bytes = [0u8; 32];
            account_bytes.copy_from_slice(&hash);
            Ok(AccountId::from(account_bytes))
        }

        fn check_withdrawal_timelock(
            &self,
            order: &FusionOrder,
            current_time: Timestamp,
        ) -> Result<(), Error> {
            // Allow withdrawal before deadline
            if current_time <= order.time_locks.fill_deadline {
                return Ok(());
            }
            
            Err(Error::DeadlineExpired)
        }

        fn check_cancellation_timelock(
            &self,
            order: &FusionOrder,
            current_time: Timestamp,
        ) -> Result<(), Error> {
            // Allow cancellation after private cancellation period or after deadline
            if current_time > order.time_locks.private_cancellation || 
               current_time > order.time_locks.fill_deadline {
                return Ok(());
            }
            
            Err(Error::TimelockNotExpired)
        }

        fn execute_arbitrary_call(
            &self,
            _target: AccountId,
            _args: &[u8],
        ) -> Result<(), Error> {
            // Execute arbitrary cross-contract call
            // For now, assume success
            Ok(())
        }
    }
}