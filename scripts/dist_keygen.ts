/**
 * Generate the business X25519 distribution keypair and publish the pubkey.
 * The secret is printed once — store it as BUSINESS_DIST_SECRET in .env
 * (never committed). The auditor seals threshold packages to the pubkey,
 * so (threshold, salt) are never sent manually again.
 *
 * Run: node --import tsx/esm --env-file=.env ./scripts/dist_keygen.ts
 */
import nacl from "tweetnacl"
import { RpcProvider, Account } from "starknet"
import { splitPubkey } from "../packages/audit-sdk/src/distribution.js"

const RPC_URL = process.env.STARKNET_RPC_URL!
const ACCOUNT_ADDRESS = process.env.ACCOUNT_ADDRESS!
const ACCOUNT_PK = process.env.ACCOUNT_PRIVATE_KEY!
const REGISTRY = process.env.AUDIT_REGISTRY_ADDRESS || "0x1ce7138415c267093450c95241c0a02e1e5cd1b4db52452149fa05f36d6ead6"

async function main() {
  const kp = nacl.box.keyPair()
  const { low, high } = splitPubkey(kp.publicKey)
  console.log(`Distribution pubkey low=${low} high=${high}`)

  const provider = new RpcProvider({ nodeUrl: RPC_URL })
  const account = new Account({ provider, address: ACCOUNT_ADDRESS, signer: ACCOUNT_PK, cairoVersion: "1" })
  const tx: any = await account.execute(
    { contractAddress: REGISTRY, entrypoint: "set_distribution_key", calldata: [low, high] },
    { tip: 0n },
  )
  console.log(`set_distribution_key tx ${tx.transaction_hash}`)
  await provider.waitForTransaction(tx.transaction_hash)
  console.log("Published. Add this to .env (KEEP SECRET, never commit):")
  console.log(`BUSINESS_DIST_SECRET=0x${Buffer.from(kp.secretKey).toString("hex")}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
