import { RpcProvider, Account, hash } from "starknet"

const RPC_URL = process.env.STARKNET_RPC_URL!
const ACCOUNT_ADDRESS = process.env.ACCOUNT_ADDRESS!
const ACCOUNT_PK = process.env.ACCOUNT_PRIVATE_KEY!
// Env-first so a redeploy is picked up automatically; old address kept as fallback.
const REGISTRY = process.env.AUDIT_REGISTRY_ADDRESS || "0x1ce7138415c267093450c95241c0a02e1e5cd1b4db52452149fa05f36d6ead6"
const BUSINESS = ACCOUNT_ADDRESS // for demo, business is same as auditor
const THRESHOLD = 1000000000000000000n // 1 STRK
const AUDITOR_SALT = 0xcafebabefn

async function main() {
  const provider = new RpcProvider({ nodeUrl: RPC_URL })
  const account = new Account({ provider, address: ACCOUNT_ADDRESS, signer: ACCOUNT_PK, cairoVersion: "1" })
  // Use poseidon for threshold commitment as in build_witness.ts: poseidon(THRESHOLD_TAG, threshold, auditor_salt)
  const THRESHOLD_TAG = BigInt("0x7374617263617564697433") // "starkaudit3"
  const threshold_commitment = BigInt(hash.computePoseidonHashOnElements([THRESHOLD_TAG, THRESHOLD, AUDITOR_SALT]))

  console.log(`Registry ${REGISTRY} auditor ${ACCOUNT_ADDRESS} business ${BUSINESS} threshold_commitment 0x${threshold_commitment.toString(16)}`)

  console.log("Registering business (open self-register)...")
  const tx1: any = await account.execute({ contractAddress: REGISTRY, entrypoint: "register_business", calldata: [] }, { tip: 0n })
  console.log(`register_business tx ${tx1.transaction_hash} https://sepolia.voyager.online/tx/${tx1.transaction_hash}`)
  await provider.waitForTransaction(tx1.transaction_hash)
  console.log("Registered, now setting auditor to self (demo: business picks any auditor)...")
  const tx1b: any = await account.execute({ contractAddress: REGISTRY, entrypoint: "set_auditor", calldata: [ACCOUNT_ADDRESS] }, { tip: 0n })
  console.log(`set_auditor tx ${tx1b.transaction_hash} https://sepolia.voyager.online/tx/${tx1b.transaction_hash}`)
  await provider.waitForTransaction(tx1b.transaction_hash)
  console.log("Auditor set")

  console.log("Setting threshold commitment (per-business: caller must be that business's auditor)...")
  const tx2: any = await account.execute({ contractAddress: REGISTRY, entrypoint: "set_threshold_commitment", calldata: [BUSINESS, threshold_commitment] }, { tip: 0n })
  console.log(`set_threshold tx ${tx2.transaction_hash} https://sepolia.voyager.online/tx/${tx2.transaction_hash}`)
  await provider.waitForTransaction(tx2.transaction_hash)
  console.log("Threshold set")

  const versionRes: any = await provider.callContract({ contractAddress: REGISTRY, entrypoint: "get_threshold_version", calldata: [BUSINESS] })
  console.log(`Version ${versionRes[0] ?? versionRes}`)
  const isRegRes: any = await provider.callContract({ contractAddress: REGISTRY, entrypoint: "is_registered", calldata: [BUSINESS] })
  console.log(`is_registered ${isRegRes[0] ?? isRegRes}`)
}

main().catch(e => { console.error(e); process.exit(1) })
