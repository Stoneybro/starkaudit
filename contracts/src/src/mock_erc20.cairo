// StarkAudit — MockERC20 (TEST-ONLY, never deployed on-chain).
// Minimal ERC-20 surface the PayrollAnonymizer needs (balance_of/approve)
// plus open mint/transfer so snforge tests can fund the helper.
// Excluded from production deploys by convention — deploy scripts never reference it.

use starknet::ContractAddress;

#[starknet::interface]
pub trait IMockERC20<T> {
    fn balance_of(self: @T, account: ContractAddress) -> u256;
    fn allowance(self: @T, owner: ContractAddress, spender: ContractAddress) -> u256;
    fn approve(ref self: T, spender: ContractAddress, amount: u256) -> bool;
    fn transfer(ref self: T, recipient: ContractAddress, amount: u256) -> bool;
    fn mint(ref self: T, recipient: ContractAddress, amount: u256);
}

#[starknet::contract]
pub mod MockERC20 {
    use super::IMockERC20;
    use starknet::{ContractAddress, get_caller_address};
    use starknet::storage::{Map, StoragePointerReadAccess, StoragePointerWriteAccess, StoragePathEntry};

    #[storage]
    struct Storage {
        balances: Map<ContractAddress, u256>,
        allowances: Map<(ContractAddress, ContractAddress), u256>,
    }

    #[constructor]
    fn constructor(ref self: ContractState) {}

    #[abi(embed_v0)]
    impl MockERC20Impl of IMockERC20<ContractState> {
        fn balance_of(self: @ContractState, account: ContractAddress) -> u256 {
            self.balances.entry(account).read()
        }

        fn allowance(
            self: @ContractState, owner: ContractAddress, spender: ContractAddress,
        ) -> u256 {
            self.allowances.entry((owner, spender)).read()
        }

        fn approve(ref self: ContractState, spender: ContractAddress, amount: u256) -> bool {
            self.allowances.entry((get_caller_address(), spender)).write(amount);
            true
        }

        fn transfer(ref self: ContractState, recipient: ContractAddress, amount: u256) -> bool {
            let sender = get_caller_address();
            let bal = self.balances.entry(sender).read();
            assert(bal >= amount, 'INSUFFICIENT_BALANCE');
            self.balances.entry(sender).write(bal - amount);
            self.balances.entry(recipient).write(self.balances.entry(recipient).read() + amount);
            true
        }

        fn mint(ref self: ContractState, recipient: ContractAddress, amount: u256) {
            self.balances.entry(recipient).write(self.balances.entry(recipient).read() + amount);
        }
    }
}
