import { RpcProvider, Account, hash } from "starknet"
import fs from "fs"

const RPC_URL = process.env.STARKNET_RPC_URL!
const ACCOUNT_ADDRESS = process.env.ACCOUNT_ADDRESS!
const ACCOUNT_PK = process.env.ACCOUNT_PRIVATE_KEY!

async function main() {
  const provider = new RpcProvider({ nodeUrl: RPC_URL })
  const account = new Account({ provider, address: ACCOUNT_ADDRESS, signer: ACCOUNT_PK, cairoVersion: "1" })
  console.log(`Deployer ${ACCOUNT_ADDRESS}`)

  const sierraPath = "contracts/target/dev/shadowaudit_AuditRegistry.contract_class.json"
  const casmPath = "contracts/target/dev/shadowaudit_AuditRegistry.compiled_contract_class.json"
  const sierra = JSON.parse(fs.readFileSync(sierraPath, "utf-8"))
  const casm = JSON.parse(fs.readFileSync(casmPath, "utf-8"))

  console.log("Declaring AuditRegistry...")
  const declareTx: any = await account.declare({ contract: sierra, casm }, { tip: 0n })
  console.log(`Declare tx ${declareTx.transaction_hash} https://sepolia.voyager.online/tx/${declareTx.transaction_hash}`)
  await provider.waitForTransaction(declareTx.transaction_hash)
  console.log(`Declared class ${declareTx.class_hash}`)

  console.log("Deploying with auditor =", ACCOUNT_ADDRESS)
  const deployTx: any = await account.deployContract({ classHash: declareTx.class_hash, constructorCalldata: [ACCOUNT_ADDRESS] }, { tip: 0n })
  console.log(`Deploy tx ${deployTx.transaction_hash}`)
  const receipt: any = await provider.waitForTransaction(deployTx.transaction_hash)
  const addr = receipt.contract_address ?? deployTx.contract_address
  console.log(`Deployed at ${addr} block ${receipt.block_number} https://sepolia.voyager.online/contract/${addr}`)

  // Update .env would be manual, but log
  console.log(`Next: register_business + set_threshold_commitment via ${addr}`)
}

main().catch(e => { console.error(e); process.exit(1) })
