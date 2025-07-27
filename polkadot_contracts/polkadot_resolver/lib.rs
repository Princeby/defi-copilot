#![cfg_attr(not(feature = "std"), no_std, no_main)]

use ink::storage::Mapping;
use scale::{Decode, Encode};

/// Polkadot Resolver Contract - Coordinates cross-chain swaps
#[ink::contract]
mod polkadot_resolver {
    use super::*;

    /// Cross-chain swap direction
    #[derive(Debug, Clone, PartialEq, Eq, Encode, Decode)]
    #[cfg_attr(feature = "std", derive(scale_info::TypeInfo, ink::storage::traits::StorageLayout))]
    pub enum SwapDirection {
        EthereumToPolkadot,
        PolkadotToEthereum,
    }

    /// Ethereum escrow proof data
    #[derive(Debug, Clone, PartialEq, Eq, Encode, Decode)]
    #[cfg_attr(feature = "std", derive(scale_info::TypeInfo, ink::storage::traits::StorageLayout))]
    pub struct EthereumEscrowProof {
        pub escrow_address: [u8; 20],
        pub block_hash: [u8; 32],
        pub block_number: u64,
        pub tx_hash: [u8; 32],
        pub merkle_proof: Vec<[u8; 32]>,
    }

    /// Resolver job status
    #[derive(Debug, Clone, PartialEq, Eq, Encode, Decode)]
    #[cfg_attr(feature = "std", derive(scale_info::TypeInfo, ink::storage::traits::StorageLayout))]
    pub enum JobStatus {
        Pending,           // Waiting for resolver to pick up
        EthereumDeployed,  // Ethereum escrow deployed
        PolkadotDeployed,  // Polkadot escrow deployed
        Executing,         // Secret revealed, executing swaps
        Completed,         // Both sides completed
        Failed,            // Something went wrong
        Cancelled,         // Job cancelled
    }

    /// Cross-chain resolver job
    #[derive(Debug, Clone, PartialEq, Eq, Encode, Decode)]
    #[cfg_attr(feature = "std", derive(scale_info::TypeInfo, ink::storage::traits::StorageLayout))]
    pub struct ResolverJob {
        pub job_id: [u8; 32],
        pub polkadot_order_hash: [u8; 32],
        pub ethereum_order_hash: [u8; 32],
        pub direction: SwapDirection,
        pub hash_lock: [u8; 32],
        pub secret: Option<[u8; 32]>,
        pub resolver: AccountId,
        pub maker: AccountId,
        pub status: JobStatus,
        pub ethereum_escrow_proof: Option<EthereumEscrowProof>,
        pub created_at: Timestamp,
        pub deadline: Timestamp,
        pub stake_amount: Balance,
    }

    /// Events
    #[ink(event)]
    pub struct JobCreated {
        #[ink(topic)]
        pub job_id: [u8; 32],
        #[ink(topic)]
        pub resolver: AccountId,
        pub direction: SwapDirection,
        pub polkadot_order_hash: [u8; 32],
        pub ethereum_order_hash: [u8; 32],
    }

    #[ink(event)]
    pub struct EthereumEscrowVerified {
        #[ink(topic)]
        pub job_id: [u8; 32],
        pub escrow_address: [u8; 20],
        pub block_number: u64,
    }

    #[ink(event)]
    pub struct SwapExecuted {
        #[ink(topic)]
        pub job_id: [u8; 32],
        pub secret_revealed: [u8; 32],
    }

    #[ink(event)]
    pub struct JobCompleted {
        #[ink(topic)]
        pub job_id: [u8; 32],
        pub success: bool,
    }

    /// Errors
    #[derive(Debug, PartialEq, Eq, Encode, Decode)]
    #[cfg_attr(feature = "std", derive(scale_info::TypeInfo))]
    pub enum Error {
        JobNotFound,
        InvalidJobStatus,
        Unauthorized,
        OnlyResolver,
        OnlyOwner,
        DeadlineExpired,
        InvalidProof,
        InvalidSecret,
        InsufficientStake,
        EscrowContractError,
        RelayerNotTrusted,
        ArithmeticOverflow,
    }

    #[ink(storage)]
    pub struct PolkadotResolver {
        /// Core storage
        jobs: Mapping<[u8; 32], ResolverJob>,
        active_resolvers: Mapping<AccountId, bool>,
        
        /// Cross-chain coordination
        escrow_contract: AccountId,  // Main Polkadot escrow contract
        trusted_relayers: Mapping<AccountId, bool>,
        ethereum_block_confirmations: u32,
        
        /// Configuration
        owner: AccountId,
        min_stake: Balance,
        job_timeout: u64,
        
        /// Metrics
        job_nonce: u64,
        total_jobs_completed: u64,
    }

    impl PolkadotResolver {
        #[ink(constructor)]
        pub fn new(
            escrow_contract: AccountId,
            min_stake: Balance,
            job_timeout: u64,
            ethereum_block_confirmations: u32,
        ) -> Self {
            Self {
                jobs: Mapping::default(),
                active_resolvers: Mapping::default(),
                escrow_contract,
                trusted_relayers: Mapping::default(),
                ethereum_block_confirmations,
                owner: Self::env().caller(),
                min_stake,
                job_timeout,
                job_nonce: 0,
                total_jobs_completed: 0,
            }
        }

        /// Create a new resolver job
        #[ink(message, payable)]
        pub fn create_job(
            &mut self,
            polkadot_order_hash: [u8; 32],
            ethereum_order_hash: [u8; 32],
            direction: SwapDirection,
            hash_lock: [u8; 32],
            deadline: Timestamp,
        ) -> Result<[u8; 32], Error> {
            let caller = self.env().caller();
            let stake = self.env().transferred_value();
            let current_time = self.env().block_timestamp();

            // Validate stake
            if stake < self.min_stake {
                return Err(Error::InsufficientStake);
            }

            // Generate job ID
            let job_data = (
                polkadot_order_hash,
                ethereum_order_hash,
                &caller,
                current_time,
                self.job_nonce,
            );
            let encoded = scale::Encode::encode(&job_data);
            let job_id = self.env().hash_bytes::<ink::env::hash::Blake2x256>(&encoded);

            let job = ResolverJob {
                job_id,
                polkadot_order_hash,
                ethereum_order_hash,
                direction: direction.clone(),
                hash_lock,
                secret: None,
                resolver: caller,
                maker: caller, // Will be updated with actual maker
                status: JobStatus::Pending,
                ethereum_escrow_proof: None,
                created_at: current_time,
                deadline,
                stake_amount: stake,
            };

            self.jobs.insert(job_id, &job);
            self.job_nonce = self.job_nonce.checked_add(1).ok_or(Error::ArithmeticOverflow)?;

            self.env().emit_event(JobCreated {
                job_id,
                resolver: caller,
                direction,
                polkadot_order_hash,
                ethereum_order_hash,
            });

            Ok(job_id)
        }

        /// Submit Ethereum escrow deployment proof
        #[ink(message)]
        pub fn submit_ethereum_proof(
            &mut self,
            job_id: [u8; 32],
            proof: EthereumEscrowProof,
        ) -> Result<(), Error> {
            let caller = self.env().caller();
            
            // Only trusted relayers can submit proofs
            if !self.trusted_relayers.get(caller).unwrap_or(false) {
                return Err(Error::RelayerNotTrusted);
            }

            let mut job = self.jobs.get(job_id).ok_or(Error::JobNotFound)?;

            if job.status != JobStatus::Pending {
                return Err(Error::InvalidJobStatus);
            }

            // Verify the proof (simplified - real implementation would verify Merkle proof)
            if !self.verify_ethereum_escrow_proof(&proof)? {
                return Err(Error::InvalidProof);
            }

            // Update job
            job.ethereum_escrow_proof = Some(proof.clone());
            job.status = JobStatus::EthereumDeployed;
            self.jobs.insert(job_id, &job);

            self.env().emit_event(EthereumEscrowVerified {
                job_id,
                escrow_address: proof.escrow_address,
                block_number: proof.block_number,
            });

            Ok(())
        }

        /// Deploy Polkadot escrow (called by resolver)
        #[ink(message)]
        pub fn deploy_polkadot_escrow(
            &mut self,
            job_id: [u8; 32],
        ) -> Result<(), Error> {
            let caller = self.env().caller();
            let mut job = self.jobs.get(job_id).ok_or(Error::JobNotFound)?;

            if caller != job.resolver {
                return Err(Error::OnlyResolver);
            }

            if job.status != JobStatus::EthereumDeployed {
                return Err(Error::InvalidJobStatus);
            }

            // Call the main escrow contract to deploy escrow
            // This would be a cross-contract call in practice
            let deploy_result = self.call_escrow_deploy(
                job.polkadot_order_hash,
                job.resolver,
                job.hash_lock,
                job.ethereum_escrow_proof.clone().unwrap().escrow_address,
            )?;

            if deploy_result {
                job.status = JobStatus::PolkadotDeployed;
                self.jobs.insert(job_id, &job);
            }

            Ok(())
        }

        /// Execute cross-chain swap (reveal secret)
        #[ink(message)]
        pub fn execute_swap(
            &mut self,
            job_id: [u8; 32],
            secret: [u8; 32],
        ) -> Result<(), Error> {
            let caller = self.env().caller();
            let mut job = self.jobs.get(job_id).ok_or(Error::JobNotFound)?;

            if caller != job.resolver {
                return Err(Error::OnlyResolver);
            }

            if job.status != JobStatus::PolkadotDeployed {
                return Err(Error::InvalidJobStatus);
            }

            // Verify secret matches hash lock
            let computed_hash = self.env().hash_bytes::<ink::env::hash::Blake2x256>(&secret);
            if computed_hash != job.hash_lock {
                return Err(Error::InvalidSecret);
            }

            // Call main escrow contract to execute swap
            let execute_result = self.call_escrow_execute(
                job.polkadot_order_hash,
                secret,
            )?;

            if execute_result {
                job.secret = Some(secret);
                job.status = JobStatus::Executing;
                self.jobs.insert(job_id, &job);

                self.env().emit_event(SwapExecuted {
                    job_id,
                    secret_revealed: secret,
                });
            }

            Ok(())
        }

        /// Mark job as completed (called by relayer after confirming both sides)
        #[ink(message)]
        pub fn complete_job(
            &mut self,
            job_id: [u8; 32],
            success: bool,
        ) -> Result<(), Error> {
            let caller = self.env().caller();
            
            if !self.trusted_relayers.get(caller).unwrap_or(false) {
                return Err(Error::RelayerNotTrusted);
            }

            let mut job = self.jobs.get(job_id).ok_or(Error::JobNotFound)?;

            if job.status != JobStatus::Executing {
                return Err(Error::InvalidJobStatus);
            }

            if success {
                job.status = JobStatus::Completed;
                self.total_jobs_completed = self.total_jobs_completed.checked_add(1).ok_or(Error::ArithmeticOverflow)?;
                
                // Return stake to resolver
                self.env().transfer(job.resolver, job.stake_amount)
                    .map_err(|_| Error::EscrowContractError)?;
            } else {
                job.status = JobStatus::Failed;
                // Stake is slashed (kept by contract)
            }

            self.jobs.insert(job_id, &job);

            self.env().emit_event(JobCompleted {
                job_id,
                success,
            });

            Ok(())
        }

        /// Cancel job (timeout or failure)
        #[ink(message)]
        pub fn cancel_job(&mut self, job_id: [u8; 32]) -> Result<(), Error> {
            let caller = self.env().caller();
            let current_time = self.env().block_timestamp();
            let mut job = self.jobs.get(job_id).ok_or(Error::JobNotFound)?;

            let can_cancel = caller == job.resolver || 
                           current_time > job.deadline ||
                           self.trusted_relayers.get(caller).unwrap_or(false);

            if !can_cancel {
                return Err(Error::Unauthorized);
            }

            // Refund stake if not resolver's fault
            if current_time > job.deadline || caller != job.resolver {
                self.env().transfer(job.resolver, job.stake_amount)
                    .map_err(|_| Error::EscrowContractError)?;
            }

            job.status = JobStatus::Cancelled;
            self.jobs.insert(job_id, &job);

            Ok(())
        }

        // --- View Functions ---

        #[ink(message)]
        pub fn get_job(&self, job_id: [u8; 32]) -> Option<ResolverJob> {
            self.jobs.get(job_id)
        }

        #[ink(message)]
        pub fn is_trusted_relayer(&self, relayer: AccountId) -> bool {
            self.trusted_relayers.get(relayer).unwrap_or(false)
        }

        // --- Admin Functions ---

        #[ink(message)]
        pub fn add_trusted_relayer(&mut self, relayer: AccountId) -> Result<(), Error> {
            if self.env().caller() != self.owner {
                return Err(Error::OnlyOwner);
            }
            self.trusted_relayers.insert(relayer, &true);
            Ok(())
        }

        #[ink(message)]
        pub fn approve_resolver(&mut self, resolver: AccountId) -> Result<(), Error> {
            if self.env().caller() != self.owner {
                return Err(Error::OnlyOwner);
            }
            self.active_resolvers.insert(resolver, &true);
            Ok(())
        }

        // --- Helper Functions ---

        fn verify_ethereum_escrow_proof(&self, proof: &EthereumEscrowProof) -> Result<bool, Error> {
            // Simplified verification - real implementation would:
            // 1. Verify Merkle proof against known Ethereum block hash
            // 2. Verify transaction inclusion in block
            // 3. Verify escrow contract deployment
            // 4. Check minimum confirmations
            
            // For now, just basic validation
            if proof.block_number == 0 || proof.escrow_address == [0u8; 20] {
                return Ok(false);
            }
            
            Ok(true)
        }

        fn call_escrow_deploy(
            &self,
            order_hash: [u8; 32],
            resolver: AccountId,
            hash_lock: [u8; 32],
            ethereum_escrow: [u8; 20],
        ) -> Result<bool, Error> {
            // This would be a cross-contract call to the main escrow contract
            // For now, return success
            Ok(true)
        }

        fn call_escrow_execute(
            &self,
            order_hash: [u8; 32],
            secret: [u8; 32],
        ) -> Result<bool, Error> {
            // This would be a cross-contract call to execute the swap
            // For now, return success
            Ok(true)
        }
    }
}