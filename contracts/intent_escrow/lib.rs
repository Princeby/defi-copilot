#![cfg_attr(not(feature = "std"), no_std, no_main)]

#[ink::contract]
mod intent_escrow {
    use ink::storage::Mapping;
    use scale::{Decode, Encode};

    #[derive(Debug, PartialEq, Eq, Encode, Decode)]
    #[cfg_attr(feature = "std", derive(scale_info::TypeInfo))]
    pub enum OrderStatus {
        Pending, Locked, PartiallyFilled, Executed, Refunded, Disputed,
    }

    #[derive(Debug, PartialEq, Eq, Encode, Decode)]
    #[cfg_attr(feature = "std", derive(scale_info::TypeInfo))]
    pub struct FusionOrder {
        maker: AccountId,
        from_token: AccountId,
        to_token: AccountId,
        from_amount: Balance,
        min_to_amount: Balance,
        hashlock: Hash,
        timelock: Timestamp,
        intent_hash: Hash,
        assigned_resolver: Option<AccountId>,
        ethereum_escrow_src: Option<AccountId>,
        status: OrderStatus,
        created_at: Timestamp,
        resolver_fee: Balance,
        filled_amount: Balance,
    }

    #[ink(storage)]
    pub struct IntentEscrow {
        orders: Mapping<u64, FusionOrder>,
        order_nonce: u64,
        relayer_coordinator: Option<AccountId>,
        protocol_fee_bps: u32,
        owner: AccountId,
        paused: bool,
        active_htlcs: Mapping<Hash, u64>,
    }

    #[derive(Debug, PartialEq, Eq, Encode, Decode)]
    #[cfg_attr(feature = "std", derive(scale_info::TypeInfo))]
    pub enum Error {
        ContractPaused, OrderNotFound, InvalidOrderStatus, DeadlineExpired,
        Unauthorized, InvalidHashlock, InsufficientFunds, RelayerNotRegistered,
    }

    #[ink(event)]
    pub struct FusionOrderCreated {
        #[ink(topic)]
        order_id: u64,
        #[ink(topic)]
        maker: AccountId,
        intent_hash: Hash,
        ethereum_escrow_src: Option<AccountId>,
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
        hashlock: Hash,
        resolver_fee: Balance,
    }

    #[ink(event)]
    pub struct CrossChainSwapCompleted {
        #[ink(topic)]
        order_id: u64,
        resolver: AccountId,
        secret: Hash,
        final_amount: Balance,
    }

    impl IntentEscrow {
        #[ink(constructor)]
        pub fn new(protocol_fee_bps: u32) -> Self {
            Self {
                orders: Mapping::default(),
                order_nonce: 0,
                relayer_coordinator: None,
                protocol_fee_bps,
                owner: Self::env().caller(),
                paused: false,
                active_htlcs: Mapping::default(),
            }
        }

        #[ink(message)]
        pub fn set_relayer_coordinator(&mut self, coordinator: AccountId) -> Result<(), Error> {
            if self.env().caller() != self.owner { return Err(Error::Unauthorized); }
            self.relayer_coordinator = Some(coordinator);
            Ok(())
        }

        #[ink(message, payable)]
        pub fn submit_fusion_intent(
            &mut self,
            from_token: AccountId,
            to_token: AccountId,
            from_amount: Balance,
            min_to_amount: Balance,
            deadline: Timestamp,
            ethereum_escrow_src: Option<AccountId>,
            max_resolver_fee: Balance,
        ) -> Result<u64, Error> {
            if self.paused { return Err(Error::ContractPaused); }
            let caller = self.env().caller();
            let current_time = self.env().block_timestamp();
            if deadline <= current_time { return Err(Error::DeadlineExpired); }
            if self.env().transferred_value() < from_amount { return Err(Error::InsufficientFunds); }

            let timelock = current_time + 24 * 60 * 60 * 1000;
            let intent_data = (from_token, to_token, from_amount, min_to_amount, deadline, caller);
            let intent_hash = self.env().hash_encoded::<blake2::Blake2x256, _>(&intent_data);

            let order_id = self.order_nonce;
            let order = FusionOrder {
                maker: caller,
                from_token,
                to_token,
                from_amount,
                min_to_amount,
                hashlock: Hash::default(),
                timelock,
                intent_hash,
                assigned_resolver: None,
                ethereum_escrow_src,
                status: OrderStatus::Pending,
                created_at: current_time,
                resolver_fee: max_resolver_fee,
                filled_amount: 0,
            };

            self.orders.insert(order_id, &order);
            self.order_nonce += 1;
            self.env().emit_event(FusionOrderCreated {
                order_id,
                maker: caller,
                intent_hash,
                ethereum_escrow_src,
                from_amount,
                min_to_amount,
                timelock,
            });
            Ok(order_id)
        }
    }
}