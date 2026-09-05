/**
 * Sealed threshold distribution — nacl box (X25519 + XSalsa20-Poly1305).
 *
 * The auditor seals (threshold, salt, version) to each business's on-chain
 * X25519 distribution pubkey. The contract stores only sealed felts bound to
 * the threshold version. The business backend decrypts with its secret (from
 * env, never committed) and verifies poseidon(package) against the on-chain
 * commitment + version before touching witness building.
 *
 * Plaintext layout (72 bytes):
 *   threshold_u256_be32 || salt_felt_be32 || version_u64_be8
 * Ciphertext is 88 bytes (16 box overhead) → 3 felts of 31/31/26 bytes
 * big-endian. The 24-byte nonce fits one felt. The 32-byte ephemeral pubkey
 * rides as low/high u128 felts, like the long-term distribution key.
 *
 * MUST stay in sync with apps/web/src/lib/distribution.ts (the dashboard
 * cannot import this package, so the pure helpers are duplicated there).
 */
import nacl from "tweetnacl"

export const DIST_FELT_BYTES = 31
export const DIST_NONCE_BYTES = 24
export const DIST_THRESHOLD_BYTES = 32
export const DIST_SALT_BYTES = 32
export const DIST_VERSION_BYTES = 8
export const DIST_PLAINTEXT_BYTES =
  DIST_THRESHOLD_BYTES + DIST_SALT_BYTES + DIST_VERSION_BYTES // 72
export const DIST_CIPHERTEXT_BYTES = DIST_PLAINTEXT_BYTES + nacl.box.overheadLength // 88

export type SealedPackageFelts = {
  ephLow: string
  ephHigh: string
  nonce: string
  c0: string
  c1: string
  c2: string
}

export type OpenedPackage = {
  thresholdWei: bigint
  saltFelt: bigint
  version: bigint
}

function hexOf(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")
}

function bytesOf(hex: string): Uint8Array {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex
  if (h.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(h)) throw new Error("bad hex bytes")
  const out = new Uint8Array(h.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16)
  return out
}

/** ≤31 bytes big-endian → felt hex. */
export function bytesToFeltHex(bytes: Uint8Array): string {
  if (bytes.length > DIST_FELT_BYTES) throw new Error("too many bytes for one felt")
  return `0x${BigInt(`0x${hexOf(bytes) || "0"}`).toString(16)}`
}

/** felt hex → exactly `length` bytes big-endian. */
export function feltHexToBytes(feltHex: string, length: number): Uint8Array {
  const v = BigInt(feltHex)
  const h = v.toString(16).padStart(length * 2, "0")
  if (h.length > length * 2) throw new Error("felt overflows byte length")
  return bytesOf(h)
}

/** 32-byte X25519 pubkey → low/high u128 felt hex. */
export function splitPubkey(pubkey32: Uint8Array): { low: string; high: string } {
  if (pubkey32.length !== 32) throw new Error("pubkey must be 32 bytes")
  return {
    low: bytesToFeltHex(pubkey32.slice(0, 16)),
    high: bytesToFeltHex(pubkey32.slice(16, 32)),
  }
}

/** low/high u128 felt hex → 32-byte X25519 pubkey. */
export function joinPubkey(lowHex: string, highHex: string): Uint8Array {
  const out = new Uint8Array(32)
  out.set(feltHexToBytes(lowHex, 16), 0)
  out.set(feltHexToBytes(highHex, 16), 16)
  return out
}

export function bigToBe(v: bigint, length: number): Uint8Array {
  if (v < 0n) throw new Error("negative bigint")
  const h = v.toString(16).padStart(length * 2, "0")
  if (h.length > length * 2) throw new Error("bigint overflows byte length")
  return bytesOf(h)
}

export function beToBig(bytes: Uint8Array): bigint {
  return BigInt(`0x${hexOf(bytes) || "0"}`)
}

/**
 * Seal (thresholdWei, saltFelt, version) to a business distribution pubkey.
 * Fresh ephemeral keypair + nonce per call (pass `rand` in tests for determinism).
 */
export function sealThresholdPackage(
  businessPub32: Uint8Array,
  thresholdWei: bigint,
  saltFelt: bigint,
  version: bigint,
  rand: (n: number) => Uint8Array = (n) => nacl.randomBytes(n),
): SealedPackageFelts {
  if (businessPub32.length !== 32) throw new Error("business pubkey must be 32 bytes")
  const plain = new Uint8Array(DIST_PLAINTEXT_BYTES)
  plain.set(bigToBe(thresholdWei, DIST_THRESHOLD_BYTES), 0)
  plain.set(bigToBe(saltFelt, DIST_SALT_BYTES), DIST_THRESHOLD_BYTES)
  plain.set(bigToBe(version, DIST_VERSION_BYTES), DIST_THRESHOLD_BYTES + DIST_SALT_BYTES)
  const eph = nacl.box.keyPair()
  const nonce = rand(DIST_NONCE_BYTES)
  const ct = nacl.box(plain, nonce, businessPub32, eph.secretKey)
  if (ct.length !== DIST_CIPHERTEXT_BYTES) throw new Error("unexpected box length")
  const { low: ephLow, high: ephHigh } = splitPubkey(eph.publicKey)
  return {
    ephLow,
    ephHigh,
    nonce: bytesToFeltHex(nonce),
    c0: bytesToFeltHex(ct.slice(0, 31)),
    c1: bytesToFeltHex(ct.slice(31, 62)),
    c2: bytesToFeltHex(ct.slice(62, 88)),
  }
}

/** Open a sealed package with the business distribution secret. Throws on tamper. */
export function openThresholdPackage(
  secret32: Uint8Array,
  felts: SealedPackageFelts,
): OpenedPackage {
  if (secret32.length !== 32) throw new Error("secret must be 32 bytes")
  const ephPub = joinPubkey(felts.ephLow, felts.ephHigh)
  const nonce = feltHexToBytes(felts.nonce, DIST_NONCE_BYTES)
  const ct = new Uint8Array(DIST_CIPHERTEXT_BYTES)
  ct.set(feltHexToBytes(felts.c0, 31), 0)
  ct.set(feltHexToBytes(felts.c1, 31), 31)
  ct.set(feltHexToBytes(felts.c2, 26), 62)
  const plain = nacl.box.open(ct, nonce, ephPub, secret32)
  if (!plain || plain.length !== DIST_PLAINTEXT_BYTES) throw new Error("package failed to open (wrong key or tampered)")
  return {
    thresholdWei: beToBig(plain.slice(0, 32)),
    saltFelt: beToBig(plain.slice(32, 64)),
    version: beToBig(plain.slice(64, 72)),
  }
}
