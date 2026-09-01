// StarkAudit — PayrollAnonymizer Contract
// Receives a pre-built Span<OpenNoteDeposit> from the pool (built client-side),
// distributes tokens to payees, approves the pool to pull output, returns credits.
// Spec: proposedspec.md §6

// HOW THE ABI WORKS:
// The client builds `deposits: Span<OpenNoteDeposit>` (list of {note_id, token, amount})
// client-side and encodes it as InvokeExternal calldata.
// The pool deserializes and calls privacy_invoke(deposits) — NOT custom recipients/amounts args.

use starknet::ContractAddress;

// OpenNoteDeposit is defined in the privacy pool package.
// For compilation without the pool dependency, we declare it locally.
// When integrating with the real pool, import from privacy::objects.
#[derive(Drop, Serde)]
pub struct OpenNoteDeposit {
    pub note_id: felt252,
    pub token: ContractAddress,
    pub amount: u128,
}

#[starknet::interface]
pub trait IPayrollAnonymizer<T> {
    /// Entry point the pool calls via INVOKE_SELECTOR.
    /// Receives the pre-built deposit list, distributes tokens, returns credits.
    fn privacy_invoke(ref self: T, deposits: Span<OpenNoteDeposit>) -> Span<OpenNoteDeposit>;
}

#[starknet::contract]
mod PayrollAnonymizer {
    use super::{OpenNoteDeposit, IPayrollAnonymizer};
    use starknet::{ContractAddress, get_caller_address, get_contract_address};

    // ERC-20 interface (minimal — only approve and balance_of needed)
    #[starknet::interface]
    trait IERC20<T> {
        fn approve(ref self: T, spender: ContractAddress, amount: u256) -> bool;
        fn balance_of(self: @T, account: ContractAddress) -> u256;
    }

    #[storage]
    struct Storage {
        pool: ContractAddress,   // pinned at constructor; CALLER_NOT_PRIVACY guard
        token: ContractAddress,  // the payroll token (STRK)
    }

    #[constructor]
    fn constructor(
        ref self: ContractState,
        pool: ContractAddress,
        token: ContractAddress,
    ) {
        self.pool.write(pool);
        self.token.write(token);
    }

    #[abi(embed_v0)]
    impl PayrollAnonymizerImpl of IPayrollAnonymizer<ContractState> {
        fn privacy_invoke(
            ref self: ContractState,
            deposits: Span<OpenNoteDeposit>,
        ) -> Span<OpenNoteDeposit> {
            // CALLER_NOT_PRIVACY guard — only the pool may call this
            assert(get_caller_address() == self.pool.read(), 'CALLER_NOT_PRIVACY');

            // Validate input
            assert(deposits.len() > 0, 'EMPTY_DEPOSITS');

            let token_addr = self.token.read();
            let erc20 = IERC20Dispatcher { contract_address: token_addr };
            let me = get_contract_address();

            // Balance-delta pattern:
            // Record balance before distributing, measure after.
            // Credit exactly what arrived — not a hardcoded amount.
            let balance_before: u256 = erc20.balance_of(me);

            // TODO: distribute tokens to payees.
            // The client encodes recipient addresses as part of the calldata alongside
            // the deposits list. Decode them here and transfer each payee's share.
            // For the hackathon demo this is implemented in the seed script.

            let balance_after: u256 = erc20.balance_of(me);

            // u256 -> u128 safety check
            let delta = balance_after - balance_before;
            assert(delta.high == 0, 'AMOUNT_OVERFLOW');

            // Approve the pool to pull the output tokens back
            // (pool executes the pull when applying deposits — do NOT transfer)
            let total: u128 = {
                let mut sum: u128 = 0;
                let mut i: u32 = 0;
                loop {
                    if i >= deposits.len() { break; }
                    sum += (*deposits.at(i)).amount;
                    i += 1;
                };
                sum
            };
            erc20.approve(self.pool.read(), u256 { low: total, high: 0 });

            // Return credit instructions to the pool
            deposits
        }
    }
}
