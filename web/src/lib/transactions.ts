import type { Hash, TransactionReceipt } from "viem";
import type { TxState } from "./domain";

export interface TransactionPort {
  check(): Promise<void>;
  simulate(): Promise<void>;
  send(): Promise<Hash>;
  wait(hash: Hash, replaced: (hash: Hash) => void): Promise<TransactionReceipt>;
  verify(receipt: TransactionReceipt): Promise<void>;
}
/** Confirmation describes the transaction only. Financial status always comes from a fresh chain read. */
export async function confirmTransaction(
  port: TransactionPort,
  update: (state: TxState) => void,
): Promise<TransactionReceipt> {
  update({
    phase: "checking",
    message: "Checking your wallet and simulating this action…",
  });
  await port.check();
  await port.simulate();
  await port.check();
  update({
    phase: "signature",
    message: "Review the recipient, amount, and network in your wallet.",
  });
  let hash = await port.send();
  update({
    phase: "pending",
    message: "Submitted. Waiting for confirmation on Base Sepolia…",
    hash,
  });
  const receipt = await port.wait(hash, (replacement) => {
    hash = replacement;
    update({
      phase: "pending",
      message:
        "Your wallet replaced this transaction. Checking the confirmed result…",
      hash,
    });
  });
  if (receipt.status !== "success")
    throw new Error(
      "The transaction reverted. No successful payment is recorded.",
    );
  await port.verify(receipt);
  update({
    phase: "confirmed",
    message: "Transaction confirmed. Refreshing the payment record…",
    hash: receipt.transactionHash,
  });
  return receipt;
}
