import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { keccak256 } from "viem";

const root = fileURLToPath(new URL("../../", import.meta.url));
const output = root + "web/src/lib/contracts.generated.ts";
const sources = [
  "contracts/src/DealzaOperator.sol",
  "contracts/vendor/commerce-payments/src/AuthCaptureEscrow.sol",
  "contracts/vendor/commerce-payments/src/collectors/PreApprovalPaymentCollector.sol",
  "contracts/abi/AuthCaptureEscrow.v1.1.0.json",
];
const hashes = Object.fromEntries(
  sources.map((path) => [
    path,
    createHash("sha256")
      .update(readFileSync(root + path))
      .digest("hex"),
  ]),
);
const header = "// Sources-SHA256: " + JSON.stringify(hashes);
if (process.argv.includes("--check")) {
  if (!existsSync(output) || !readFileSync(output, "utf8").includes(header))
    throw new Error(
      "Contract sources changed. Run forge build, then npm run abi:sync and review the ABI changes.",
    );
  console.log("Contract source / ABI provenance: PASS");
} else {
  const artifact = (name) =>
    JSON.parse(
      readFileSync(root + `contracts/out/${name}.sol/${name}.json`, "utf8"),
    );
  const operator = artifact("DealzaOperator");
  const cpp = JSON.parse(
    readFileSync(root + "contracts/abi/AuthCaptureEscrow.v1.1.0.json", "utf8"),
  );
  const collector = artifact("PreApprovalPaymentCollector");
  writeFileSync(
    output,
    "// Generated from pinned Solidity artifacts. Do not edit.\n" +
      header +
      "\n" +
      `export const operatorRuntimeHash = '${keccak256(operator.deployedBytecode.object)}' as const\n` +
      `export const operatorAbi = ${JSON.stringify(operator.abi, null, 2)} as const\n` +
      `export const escrowAbi = ${JSON.stringify(cpp, null, 2)} as const\n` +
      `export const collectorAbi = ${JSON.stringify(collector.abi, null, 2)} as const\n`,
  );
  console.log(
    "Exported exact operator / CPP / collector ABIs and operator runtime hash",
  );
}
