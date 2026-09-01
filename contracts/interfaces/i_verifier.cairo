// Verifier interface — to be wired in submit_proof once a Stwo-compatible verifier is confirmed.
// [DECIDE] Day 1: pick verifier (Integrity/Herodotus) or fall back to offchain_verified path.

use starknet::ContractAddress;

#[starknet::interface]
pub trait IVerifier<T> {
    /// Verify a Stwo proof against public inputs.
    /// Returns true if the proof is valid, false otherwise.
    fn verify(self: @T, proof: Span<felt252>, public_inputs: Span<felt252>) -> bool;
}
