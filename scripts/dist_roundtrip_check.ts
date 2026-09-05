/**
 * Crypto roundtrip check (no chain): seal → felt packing → open → poseidon verify.
 * Run: node --import tsx/esm ./scripts/dist_roundtrip_check.ts
 */
import nacl from "tweetnacl"
import { hash } from "starknet"
import {
  joinPubkey, openThresholdPackage, sealThresholdPackage, splitPubkey,
} from "../packages/audit-sdk/src/distribution.js"
import { TAGS } from "../packages/audit-sdk/src/types.js"

const kp = nacl.box.keyPair()
const { low, high } = splitPubkey(kp.publicKey)
const businessPub = joinPubkey(low, high)
if (Buffer.from(businessPub).toString("hex") !== Buffer.from(kp.publicKey).toString("hex")) {
  throw new Error("pubkey split/join roundtrip failed")
}

const THRESHOLD = 1000000000000000000n
const SALT = 0xcafebabefn
const VERSION = 3n
const sealed = sealThresholdPackage(businessPub, THRESHOLD, SALT, VERSION)
const opened = openThresholdPackage(kp.secretKey, sealed)
if (opened.thresholdWei !== THRESHOLD || opened.saltFelt !== SALT || opened.version !== VERSION) {
  throw new Error(`open mismatch: ${JSON.stringify(opened, (_, v) => typeof v === "bigint" ? `0x${v.toString(16)}` : v)}`)
}

// Commitment the contract would hold must reproduce from opened values.
const commitment = BigInt(hash.computePoseidonHashOnElements([TAGS.THRESHOLD_TAG, opened.thresholdWei, opened.saltFelt]))
const expected = BigInt(hash.computePoseidonHashOnElements([TAGS.THRESHOLD_TAG, THRESHOLD, SALT]))
if (commitment !== expected) throw new Error("commitment mismatch")

// Wrong key must fail.
const wrong = nacl.box.keyPair()
let rejected = false
try {
  openThresholdPackage(wrong.secretKey, sealed)
} catch {
  rejected = true
}
if (!rejected) throw new Error("wrong-key open should have failed")

// Tampered felt must fail.
let tamperedRejected = false
try {
  openThresholdPackage(kp.secretKey, { ...sealed, c1: "0x1234" })
} catch {
  tamperedRejected = true
}
if (!tamperedRejected) throw new Error("tampered open should have failed")

console.log("dist roundtrip OK")
console.log(`  commitment 0x${commitment.toString(16)}`)
console.log(`  felts ephLow=${sealed.ephLow} nonce=${sealed.nonce} c0=${sealed.c0.slice(0, 18)}…`)
