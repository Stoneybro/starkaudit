/**
 * scripts/derive_viewing_key.ts
 *
 * Generates a STRK20 viewing key for the account in .env.
 *
 * The viewing key is a random BigInt in [1, MAX_VIEWING_KEY] (half the STARK curve order).
 * It is NOT derived from your private key — it is a separate random key that you
 * register on-chain once. Keep it secret: it decrypts all your private notes.
 *
 * Run:  npx tsx scripts/derive_viewing_key.ts
 *
 * Output: a decimal BigInt string — paste it into .env as VIEWING_KEY=<value>
 */

import { ec, encode } from "starknet"

// STARK curve order n (from starknet.js)
const CURVE_ORDER = 0x0800000000000010ffffffffffffffffb781126dcae7b2321e66a241adc64d2fn

// MAX_VIEWING_KEY = floor(CURVE_ORDER / 2) — required range per SDK
const MAX_VIEWING_KEY = CURVE_ORDER >> 1n

/**
 * Generate a cryptographically random viewing key.
 * This is the recommended approach unless you need deterministic derivation.
 */
function generateViewingKey(): bigint {
  // Generate 32 random bytes, convert to BigInt, clamp to valid range
  const randomBytes = new Uint8Array(32)
  crypto.getRandomValues(randomBytes)
  const hex = Array.from(randomBytes).map(b => b.toString(16).padStart(2, "0")).join("")
  const raw = BigInt("0x" + hex)
  // Clamp: ensure 1 <= key <= MAX_VIEWING_KEY
  const key = (raw % (MAX_VIEWING_KEY - 1n)) + 1n
  return key
}

const viewingKey = generateViewingKey()

console.log("\n✅ Viewing key generated successfully.\n")
console.log("─".repeat(60))
console.log(`VIEWING_KEY=${viewingKey}`)
console.log("─".repeat(60))
console.log("\n⚠️  This is a SECRET. Treat it like a private key.")
console.log("   - Add the line above to your .env file")
console.log("   - NEVER commit it to git (already covered by .gitignore)")
console.log("   - NEVER share it — it decrypts all your private pool notes")
console.log("\n📋 You only generate this once. The same key is used for:")
console.log("   - Registering on the STRK20 pool (Stage 1)")
console.log("   - Decrypting notes you receive (Stage 3+)")
console.log("   - Building audit witnesses (Stage 5)")
console.log("")
