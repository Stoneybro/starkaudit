use starknet::ContractAddress;
use snforge_std::{
    declare, ContractClassTrait, DeclareResultTrait, start_cheat_caller_address,
    stop_cheat_caller_address,
};
use shadowaudit::payroll_anonymizer::{
    IPayrollAnonymizerDispatcher, IPayrollAnonymizerDispatcherTrait, OpenNoteDeposit,
};
use shadowaudit::mock_erc20::{IMockERC20Dispatcher, IMockERC20DispatcherTrait};

fn POOL() -> ContractAddress {
    0x504f4f4c.try_into().unwrap()
}
fn ATTACKER() -> ContractAddress {
    0x9abc.try_into().unwrap()
}
fn TOKEN_HOLDER() -> ContractAddress {
    0xbeef.try_into().unwrap()
}

fn deploy_payroll(token: ContractAddress) -> (ContractAddress, IPayrollAnonymizerDispatcher) {
    let class = declare("PayrollAnonymizer").unwrap().contract_class();
    let (addr, _) = class.deploy(@array![POOL().into(), token.into()]).unwrap();
    (addr, IPayrollAnonymizerDispatcher { contract_address: addr })
}

fn deploy_token() -> (ContractAddress, IMockERC20Dispatcher) {
    let class = declare("MockERC20").unwrap().contract_class();
    let (addr, _) = class.deploy(@array![]).unwrap();
    (addr, IMockERC20Dispatcher { contract_address: addr })
}

fn deposit(note_id: felt252, token: ContractAddress, amount: u128) -> OpenNoteDeposit {
    OpenNoteDeposit { note_id, token, amount }
}

#[test]
#[should_panic(expected: ('CALLER_NOT_PRIVACY',))]
fn test_privacy_invoke_not_pool_reverts() {
    let (token, _) = deploy_token();
    let (_, payroll) = deploy_payroll(token);
    start_cheat_caller_address(payroll.contract_address, ATTACKER());
    payroll.privacy_invoke(array![deposit(0x1, token, 100)].span());
    stop_cheat_caller_address(payroll.contract_address);
}

#[test]
#[should_panic(expected: ('EMPTY_DEPOSITS',))]
fn test_privacy_invoke_empty_reverts() {
    let (token, _) = deploy_token();
    let (_, payroll) = deploy_payroll(token);
    start_cheat_caller_address(payroll.contract_address, POOL());
    payroll.privacy_invoke(array![].span());
    stop_cheat_caller_address(payroll.contract_address);
}

#[test]
fn test_privacy_invoke_splits_and_approves() {
    let (token, erc20) = deploy_token();
    let (payroll_addr, payroll) = deploy_payroll(token);
    // Pool funds the helper before invoke (mirrors on-chain withdraw leg)
    start_cheat_caller_address(token, TOKEN_HOLDER());
    erc20.mint(payroll_addr, 500);
    stop_cheat_caller_address(token);
    // 0.3 + 0.2 split across two open notes
    let deposits = array![
        deposit(0x101, token, 300), deposit(0x102, token, 200),
    ];
    start_cheat_caller_address(payroll_addr, POOL());
    let out = payroll.privacy_invoke(deposits.span());
    stop_cheat_caller_address(payroll_addr);
    assert(out.len() == 2, 'echo two deposits');
    assert((*out.at(0)).note_id == 0x101, 'first note id');
    assert((*out.at(1)).amount == 200, 'second amount');
    // Exact approve for the pool to pull back
    assert(erc20.allowance(payroll_addr, POOL()) == 500, 'approve exact total');
}

#[test]
#[should_panic(expected: ('TOKEN_MISMATCH',))]
fn test_privacy_invoke_wrong_token_reverts() {
    let (token, erc20) = deploy_token();
    let (payroll_addr, payroll) = deploy_payroll(token);
    let other: ContractAddress = 0x777.try_into().unwrap();
    start_cheat_caller_address(token, TOKEN_HOLDER());
    erc20.mint(payroll_addr, 100);
    stop_cheat_caller_address(token);
    start_cheat_caller_address(payroll_addr, POOL());
    payroll.privacy_invoke(array![deposit(0x1, other, 100)].span());
    stop_cheat_caller_address(payroll_addr);
}

#[test]
#[should_panic(expected: ('INSUFFICIENT_INPUT',))]
fn test_privacy_invoke_shortfall_reverts() {
    let (token, erc20) = deploy_token();
    let (payroll_addr, payroll) = deploy_payroll(token);
    start_cheat_caller_address(token, TOKEN_HOLDER());
    erc20.mint(payroll_addr, 400); // deposits claim 500
    stop_cheat_caller_address(token);
    start_cheat_caller_address(payroll_addr, POOL());
    payroll.privacy_invoke(array![deposit(0x1, token, 300), deposit(0x2, token, 200)].span());
    stop_cheat_caller_address(payroll_addr);
}

#[test]
fn test_privacy_invoke_donation_does_not_brick() {
    let (token, erc20) = deploy_token();
    let (payroll_addr, payroll) = deploy_payroll(token);
    start_cheat_caller_address(token, TOKEN_HOLDER());
    erc20.mint(payroll_addr, 600); // 500 payroll + 100 stray donation
    stop_cheat_caller_address(token);
    start_cheat_caller_address(payroll_addr, POOL());
    let out = payroll.privacy_invoke(array![deposit(0x1, token, 300), deposit(0x2, token, 200)].span());
    stop_cheat_caller_address(payroll_addr);
    assert(out.len() == 2, 'echo two deposits');
    // Only the exact total is approved — dust stays, nothing minted
    assert(erc20.allowance(payroll_addr, POOL()) == 500, 'approve exact total');
    assert(erc20.balance_of(payroll_addr) == 600, 'dust untouched');
}
