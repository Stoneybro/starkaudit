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
#[derive(Drop, Copy, Serde)]
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
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};

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
        /// Split the pool's input across the client-provided open notes.
        /// The client builds `deposits` (one entry per payee open note) and the
        /// pool funds this contract via `withdraw` before calling us, so we
        /// require sum(deposits.amounts) <= our balance: we can never credit
        /// more than we hold (no minting), while stray donations can't brick
        /// a run — only the exact total is approved and pulled. Amounts are
        /// public (open-note salt=1 by design); funder and payee identities
        /// stay hidden behind the pool.
        fn privacy_invoke(
            ref self: ContractState,
            deposits: Span<OpenNoteDeposit>,
        ) -> Span<OpenNoteDeposit> {
            // CALLER_NOT_PRIVACY guard — only the pool may call this
            assert(get_caller_address() == self.pool.read(), 'CALLER_NOT_PRIVACY');

            // Validate input
            let n = deposits.len();
            assert(n > 0, 'EMPTY_DEPOSITS');
            assert(n <= 128, 'TOO_MANY_PAYEES'); // demo bound — one tx must fit block gas

            let token_addr = self.token.read();
            let erc20 = IERC20Dispatcher { contract_address: token_addr };
            let me = get_contract_address();

            // Solvency: every deposit names our token and the total never
            // exceeds what the pool funded us with (u256 accumulator, no overflow).
            let mut total: u256 = 0.into();
            let mut i: u32 = 0;
            loop {
                if i >= n {
                    break;
                }
                let d = *deposits.at(i);
                assert(d.token == token_addr, 'TOKEN_MISMATCH');
                total += d.amount.into();
                i += 1;
            };
            assert(total <= erc20.balance_of(me), 'INSUFFICIENT_INPUT');

            // Approve the pool to pull the output tokens back
            // (pool executes the pull when applying deposits — do NOT transfer)
            erc20.approve(self.pool.read(), total);

            // Return credit instructions to the pool
            deposits
        }
    }
}
