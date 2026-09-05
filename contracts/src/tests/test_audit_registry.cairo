use starknet::ContractAddress;
use snforge_std::{declare, ContractClassTrait, DeclareResultTrait, start_cheat_caller_address, stop_cheat_caller_address, spy_events, EventSpyAssertionsTrait, start_cheat_block_timestamp, stop_cheat_block_timestamp};
use shadowaudit::audit_registry::{IAuditRegistryDispatcher, IAuditRegistryDispatcherTrait};

fn AUDITOR() -> ContractAddress { 0x1234.try_into().unwrap() }
fn AUDITOR2() -> ContractAddress { 0x4321.try_into().unwrap() }
fn BUSINESS() -> ContractAddress { 0x5678.try_into().unwrap() }
fn BUSINESS2() -> ContractAddress { 0x8765.try_into().unwrap() }
fn ATTACKER() -> ContractAddress { 0x9abc.try_into().unwrap() }

fn deploy_registry() -> (ContractAddress, IAuditRegistryDispatcher) {
    let contract = declare("AuditRegistry").unwrap().contract_class();
    let (addr, _) = contract.deploy(@array![]).unwrap();
    (addr, IAuditRegistryDispatcher { contract_address: addr })
}

// Business names its auditor (self-serve), then that auditor acts for it.
fn setup_auditor(dispatcher: IAuditRegistryDispatcher, business: ContractAddress, auditor: ContractAddress) {
    start_cheat_caller_address(dispatcher.contract_address, business);
    dispatcher.set_auditor(auditor);
    stop_cheat_caller_address(dispatcher.contract_address);
}

#[test]
fn test_register_business_open() {
    let (_, dispatcher) = deploy_registry();
    // Anyone can self-register (open)
    start_cheat_caller_address(dispatcher.contract_address, BUSINESS());
    dispatcher.register_business();
    stop_cheat_caller_address(dispatcher.contract_address);
    assert(dispatcher.is_registered(BUSINESS()), 'business should be registered');
    start_cheat_caller_address(dispatcher.contract_address, AUDITOR());
    dispatcher.register_business();
    stop_cheat_caller_address(dispatcher.contract_address);
    assert(dispatcher.is_registered(AUDITOR()), 'auditor self-registered');
}

#[test]
fn test_set_auditor_self_serve() {
    let (_, dispatcher) = deploy_registry();
    start_cheat_caller_address(dispatcher.contract_address, BUSINESS());
    dispatcher.set_auditor(AUDITOR());
    stop_cheat_caller_address(dispatcher.contract_address);
    assert(dispatcher.get_auditor(BUSINESS()) == AUDITOR(), 'auditor set');
    // Attacker cannot overwrite another business's auditor — set_auditor only
    // writes caller’s own entry, so this sets ATTACKER's own, not BUSINESS's.
    start_cheat_caller_address(dispatcher.contract_address, ATTACKER());
    dispatcher.set_auditor(ATTACKER());
    stop_cheat_caller_address(dispatcher.contract_address);
    assert(dispatcher.get_auditor(BUSINESS()) == AUDITOR(), 'business auditor unchanged');
    assert(dispatcher.get_auditor(ATTACKER()) == ATTACKER(), 'attacker own set');
}

#[test]
fn test_threshold_versioning_per_business() {
    let (_, dispatcher) = deploy_registry();
    setup_auditor(dispatcher, BUSINESS(), AUDITOR());
    setup_auditor(dispatcher, BUSINESS2(), AUDITOR2());
    start_cheat_caller_address(dispatcher.contract_address, AUDITOR());
    assert(dispatcher.get_threshold_version(BUSINESS()) == 0, 'initial version 0');
    dispatcher.set_threshold_commitment(BUSINESS(), 0xabc);
    assert(dispatcher.get_threshold_commitment(BUSINESS()) == 0xabc, 'commitment set');
    assert(dispatcher.get_threshold_version(BUSINESS()) == 1, 'version 1');
    dispatcher.set_threshold_commitment(BUSINESS(), 0xdef);
    assert(dispatcher.get_threshold_version(BUSINESS()) == 2, 'version 2');
    stop_cheat_caller_address(dispatcher.contract_address);
    // Other business untouched — independent version namespace.
    assert(dispatcher.get_threshold_version(BUSINESS2()) == 0, 'b2 still 0');
    assert(dispatcher.get_threshold_commitment(BUSINESS2()) == 0, 'b2 no commitment');
}

#[test]
#[should_panic(expected: ('NOT_AUDITOR',))]
fn test_set_threshold_wrong_auditor_reverts() {
    let (_, dispatcher) = deploy_registry();
    setup_auditor(dispatcher, BUSINESS(), AUDITOR());
    // ATTACKER is not BUSINESS's auditor.
    start_cheat_caller_address(dispatcher.contract_address, ATTACKER());
    dispatcher.set_threshold_commitment(BUSINESS(), 0x123);
    stop_cheat_caller_address(dispatcher.contract_address);
}

#[test]
#[should_panic(expected: ('NOT_AUDITOR',))]
fn test_set_threshold_other_business_auditor_reverts() {
    let (_, dispatcher) = deploy_registry();
    setup_auditor(dispatcher, BUSINESS(), AUDITOR());
    setup_auditor(dispatcher, BUSINESS2(), AUDITOR2());
    // AUDITOR2 audits BUSINESS2, not BUSINESS.
    start_cheat_caller_address(dispatcher.contract_address, AUDITOR2());
    dispatcher.set_threshold_commitment(BUSINESS(), 0x123);
    stop_cheat_caller_address(dispatcher.contract_address);
}

#[test]
#[should_panic(expected: ('NO_AUDITOR',))]
fn test_set_threshold_no_auditor_reverts() {
    let (_, dispatcher) = deploy_registry();
    // BUSINESS never named an auditor.
    start_cheat_caller_address(dispatcher.contract_address, AUDITOR());
    dispatcher.set_threshold_commitment(BUSINESS(), 0x123);
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
    start_cheat_caller_address(dispatcher.contract_address, BUSINESS());
    dispatcher.submit_proof(nullifier, note_id, audit_commit, dup_commit, enc_amount, array![].span(), array![].span(), true);
    stop_cheat_caller_address(dispatcher.contract_address);
    // Check stored
    let res = dispatcher.get_result(nullifier);
    assert(res.business == BUSINESS(), 'business mismatch');
    assert(res.note_id == note_id, 'note_id mismatch');
    assert(res.audit_commitment == audit_commit, 'audit_commit mismatch');
    assert(res.dup_commit == dup_commit, 'dup_commit mismatch');
    assert(res.pass == true, 'pass true if not duplicate');
    assert(res.is_duplicate == false, 'not duplicate');
    assert(res.offchain_verified == true, 'offchain fallback');
    // Check event
    spy.assert_emitted(@array![(dispatcher.contract_address, shadowaudit::audit_registry::AuditRegistry::Event::ProofSubmitted(shadowaudit::audit_registry::ProofSubmitted { nullifier, business: BUSINESS(), pass: true, is_duplicate: false, unverified_binding: false, offchain_verified: true }))]);
}

#[test]
fn test_submit_proof_fail_claim_stored() {
    let (_, dispatcher) = deploy_registry();
    let mut spy = spy_events();
    let nullifier = 0x5;
    start_cheat_caller_address(dispatcher.contract_address, BUSINESS());
    dispatcher.submit_proof(nullifier, 0x50, 0x51, 0x52, 0x53, array![].span(), array![].span(), false);
    stop_cheat_caller_address(dispatcher.contract_address);
    let res = dispatcher.get_result(nullifier);
    assert(res.pass == false, 'fail claim stored');
    assert(res.is_duplicate == false, 'fresh dup commit');
    spy.assert_emitted(@array![(dispatcher.contract_address, shadowaudit::audit_registry::AuditRegistry::Event::ProofSubmitted(shadowaudit::audit_registry::ProofSubmitted { nullifier, business: BUSINESS(), pass: false, is_duplicate: false, unverified_binding: false, offchain_verified: true }))]);
}

#[test]
#[should_panic(expected: ('ALREADY_SUBMITTED',))]
fn test_anti_replay_same_nullifier_reverts() {
    let (_, dispatcher) = deploy_registry();
    let nullifier = 0x111;
    dispatcher.submit_proof(nullifier, 0x222, 0x333, 0x444, 0x555, array![].span(), array![].span(), true);
    // Second submit with same nullifier should revert
    dispatcher.submit_proof(nullifier, 0x999, 0x888, 0x777, 0x666, array![].span(), array![].span(), true);
}

#[test]
fn test_duplicate_window_per_business() {
    let (addr, dispatcher) = deploy_registry();
    setup_auditor(dispatcher, BUSINESS(), AUDITOR());
    setup_auditor(dispatcher, BUSINESS2(), AUDITOR2());
    // BUSINESS window 100s; BUSINESS2 keeps default 7d.
    start_cheat_caller_address(addr, AUDITOR());
    dispatcher.set_duplicate_window(BUSINESS(), 100);
    stop_cheat_caller_address(addr);
    assert(dispatcher.get_duplicate_window(BUSINESS()) == 100_u64, 'b window 100');
    assert(dispatcher.get_duplicate_window(BUSINESS2()) == 604800_u64, 'b2 default 7d');
    // First proof with dup_commit 0x999 from BUSINESS
    let dup = 0x999;
    start_cheat_caller_address(addr, BUSINESS());
    dispatcher.submit_proof(0x1, 0x10, 0x20, dup, 0x30, array![].span(), array![].span(), true);
    stop_cheat_caller_address(addr);
    let res1 = dispatcher.get_result(0x1);
    assert(res1.is_duplicate == false, 'first not duplicate');
    assert(res1.pass == true, 'first pass');
    // Second proof same dup_commit within window (timestamp 50) from same business
    start_cheat_block_timestamp(addr, 50);
    start_cheat_caller_address(addr, BUSINESS());
    dispatcher.submit_proof(0x2, 0x11, 0x21, dup, 0x31, array![].span(), array![].span(), true);
    stop_cheat_caller_address(addr);
    let res2 = dispatcher.get_result(0x2);
    assert(res2.is_duplicate == true, 'second should be duplicate');
    assert(res2.pass == false, 'duplicate pass false');
    stop_cheat_block_timestamp(addr);
    // Third outside window (timestamp 200) should not be duplicate
    start_cheat_block_timestamp(addr, 200);
    start_cheat_caller_address(addr, BUSINESS());
    dispatcher.submit_proof(0x3, 0x12, 0x22, dup, 0x32, array![].span(), array![].span(), true);
    stop_cheat_caller_address(addr);
    let res3 = dispatcher.get_result(0x3);
    assert(res3.is_duplicate == false, 'outside window not duplicate');
    stop_cheat_block_timestamp(addr);
}

#[test]
fn test_duplicate_scoped_per_business_no_cross_collision() {
    let (addr, dispatcher) = deploy_registry();
    // Same dup_commit from two different businesses must NOT collide.
    let dup = 0xabcd;
    start_cheat_caller_address(addr, BUSINESS());
    dispatcher.submit_proof(0x11, 0x10, 0x20, dup, 0x30, array![].span(), array![].span(), true);
    stop_cheat_caller_address(addr);
    start_cheat_caller_address(addr, BUSINESS2());
    dispatcher.submit_proof(0x12, 0x10, 0x20, dup, 0x30, array![].span(), array![].span(), true);
    stop_cheat_caller_address(addr);
    let res2 = dispatcher.get_result(0x12);
    assert(res2.is_duplicate == false, 'cross-business not duplicate');
    assert(res2.pass == true, 'cross-business pass');
}

#[test]
#[should_panic(expected: ('NOT_AUDITOR',))]
fn test_set_duplicate_window_not_auditor_reverts() {
    let (_, dispatcher) = deploy_registry();
    setup_auditor(dispatcher, BUSINESS(), AUDITOR());
    start_cheat_caller_address(dispatcher.contract_address, ATTACKER());
    dispatcher.set_duplicate_window(BUSINESS(), 100);
    stop_cheat_caller_address(dispatcher.contract_address);
}

#[test]
fn test_duplicate_window_default_and_set() {
    let (addr, dispatcher) = deploy_registry();
    setup_auditor(dispatcher, BUSINESS(), AUDITOR());
    // Default is 7 days (604800 seconds) until the business's auditor sets one.
    assert(dispatcher.get_duplicate_window(BUSINESS()) == 604800_u64, 'default window 7d');
    start_cheat_caller_address(addr, AUDITOR());
    dispatcher.set_duplicate_window(BUSINESS(), 100);
    stop_cheat_caller_address(addr);
    assert(dispatcher.get_duplicate_window(BUSINESS()) == 100_u64, 'window updated');
}

#[test]
#[should_panic(expected: ('NOT_AUDITOR',))]
fn test_flag_exception_not_auditor_reverts() {
    let (_, dispatcher) = deploy_registry();
    setup_auditor(dispatcher, BUSINESS(), AUDITOR());
    start_cheat_caller_address(dispatcher.contract_address, ATTACKER());
    dispatcher.flag_exception(BUSINESS(), 0x123);
    stop_cheat_caller_address(dispatcher.contract_address);
}

#[test]
#[should_panic(expected: ('NOT_AUDITOR',))]
fn test_flag_exception_other_auditor_reverts() {
    let (_, dispatcher) = deploy_registry();
    setup_auditor(dispatcher, BUSINESS(), AUDITOR());
    setup_auditor(dispatcher, BUSINESS2(), AUDITOR2());
    start_cheat_caller_address(dispatcher.contract_address, AUDITOR2());
    dispatcher.flag_exception(BUSINESS(), 0x123);
    stop_cheat_caller_address(dispatcher.contract_address);
}

#[test]
fn test_flag_exception_auditor_succeeds() {
    let (_, dispatcher) = deploy_registry();
    setup_auditor(dispatcher, BUSINESS(), AUDITOR());
    let mut spy = spy_events();
    start_cheat_caller_address(dispatcher.contract_address, AUDITOR());
    dispatcher.flag_exception(BUSINESS(), 0xabc);
    stop_cheat_caller_address(dispatcher.contract_address);
    spy.assert_emitted(@array![(dispatcher.contract_address, shadowaudit::audit_registry::AuditRegistry::Event::ExceptionFlagged(shadowaudit::audit_registry::ExceptionFlagged { business: BUSINESS(), nullifier: 0xabc }))]);
}

#[test]
fn test_distribution_key_set_and_get() {
    let (_, dispatcher) = deploy_registry();
    assert(!dispatcher.has_distribution_key(BUSINESS()), 'no key initially');
    // Business publishes its own key (open self-serve).
    start_cheat_caller_address(dispatcher.contract_address, BUSINESS());
    dispatcher.set_distribution_key(0x111, 0x222);
    stop_cheat_caller_address(dispatcher.contract_address);
    assert(dispatcher.has_distribution_key(BUSINESS()), 'key exists');
    let (low, high) = dispatcher.get_distribution_key(BUSINESS());
    assert(low == 0x111, 'low mismatch');
    assert(high == 0x222, 'high mismatch');
}

#[test]
#[should_panic(expected: ('NO_DIST_KEY',))]
fn test_distribution_key_missing_reverts() {
    let (_, dispatcher) = deploy_registry();
    dispatcher.get_distribution_key(BUSINESS());
}

#[test]
fn test_share_package_bound_to_per_business_version() {
    let (addr, dispatcher) = deploy_registry();
    setup_auditor(dispatcher, BUSINESS(), AUDITOR());
    // Business publishes key first.
    start_cheat_caller_address(addr, BUSINESS());
    dispatcher.set_distribution_key(0x111, 0x222);
    stop_cheat_caller_address(addr);
    // Business's auditor commits a threshold (version 1), then shares the sealed package.
    start_cheat_caller_address(addr, AUDITOR());
    dispatcher.set_threshold_commitment(BUSINESS(), 0xabc);
    dispatcher.share_threshold_package(BUSINESS(), 0x1, 0x2, 0x3, 0x4, 0x5, 0x6);
    stop_cheat_caller_address(addr);
    assert(dispatcher.has_threshold_package(BUSINESS(), 1), 'package v1 exists');
    assert(!dispatcher.has_threshold_package(BUSINESS(), 2), 'no package v2');
    assert(!dispatcher.has_threshold_package(BUSINESS2(), 1), 'no package for b2');
    let (eph_low, eph_high, nonce, c0, c1, c2) = dispatcher.get_threshold_package(BUSINESS(), 1);
    assert(eph_low == 0x1, 'eph_low mismatch');
    assert(eph_high == 0x2, 'eph_high mismatch');
    assert(nonce == 0x3, 'nonce mismatch');
    assert(c0 == 0x4, 'c0 mismatch');
    assert(c1 == 0x5, 'c1 mismatch');
    assert(c2 == 0x6, 'c2 mismatch');
}

#[test]
#[should_panic(expected: ('NOT_AUDITOR',))]
fn test_share_package_not_auditor_reverts() {
    let (_, dispatcher) = deploy_registry();
    setup_auditor(dispatcher, BUSINESS(), AUDITOR());
    start_cheat_caller_address(dispatcher.contract_address, ATTACKER());
    dispatcher.share_threshold_package(BUSINESS(), 0x1, 0x2, 0x3, 0x4, 0x5, 0x6);
    stop_cheat_caller_address(dispatcher.contract_address);
}

#[test]
#[should_panic(expected: ('NO_THRESHOLD',))]
fn test_share_package_without_threshold_reverts() {
    let (addr, dispatcher) = deploy_registry();
    setup_auditor(dispatcher, BUSINESS(), AUDITOR());
    // Business published a key but its auditor never committed a threshold.
    start_cheat_caller_address(addr, BUSINESS());
    dispatcher.set_distribution_key(0x111, 0x222);
    stop_cheat_caller_address(addr);
    start_cheat_caller_address(addr, AUDITOR());
    dispatcher.share_threshold_package(BUSINESS(), 0x1, 0x2, 0x3, 0x4, 0x5, 0x6);
    stop_cheat_caller_address(addr);
}

#[test]
#[should_panic(expected: ('NO_DIST_KEY',))]
fn test_share_package_without_dist_key_reverts() {
    let (addr, dispatcher) = deploy_registry();
    setup_auditor(dispatcher, BUSINESS(), AUDITOR());
    start_cheat_caller_address(addr, AUDITOR());
    dispatcher.set_threshold_commitment(BUSINESS(), 0xabc);
    // No set_distribution_key for BUSINESS — share must refuse.
    dispatcher.share_threshold_package(BUSINESS(), 0x1, 0x2, 0x3, 0x4, 0x5, 0x6);
    stop_cheat_caller_address(addr);
}

#[test]
#[should_panic(expected: ('NO_PACKAGE',))]
fn test_get_missing_package_reverts() {
    let (addr, dispatcher) = deploy_registry();
    setup_auditor(dispatcher, BUSINESS(), AUDITOR());
    start_cheat_caller_address(addr, AUDITOR());
    dispatcher.set_threshold_commitment(BUSINESS(), 0xabc);
    stop_cheat_caller_address(addr);
    dispatcher.get_threshold_package(BUSINESS(), 1);
}
