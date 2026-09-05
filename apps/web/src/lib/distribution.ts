/**
 * Browser mirror of packages/audit-sdk/src/distribution.ts (seal side).
 * The dashboard cannot import the SDK package, so the pure seal/packing
 * helpers are duplicated here — keep the byte layout identical:
 * plaintext threshold_u256_be32 || salt_felt_be32 || version_u64_be8 (72B),
 * nacl box → 88B ciphertext → 3 felts (31/31/26B BE), 24B nonce → 1 felt,
 * 32B ephemeral pubkey → low/high u128 felts.
 */
import nacl from "tweetnacl"

export type SealedPackageFelts = {
  ephLow: string
  ephHigh: string
  nonce: string
  c0: string
  c1: string
  c2: string
}

function hexOf(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")
}

export function bytesToFeltHex(bytes: Uint8Array): string {
  if (bytes.length > 31) throw new Error("too many bytes for one felt")
  return `0x${BigInt(`0x${hexOf(bytes) || "0"}`).toString(16)}`
}

export function splitPubkey(pubkey32: Uint8Array): { low: string; high: string } {
  if (pubkey32.length !== 32) throw new Error("pubkey must be 32 bytes")
  return {
    low: bytesToFeltHex(pubkey32.slice(0, 16)),
    high: bytesToFeltHex(pubkey32.slice(16, 32)),
  }
}

function bigToBe(v: bigint, length: number): Uint8Array {
  if (v < 0n) throw new Error("negative bigint")
  const h = v.toString(16).padStart(length * 2, "0")
  if (h.length > length * 2) throw new Error("bigint overflows byte length")
  const out = new Uint8Array(length)
  for (let i = 0; i < length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16)
  return out
}

/** Felt hex (0x…) → low/high u128 felt hex pair for a 32-byte pubkey. */
export function joinPubkey(lowHex: string, highHex: string): Uint8Array {
  const toBytes = (feltHex: string, length: number): Uint8Array => {
    const h = BigInt(feltHex).toString(16).padStart(length * 2, "0")
    if (h.length > length * 2) throw new Error("felt overflows byte length")
    const out = new Uint8Array(length)
    for (let i = 0; i < length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16)
    return out
  }
  const out = new Uint8Array(32)
  out.set(toBytes(lowHex, 16), 0)
  out.set(toBytes(highHex, 16), 16)
  return out
}

/** Seal (thresholdWei, saltFelt, version) to a business distribution pubkey. */
export function sealThresholdPackage(
  businessPub32: Uint8Array,
  thresholdWei: bigint,
  saltFelt: bigint,
  version: bigint,
): SealedPackageFelts {
  if (businessPub32.length !== 32) throw new Error("business pubkey must be 32 bytes")
  const plain = new Uint8Array(72)
  plain.set(bigToBe(thresholdWei, 32), 0)
  plain.set(bigToBe(saltFelt, 32), 32)
  plain.set(bigToBe(version, 8), 64)
  const eph = nacl.box.keyPair()
  const nonce = nacl.randomBytes(24)
  const ct = nacl.box(plain, nonce, businessPub32, eph.secretKey)
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

/** Random felt hex (felt-sized) for auditor salts. */
export function randomFeltHex(): string {
  const b = nacl.randomBytes(31)
  return `0x${hexOf(b)}`
}

/** Parse "1.5" STRK → wei, or null. */
export function parseStrkToWei(input: string): bigint | null {
  const v = input.trim()
  if (!/^\d+(\.\d{1,18})?$/.test(v)) return null
  const [whole, frac = ""] = v.split(".")
  return BigInt(whole) * 10n ** 18n + BigInt((frac + "0".repeat(18)).slice(0, 18) || "0")
}
