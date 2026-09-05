/**
 * Sync the sealed threshold package for this business backend.
 * Reads the on-chain package for the current threshold version, decrypts it
 * with BUSINESS_DIST_SECRET, verifies poseidon(threshold, salt) against the
 * on-chain commitment, and writes threshold-package.json for witness building.
 * No threshold value is ever hardcoded or delivered manually.
 *
 * Run: node --import tsx/esm --env-file=.env ./scripts/sync_package.ts
 */
import { writeFileSync } from "node:fs"
import { RpcProvider, hash } from "starknet"
import { openThresholdPackage } from "../packages/audit-sdk/src/distribution.js"
import { TAGS } from "../packages/audit-sdk/src/types.js"

const RPC_URL = process.env.STARKNET_RPC_URL!
const ACCOUNT_ADDRESS = process.env.ACCOUNT_ADDRESS!
const REGISTRY = process.env.AUDIT_REGISTRY_ADDRESS || "0x1ce7138415c267093450c95241c0a02e1e5cd1b4db52452149fa05f36d6ead6"
const SECRET = process.env.BUSINESS_DIST_SECRET!
const OUT_PATH = new URL("../threshold-package.json", import.meta.url)

function hexBytes(hex: string): Uint8Array {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex
  const out = new Uint8Array(h.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16)
  return out
}

async function main() {
  const provider = new RpcProvider({ nodeUrl: RPC_URL })

  const versionRes: any = await provider.callContract({ contractAddress: REGISTRY, entrypoint: "get_threshold_version", calldata: [ACCOUNT_ADDRESS] })
  const version = BigInt(versionRes[0] ?? versionRes)
  if (version === 0n) throw new Error("No threshold committed on-chain yet — auditor must configure T1 first")
  console.log(`On-chain threshold version ${version} for ${ACCOUNT_ADDRESS}`)

  const tcRes: any = await provider.callContract({ contractAddress: REGISTRY, entrypoint: "get_threshold_commitment", calldata: [ACCOUNT_ADDRESS] })
  const onchainTc = BigInt(tcRes[0] ?? tcRes)

  let pkgRes: any
  try {
    pkgRes = await provider.callContract({
      contractAddress: REGISTRY, entrypoint: "get_threshold_package", calldata: [ACCOUNT_ADDRESS, `0x${version.toString(16)}`],
    })
  } catch {
    throw new Error(`No sealed package for ${ACCOUNT_ADDRESS} at version ${version} — auditor must share it from the Tests tab`)
  }
  const felts = pkgRes as string[]
  const opened = openThresholdPackage(hexBytes(SECRET), {
    ephLow: felts[0], ephHigh: felts[1], nonce: felts[2], c0: felts[3], c1: felts[4], c2: felts[5],
  })
  if (opened.version !== version) {
    throw new Error(`Package version ${opened.version} != on-chain version ${version} — refusing stale package`)
  }
  const recomputed = BigInt(hash.computePoseidonHashOnElements([TAGS.THRESHOLD_TAG, opened.thresholdWei, opened.saltFelt]))
  if (recomputed !== onchainTc) {
    throw new Error("Decrypted package does not reproduce the on-chain commitment — refusing tampered package")
  }

  const pkg = {
    business: ACCOUNT_ADDRESS,
    version: version.toString(),
    threshold_wei: `0x${opened.thresholdWei.toString(16)}`,
    salt: `0x${opened.saltFelt.toString(16)}`,
    commitment: `0x${onchainTc.toString(16)}`,
  }
  writeFileSync(OUT_PATH, `${JSON.stringify(pkg, null, 2)}\n`)
  console.log(`Verified + wrote threshold-package.json (version ${version}, commitment 0x${onchainTc.toString(16).slice(0, 12)}…)`)
}

main().catch((e) => { console.error(e); process.exit(1) })
