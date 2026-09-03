use starknet::ContractAddress;
use snforge_std::{declare, ContractClassTrait, DeclareResultTrait, start_cheat_caller_address, stop_cheat_caller_address, spy_events, EventSpyAssertionsTrait, start_cheat_block_timestamp, stop_cheat_block_timestamp};
use shadowaudit::audit_registry::{IAuditRegistryDispatcher, IAuditRegistryDispatcherTrait};

fn AUDITOR() -> ContractAddress { 0x1234.try_into().unwrap() }
fn BUSINESS() -> ContractAddress { 0x5678.try_into().unwrap() }
fn ATTACKER() -> ContractAddress { 0x9abc.try_into().unwrap() }

fn deploy_registry() -> (ContractAddress, IAuditRegistryDispatcher) {
    let contract = declare("AuditRegistry").unwrap().contract_class();
    let (addr, _) = contract.deploy(@array![AUDITOR().into()]).unwrap();
    (addr, IAuditRegistryDispatcher { contract_address: addr })
}

#[test]
fn test_access_control_register_business() {
    let (_, dispatcher) = deploy_registry();
    // Anyone can self-register (open)
    start_cheat_caller_address(dispatcher.contract_address, BUSINESS());
    dispatcher.register_business();
    stop_cheat_caller_address(dispatcher.contract_address);
    assert(dispatcher.is_registered(BUSINESS()), 'business should be registered');
    // Auditor can also self-register via same open path
    start_cheat_caller_address(dispatcher.contract_address, AUDITOR());
    dispatcher.register_business();
    stop_cheat_caller_address(dispatcher.contract_address);
    assert(dispatcher.is_registered(AUDITOR()), 'auditor self-registered');
    // Auditor helper can register for another address
    start_cheat_caller_address(dispatcher.contract_address, AUDITOR());
    dispatcher.register_business_for(ATTACKER());
    stop_cheat_caller_address(dispatcher.contract_address);
    assert(dispatcher.is_registered(ATTACKER()), 'attacker registered via auditor helper');
}

#[test]
#[should_panic(expected: ('NOT_AUDITOR',))]
fn test_register_business_for_not_auditor_reverts() {
    let (_, dispatcher) = deploy_registry();
    start_cheat_caller_address(dispatcher.contract_address, ATTACKER());
    dispatcher.register_business_for(BUSINESS());
    stop_cheat_caller_address(dispatcher.contract_address);
}

#[test]
fn test_threshold_versioning() {
    let (_, dispatcher) = deploy_registry();
    start_cheat_caller_address(dispatcher.contract_address, AUDITOR());
    assert(dispatcher.get_threshold_version() == 0, 'initial version 0');
    dispatcher.set_threshold_commitment(0xabc);
    assert(dispatcher.get_threshold_commitment() == 0xabc, 'commitment set');
    assert(dispatcher.get_threshold_version() == 1, 'version 1');
    dispatcher.set_threshold_commitment(0xdef);
    assert(dispatcher.get_threshold_version() == 2, 'version 2');
    stop_cheat_caller_address(dispatcher.contract_address);
}

#[test]
#[should_panic(expected: ('NOT_AUDITOR',))]
fn test_set_threshold_not_auditor_reverts() {
    let (_, dispatcher) = deploy_registry();
    start_cheat_caller_address(dispatcher.contract_address, ATTACKER());
    dispatcher.set_threshold_commitment(0x123);
    stop_cheat_caller_address(dispatcher.contract_address);
}

#[test]
fn test_submit_proof_store_and_emit() {
    let (_, dispatcher) = deploy_registry();
    let mut spy = spy_events();
    let nullifier = 0x111;
    let note_id = 0x222;
    let audit_commit = 0x333;
    let dup_commit = 0x444;
    let enc_amount = 0x555;
    dispatcher.submit_proof(nullifier, note_id, audit_commit, dup_commit, enc_amount, array![].span(), array![].span());
    // Check stored
    let res = dispatcher.get_result(nullifier);
    assert(res.note_id == note_id, 'note_id mismatch');
    assert(res.audit_commitment == audit_commit, 'audit_commit mismatch');
    assert(res.dup_commit == dup_commit, 'dup_commit mismatch');
    assert(res.pass == true, 'pass should be true when not duplicate');
    assert(res.is_duplicate == false, 'not duplicate');
    assert(res.offchain_verified == true, 'offchain fallback');
    // Check event
    spy.assert_emitted(@array![(dispatcher.contract_address, shadowaudit::audit_registry::AuditRegistry::Event::ProofSubmitted(shadowaudit::audit_registry::ProofSubmitted { nullifier, pass: true, is_duplicate: false, unverified_binding: false, offchain_verified: true }))]);
}

#[test]
#[should_panic(expected: ('ALREADY_SUBMITTED',))]
fn test_anti_replay_same_nullifier_reverts() {
    let (_, dispatcher) = deploy_registry();
    let nullifier = 0x111;
    dispatcher.submit_proof(nullifier, 0x222, 0x333, 0x444, 0x555, array![].span(), array![].span());
    // Second submit with same nullifier should revert
    dispatcher.submit_proof(nullifier, 0x999, 0x888, 0x777, 0x666, array![].span(), array![].span());
}

#[test]
fn test_duplicate_window_is_duplicate_true() {
    let (addr, dispatcher) = deploy_registry();
    // Set window to 100 seconds for test
    start_cheat_caller_address(addr, AUDITOR());
    dispatcher.set_duplicate_window(100);
    stop_cheat_caller_address(addr);
    // First proof with dup_commit 0x999
    let dup = 0x999;
    dispatcher.submit_proof(0x1, 0x10, 0x20, dup, 0x30, array![].span(), array![].span());
    let res1 = dispatcher.get_result(0x1);
    assert(res1.is_duplicate == false, 'first not duplicate');
    assert(res1.pass == true, 'first pass');
    // Second proof same dup_commit within window (timestamp 50)
    start_cheat_block_timestamp(addr, 50);
    dispatcher.submit_proof(0x2, 0x11, 0x21, dup, 0x31, array![].span(), array![].span());
    let res2 = dispatcher.get_result(0x2);
    assert(res2.is_duplicate == true, 'second should be duplicate');
    assert(res2.pass == false, 'duplicate pass false');
    stop_cheat_block_timestamp(addr);
    // Third outside window (timestamp 200) should not be duplicate
    start_cheat_block_timestamp(addr, 200);
    dispatcher.submit_proof(0x3, 0x12, 0x22, dup, 0x32, array![].span(), array![].span());
    let res3 = dispatcher.get_result(0x3);
    assert(res3.is_duplicate == false, 'outside window not duplicate');
    stop_cheat_block_timestamp(addr);
}

#[test]
#[should_panic(expected: ('NOT_AUDITOR',))]
fn test_flag_exception_not_auditor_reverts() {
    let (_, dispatcher) = deploy_registry();
    start_cheat_caller_address(dispatcher.contract_address, ATTACKER());
    dispatcher.flag_exception(0x123);
    stop_cheat_caller_address(dispatcher.contract_address);
}

#[test]
fn test_flag_exception_auditor_succeeds() {
    let (_, dispatcher) = deploy_registry();
    let mut spy = spy_events();
    start_cheat_caller_address(dispatcher.contract_address, AUDITOR());
    dispatcher.flag_exception(0xabc);
    stop_cheat_caller_address(dispatcher.contract_address);
    spy.assert_emitted(@array![(dispatcher.contract_address, shadowaudit::audit_registry::AuditRegistry::Event::ExceptionFlagged(shadowaudit::audit_registry::ExceptionFlagged { nullifier: 0xabc }))]);
}
