#!/usr/bin/env python3
"""Read-only funding receipt discovery and nonzero-price deployment estimate. No wallet access."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import os

from integration import ROOT, CHAIN, PublicRPC, command, encode, require, words


class ReceiptRPC(PublicRPC):
    def rpc(self, method, params):
        if method == "eth_getTransactionReceipt":
            return json.loads(command("cast", "rpc", "--rpc-url", self.url, method,
                                      *[p if isinstance(p, str) else json.dumps(p) for p in params]))
        return super().rpc(method, params)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--estimate-only", action="store_true")
    args = parser.parse_args()
    from pathlib import Path
    output = Path(args.output_dir)
    prior = json.loads((ROOT.parent / "docs/verification/funding-refresh/preflight.json").read_text())
    plan = json.loads((ROOT.parent / "docs/verification/funding-refresh/funding-plan.json").read_text())
    current = json.loads((output / "preflight.json").read_text())
    rpc = ReceiptRPC(os.environ.get("BASE_SEPOLIA_RPC_URL", "https://sepolia.base.org"))
    require(int(rpc.rpc("eth_chainId", []), 16) == CHAIN, "Wrong chain")
    tip = current["block"]

    def funding(item):
        role, amount = item["role"], item["amount_wei"]
        wallet = current["roles"][role]["address"]
        low, high = prior["block"], tip
        require(prior["roles"][role]["eth_wei"] == 0, "Discovery requires prior zero balance")
        require(current["roles"][role]["nonce"] == 0, "Participant has transacted; review history separately")
        require(current["roles"][role]["eth_wei"] == amount, "Current funding differs from plan")
        cache = output / f"funding-block-{role}.json"
        if cache.exists():
            block = json.loads(cache.read_text())
            high = int(block["number"], 16)
            require(low < high <= tip, "Cached funding block outside snapshot window")
            require(int(rpc.rpc("eth_getBalance", [wallet, hex(high - 1)]), 16) == 0
                    and int(rpc.rpc("eth_getBalance", [wallet, hex(high)]), 16) == amount,
                    "Cached funding balance transition mismatch")
        else:
            while high - low > 1:
                mid = (low + high) // 2
                if int(rpc.rpc("eth_getBalance", [wallet, hex(mid)]), 16) > 0:
                    high = mid
                else:
                    low = mid
            block = rpc.rpc("eth_getBlockByNumber", [hex(high), True])
        matches = [t for t in block["transactions"] if (t.get("to") or "").lower() == wallet.lower()
                   and int(t["value"], 16) == amount]
        (output / f"funding-block-{role}.json").write_text(json.dumps(block, indent=2) + "\n")
        if not matches:
            deployer = current["roles"]["deployer"]["address"].lower()
            matches = [t for t in block["transactions"]
                       if (t.get("to") or "").lower() == deployer or t["from"].lower() == deployer
                       or wallet[2:].lower() in t.get("input", "").lower()]
        require(len(matches) == 1, "Expected one identifiable funding transaction")
        tx = matches[0]
        balance_evidence = {}
        if (tx.get("to") or "").lower() != wallet.lower():
            # Native internal calls emit no ERC20 Transfer event. Verify the actual
            # adjacent-block state deltas and the packed recipient/value in the
            # unique sponsored transaction; do not invent an internal trace.
            deployer = current["roles"]["deployer"]["address"]
            packed_transfer = wallet[2:].lower() + f"{amount:064x}"
            require(packed_transfer in tx["input"].lower() and deployer[2:].lower() in tx["input"].lower(),
                    "Wallet funding calldata mismatch")
            for label, account in (("sender", deployer), ("recipient", wallet)):
                balance_evidence[label] = {"address": account,
                    "before_wei": int(rpc.rpc("eth_getBalance", [account, hex(high - 1)]), 16),
                    "after_wei": int(rpc.rpc("eth_getBalance", [account, hex(high)]), 16)}
            require(balance_evidence["recipient"]["before_wei"] == 0
                    and balance_evidence["recipient"]["after_wei"] == amount,
                    "Recipient balance delta mismatch")
            require(balance_evidence["sender"]["before_wei"] - balance_evidence["sender"]["after_wei"] == amount,
                    "Sender balance delta mismatch")
        else:
            require(tx["from"].lower() == current["roles"]["deployer"]["address"].lower(), "Unexpected funder")
        receipt = rpc.rpc("eth_getTransactionReceipt", [tx["hash"]])
        require(receipt and int(receipt["status"], 16) == 1, "Funding receipt failed")
        require(receipt["transactionHash"] == tx["hash"] and receipt["blockHash"] == block["hash"],
                "Funding receipt identity mismatch")
        require(int(receipt["blockNumber"], 16) == high and tx["blockHash"] == block["hash"],
                "Funding block mismatch")
        require(rpc.rpc("eth_getBlockByNumber", [hex(high), False])["hash"] == block["hash"],
                "Funding block changed")
        return {"role": role, "amount_wei": amount, "confirmations_at_snapshot": tip - high + 1,
                "transaction": tx, "receipt": receipt, "adjacent_block_balances": balance_evidence,
                "proof_note": "Successful canonical receipt, unique matching calldata and exact adjacent-block native balance deltas; no internal trace claimed",
                "explorer_url": "https://sepolia.basescan.org/tx/" + tx["hash"]}

    if not args.estimate_only:
        with ThreadPoolExecutor(max_workers=3) as pool:
            transfers = list(pool.map(funding, plan["plan"]))
        finalized = rpc.rpc("eth_getBlockByNumber", ["finalized", False])
        for transfer in transfers:
            transfer["finalized"] = int(transfer["receipt"]["blockNumber"], 16) <= int(finalized["number"], 16)
        (output / "funding-receipts.json").write_text(json.dumps({"chain_id": CHAIN, "snapshot_block": tip,
            "finalized_block": int(finalized["number"], 16), "transfers": transfers}, indent=2) + "\n")

    artifact = json.loads((ROOT / "out/DealzaOperator.sol/DealzaOperator.json").read_text())
    creation, runtime = artifact["bytecode"]["object"], artifact["deployedBytecode"]["object"]
    old = json.loads((ROOT.parent / "docs/verification/funding-refresh/deployment-estimate.json").read_text())
    require(creation == old["unsigned_transaction"]["data"], "Creation differs from reviewed preparation")
    block = rpc.rpc("eth_blockNumber", [])
    gas_price = int(rpc.rpc("eth_gasPrice", []), 16)
    require(gas_price > 0, "Nonzero gas price required")
    sender = current["roles"]["deployer"]["address"]
    tx = {"from": sender, "data": creation, "value": "0x0", "gasPrice": hex(gas_price)}
    require(rpc.rpc("eth_call", [tx, block]) == runtime, "Constructor runtime mismatch")
    estimate = int(rpc.rpc("eth_estimateGas", [tx, block]), 16)
    gas_limit = (estimate * 125 + 99) // 100
    oracle = "0x420000000000000000000000000000000000000F"
    def fee(signature, value):
        return words(rpc.rpc("eth_call", [{"to": oracle, "data": encode(signature, value)}, block]))[0]
    l1 = fee("getL1FeeUpperBound(uint256)", (len(creation) - 2) // 2 + 128)
    operator = fee("getOperatorFee(uint256)", gas_limit)
    budget = gas_limit * gas_price * 2 + (l1 + operator) * 2
    nonce = int(rpc.rpc("eth_getTransactionCount", [sender, block]), 16)
    pending_nonce = int(rpc.rpc("eth_getTransactionCount", [sender, "pending"]), 16)
    require(nonce == pending_nonce, "Pending deployer transaction; refresh before deployment")
    balance = int(rpc.rpc("eth_getBalance", [sender, block]), 16)
    require(balance > budget, "Deployment budget exceeds funding")
    report = {"chain_id": CHAIN, "block": int(block, 16), "constructor_arguments": [],
        "exact_runtime_match": True, "exact_prior_creation_match": True,
        "creation_bytes": (len(creation) - 2) // 2, "runtime_bytes": (len(runtime) - 2) // 2,
        "creation_sha256": hashlib.sha256(bytes.fromhex(creation[2:])).hexdigest(),
        "runtime_keccak256": command("cast", "keccak", runtime), "runtime_sha256": hashlib.sha256(bytes.fromhex(runtime[2:])).hexdigest(),
        "estimated_execution_gas": estimate, "gas_limit_25pct_buffer": gas_limit,
        "gas_price_wei": gas_price, "l1_fee_upper_bound_wei": l1,
        "operator_fee_at_buffered_gas_wei": operator,
        "estimated_total_using_l1_upper_bound_wei": estimate * gas_price + l1 + operator,
        "buffered_budget_at_2x_fees_wei": budget, "deployer_balance_wei": balance,
        "pending_nonce": pending_nonce,
        "unsigned_transaction": {"chainId": CHAIN, **tx, "nonce": hex(nonce),
                                 "gas": hex(gas_limit), "gasPrice": hex(gas_price * 2)},
        "note": "Read-only proposal. Refresh state, nonce and all Base fees before separately authorized deployment."}
    (output / "deployment-estimate.json").write_text(json.dumps(report, indent=2) + "\n")
    print("PASS: exact runtime/nonzero-price deployment simulation; no signing or broadcast")
    if not args.estimate_only:
        print("PASS: three funding transfers verified by receipts, calldata and native balance deltas")


if __name__ == "__main__":
    try:
        main()
    except Exception as failure:
        print("NO-GO: " + (str(failure) if isinstance(failure, RuntimeError) else type(failure).__name__))
        raise SystemExit(1)
