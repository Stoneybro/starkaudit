/**
 * Redeploy AuditRegistry + PayrollAnonymizer without re-paying declare fees for
 * classes already declared on-chain.
 *
 * - AuditRegistry: fresh source (adds distribution-key + threshold-package
 *   entrypoints) => must declare. The padded fee estimate is an upper bound;
 *   the real measured cost is ~467M L2 gas (~22 STRK at Sep 2026 prices). Set
 *   DECLARE_L2_MAX higher and retry if rejected — rejection costs nothing.
 *   REUSE_REGISTRY_CLASS=0x… deploys an already-declared older class instead
 *   (no declare fee; lacks the distribution entrypoints — pair it with a
 *   manually written threshold-package.json, see registry_setup.ts).
 * - PayrollAnonymizer: class already declared (verified via getClass) => deploy
 *   a new instance directly from the existing class hash.
 *
 * Run: node --import tsx/esm --env-file=.env ./scripts/redeploy.ts
 * Funded full redeploy: DECLARE_L2_MAX=500000000 ./scripts/redeploy.ts
 * Cheap reuse redeploy: REUSE_REGISTRY_CLASS=0x2aa91d96ca82f6186ac686e2427a146704f84ca75731980ecb4fe2c967baec4 ./scripts/redeploy.ts
 */
import { RpcProvider, Account, hash, constants } from "starknet"
import fs from "fs"

const RPC_URL = process.env.STARKNET_RPC_URL!
const ACCOUNT_ADDRESS = process.env.ACCOUNT_ADDRESS!
const ACCOUNT_PK = process.env.ACCOUNT_PRIVATE_KEY!
const POOL = process.env.POOL_ADDRESS || "0x0254a6b2997ef52e9f830ce1f543f6b29768295e8d17e2267d672c552cfe0d91"
const STRK = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d"
const REUSE_REGISTRY_CLASS = process.env.REUSE_REGISTRY_CLASS || ""

// Tight l2_gas ceiling for the declare (wei-per-unit fixed by the estimate).
const L2_PRICE = 46756209885n
const L2_MAX = BigInt(process.env.DECLARE_L2_MAX ?? "60000000") // 60M * price ~= 2.8 STRK
const L1_DATA_MAX = 300n
const L1_DATA_PRICE = 1151730722244n
const L1_PRICE = 273791058036135n

function sierra(name: string) {
  return JSON.parse(fs.readFileSync(`contracts/target/dev/shadowaudit_${name}.contract_class.json`, "utf8"))
}
function casm(name: string) {
  return JSON.parse(fs.readFileSync(`contracts/target/dev/shadowaudit_${name}.compiled_contract_class.json`, "utf8"))
}

async function main() {
  const provider = new RpcProvider({ nodeUrl: RPC_URL })
  const account = new Account({ provider, address: ACCOUNT_ADDRESS, signer: ACCOUNT_PK, cairoVersion: "1" })
  console.log(`Deployer ${ACCOUNT_ADDRESS} chain ${await provider.getChainId()}`)

  // ---- AuditRegistry: declare if needed (skipped in reuse mode) ----
  let regClassHex: string
  if (REUSE_REGISTRY_CLASS) {
    console.log(`REUSE mode: deploying existing declared class ${REUSE_REGISTRY_CLASS} (no declare fee)`)
    regClassHex = REUSE_REGISTRY_CLASS
  } else {
    const regSierra = sierra("AuditRegistry")
    const regClassHash = BigInt(hash.computeSierraContractClassHash(regSierra))
    regClassHex = `0x${regClassHash.toString(16)}`
    console.log(`AuditRegistry class ${regClassHex}`)
    let declared = true
    try {
      await provider.getClass(regClassHex)
    } catch {
      declared = false
    }
    if (!declared) {
    console.log(`Declaring AuditRegistry with l2_gas max_amount=${L2_MAX} (≈${Number(L2_MAX * L2_PRICE) / 1e18} STRK ceiling)...`)
    const declareTx: any = await account.declare(
      { contract: regSierra, casm: casm("AuditRegistry") },
      {
        tip: 0n,
        resourceBounds: {
          l1_gas: { max_amount: 0n, max_price_per_unit: L1_PRICE },
          l1_data_gas: { max_amount: L1_DATA_MAX, max_price_per_unit: L1_DATA_PRICE },
          l2_gas: { max_amount: L2_MAX, max_price_per_unit: L2_PRICE },
        },
      } as any,
    )
    console.log(`Declare tx ${declareTx.transaction_hash}`)
    const drcpt: any = await provider.waitForTransaction(declareTx.transaction_hash)
    console.log(`Declare ${drcpt.execution_status ?? drcpt.finality_status}`)
    if (String(drcpt.execution_status) === "REJECTED") {
      throw new Error(`Declare REJECTED — bounds too tight. Retry with DECLARE_L2_MAX higher than ${L2_MAX}`)
    }
    if (String(drcpt.execution_status) === "REVERTED") throw new Error(`Declare reverted: ${drcpt.revert_reason ?? ""}`)
    } else {
      console.log("AuditRegistry class already declared — skipping declare")
    }
  }

  // ---- Deploy AuditRegistry ----
  const regDeploy: any = await account.deployContract(
    { classHash: regClassHex, constructorCalldata: [ACCOUNT_ADDRESS] },
    { tip: 0n },
  )
  console.log(`Registry deploy tx ${regDeploy.transaction_hash}`)
  const rrcpt: any = await provider.waitForTransaction(regDeploy.transaction_hash)
  const regAddr = regDeploy.contract_address?.[0] ?? rrcpt.contract_address
  console.log(`AUDIT_REGISTRY_ADDRESS=${regAddr} (block ${rrcpt.block_number})`)

  // ---- PayrollAnonymizer: class already declared, deploy directly ----
  const payClassHash = BigInt(hash.computeSierraContractClassHash(sierra("PayrollAnonymizer")))
  console.log(`PayrollAnonymizer class 0x${payClassHash.toString(16)}`)
  const payDeploy: any = await account.deployContract(
    { classHash: `0x${payClassHash.toString(16)}`, constructorCalldata: [POOL, STRK] },
    { tip: 0n },
  )
  console.log(`Payroll deploy tx ${payDeploy.transaction_hash}`)
  const prcpt: any = await provider.waitForTransaction(payDeploy.transaction_hash)
  const payAddr = payDeploy.contract_address?.[0] ?? prcpt.contract_address
  console.log(`PAYROLL_ANONYMIZER_ADDRESS=${payAddr} (block ${prcpt.block_number})`)

  console.log("\n--- add to .env ---")
  console.log(`AUDIT_REGISTRY_ADDRESS=${regAddr}`)
  console.log(`PAYROLL_ANONYMIZER_ADDRESS=${payAddr}`)
  console.log(`NEXT_PUBLIC_REGISTRY_DEPLOY_BLOCK=${rrcpt.block_number}`)
}

main().catch(e => { console.error(e); process.exit(1) })
