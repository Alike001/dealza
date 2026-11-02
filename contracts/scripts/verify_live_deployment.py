#!/usr/bin/env python3
"""Read-only deployment verification and one payment on an owned local fork only."""
import argparse
import hashlib
import json
import os
from pathlib import Path

from integration import (ROOT, CHAIN, ESCROW, COLLECTOR, USDC, AMOUNT, PAYMENT,
                         PublicRPC, LocalFork, Rehearsal, address, call, command,
                         load_roles, require, token_balance, words)

OPERATOR = "0xd798Ec27019Bba2E6411986A2D58ff3D50F8C9c8"
TRANSACTION = "0x73c6b79e93387e6e0f69ceae5185f6a9049ef8fbb2526ada2c70f145e1b96fe1"
BLOCK = 53676176
CREATION_SHA256 = "45d2044b191500c9e097982f436a27cad6eb8105f72e161cd59946b854d6094a"
RUNTIME_HASH = "0xadbc98ddf155ec9a93328c11d78ff7fe2aeb180cc74bd34222e4313584b2374d"


class DeploymentRPC(PublicRPC):
    def rpc(self, method, params):
        if method in {"eth_getTransactionReceipt", "eth_getTransactionByHash", "eth_getStorageAt"}:
            return json.loads(command("cast", "rpc", "--rpc-url", self.url, method,
                                      *[p if isinstance(p, str) else json.dumps(p) for p in params]))
        return super().rpc(method, params)


def write(output, name, data):
    (output / name).write_text(json.dumps(data, indent=2) + "\n")


def verify(public, artifact, roles, output):
    require(int(public.rpc("eth_chainId", []), 16) == CHAIN, "Wrong chain")
    block = public.rpc("eth_blockNumber", [])
    header = public.rpc("eth_getBlockByNumber", [block, False])
    receipt = public.rpc("eth_getTransactionReceipt", [TRANSACTION])
    tx = public.rpc("eth_getTransactionByHash", [TRANSACTION])
    write(output, "receipt.json", receipt)
    write(output, "transaction.json", tx)
    deployment_header = public.rpc("eth_getBlockByNumber", [hex(BLOCK), False])
    write(output, "deployment-block.json", deployment_header)
    require(receipt and tx and deployment_header, "Missing deployment evidence")
    require(receipt["status"] == "0x1" and receipt["to"] is None and tx["to"] is None,
            "Not a successful CREATE")
    require(receipt["transactionHash"] == tx["hash"] == TRANSACTION, "Transaction mismatch")
    require(int(tx["chainId"], 16) == CHAIN, "Transaction chain mismatch")
    require(receipt["from"].lower() == tx["from"].lower() == roles["deployer"].lower(), "Wrong deployer")
    require(receipt["contractAddress"].lower() == OPERATOR.lower(), "Wrong contract")
    require(int(receipt["blockNumber"], 16) == int(tx["blockNumber"], 16) == BLOCK, "Wrong deployment block")
    require(receipt["blockHash"] == tx["blockHash"] == deployment_header["hash"], "Noncanonical receipt")
    require(TRANSACTION in deployment_header["transactions"], "Transaction missing from block")
    require(int(tx["value"], 16) == 0, "Unexpected native value")
    creation = artifact["bytecode"]["object"]
    runtime = artifact["deployedBytecode"]["object"]
    require(hashlib.sha256(bytes.fromhex(creation[2:])).hexdigest() == CREATION_SHA256,
            "Artifact differs from reviewed creation")
    require(command("cast", "keccak", runtime) == RUNTIME_HASH, "Artifact differs from reviewed runtime")
    require(tx["input"].lower() == creation.lower(), "Creation input or constructor arguments differ")
    require(not artifact["deployedBytecode"].get("immutableReferences"), "Unexpected immutable references")
    require(not command("git", "diff", "2d611b0", "--", str(ROOT / "src"),
                        str(ROOT / "vendor"), str(ROOT / "foundry.toml"),
                        str(ROOT / "dependencies.lock.json")), "Reviewed contract inputs changed")
    for tag in (hex(BLOCK), block):
        require(public.rpc("eth_getCode", [OPERATOR, tag]).lower() == runtime.lower(),
                "Full operator runtime mismatch")
    simulated = public.rpc("eth_call", [{"from": roles["deployer"], "data": creation,
                                         "value": "0x0", "gasPrice": "0x0"}, block])
    require(simulated.lower() == runtime.lower(), "Constructor simulation mismatch")
    (output / "runtime.hex").write_text(runtime + "\n")
    (output / "constructor-runtime.hex").write_text(simulated + "\n")
    config = {}
    for sig, expected in (("ESCROW()", ESCROW), ("COLLECTOR()", COLLECTOR), ("USDC()", USDC)):
        actual = address(words(call(public, OPERATOR, sig, block=block))[0])
        require(actual.lower() == expected.lower(), "Operator config mismatch")
        config[sig] = actual
    for sig, expected in (("CHAIN_ID()", CHAIN), ("MAX_DURATION()", 2592000)):
        config[sig] = words(call(public, OPERATOR, sig, block=block))[0]
        require(config[sig] == expected, "Operator constant mismatch")
    require(address(words(call(public, COLLECTOR, "authCaptureEscrow()", block=block))[0]).lower()
            == ESCROW.lower(), "Collector binding mismatch")
    protocol = json.loads((ROOT.parent / "docs/verification/base-sepolia.json").read_text())
    for name, target in (("escrow", ESCROW), ("collector", COLLECTOR)):
        require(command("cast", "keccak", public.rpc("eth_getCode", [target, block]))
                == protocol[name]["runtime_keccak256"], "Pinned protocol code mismatch")
    prior = json.loads((ROOT.parent / "docs/verification/review/runtime.json").read_text())["usdc"]
    implementation = address(words(call(public, USDC, "implementation()", block=block))[0])
    require(implementation.lower() == prior["implementation"].lower(), "USDC implementation changed")
    for target, key in ((USDC, "proxy_runtime_keccak256"), (implementation, "implementation_runtime_keccak256")):
        require(command("cast", "keccak", public.rpc("eth_getCode", [target, block])) == prior[key],
                "Pinned USDC code mismatch")
    require(words(call(public, USDC, "decimals()", block=block))[0] == 6, "USDC decimals mismatch")
    require(words(call(public, USDC, "paused()", block=block))[0] == 0, "USDC paused")
    participants = {}
    for role, wallet in roles.items():
        participants[role] = {"address": wallet,
            "eth_wei": int(public.rpc("eth_getBalance", [wallet, block]), 16),
            "usdc_units": token_balance(public, wallet, block),
            "nonce": int(public.rpc("eth_getTransactionCount", [wallet, block]), 16),
            "code": public.rpc("eth_getCode", [wallet, block]),
            "blacklisted": bool(words(call(public, USDC, "isBlacklisted(address)", wallet, block=block))[0])}
    allowance = words(call(public, USDC, "allowance(address,address)", roles["buyer"], COLLECTOR, block=block))[0]
    functions = sorted(i["name"] for i in artifact["abi"] if i["type"] == "function")
    proxy_slots = {name: public.rpc("eth_getStorageAt", [OPERATOR, slot, block]) for name, slot in {
        "implementation": "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc",
        "admin": "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103",
        "beacon": "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50"}.items()}
    require(all(int(v, 16) == 0 for v in proxy_slots.values()), "Unexpected proxy slot")
    report = {"result": "PASS_FULL_DEPLOYMENT_VERIFICATION", "chain_id": CHAIN,
        "operator": OPERATOR, "deployment_transaction": TRANSACTION, "deployment_block": BLOCK,
        "snapshot_block": int(block, 16), "snapshot_block_hash": header["hash"],
        "timestamp": int(header["timestamp"], 16), "confirmations": int(block, 16) - BLOCK + 1,
        "canonical_receipt_success": True, "exact_creation_input_match": True,
        "creation_sha256": CREATION_SHA256, "runtime_bytes": (len(runtime)-2)//2,
        "runtime_keccak256": RUNTIME_HASH, "complete_runtime_match_at_deployment_and_snapshot": True,
        "fresh_constructor_runtime_match": True, "immutable_references": {},
        "metadata_stripped": False, "reviewed_contract_inputs_unchanged_since": "2d611b0",
        "configuration": config, "pinned_cpp_collector_usdc_match": True,
        "usdc_implementation": implementation, "public_functions": functions,
        "proxy_slots": proxy_slots, "roles": participants, "buyer_collector_allowance": allowance,
        "gas_price_snapshot_wei": int(public.rpc("eth_gasPrice", []), 16),
        "live_transactions_sent": [], "signature_requested": False}
    write(output, "verification.json", report)
    return report


def simulate(public, artifact, roles, report, output):
    for role in ("buyer", "seller", "reviewer"):
        p = report["roles"][role]
        require(p["eth_wei"] > 0 and p["code"] == "0x" and not p["blacklisted"], "Participant not ready")
    require(report["roles"]["buyer"]["usdc_units"] >= AMOUNT, "Buyer needs 1 test USDC")
    require(report["buyer_collector_allowance"] == 0, "Existing allowance needs separate review")
    fork = LocalFork(public.url, report["snapshot_block"])
    try:
        r = Rehearsal(fork, roles, {"block": report["snapshot_block"],
                                  "gas_price_snapshot_wei": report["gas_price_snapshot_wei"]}, artifact)
        r.operator = OPERATOR
        r.store = address(words(call(fork, ESCROW, "getTokenStore(address)", OPERATOR))[0])
        r.report["live_operator"] = OPERATOR
        r.report["initial_state"] = r.snapshot()
        require(r.report["initial_state"]["operator"] == 0 and r.report["initial_state"]["token_store"] == 0,
                "Existing retained balance requires review")
        payment, _, entry = r.order("first real payment rehearsal")
        proof = command("cast", "keccak", "Dealza first payment delivery evidence")
        r.send("seller delivery evidence", "seller", OPERATOR, "noteDelivery(bytes32,bytes32)", r.id, proof)
        require(r.snapshot()["cpp_state"] == [1, AMOUNT, 0], "Delivery changed reservation")
        r.reject("seller release", "seller", OPERATOR, "release(bytes32)", "Unauthorized()", r.id)
        r.reject("seller direct CPP capture", "seller", ESCROW, f"capture({PAYMENT},uint256,uint256,address)",
                 "InvalidSender(address,address)", payment, AMOUNT, 0, address(0))
        r.reject("deployer release", "deployer", OPERATOR, "release(bytes32)", "Unauthorized()", r.id)
        r.send("buyer approved release", "buyer", OPERATOR, "release(bytes32)", r.id)
        r.reject("duplicate buyer release", "buyer", OPERATOR, "release(bytes32)", "InvalidState()", r.id)
        r.finish(entry, r.report["initial_state"]["buyer"], r.report["initial_state"]["seller"], True)
        require(words(call(fork, USDC, "allowance(address,address)", roles["buyer"], COLLECTOR))[0] == 0,
                "Allowance not consumed")
        r.report["final_allowance"] = 0
        r.report["result"] = "PASS_LOCAL_FORK_ONLY"
        r.report["balance_overrides"] = False
        r.report["deployment_performed"] = False
        r.report["proposed_gas_limits_by_role"] = {role: sum(t["proposed_gas_limit"]
            for t in r.report["transactions"] if t["signer_role"] == role) for role in roles}
        write(output, "payment-rehearsal.json", r.report)
    finally:
        fork.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--simulate", action="store_true", help="Execute only on a fresh owned loopback fork")
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    roles = load_roles(ROOT / "config/base-sepolia.roles.json")
    artifact = json.loads((ROOT / "out/DealzaOperator.sol/DealzaOperator.json").read_text())
    public = DeploymentRPC(os.environ.get("BASE_SEPOLIA_RPC_URL", "https://sepolia.base.org"))
    report = verify(public, artifact, roles, args.output_dir)
    if args.simulate:
        simulate(public, artifact, roles, report, args.output_dir)
    print("PASS: deployment verified" + ("; payment passed on local fork only" if args.simulate else ""))


if __name__ == "__main__":
    try:
        main()
    except Exception as failure:
        detail = str(failure) if isinstance(failure, RuntimeError) else type(failure).__name__
        print(f"NO-GO: {detail}. No public send/sign mode exists.")
        raise SystemExit(1)
