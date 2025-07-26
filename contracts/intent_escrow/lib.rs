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

      fn create_default_params() -> SubmitIntentParams {
          SubmitIntentParams {
              from_token: AccountId::from([0x1; 32]),
              to_token: AccountId::from([0x2; 32]),
              from_amount: 1_000_000,
              min_to_amount: 950_000,
              deadline: ink::env::block_timestamp::<ink::env::DefaultEnvironment>() + 86400000,
              ethereum_escrow_src: Some([0x42; 20]),
              max_resolver_fee: 5000,
          }
      }

      #[ink::test]
      fn test_new_contract() {
          let contract = IntentEscrow::new(50, 1000);
          assert_eq!(contract.protocol_fee_bps, 50);
          assert_eq!(contract.min_resolver_stake, 1000);
          assert!(!contract.is_paused());
          assert_eq!(contract.current_nonce(), 0);
          assert_eq!(contract.owner(), default_accounts().alice);
      }

      #[ink::test]
      fn test_submit_fusion_intent_success() {
          let mut contract = IntentEscrow::new(50, 1000);
          let accounts = default_accounts();
          ink::env::test::set_caller::<ink::env::DefaultEnvironment>(accounts.alice);
          ink::env::test::set_value_transferred::<ink::env::DefaultEnvironment>(1_000_000);

          let params = create_default_params();
          let result = contract.submit_fusion_intent(params);
          
          assert!(result.is_ok());
          assert_eq!(result.unwrap(), 0);
          assert_eq!(contract.current_nonce(), 1);

          let order = contract.get_order(0).unwrap();
          assert_eq!(order.maker, accounts.alice);
          assert_eq!(order.from_amount, 1_000_000);
          assert_eq!(order.status, OrderStatus::Pending);
          assert_eq!(order.filled_amount, 0);
      }

      #[ink::test]
      fn test_submit_fusion_intent_insufficient_funds() {
          let mut contract = IntentEscrow::new(50, 1000);
          let accounts = default_accounts();
          ink::env::test::set_caller::<ink::env::DefaultEnvironment>(accounts.alice);
          ink::env::test::set_value_transferred::<ink::env::DefaultEnvironment>(500_000); // Less than from_amount

          let params = create_default_params();
          let result = contract.submit_fusion_intent(params);
          
          assert_eq!(result, Err(Error::InsufficientFunds));
      }

      #[ink::test]
      fn test_submit_fusion_intent_expired_deadline() {
          let mut contract = IntentEscrow::new(50, 1000);
          let accounts = default_accounts();
          ink::env::test::set_caller::<ink::env::DefaultEnvironment>(accounts.alice);
          ink::env::test::set_value_transferred::<ink::env::DefaultEnvironment>(1_000_000);

          let mut params = create_default_params();
          params.deadline = 0; // Expired deadline
          
          let result = contract.submit_fusion_intent(params);
          assert_eq!(result, Err(Error::DeadlineExpired));
      }

      #[ink::test]
      fn test_submit_fusion_intent_when_paused() {
          let mut contract = IntentEscrow::new(50, 1000);
          let accounts = default_accounts();
          
          // Pause the contract
          ink::env::test::set_caller::<ink::env::DefaultEnvironment>(accounts.alice);
          let _ = contract.set_paused(true);
          
          // Try to submit intent
          ink::env::test::set_value_transferred::<ink::env::DefaultEnvironment>(1_000_000);
          let params = create_default_params();
          let result = contract.submit_fusion_intent(params);
          
          assert_eq!(result, Err(Error::ContractPaused));
      }

      #[ink::test]
      fn test_assign_resolver_success() {
          let mut contract = IntentEscrow::new(50, 1000);
          let accounts = default_accounts();
          
          // First create an order
          ink::env::test::set_caller::<ink::env::DefaultEnvironment>(accounts.alice);
          ink::env::test::set_value_transferred::<ink::env::DefaultEnvironment>(1_000_000);
          let params = create_default_params();
          let order_id = contract.submit_fusion_intent(params).unwrap();

          // Now assign resolver
          ink::env::test::set_caller::<ink::env::DefaultEnvironment>(accounts.bob);
          ink::env::test::set_value_transferred::<ink::env::DefaultEnvironment>(1000); // Min stake
          let hashlock = [0x99; 32];
          let resolver_fee = 2000;

          let result = contract.assign_resolver(order_id, accounts.charlie, hashlock, resolver_fee);
          assert!(result.is_ok());

          let order = contract.get_order(order_id).unwrap();
          assert_eq!(order.assigned_resolver, Some(accounts.charlie));
          assert_eq!(order.hashlock, hashlock);
          assert_eq!(order.resolver_fee, resolver_fee);
          assert_eq!(order.status, OrderStatus::Locked);
      }

      #[ink::test]
      fn test_assign_resolver_insufficient_stake() {
          let mut contract = IntentEscrow::new(50, 1000);
          let accounts = default_accounts();
          
          // First create an order
          ink::env::test::set_caller::<ink::env::DefaultEnvironment>(accounts.alice);
          ink::env::test::set_value_transferred::<ink::env::DefaultEnvironment>(1_000_000);
          let params = create_default_params();
          let order_id = contract.submit_fusion_intent(params).unwrap();

          // Try to assign resolver with insufficient stake
          ink::env::test::set_caller::<ink::env::DefaultEnvironment>(accounts.bob);
          ink::env::test::set_value_transferred::<ink::env::DefaultEnvironment>(500); // Less than min stake
          let hashlock = [0x99; 32];

          let result = contract.assign_resolver(order_id, accounts.charlie, hashlock, 2000);
          assert_eq!(result, Err(Error::InsufficientStake));
      }

      #[ink::test]
      fn test_assign_resolver_order_not_found() {
          let mut contract = IntentEscrow::new(50, 1000);
          let accounts = default_accounts();
          
          ink::env::test::set_caller::<ink::env::DefaultEnvironment>(accounts.bob);
          ink::env::test::set_value_transferred::<ink::env::DefaultEnvironment>(1000);
          let hashlock = [0x99; 32];

          let result = contract.assign_resolver(999, accounts.charlie, hashlock, 2000);
          assert_eq!(result, Err(Error::OrderNotFound));
      }

      #[ink::test]
      fn test_execute_swap_success() {
          let mut contract = IntentEscrow::new(50, 1000);
          let accounts = default_accounts();
          
          // Create order and assign resolver
          ink::env::test::set_caller::<ink::env::DefaultEnvironment>(accounts.alice);
          ink::env::test::set_value_transferred::<ink::env::DefaultEnvironment>(1_000_000);
          let params = create_default_params();
          let order_id = contract.submit_fusion_intent(params).unwrap();

          ink::env::test::set_caller::<ink::env::DefaultEnvironment>(accounts.bob);
          ink::env::test::set_value_transferred::<ink::env::DefaultEnvironment>(1000);
          let secret = [0x11; 32];
          let mut hashlock = [0u8; 32];
          ink::env::hash_bytes::<ink::env::hash::Blake2x256>(&secret, &mut hashlock);
          let _ = contract.assign_resolver(order_id, accounts.charlie, hashlock, 2000);

          // Execute swap
          ink::env::test::set_caller::<ink::env::DefaultEnvironment>(accounts.charlie);
          let result = contract.execute_swap(order_id, secret, 1_000_000);
          assert!(result.is_ok());

          let order = contract.get_order(order_id).unwrap();
          assert_eq!(order.status, OrderStatus::Executed);
          assert_eq!(order.filled_amount, 1_000_000);
      }

      #[ink::test]
      fn test_execute_swap_partial_fill() {
          let mut contract = IntentEscrow::new(50, 1000);
          let accounts = default_accounts();
          
          // Create order and assign resolver
          ink::env::test::set_caller::<ink::env::DefaultEnvironment>(accounts.alice);
          ink::env::test::set_value_transferred::<ink::env::DefaultEnvironment>(1_000_000);
          let params = create_default_params();
          let order_id = contract.submit_fusion_intent(params).unwrap();

          ink::env::test::set_caller::<ink::env::DefaultEnvironment>(accounts.bob);
          ink::env::test::set_value_transferred::<ink::env::DefaultEnvironment>(1000);
          let secret = [0x11; 32];
          let mut hashlock = [0u8; 32];
          ink::env::hash_bytes::<ink::env::hash::Blake2x256>(&secret, &mut hashlock);
          let _ = contract.assign_resolver(order_id, accounts.charlie, hashlock, 2000);

          // Execute partial swap
          ink::env::test::set_caller::<ink::env::DefaultEnvironment>(accounts.charlie);
          let result = contract.execute_swap(order_id, secret, 500_000);
          assert!(result.is_ok());

          let order = contract.get_order(order_id).unwrap();
          assert_eq!(order.status, OrderStatus::PartiallyFilled);
          assert_eq!(order.filled_amount, 500_000);
      }

      #[ink::test]
      fn test_execute_swap_invalid_secret() {
          let mut contract = IntentEscrow::new(50, 1000);
          let accounts = default_accounts();
          
          // Create order and assign resolver
          ink::env::test::set_caller::<ink::env::DefaultEnvironment>(accounts.alice);
          ink::env::test::set_value_transferred::<ink::env::DefaultEnvironment>(1_000_000);
          let params = create_default_params();
          let order_id = contract.submit_fusion_intent(params).unwrap();

          ink::env::test::set_caller::<ink::env::DefaultEnvironment>(accounts.bob);
          ink::env::test::set_value_transferred::<ink::env::DefaultEnvironment>(1000);
          let secret = [0x11; 32];
          let mut hashlock = [0u8; 32];
          ink::env::hash_bytes::<ink::env::hash::Blake2x256>(&secret, &mut hashlock);
          let _ = contract.assign_resolver(order_id, accounts.charlie, hashlock, 2000);

          // Try with wrong secret
          ink::env::test::set_caller::<ink::env::DefaultEnvironment>(accounts.charlie);
          let wrong_secret = [0x22; 32];
          let result = contract.execute_swap(order_id, wrong_secret, 1_000_000);
          assert_eq!(result, Err(Error::InvalidSecret));
      }

      #[ink::test]
      fn test_refund_order_success() {
          let mut contract = IntentEscrow::new(50, 1000);
          let accounts = default_accounts();
          
          // Create order and assign resolver
          ink::env::test::set_caller::<ink::env::DefaultEnvironment>(accounts.alice);
          ink::env::test::set_value_transferred::<ink::env::DefaultEnvironment>(1_000_000);
          let params = create_default_params();
          let order_id = contract.submit_fusion_intent(params).unwrap();

          ink::env::test::set_caller::<ink::env::DefaultEnvironment>(accounts.bob);
          ink::env::test::set_value_transferred::<ink::env::DefaultEnvironment>(1000);
          let hashlock = [0x99; 32];
          let _ = contract.assign_resolver(order_id, accounts.charlie, hashlock, 2000);

          // Set time past timelock
          let order = contract.get_order(order_id).unwrap();
          ink::env::test::set_block_timestamp::<ink::env::DefaultEnvironment>(order.timelock + 1);

          // Refund order
          ink::env::test::set_caller::<ink::env::DefaultEnvironment>(accounts.alice);
          let result = contract.refund_order(order_id);
          assert!(result.is_ok());

          let updated_order = contract.get_order(order_id).unwrap();
          assert_eq!(updated_order.status, OrderStatus::Refunded);
      }

      #[ink::test]
      fn test_refund_order_timelock_not_expired() {
          let mut contract = IntentEscrow::new(50, 1000);
          let accounts = default_accounts();
          
          // Create order and assign resolver
          ink::env::test::set_caller::<ink::env::DefaultEnvironment>(accounts.alice);
          ink::env::test::set_value_transferred::<ink::env::DefaultEnvironment>(1_000_000);
          let params = create_default_params();
          let order_id = contract.submit_fusion_intent(params).unwrap();

          ink::env::test::set_caller::<ink::env::DefaultEnvironment>(accounts.bob);
          ink::env::test::set_value_transferred::<ink::env::DefaultEnvironment>(1000);
          let hashlock = [0x99; 32];
          let _ = contract.assign_resolver(order_id, accounts.charlie, hashlock, 2000);

          // Try to refund before timelock expires
          ink::env::test::set_caller::<ink::env::DefaultEnvironment>(accounts.alice);
          let result = contract.refund_order(order_id);
          assert_eq!(result, Err(Error::TimelockNotExpired));
      }

      #[ink::test]
      fn test_refund_order_unauthorized() {
          let mut contract = IntentEscrow::new(50, 1000);
          let accounts = default_accounts();
          
          // Create order and assign resolver
          ink::env::test::set_caller::<ink::env::DefaultEnvironment>(accounts.alice);
          ink::env::test::set_value_transferred::<ink::env::DefaultEnvironment>(1_000_000);
          let params = create_default_params();
          let order_id = contract.submit_fusion_intent(params).unwrap();

          ink::env::test::set_caller::<ink::env::DefaultEnvironment>(accounts.bob);
          ink::env::test::set_value_transferred::<ink::env::DefaultEnvironment>(1000);
          let hashlock = [0x99; 32];
          let _ = contract.assign_resolver(order_id, accounts.charlie, hashlock, 2000);

          // Set time past timelock
          let order = contract.get_order(order_id).unwrap();
          ink::env::test::set_block_timestamp::<ink::env::DefaultEnvironment>(order.timelock + 1);

          // Try to refund from wrong account
          ink::env::test::set_caller::<ink::env::DefaultEnvironment>(accounts.bob);
          let result = contract.refund_order(order_id);
          assert_eq!(result, Err(Error::Unauthorized));
      }

      #[ink::test]
      fn test_set_paused_unauthorized() {
          let mut contract = IntentEscrow::new(50, 1000);
          let accounts = default_accounts();
          
          ink::env::test::set_caller::<ink::env::DefaultEnvironment>(accounts.bob);
          let result = contract.set_paused(true);
          assert_eq!(result, Err(Error::Unauthorized));
      }

      #[ink::test]
      fn test_set_relayer_coordinator() {
          let mut contract = IntentEscrow::new(50, 1000);
          let accounts = default_accounts();
          
          ink::env::test::set_caller::<ink::env::DefaultEnvironment>(accounts.alice);
          let result = contract.set_relayer_coordinator(accounts.bob);
          assert!(result.is_ok());
          assert_eq!(contract.relayer_coordinator, Some(accounts.bob));
      }

      #[ink::test]
      fn test_set_relayer_coordinator_unauthorized() {
          let mut contract = IntentEscrow::new(50, 1000);
          let accounts = default_accounts();
          
          ink::env::test::set_caller::<ink::env::DefaultEnvironment>(accounts.bob);
          let result = contract.set_relayer_coordinator(accounts.charlie);
          assert_eq!(result, Err(Error::Unauthorized));
      }

      #[ink::test]
      fn test_get_order_by_hashlock() {
          let mut contract = IntentEscrow::new(50, 1000);
          let accounts = default_accounts();
          
          // Create order and assign resolver
          ink::env::test::set_caller::<ink::env::DefaultEnvironment>(accounts.alice);
          ink::env::test::set_value_transferred::<ink::env::DefaultEnvironment>(1_000_000);
          let params = create_default_params();
          let order_id = contract.submit_fusion_intent(params).unwrap();

          ink::env::test::set_caller::<ink::env::DefaultEnvironment>(accounts.bob);
          ink::env::test::set_value_transferred::<ink::env::DefaultEnvironment>(1000);
          let hashlock = [0x99; 32];
          let _ = contract.assign_resolver(order_id, accounts.charlie, hashlock, 2000);

          // Test hashlock lookup
          let found_order_id = contract.get_order_by_hashlock(hashlock);
          assert_eq!(found_order_id, Some(order_id));

          // Test non-existent hashlock
          let non_existent = contract.get_order_by_hashlock([0x88; 32]);
          assert_eq!(non_existent, None);
      }

      #[ink::test]
      fn test_duplicate_hashlock() {
          let mut contract = IntentEscrow::new(50, 1000);
          let accounts = default_accounts();
          
          // Create first order
          ink::env::test::set_caller::<ink::env::DefaultEnvironment>(accounts.alice);
          ink::env::test::set_value_transferred::<ink::env::DefaultEnvironment>(1_000_000);
          let params = create_default_params();
          let order_id1 = contract.submit_fusion_intent(params).unwrap();

          // Create second order
          let params2 = create_default_params();
          let order_id2 = contract.submit_fusion_intent(params2).unwrap();

          // Assign resolver to first order
          ink::env::test::set_caller::<ink::env::DefaultEnvironment>(accounts.bob);
          ink::env::test::set_value_transferred::<ink::env::DefaultEnvironment>(1000);
          let hashlock = [0x99; 32];
          let _ = contract.assign_resolver(order_id1, accounts.charlie, hashlock, 2000);

          // Try to assign same hashlock to second order
          ink::env::test::set_value_transferred::<ink::env::DefaultEnvironment>(1000);
          let result = contract.assign_resolver(order_id2, accounts.django, hashlock, 2000);
          assert_eq!(result, Err(Error::OrderAlreadyExists));
      }

      #[ink::test]
      fn test_execute_swap_excess_amount() {
          let mut contract = IntentEscrow::new(50, 1000);
          let accounts = default_accounts();
          
          // Create order and assign resolver
          ink::env::test::set_caller::<ink::env::DefaultEnvironment>(accounts.alice);
          ink::env::test::set_value_transferred::<ink::env::DefaultEnvironment>(1_000_000);
          let params = create_default_params();
          let order_id = contract.submit_fusion_intent(params).unwrap();

          ink::env::test::set_caller::<ink::env::DefaultEnvironment>(accounts.bob);
          ink::env::test::set_value_transferred::<ink::env::DefaultEnvironment>(1000);
          let secret = [0x11; 32];
          let mut hashlock = [0u8; 32];
          ink::env::hash_bytes::<ink::env::hash::Blake2x256>(&secret, &mut hashlock);
          let _ = contract.assign_resolver(order_id, accounts.charlie, hashlock, 2000);

          // Try to execute with more than available amount
          ink::env::test::set_caller::<ink::env::DefaultEnvironment>(accounts.charlie);
          let result = contract.execute_swap(order_id, secret, 2_000_000);
          assert_eq!(result, Err(Error::InsufficientFunds));
      }

      #[ink::test]
      fn test_multiple_partial_fills() {
          let mut contract = IntentEscrow::new(50, 1000);
          let accounts = default_accounts();
          
          // Create order and assign resolver
          ink::env::test::set_caller::<ink::env::DefaultEnvironment>(accounts.alice);
          ink::env::test::set_value_transferred::<ink::env::DefaultEnvironment>(1_000_000);
          let params = create_default_params();
          let order_id = contract.submit_fusion_intent(params).unwrap();

          ink::env::test::set_caller::<ink::env::DefaultEnvironment>(accounts.bob);
          ink::env::test::set_value_transferred::<ink::env::DefaultEnvironment>(1000);
          let secret = [0x11; 32];
          let mut hashlock = [0u8; 32];
          ink::env::hash_bytes::<ink::env::hash::Blake2x256>(&secret, &mut hashlock);
          let _ = contract.assign_resolver(order_id, accounts.charlie, hashlock, 2000);

          // First partial fill
          ink::env::test::set_caller::<ink::env::DefaultEnvironment>(accounts.charlie);
          let result1 = contract.execute_swap(order_id, secret, 300_000);
          assert!(result1.is_ok());

          let order = contract.get_order(order_id).unwrap();
          assert_eq!(order.status, OrderStatus::PartiallyFilled);
          assert_eq!(order.filled_amount, 300_000);

          // Second partial fill
          let result2 = contract.execute_swap(order_id, secret, 200_000);
          assert!(result2.is_ok());

          let order = contract.get_order(order_id).unwrap();
          assert_eq!(order.status, OrderStatus::PartiallyFilled);
          assert_eq!(order.filled_amount, 500_000);

          // Final fill
          let result3 = contract.execute_swap(order_id, secret, 500_000);
          assert!(result3.is_ok());

          let order = contract.get_order(order_id).unwrap();
          assert_eq!(order.status, OrderStatus::Executed);
          assert_eq!(order.filled_amount, 1_000_000);
      }

      #[ink::test]
      fn test_refund_partially_filled_order() {
          let mut contract = IntentEscrow::new(50, 1000);
          let accounts = default_accounts();
          
          // Create order and assign resolver
          ink::env::test::set_caller::<ink::env::DefaultEnvironment>(accounts.alice);
          ink::env::test::set_value_transferred::<ink::env::DefaultEnvironment>(1_000_000);
          let params = create_default_params();
          let order_id = contract.submit_fusion_intent(params).unwrap();

          ink::env::test::set_caller::<ink::env::DefaultEnvironment>(accounts.bob);
          ink::env::test::set_value_transferred::<ink::env::DefaultEnvironment>(1000);
          let secret = [0x11; 32];
          let mut hashlock = [0u8; 32];
          ink::env::hash_bytes::<ink::env::hash::Blake2x256>(&secret, &mut hashlock);
          let _ = contract.assign_resolver(order_id, accounts.charlie, hashlock, 2000);

          // Partial fill
          ink::env::test::set_caller::<ink::env::DefaultEnvironment>(accounts.charlie);
          let _ = contract.execute_swap(order_id, secret, 400_000);

          // Set time past timelock
          let order = contract.get_order(order_id).unwrap();
          ink::env::test::set_block_timestamp::<ink::env::DefaultEnvironment>(order.timelock + 1);

          // Refund remaining amount
          ink::env::test::set_caller::<ink::env::DefaultEnvironment>(accounts.alice);
          let result = contract.refund_order(order_id);
          assert!(result.is_ok());

          let updated_order = contract.get_order(order_id).unwrap();
          assert_eq!(updated_order.status, OrderStatus::Refunded);
      }

      #[ink::test]
      fn test_invalid_order_status_transitions() {
          let mut contract = IntentEscrow::new(50, 1000);
          let accounts = default_accounts();
          
          // Create order
          ink::env::test::set_caller::<ink::env::DefaultEnvironment>(accounts.alice);
          ink::env::test::set_value_transferred::<ink::env::DefaultEnvironment>(1_000_000);
          let params = create_default_params();
          let order_id = contract.submit_fusion_intent(params).unwrap();

          // Try to execute swap on pending order (should fail)
          ink::env::test::set_caller::<ink::env::DefaultEnvironment>(accounts.charlie);
          let secret = [0x11; 32];
          let result = contract.execute_swap(order_id, secret, 1_000_000);
          assert_eq!(result, Err(Error::InvalidOrderStatus));

          // Try to refund pending order (should fail)
          ink::env::test::set_caller::<ink::env::DefaultEnvironment>(accounts.alice);
          let result = contract.refund_order(order_id);
          assert_eq!(result, Err(Error::InvalidOrderStatus));
      }

      #[ink::test]
      fn test_contract_pause_functionality() {
          let mut contract = IntentEscrow::new(50, 1000);
          let accounts = default_accounts();
          
          // Pause contract
          ink::env::test::set_caller::<ink::env::DefaultEnvironment>(accounts.alice);
          let _ = contract.set_paused(true);
          assert!(contract.is_paused());

          // Try operations while paused
          ink::env::test::set_value_transferred::<ink::env::DefaultEnvironment>(1_000_000);
          let params = create_default_params();
          let result = contract.submit_fusion_intent(params);
          assert_eq!(result, Err(Error::ContractPaused));

          // Unpause and try again
          let _ = contract.set_paused(false);
          assert!(!contract.is_paused());
          
          let result = contract.submit_fusion_intent(create_default_params());
          assert!(result.is_ok());
      }
  }
  
  
  /// To enable end-to-end tests, add the `e2e-tests` feature to your Cargo.toml:
    /// [features]
    /// e2e-tests = []
    #[cfg(all(test, feature = "e2e-tests"))]
    mod e2e_tests {
       // ... e2e tests content ...
    }
}