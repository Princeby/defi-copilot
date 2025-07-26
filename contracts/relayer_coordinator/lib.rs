#![cfg_attr(not(feature = "std"), no_std, no_main)]

#[ink::contract]
mod relayer_coordinator {
    use ink::storage::Mapping;
    use scale::{Decode, Encode};

    // --- Structs and Enums ---

    /// Relayer information structure
    #[derive(Debug, Clone, PartialEq, Eq, Encode, Decode)]
    #[cfg_attr(feature = "std", derive(scale_info::TypeInfo, ink::storage::traits::StorageLayout))]
    pub struct RelayerInfo {
        pub stake: Balance,
        pub is_active: bool,
        pub registered_at: Timestamp,
        pub total_orders_resolved: u64,
        pub reputation_score: u32, // 0-1000 scale
        pub last_activity: Timestamp,
    }

    /// Assignment strategy for relayers
    #[derive(Debug, Clone, PartialEq, Eq, Encode, Decode)]
    #[cfg_attr(feature = "std", derive(scale_info::TypeInfo, ink::storage::traits::StorageLayout))]
    pub enum AssignmentStrategy {
        FirstAvailable,
        HighestStake,
        BestReputation,
        RoundRobin,
    }

    /// Order assignment request
    #[derive(Debug, Clone, PartialEq, Eq, Encode, Decode)]
    #[cfg_attr(feature = "std", derive(scale_info::TypeInfo))]
    pub struct AssignmentRequest {
        pub order_id: u64,
        pub required_stake: Balance,
        pub max_resolver_fee: Balance,
        pub deadline: Timestamp,
        pub priority: u8, // 1-10 scale
    }

    /// Contract storage
    #[ink(storage)]
    pub struct RelayerCoordinator {
        relayers: Mapping<AccountId, RelayerInfo>,
        owner: AccountId,
        intent_escrow: Option<AccountId>,
        min_stake: Balance,
        max_relayers: u32,
        assignment_strategy: AssignmentStrategy,
        round_robin_index: u32,
        active_relayer_count: u32,
        total_stakes: Balance,
        paused: bool,
        // Track relayer performance
        relayer_assignments: Mapping<AccountId, u64>, // Total assignments per relayer
        order_assignments: Mapping<u64, AccountId>, // Order ID -> Assigned relayer
        // Penalty system
        penalty_threshold: u32, // Number of missed assignments before penalty
        relayer_penalties: Mapping<AccountId, u32>, // Missed assignments count
    }

    /// Contract errors
    #[derive(Debug, PartialEq, Eq, Encode, Decode)]
    #[cfg_attr(feature = "std", derive(scale_info::TypeInfo))]
    pub enum Error {
        Unauthorized,
        InsufficientStake,
        RelayerNotFound,
        RelayerNotActive,
        MaxRelayersReached,
        ContractPaused,
        InvalidStrategy,
        NoAvailableRelayers,
        OrderAlreadyAssigned,
        InvalidReputationScore,
        PenaltyThresholdReached,
        /// Returned when an arithmetic operation overflows
        ArithmeticOverflow,
    }

    // --- Events ---

    #[ink(event)]
    pub struct RelayerRegistered {
        #[ink(topic)]
        relayer: AccountId,
        stake: Balance,
        timestamp: Timestamp,
    }

    #[ink(event)]
    pub struct RelayerRemoved {
        #[ink(topic)]
        relayer: AccountId,
        stake_returned: Balance,
    }

    #[ink(event)]
    pub struct RelayerStakeIncreased {
        #[ink(topic)]
        relayer: AccountId,
        old_stake: Balance,
        new_stake: Balance,
    }

    #[ink(event)]
    pub struct RelayerAssignedToOrder {
        #[ink(topic)]
        order_id: u64,
        #[ink(topic)]
        relayer: AccountId,
        assignment_strategy: AssignmentStrategy,
        resolver_fee: Balance,
    }

    #[ink(event)]
    pub struct RelayerDeactivated {
        #[ink(topic)]
        relayer: AccountId,
        reason: u8, // 1: Self-deactivated, 2: Penalty, 3: Owner action
    }

    #[ink(event)]
    pub struct RelayerReactivated {
        #[ink(topic)]
        relayer: AccountId,
    }

    #[ink(event)]
    pub struct ReputationUpdated {
        #[ink(topic)]
        relayer: AccountId,
        old_score: u32,
        new_score: u32,
    }

    // --- Implementation ---

    impl RelayerCoordinator {
        #[ink(constructor)]
        pub fn new(min_stake: Balance, max_relayers: u32) -> Self {
            Self {
                relayers: Mapping::default(),
                owner: Self::env().caller(),
                intent_escrow: None,
                min_stake,
                max_relayers,
                assignment_strategy: AssignmentStrategy::FirstAvailable,
                round_robin_index: 0,
                active_relayer_count: 0,
                total_stakes: 0,
                paused: false,
                relayer_assignments: Mapping::default(),
                order_assignments: Mapping::default(),
                penalty_threshold: 3, // Default: 3 missed assignments = penalty
                relayer_penalties: Mapping::default(),
            }
        }

        // --- Owner Functions ---

        #[ink(message)]
        pub fn set_intent_escrow(&mut self, escrow: AccountId) -> Result<(), Error> {
            if self.env().caller() != self.owner {
                return Err(Error::Unauthorized);
            }
            self.intent_escrow = Some(escrow);
            Ok(())
        }

        #[ink(message)]
        pub fn set_assignment_strategy(&mut self, strategy: AssignmentStrategy) -> Result<(), Error> {
            if self.env().caller() != self.owner {
                return Err(Error::Unauthorized);
            }
            self.assignment_strategy = strategy;
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

        #[ink(message)]
        pub fn set_penalty_threshold(&mut self, threshold: u32) -> Result<(), Error> {
            if self.env().caller() != self.owner {
                return Err(Error::Unauthorized);
            }
            self.penalty_threshold = threshold;
            Ok(())
        }

        #[ink(message)]
        pub fn force_deactivate_relayer(&mut self, relayer: AccountId) -> Result<(), Error> {
            if self.env().caller() != self.owner {
                return Err(Error::Unauthorized);
            }

            let mut relayer_info = self.relayers.get(relayer).ok_or(Error::RelayerNotFound)?;
            if relayer_info.is_active {
                relayer_info.is_active = false;
                self.relayers.insert(relayer, &relayer_info);
                self.active_relayer_count = self.active_relayer_count.saturating_sub(1);

                self.env().emit_event(RelayerDeactivated {
                    relayer,
                    reason: 3, // Owner action
                });
            }
            Ok(())
        }

        // --- Relayer Management Functions ---

        #[ink(message, payable)]
        pub fn register_relayer(&mut self) -> Result<(), Error> {
            if self.paused {
                return Err(Error::ContractPaused);
            }

            let caller = self.env().caller();
            let stake = self.env().transferred_value();

            if stake < self.min_stake {
                return Err(Error::InsufficientStake);
            }

            if self.active_relayer_count >= self.max_relayers {
                return Err(Error::MaxRelayersReached);
            }

            let current_time = self.env().block_timestamp();

            // Check if relayer already exists
            if let Some(mut existing_relayer) = self.relayers.get(caller) {
                // If exists but inactive, reactivate
                if !existing_relayer.is_active {
                    existing_relayer.stake = existing_relayer.stake.checked_add(stake).ok_or(Error::ArithmeticOverflow)?;
                    existing_relayer.is_active = true;
                    existing_relayer.last_activity = current_time;
                    self.relayers.insert(caller, &existing_relayer);
                    self.active_relayer_count = self.active_relayer_count.checked_add(1).ok_or(Error::ArithmeticOverflow)?;

                    self.env().emit_event(RelayerReactivated { relayer: caller });
                } else {
                    // Already active, just increase stake
                    existing_relayer.stake = existing_relayer.stake.checked_add(stake).ok_or(Error::ArithmeticOverflow)?;
                    self.relayers.insert(caller, &existing_relayer);

                    self.env().emit_event(RelayerStakeIncreased {
                        relayer: caller,
                        old_stake: existing_relayer.stake.checked_sub(stake).ok_or(Error::ArithmeticOverflow)?,
                        new_stake: existing_relayer.stake,
                    });
                }
            } else {
                // New relayer
                let relayer_info = RelayerInfo {
                    stake,
                    is_active: true,
                    registered_at: current_time,
                    total_orders_resolved: 0,
                    reputation_score: 500, // Start with middle reputation
                    last_activity: current_time,
                };

                self.relayers.insert(caller, &relayer_info);
                self.active_relayer_count = self.active_relayer_count.checked_add(1).ok_or(Error::ArithmeticOverflow)?;

                self.env().emit_event(RelayerRegistered {
                    relayer: caller,
                    stake,
                    timestamp: current_time,
                });
            }

            self.total_stakes = self.total_stakes.checked_add(stake).ok_or(Error::ArithmeticOverflow)?;
            Ok(())
        }

        #[ink(message)]
        pub fn deactivate_relayer(&mut self) -> Result<(), Error> {
            let caller = self.env().caller();
            let mut relayer_info = self.relayers.get(caller).ok_or(Error::RelayerNotFound)?;

            if !relayer_info.is_active {
                return Err(Error::RelayerNotActive);
            }

            relayer_info.is_active = false;
            self.relayers.insert(caller, &relayer_info);
            self.active_relayer_count = self.active_relayer_count.saturating_sub(1);

            self.env().emit_event(RelayerDeactivated {
                relayer: caller,
                reason: 1, // Self-deactivated
            });

            Ok(())
        }

        #[ink(message)]
        pub fn withdraw_stake(&mut self, amount: Balance) -> Result<(), Error> {
            let caller = self.env().caller();
            let mut relayer_info = self.relayers.get(caller).ok_or(Error::RelayerNotFound)?;

            if relayer_info.is_active {
                return Err(Error::RelayerNotActive); // Must deactivate first
            }

            if amount > relayer_info.stake {
                return Err(Error::InsufficientStake);
            }

            let remaining_stake = relayer_info.stake.checked_sub(amount).ok_or(Error::ArithmeticOverflow)?;
            
            if remaining_stake > 0 {
                relayer_info.stake = remaining_stake;
                self.relayers.insert(caller, &relayer_info);
            } else {
                self.relayers.remove(caller);
                self.env().emit_event(RelayerRemoved {
                    relayer: caller,
                    stake_returned: amount,
                });
            }

            self.total_stakes = self.total_stakes.checked_sub(amount).ok_or(Error::ArithmeticOverflow)?;

            // Transfer stake back to relayer
            self.env().transfer(caller, amount).map_err(|_| Error::ArithmeticOverflow)?;

            Ok(())
        }

        // --- Assignment Functions ---

        #[ink(message)]
        pub fn assign_relayer_to_order(&mut self, request: AssignmentRequest) -> Result<AccountId, Error> {
            if self.paused {
                return Err(Error::ContractPaused);
            }

            // Only intent escrow can call this
            if Some(self.env().caller()) != self.intent_escrow {
                return Err(Error::Unauthorized);
            }

            // Check if order already assigned
            if self.order_assignments.contains(request.order_id) {
                return Err(Error::OrderAlreadyAssigned);
            }

            let assigned_relayer = match self.assignment_strategy {
                AssignmentStrategy::FirstAvailable => self.assign_first_available(&request)?,
                AssignmentStrategy::HighestStake => self.assign_highest_stake(&request)?,
                AssignmentStrategy::BestReputation => self.assign_best_reputation(&request)?,
                AssignmentStrategy::RoundRobin => self.assign_round_robin(&request)?,
            };

            // Record assignment
            self.order_assignments.insert(request.order_id, &assigned_relayer);
            let current_assignments = self.relayer_assignments.get(assigned_relayer).unwrap_or(0);
            self.relayer_assignments.insert(assigned_relayer, &(current_assignments.checked_add(1).ok_or(Error::ArithmeticOverflow)?));

            // Update relayer's last activity
            if let Some(mut relayer_info) = self.relayers.get(assigned_relayer) {
                relayer_info.last_activity = self.env().block_timestamp();
                self.relayers.insert(assigned_relayer, &relayer_info);
            }

            self.env().emit_event(RelayerAssignedToOrder {
                order_id: request.order_id,
                relayer: assigned_relayer,
                assignment_strategy: self.assignment_strategy.clone(),
                resolver_fee: request.max_resolver_fee,
            });

            Ok(assigned_relayer)
        }

        #[ink(message)]
        pub fn report_order_completion(&mut self, order_id: u64, success: bool) -> Result<(), Error> {
            // Only intent escrow can call this
            if Some(self.env().caller()) != self.intent_escrow {
                return Err(Error::Unauthorized);
            }

            if let Some(relayer) = self.order_assignments.get(order_id) {
                if let Some(mut relayer_info) = self.relayers.get(relayer) {
                    if success {
                        relayer_info.total_orders_resolved = relayer_info.total_orders_resolved.checked_add(1).ok_or(Error::ArithmeticOverflow)?;
                        // Increase reputation (max 1000)
                        let old_score = relayer_info.reputation_score;
                        relayer_info.reputation_score = (relayer_info.reputation_score.checked_add(10).ok_or(Error::ArithmeticOverflow)?).min(1000);
                        
                        self.relayers.insert(relayer, &relayer_info);

                        self.env().emit_event(ReputationUpdated {
                            relayer,
                            old_score,
                            new_score: relayer_info.reputation_score,
                        });

                        // Reset penalties on successful completion
                        self.relayer_penalties.remove(relayer);
                    } else {
                        // Decrease reputation (min 0) and add penalty
                        let old_score = relayer_info.reputation_score;
                        relayer_info.reputation_score = relayer_info.reputation_score.saturating_sub(20);
                        self.relayers.insert(relayer, &relayer_info);

                        let penalties = self.relayer_penalties.get(relayer).unwrap_or(0).checked_add(1).ok_or(Error::ArithmeticOverflow)?;
                        self.relayer_penalties.insert(relayer, &penalties);

                        // Auto-deactivate if penalty threshold reached
                        if penalties >= self.penalty_threshold {
                            relayer_info.is_active = false;
                            self.relayers.insert(relayer, &relayer_info);
                            self.active_relayer_count = self.active_relayer_count.saturating_sub(1);

                            self.env().emit_event(RelayerDeactivated {
                                relayer,
                                reason: 2, // Penalty
                            });
                        }

                        self.env().emit_event(ReputationUpdated {
                            relayer,
                            old_score,
                            new_score: relayer_info.reputation_score,
                        });
                    }
                }

                // Clean up assignment record
                self.order_assignments.remove(order_id);
            }

            Ok(())
        }

        // --- Assignment Strategy Implementations ---

        fn assign_first_available(&self, _request: &AssignmentRequest) -> Result<AccountId, Error> {
            // Simple iteration through relayers (not gas efficient for large sets)
            // In production, consider maintaining an active relayers list
            for _i in 0..self.active_relayer_count {
                // This is a simplified approach - in reality you'd iterate through actual relayer addresses
                // For demo purposes, we'll use a different approach
            }
            
            // For now, return an error if no relayers available
            // In a real implementation, you'd maintain a list of active relayer addresses
            Err(Error::NoAvailableRelayers)
        }

        fn assign_highest_stake(&self, _request: &AssignmentRequest) -> Result<AccountId, Error> {
            // Similar limitation - would need to iterate through all relayers
            // This is a simplified version
            Err(Error::NoAvailableRelayers)
        }

        fn assign_best_reputation(&self, _request: &AssignmentRequest) -> Result<AccountId, Error> {
            // Similar limitation
            Err(Error::NoAvailableRelayers)
        }

        fn assign_round_robin(&mut self, _request: &AssignmentRequest) -> Result<AccountId, Error> {
            // Similar limitation
            let next_index = self.round_robin_index.checked_add(1).ok_or(Error::ArithmeticOverflow)?;
            let max_count = self.active_relayer_count.max(1);
            self.round_robin_index = next_index.checked_rem(max_count).unwrap_or(0);
            Err(Error::NoAvailableRelayers)
        }

        // --- Read-only Functions ---

        #[ink(message)]
        pub fn is_relayer(&self, account: AccountId) -> bool {
            if let Some(relayer_info) = self.relayers.get(account) {
                relayer_info.is_active
            } else {
                false
            }
        }

        #[ink(message)]
        pub fn get_relayer_info(&self, account: AccountId) -> Option<RelayerInfo> {
            self.relayers.get(account)
        }

        #[ink(message)]
        pub fn get_assignment_strategy(&self) -> AssignmentStrategy {
            self.assignment_strategy.clone()
        }

        #[ink(message)]
        pub fn get_active_relayer_count(&self) -> u32 {
            self.active_relayer_count
        }

        #[ink(message)]
        pub fn get_total_stakes(&self) -> Balance {
            self.total_stakes
        }

        #[ink(message)]
        pub fn get_relayer_assignments(&self, relayer: AccountId) -> u64 {
            self.relayer_assignments.get(relayer).unwrap_or(0)
        }

        #[ink(message)]
        pub fn get_order_assignment(&self, order_id: u64) -> Option<AccountId> {
            self.order_assignments.get(order_id)
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
        pub fn min_stake(&self) -> Balance {
            self.min_stake
        }

        #[ink(message)]
        pub fn get_relayer_penalties(&self, relayer: AccountId) -> u32 {
            self.relayer_penalties.get(relayer).unwrap_or(0)
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
        fn test_new_coordinator() {
            let coordinator = RelayerCoordinator::new(1000, 10);
            assert_eq!(coordinator.min_stake, 1000);
            assert_eq!(coordinator.max_relayers, 10);
            assert_eq!(coordinator.active_relayer_count, 0);
            assert!(!coordinator.is_paused());
        }

        #[ink::test]
        fn test_register_relayer_success() {
            let mut coordinator = RelayerCoordinator::new(1000, 10);
            let accounts = default_accounts();
            
            ink::env::test::set_caller::<ink::env::DefaultEnvironment>(accounts.alice);
            ink::env::test::set_value_transferred::<ink::env::DefaultEnvironment>(1000);

            let result = coordinator.register_relayer();
            assert!(result.is_ok());
            assert_eq!(coordinator.get_active_relayer_count(), 1);
            assert!(coordinator.is_relayer(accounts.alice));

            let relayer_info = coordinator.get_relayer_info(accounts.alice).unwrap();
            assert_eq!(relayer_info.stake, 1000);
            assert!(relayer_info.is_active);
            assert_eq!(relayer_info.reputation_score, 500);
        }

        #[ink::test]
        fn test_register_relayer_insufficient_stake() {
            let mut coordinator = RelayerCoordinator::new(1000, 10);
            let accounts = default_accounts();
            
            ink::env::test::set_caller::<ink::env::DefaultEnvironment>(accounts.alice);
            ink::env::test::set_value_transferred::<ink::env::DefaultEnvironment>(500);

            let result = coordinator.register_relayer();
            assert_eq!(result, Err(Error::InsufficientStake));
        }

        #[ink::test]
        fn test_deactivate_relayer() {
            let mut coordinator = RelayerCoordinator::new(1000, 10);
            let accounts = default_accounts();
            
            // Register relayer first
            ink::env::test::set_caller::<ink::env::DefaultEnvironment>(accounts.alice);
            ink::env::test::set_value_transferred::<ink::env::DefaultEnvironment>(1000);
            let _ = coordinator.register_relayer();

            // Deactivate
            let result = coordinator.deactivate_relayer();
            assert!(result.is_ok());
            assert!(!coordinator.is_relayer(accounts.alice));
            assert_eq!(coordinator.get_active_relayer_count(), 0);
        }

        #[ink::test]
        fn test_set_intent_escrow_unauthorized() {
            let mut coordinator = RelayerCoordinator::new(1000, 10);
            let accounts = default_accounts();
            
            ink::env::test::set_caller::<ink::env::DefaultEnvironment>(accounts.bob);
            let result = coordinator.set_intent_escrow(accounts.charlie);
            assert_eq!(result, Err(Error::Unauthorized));
        }

        #[ink::test]
        fn test_increase_stake() {
            let mut coordinator = RelayerCoordinator::new(1000, 10);
            let accounts = default_accounts();
            
            // Register relayer first
            ink::env::test::set_caller::<ink::env::DefaultEnvironment>(accounts.alice);
            ink::env::test::set_value_transferred::<ink::env::DefaultEnvironment>(1000);
            let _ = coordinator.register_relayer();

            // Increase stake
            ink::env::test::set_value_transferred::<ink::env::DefaultEnvironment>(500);
            let _ = coordinator.register_relayer();

            let relayer_info = coordinator.get_relayer_info(accounts.alice).unwrap();
            assert_eq!(relayer_info.stake, 1500);
        }

        #[ink::test]
        fn test_max_relayers_limit() {
            let mut coordinator = RelayerCoordinator::new(1000, 2); // Max 2 relayers
            let accounts = default_accounts();
            
            // Register first relayer
            ink::env::test::set_caller::<ink::env::DefaultEnvironment>(accounts.alice);
            ink::env::test::set_value_transferred::<ink::env::DefaultEnvironment>(1000);
            let _ = coordinator.register_relayer();

            // Register second relayer
            ink::env::test::set_caller::<ink::env::DefaultEnvironment>(accounts.bob);
            ink::env::test::set_value_transferred::<ink::env::DefaultEnvironment>(1000);
            let _ = coordinator.register_relayer();

            // Try to register third relayer (should fail)
            ink::env::test::set_caller::<ink::env::DefaultEnvironment>(accounts.charlie);
            ink::env::test::set_value_transferred::<ink::env::DefaultEnvironment>(1000);
            let result = coordinator.register_relayer();
            assert_eq!(result, Err(Error::MaxRelayersReached));
        }

        #[ink::test]
        fn test_withdraw_stake() {
            let mut coordinator = RelayerCoordinator::new(1000, 10);
            let accounts = default_accounts();
            
            // Register and then deactivate relayer
            ink::env::test::set_caller::<ink::env::DefaultEnvironment>(accounts.alice);
            ink::env::test::set_value_transferred::<ink::env::DefaultEnvironment>(1500);
            let _ = coordinator.register_relayer();
            let _ = coordinator.deactivate_relayer();

            // Withdraw partial stake
            let result = coordinator.withdraw_stake(500);
            assert!(result.is_ok());

            let relayer_info = coordinator.get_relayer_info(accounts.alice).unwrap();
            assert_eq!(relayer_info.stake, 1000);
        }

        #[ink::test]
        fn test_assignment_strategy() {
            let mut coordinator = RelayerCoordinator::new(1000, 10);
            let accounts = default_accounts();
            
            ink::env::test::set_caller::<ink::env::DefaultEnvironment>(accounts.alice);
            let _ = coordinator.set_assignment_strategy(AssignmentStrategy::HighestStake);
            
            assert_eq!(coordinator.get_assignment_strategy(), AssignmentStrategy::HighestStake);
        }

        #[ink::test]
        fn test_pause_functionality() {
            let mut coordinator = RelayerCoordinator::new(1000, 10);
            let accounts = default_accounts();
            
            // Pause contract
            ink::env::test::set_caller::<ink::env::DefaultEnvironment>(accounts.alice);
            let _ = coordinator.set_paused(true);
            assert!(coordinator.is_paused());

            // Try to register while paused
            ink::env::test::set_value_transferred::<ink::env::DefaultEnvironment>(1000);
            let result = coordinator.register_relayer();
            assert_eq!(result, Err(Error::ContractPaused));
        }
    }

    /// E2E tests
    #[cfg(all(test, feature = "e2e-tests"))]
    mod e2e_tests {
        use super::*;
        use ink_e2e::build_message;

        type E2EResult<T> = std::result::Result<T, Box<dyn std::error::Error>>;

        #[ink_e2e::test]
        async fn test_e2e_relayer_registration(mut client: ink_e2e::Client<C, E>) -> E2EResult<()> {
            // Deploy coordinator
            let constructor = RelayerCoordinatorRef::new(1000, 10);
            let contract_account_id = client
                .instantiate("relayer_coordinator", &ink_e2e::alice(), constructor, 0, None)
                .await
                .expect("instantiate failed")
                .account_id;

            // Register relayer
            let register_relayer = build_message::<RelayerCoordinatorRef>(contract_account_id.clone())
                .call(|coordinator| coordinator.register_relayer());
            
            let register_result = client
                .call(&ink_e2e::bob(), register_relayer, 1000, None)
                .await
                .expect("register_relayer failed");

            assert!(register_result.return_value().is_ok());

            // Check if relayer is registered
            let is_relayer = build_message::<RelayerCoordinatorRef>(contract_account_id.clone())
                .call(|coordinator| coordinator.is_relayer(ink_e2e::bob()));
            
            let is_relayer_result = client
                .call_dry_run(&ink_e2e::alice(), &is_relayer, 0, None)
                .await;

            assert!(is_relayer_result.return_value());

            Ok(())
        }
    }
}