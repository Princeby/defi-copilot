#![cfg_attr(not(feature = "std"), no_std, no_main)]

#[ink::contract]
mod intent_escrow {
    use ink::storage::Mapping;
    use scale::{Decode, Encode};

    // --- Enums and Structs ---

    /// Order status enumeration
    #[derive(Debug, Clone, PartialEq, Eq, Encode, Decode)]
    #[cfg_attr(feature = "std", derive(scale_info::TypeInfo, ink::storage::traits::StorageLayout))]
    pub enum OrderStatus {
        Pending,
        Locked,
        PartiallyFilled,
        Executed,
        Refunded,
        Disputed,
    }

    /// Fusion order structure for cross-chain swaps
    #[derive(Debug, Clone, PartialEq, Eq, Encode, Decode)]
    #[cfg_attr(feature = "std", derive(scale_info::TypeInfo, ink::storage::traits::StorageLayout))]
    pub struct FusionOrder {
        pub maker: AccountId,
        pub from_token: AccountId,
        pub to_token: AccountId,
        pub from_amount: Balance,
        pub min_to_amount: Balance,
        pub hashlock: [u8; 32],
        pub timelock: Timestamp,
        pub intent_hash: [u8; 32],
        pub assigned_resolver: Option<AccountId>,
        pub ethereum_escrow_src: Option<[u8; 20]>, // Ethereum address as bytes
        pub status: OrderStatus,
        pub created_at: Timestamp,
        pub resolver_fee: Balance,
        pub filled_amount: Balance,
    }

    /// Parameters for submitting a new fusion intent.
    /// This struct is used to avoid the "too many arguments" warning.
    #[derive(Debug, PartialEq, Eq, Encode, Decode)]
    #[cfg_attr(feature = "std", derive(scale_info::TypeInfo))]
    pub struct SubmitIntentParams {
        pub from_token: AccountId,
        pub to_token: AccountId,
        pub from_amount: Balance,
        pub min_to_amount: Balance,
        pub deadline: Timestamp,
        pub ethereum_escrow_src: Option<[u8; 20]>,
        pub max_resolver_fee: Balance,
    }

    /// Contract storage
    #[ink(storage)]
    pub struct IntentEscrow {
        orders: Mapping<u64, FusionOrder>,
        order_nonce: u64,
        relayer_coordinator: Option<AccountId>,
        protocol_fee_bps: u32,
        owner: AccountId,
        paused: bool,
        active_htlcs: Mapping<[u8; 32], u64>,
        min_resolver_stake: Balance,
    }

    /// Contract errors
    #[derive(Debug, PartialEq, Eq, Encode, Decode)]
    #[cfg_attr(feature = "std", derive(scale_info::TypeInfo))]
    pub enum Error {
        ContractPaused,
        OrderNotFound,
        InvalidOrderStatus,
        DeadlineExpired,
        Unauthorized,
        InvalidHashlock,
        InsufficientFunds,
        RelayerNotRegistered,
        InvalidSecret,
        TimelockNotExpired,
        InsufficientStake,
        OrderAlreadyExists,
        /// Returned when an arithmetic operation overflows
        ArithmeticOverflow,
    }

    // --- Events ---

    #[ink(event)]
    pub struct FusionOrderCreated {
        #[ink(topic)]
        order_id: u64,
        #[ink(topic)]
        maker: AccountId,
        intent_hash: [u8; 32],
        ethereum_escrow_src: Option<[u8; 20]>,
        from_amount: Balance,
        min_to_amount: Balance,
        timelock: Timestamp,
    }

    #[ink(event)]
    pub struct ResolverAssigned {
        #[ink(topic)]
        order_id: u64,
        #[ink(topic)]
        resolver: AccountId,
        hashlock: [u8; 32],
        resolver_fee: Balance,
    }

    #[ink(event)]
    pub struct CrossChainSwapCompleted {
        #[ink(topic)]
        order_id: u64,
        resolver: AccountId,
        secret: [u8; 32],
        final_amount: Balance,
    }

    #[ink(event)]
    pub struct OrderRefunded {
        #[ink(topic)]
        order_id: u64,
        maker: AccountId,
        refunded_amount: Balance,
    }

    #[ink(event)]
    pub struct PartialFill {
        #[ink(topic)]
        order_id: u64,
        filled_amount: Balance,
        remaining_amount: Balance,
    }

    // --- Implementation ---

    impl IntentEscrow {
        #[ink(constructor)]
        pub fn new(protocol_fee_bps: u32, min_resolver_stake: Balance) -> Self {
            Self {
                orders: Mapping::default(),
                order_nonce: 0,
                relayer_coordinator: None,
                protocol_fee_bps,
                owner: Self::env().caller(),
                paused: false,
                active_htlcs: Mapping::default(),
                min_resolver_stake,
            }
        }

        // --- Message Implementations ---

        #[ink(message)]
        pub fn set_relayer_coordinator(
            &mut self,
            coordinator: AccountId,
        ) -> Result<(), Error> {
            if self.env().caller() != self.owner {
                return Err(Error::Unauthorized);
            }
            self.relayer_coordinator = Some(coordinator);
            Ok(())
        }

        #[ink(message)]
        pub fn set_paused(&mut self, paused: bool) -> Result<(), Error> {
            if self.env().caller() != self.owner {
                return Err(Error::Unauthorized);
            }
            self.paused = paused;
            Ok(())
        }

        #[ink(message, payable)]
        pub fn submit_fusion_intent(
            &mut self,
            params: SubmitIntentParams,
        ) -> Result<u64, Error> {
            if self.paused {
                return Err(Error::ContractPaused);
            }

            let caller = self.env().caller();
            let current_time = self.env().block_timestamp();

            if params.deadline <= current_time {
                return Err(Error::DeadlineExpired);
            }

            if self.env().transferred_value() < params.from_amount {
                return Err(Error::InsufficientFunds);
            }

            // Safely calculate timelock (24 hours from now)
            const ONE_DAY_MS: u64 = 24 * 60 * 60 * 1000;
            let timelock = current_time.checked_add(ONE_DAY_MS).ok_or(Error::ArithmeticOverflow)?;

            let intent_data = (
                params.from_token,
                params.to_token,
                params.from_amount,
                params.min_to_amount,
                params.deadline,
                &caller,
                current_time,
            );
            let encoded = scale::Encode::encode(&intent_data);
            let intent_hash = self.env().hash_bytes::<ink::env::hash::Blake2x256>(&encoded);

            let order_id = self.order_nonce;
            let order = FusionOrder {
                maker: caller,
                from_token: params.from_token,
                to_token: params.to_token,
                from_amount: params.from_amount,
                min_to_amount: params.min_to_amount,
                hashlock: [0u8; 32],
                timelock,
                intent_hash,
                assigned_resolver: None,
                ethereum_escrow_src: params.ethereum_escrow_src,
                status: OrderStatus::Pending,
                created_at: current_time,
                resolver_fee: params.max_resolver_fee,
                filled_amount: 0,
            };

            self.orders.insert(order_id, &order);
            self.order_nonce = self.order_nonce.checked_add(1).ok_or(Error::ArithmeticOverflow)?;

            self.env().emit_event(FusionOrderCreated {
                order_id,
                maker: caller,
                intent_hash,
                ethereum_escrow_src: params.ethereum_escrow_src,
                from_amount: params.from_amount,
                min_to_amount: params.min_to_amount,
                timelock,
            });

            Ok(order_id)
        }

        #[ink(message, payable)]
        pub fn assign_resolver(
            &mut self,
            order_id: u64,
            resolver: AccountId,
            hashlock: [u8; 32],
            resolver_fee: Balance,
        ) -> Result<(), Error> {
            if self.paused {
                return Err(Error::ContractPaused);
            }

            if self.env().transferred_value() < self.min_resolver_stake {
                return Err(Error::InsufficientStake);
            }

            let mut order = self.orders.get(order_id).ok_or(Error::OrderNotFound)?;

            if order.status != OrderStatus::Pending {
                return Err(Error::InvalidOrderStatus);
            }

            if self.active_htlcs.contains(hashlock) {
                return Err(Error::OrderAlreadyExists);
            }

            order.assigned_resolver = Some(resolver);
            order.hashlock = hashlock;
            order.resolver_fee = resolver_fee;
            order.status = OrderStatus::Locked;

            self.active_htlcs.insert(hashlock, &order_id);
            self.orders.insert(order_id, &order);

            self.env().emit_event(ResolverAssigned {
                order_id,
                resolver,
                hashlock,
                resolver_fee,
            });

            Ok(())
        }

        #[ink(message)]
        pub fn execute_swap(
            &mut self,
            order_id: u64,
            secret: [u8; 32],
            amount: Balance,
        ) -> Result<(), Error> {
            if self.paused {
                return Err(Error::ContractPaused);
            }

            let mut order = self.orders.get(order_id).ok_or(Error::OrderNotFound)?;

            if order.status != OrderStatus::Locked && order.status != OrderStatus::PartiallyFilled {
                return Err(Error::InvalidOrderStatus);
            }

            if self.env().block_timestamp() > order.timelock {
                return Err(Error::DeadlineExpired);
            }

            let computed_hash = self.env().hash_bytes::<ink::env::hash::Blake2x256>(&secret);
            if computed_hash != order.hashlock {
                return Err(Error::InvalidSecret);
            }

            let remaining_amount = order.from_amount.checked_sub(order.filled_amount).ok_or(Error::ArithmeticOverflow)?;
            if amount > remaining_amount {
                return Err(Error::InsufficientFunds);
            }

            order.filled_amount = order.filled_amount.checked_add(amount).ok_or(Error::ArithmeticOverflow)?;
            let was_partial = order.status == OrderStatus::PartiallyFilled;

            if order.filled_amount >= order.from_amount {
                order.status = OrderStatus::Executed;
                self.active_htlcs.remove(order.hashlock);
            } else {
                order.status = OrderStatus::PartiallyFilled;
                if !was_partial {
                    let new_remaining = order.from_amount.checked_sub(order.filled_amount).ok_or(Error::ArithmeticOverflow)?;
                    self.env().emit_event(PartialFill {
                        order_id,
                        filled_amount: order.filled_amount,
                        remaining_amount: new_remaining,
                    });
                }
            }

            self.orders.insert(order_id, &order);

            self.env().emit_event(CrossChainSwapCompleted {
                order_id,
                resolver: self.env().caller(),
                secret,
                final_amount: amount,
            });

            Ok(())
        }

        #[ink(message)]
        pub fn refund_order(&mut self, order_id: u64) -> Result<(), Error> {
            if self.paused {
                return Err(Error::ContractPaused);
            }

            let mut order = self.orders.get(order_id).ok_or(Error::OrderNotFound)?;

            if order.status != OrderStatus::Locked && order.status != OrderStatus::PartiallyFilled {
                return Err(Error::InvalidOrderStatus);
            }

            if self.env().block_timestamp() <= order.timelock {
                return Err(Error::TimelockNotExpired);
            }

            if self.env().caller() != order.maker {
                return Err(Error::Unauthorized);
            }

            let refund_amount = order.from_amount.checked_sub(order.filled_amount).ok_or(Error::ArithmeticOverflow)?;
            order.status = OrderStatus::Refunded;
            self.orders.insert(order_id, &order);
            self.active_htlcs.remove(order.hashlock);

            if refund_amount > 0 {
                self.env().transfer(order.maker, refund_amount).map_err(|_| Error::InsufficientFunds)?;
            }

            self.env().emit_event(OrderRefunded {
                order_id,
                maker: order.maker,
                refunded_amount: refund_amount,
            });

            Ok(())
        }

        // --- Read-only Messages ---

        #[ink(message)]
        pub fn get_order(&self, order_id: u64) -> Option<FusionOrder> {
            self.orders.get(order_id)
        }

        #[ink(message)]
        pub fn get_order_by_hashlock(&self, hashlock: [u8; 32]) -> Option<u64> {
            self.active_htlcs.get(hashlock)
        }

        #[ink(message)]
        pub fn is_paused(&self) -> bool {
            self.paused
        }

        #[ink(message)]
        pub fn owner(&self) -> AccountId {
            self.owner
        }

        #[ink(message)]
        pub fn current_nonce(&self) -> u64 {
            self.order_nonce
        }
    }

    // --- Tests ---
    #[cfg(test)]
    mod tests {
        use super::*;

        fn default_accounts() -> ink::env::test::DefaultAccounts<ink::env::DefaultEnvironment> {
            ink::env::test::default_accounts::<ink::env::DefaultEnvironment>()
        }

        #[ink::test]
        fn test_new_contract() {
            let contract = IntentEscrow::new(50, 1000);
            assert_eq!(contract.protocol_fee_bps, 50);
            assert_eq!(contract.min_resolver_stake, 1000);
            assert!(!contract.is_paused());
        }

        #[ink::test]
        fn test_submit_fusion_intent() {
            let mut contract = IntentEscrow::new(50, 1000);
            let accounts = default_accounts();
            ink::env::test::set_caller::<ink::env::DefaultEnvironment>(accounts.alice);
            ink::env::test::set_value_transferred::<ink::env::DefaultEnvironment>(1_000_000);

            let params = SubmitIntentParams {
                from_token: AccountId::from([0x1; 32]),
                to_token: AccountId::from([0x2; 32]),
                from_amount: 1_000_000,
                min_to_amount: 950_000,
                deadline: ink::env::block_timestamp::<ink::env::DefaultEnvironment>() + 86400000,
                ethereum_escrow_src: None,
                max_resolver_fee: 5000,
            };

            let result = contract.submit_fusion_intent(params);
            assert!(result.is_ok());
            assert_eq!(result.unwrap(), 0);
            assert_eq!(contract.current_nonce(), 1);
        }

        // ... other tests would need similar updates ...
    }

    /// To enable end-to-end tests, add the `e2e-tests` feature to your Cargo.toml:
    /// [features]
    /// e2e-tests = []
    #[cfg(all(test, feature = "e2e-tests"))]
    mod e2e_tests {
       // ... e2e tests content ...
    }
}