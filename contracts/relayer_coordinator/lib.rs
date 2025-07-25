#![cfg_attr(not(feature = "std"), no_std, no_main)]

#[ink::contract]
mod relayer_coordinator {
    use ink::storage::Mapping;

    #[ink(storage)]
    pub struct RelayerCoordinator {
        relayers: Mapping<AccountId, bool>,
        owner: AccountId,
        intent_escrow: Option<AccountId>,
        min_stake: Balance,
    }

    #[ink(event)]
    pub struct RelayerRegistered { #[ink(topic)] relayer: AccountId; }
    #[ink(event)]
    pub struct RelayerRemoved { #[ink(topic)] relayer: AccountId; }

    #[derive(Debug, scale::Encode, scale::Decode)]
    #[cfg_attr(feature = "std", derive(scale_info::TypeInfo))]
    pub enum Error { Unauthorized, InsufficientStake }

    impl RelayerCoordinator {
        #[ink(constructor)]
        pub fn new(min_stake: Balance) -> Self {
            Self {
                relayers: Mapping::default(),
                owner: Self::env().caller(),
                intent_escrow: None,
                min_stake,
            }
        }

        #[ink(message)]
        pub fn set_intent_escrow(&mut self, escrow: AccountId) -> Result<(), Error> {
            if self.env().caller() != self.owner { return Err(Error::Unauthorized); }
            self.intent_escrow = Some(escrow);
            Ok(())
        }

        #[ink(message, payable)]
        pub fn register_relayer(&mut self) -> Result<(), Error> {
            let caller = self.env().caller();
            if self.env().transferred_value() < self.min_stake { return Err(Error::InsufficientStake); }
            self.relayers.insert(caller, &true);
            self.env().emit_event(RelayerRegistered { relayer: caller });
            Ok(())
        }

        #[ink(message)]
        pub fn is_relayer(&self, account: AccountId) -> bool {
            self.relayers.get(account).unwrap_or(false)
        }
    }
}