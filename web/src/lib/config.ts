import { getAddress, isAddress, type Address } from "viem";
import { baseSepolia } from "viem/chains";
import deployment from "../../../contracts/config/base-sepolia.deployment.json";
import protocol from "../../../docs/verification/base-sepolia.json";

export const chain = baseSepolia;
export const network = {
  chainId: 84532,
  escrow: getAddress(protocol.escrow.address),
  collector: getAddress(protocol.collector.address),
  usdc: getAddress("0x036CbD53842c5426634e7929541eC2318f3dCF7e"),
  escrowCodeHash: protocol.escrow.runtime_keccak256,
  collectorCodeHash: protocol.collector.runtime_keccak256,
  explorer: "https://sepolia.basescan.org",
} as const;

export type Deployment = { operator: Address; block: bigint };
export function configuredDeployment(value: {
  chainId: number;
  operator: unknown;
  deploymentBlock: unknown;
}): Deployment | null {
  if (value.chainId !== 84532)
    throw new Error("Only Base Sepolia is supported.");
  if (value.operator === null && value.deploymentBlock === null) return null;
  if (
    typeof value.operator !== "string" ||
    !isAddress(value.operator) ||
    /^0x0{40}$/i.test(value.operator) ||
    typeof value.deploymentBlock !== "number" ||
    !Number.isSafeInteger(value.deploymentBlock) ||
    value.deploymentBlock < 1
  )
    throw new Error(
      "The verified testnet deployment configuration is incomplete.",
    );
  return {
    operator: getAddress(value.operator),
    block: BigInt(value.deploymentBlock),
  };
}
export const deploymentConfig = configuredDeployment(deployment);
const rpc =
  import.meta.env.VITE_BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";
const url = new URL(rpc);
if (
  url.protocol !== "https:" &&
  !(import.meta.env.DEV && url.hostname === "127.0.0.1")
)
  throw new Error("Use a secure Base Sepolia RPC endpoint.");
export const rpcUrl = rpc;
export const explorerTx = (hash: string) => `${network.explorer}/tx/${hash}`;
export const explorerAddress = (address: string) =>
  `${network.explorer}/address/${address}`;
