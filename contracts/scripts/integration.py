#!/usr/bin/env python3
"""Base Sepolia public preflight and private local-fork rehearsal. No live send/sign mode."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import socket
import subprocess
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
ESCROW = "0xf96815976523E00e65Be8f34cA5e64b4f41EB19c"
COLLECTOR = "0xF1F9C408C787B2bC6CAEB91e5BbEc434a5c8d2Ea"
USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
CHAIN = 84532
AMOUNT = 1_000_000
PAYMENT = "(address,address,address,address,uint120,uint48,uint48,uint48,uint16,uint16,address,uint256)"
READ_METHODS = {"eth_chainId", "eth_blockNumber", "eth_getBlockByNumber", "eth_getBalance",
                "eth_getCode", "eth_getTransactionCount", "eth_gasPrice", "eth_call", "eth_estimateGas"}


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def command(*args):
    # Do not surface subprocess stderr: a custom RPC URL may contain credentials.
    result = subprocess.run(args, capture_output=True, text=True, timeout=60)
    require(result.returncode == 0, f"{args[0]} command failed; no sensitive arguments logged")
    return result.stdout.strip()


def encode(signature, *args):
    return command("cast", "calldata", signature, *map(str, args))


def words(data):
    require(data.startswith("0x") and (len(data) - 2) % 64 == 0, "Invalid static ABI result")
    return [int(data[i:i + 64], 16) for i in range(2, len(data), 64)]


def address(number):
    require(0 <= number < 2**160, "Invalid ABI address")
    return f"0x{number:040x}"


class LocalRevert(Exception):
    def __init__(self, error):
        self.data = error.get("data", "")


class PublicRPC:
    def __init__(self, url):
        self.url = url

    def rpc(self, method, params):
        require(method in READ_METHODS, "Public RPC is read-only")
        result = command("cast", "rpc", "--rpc-url", self.url, method,
                         *[p if isinstance(p, str) else json.dumps(p) for p in params])
        return json.loads(result)


class LocalFork:
    """Owns the only mutable RPC endpoint. It is allocated internally, never supplied by a user."""
    def __init__(self, public_url, block):
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            port = sock.getsockname()[1]
        self.url = f"http://127.0.0.1:{port}"
        # No generated accounts or keys, no persisted state, no logs containing fork URL.
        self.process = subprocess.Popen(
            ["anvil", "--host", "127.0.0.1", "--port", str(port), "--accounts", "0",
             "--auto-impersonate", "--chain-id", str(CHAIN), "--fork-url", public_url,
             "--fork-block-number", str(block)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            for _ in range(120):
                require(self.process.poll() is None, "Local Anvil startup failed")
                try:
                    if int(self.rpc("eth_chainId", []), 16) == CHAIN:
                        return
                except (OSError, TimeoutError):
                    pass
                time.sleep(0.25)
            raise RuntimeError("Local fork startup timed out")
        except BaseException:
            self.close()
            raise

    def close(self):
        self.process.terminate()
        try:
            self.process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            self.process.kill()
            self.process.wait()

    def rpc(self, method, params):
        require(self.url.startswith("http://127.0.0.1:"), "Mutation requires owned loopback fork")
        data = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode()
        # Ignore proxy environment variables for this private loopback endpoint.
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        req = urllib.request.Request(self.url, data=data, headers={"Content-Type": "application/json"})
        with opener.open(req, timeout=45) as response:
            result = json.load(response)
        if "error" in result:
            raise LocalRevert(result["error"])
        return result["result"]


def call(rpc, target, signature, *args, block="latest"):
    return rpc.rpc("eth_call", [{"to": target, "data": encode(signature, *args)}, block])


def token_balance(rpc, wallet, block="latest"):
    return words(call(rpc, USDC, "balanceOf(address)", wallet, block=block))[0]


def load_roles(path):
    roles = json.loads(path.read_text())
    require(set(roles) == {"chain_id", "deployer", "buyer", "seller", "reviewer"},
            "Roles file must contain only chain_id and four public addresses")
    require(roles.pop("chain_id") == CHAIN, "Only Base Sepolia is permitted")
    for value in roles.values():
        require(isinstance(value, str) and len(value) == 42 and value.startswith("0x"), "Invalid public role address")
        require(0 < int(value, 16) < 2**160, "Invalid public role address")
    require(len({x.lower() for x in roles.values()}) == 4, "Use four distinct role addresses")
    return roles


def preflight(public, roles, artifact):
    require(int(public.rpc("eth_chainId", []), 16) == CHAIN, "Wrong RPC chain")
    block = public.rpc("eth_blockNumber", [])
    header = public.rpc("eth_getBlockByNumber", [block, False])
    evidence = json.loads((ROOT.parent / "docs/verification/base-sepolia.json").read_text())
    for key, target in (("escrow", ESCROW), ("collector", COLLECTOR)):
        code = public.rpc("eth_getCode", [target, block])
        require(command("cast", "keccak", code) == evidence[key]["runtime_keccak256"], "Protocol runtime mismatch")
    require(address(words(call(public, COLLECTOR, "authCaptureEscrow()", block=block))[0]).lower()
            == ESCROW.lower(), "Collector points to wrong escrow")
    require(words(call(public, USDC, "decimals()", block=block))[0] == 6, "Wrong USDC precision")
    require(words(call(public, USDC, "paused()", block=block))[0] == 0, "USDC is paused")
    result = {"chain_id": CHAIN, "block": int(block, 16), "timestamp": int(header["timestamp"], 16),
              "roles": {}, "blockers": [], "constructor_arguments": [], "live_operator": None}
    for role, wallet in roles.items():
        balance = int(public.rpc("eth_getBalance", [wallet, block]), 16)
        code = public.rpc("eth_getCode", [wallet, block])
        blacklisted = words(call(public, USDC, "isBlacklisted(address)", wallet, block=block))[0]
        result["roles"][role] = {"address": wallet, "eth_wei": balance,
                                 "usdc_units": token_balance(public, wallet, block),
                                 "nonce": int(public.rpc("eth_getTransactionCount", [wallet, block]), 16),
                                 "code_bytes": (len(code) - 2) // 2, "blacklisted": bool(blacklisted)}
        if balance == 0:
            result["blockers"].append(f"{role} has no test ETH for gas")
        if code != "0x":
            result["blockers"].append(f"{role} is not a plain EOA; wallet-specific transaction simulation is required")
        if blacklisted:
            result["blockers"].append(f"{role} is USDC-blacklisted")
    if result["roles"]["buyer"]["usdc_units"] < AMOUNT * 3:
        result["blockers"].append("buyer needs at least 3 test USDC for this sequential five-order rehearsal (10 recommended)")
    result["buyer_collector_allowance"] = words(call(public, USDC, "allowance(address,address)",
                                                     roles["buyer"], COLLECTOR, block=block))[0]
    if result["buyer_collector_allowance"] != 0:
        result["blockers"].append("buyer has an existing collector allowance; review/revoke it separately before this rehearsal")
    bytecode = artifact["bytecode"]["object"]
    result["unsigned_deployment"] = {"chainId": CHAIN, "from": roles["deployer"], "data": bytecode,
                                      "value": "0x0", "nonce": hex(result["roles"]["deployer"]["nonce"])}
    result["creation_bytecode_sha256"] = hashlib.sha256(bytes.fromhex(bytecode[2:])).hexdigest()
    # Constructor smoke test is read-only and explicitly distinct from funded readiness.
    creation = {"from": roles["deployer"], "data": bytecode, "value": "0x0", "gasPrice": "0x0"}
    require(public.rpc("eth_call", [creation, block]) == artifact["deployedBytecode"]["object"],
            "Constructor returned unexpected runtime")
    result["constructor_simulation"] = {
        "exact_runtime_match": True,
        "estimated_execution_gas": int(public.rpc("eth_estimateGas", [creation, block]), 16),
        "gas_price_override_wei": 0,
        "note": "Read-only zero-price smoke test; does not establish funded readiness"
    }
    result["gas_price_snapshot_wei"] = int(public.rpc("eth_gasPrice", []), 16)
    result["readiness"] = "NO-GO" if result["blockers"] else "READY_FOR_LOCAL_REHEARSAL_ONLY"
    return result


class Rehearsal:
    def __init__(self, fork, roles, report, artifact):
        self.rpc, self.roles, self.artifact = fork, roles, artifact
        self.gas_price = report["gas_price_snapshot_wei"]
        require(self.gas_price > 0, "Rehearsal requires a nonzero public gas price snapshot")
        self.report = {"mode": "LOCAL_FORK_SIMULATION", "source_block": report["block"], "roles": roles,
                       "live_operator": None, "live_transactions": [], "transactions": [], "negative_checks": [],
                       "orders": [], "gas_price_snapshot_wei": self.gas_price,
                       "gas_fee_note": "Explicit public snapshot gas price; Base L1 data/operator fees require fresh wallet estimates"}
        self.operator = None
        self.store = None
        self.id = None
        self.event_names = {}
        def abi_type(item):
            return ("(" + ",".join(abi_type(c) for c in item["components"]) + ")" + item["type"][5:]
                    if item["type"].startswith("tuple") else item["type"])
        for name in ("DealzaOperator", "AuthCaptureEscrow", "PreApprovalPaymentCollector", "IERC20"):
            abi = json.loads((ROOT / f"out/{name}.sol/{name}.json").read_text())["abi"]
            for item in abi:
                if item["type"] == "event":
                    signature = item["name"] + "(" + ",".join(abi_type(i) for i in item["inputs"]) + ")"
                    self.event_names[command("cast", "keccak", signature)] = item["name"]

    def snapshot(self):
        data = {role: token_balance(self.rpc, wallet) for role, wallet in self.roles.items()}
        if self.operator:
            data["operator"] = token_balance(self.rpc, self.operator)
            data["token_store"] = token_balance(self.rpc, self.store)
            if self.id:
                data["status"] = words(call(self.rpc, self.operator, "status(bytes32)", self.id))[0]
                o = words(call(self.rpc, self.operator, "getOrder(bytes32)", self.id))
                data["stored_status"] = o[15]
                data["cpp_state"] = words(call(self.rpc, ESCROW, "paymentState(bytes32)", f"0x{o[14]:064x}"))
        return data

    def tx(self, label, role, target, data):
        sender = self.roles[role]
        before = self.snapshot()
        # Anvil's automatic fee defaults can reserve much more than actual Base
        # fees and reject funded participants. Keep real balances and use the
        # nonzero public snapshot price consistently for estimation and execution.
        tx = {"from": sender, "data": data, "value": "0x0", "gasPrice": hex(self.gas_price)}
        if target:
            tx["to"] = target
        estimate = int(self.rpc.rpc("eth_estimateGas", [tx]), 16)
        # Each transaction is estimated and eth_call-simulated before local execution.
        self.rpc.rpc("eth_call", [tx, "latest"])
        tx["gas"] = hex((estimate * 125 + 99) // 100)
        tx["nonce"] = self.rpc.rpc("eth_getTransactionCount", [sender, "latest"])
        local_hash = self.rpc.rpc("eth_sendTransaction", [tx])
        receipt = None
        for _ in range(50):
            receipt = self.rpc.rpc("eth_getTransactionReceipt", [local_hash])
            if receipt:
                break
            time.sleep(0.1)
        require(receipt and int(receipt["status"], 16) == 1, f"Local rehearsal failed: {label}")
        record = {"label": label, "signer_role": role, "unsigned_transaction": {"chainId": CHAIN, **tx},
                  "estimated_execution_gas": estimate, "proposed_gas_limit": int(tx["gas"], 16),
                  "local_gas_used": int(receipt["gasUsed"], 16), "before": before,
                  "events": [{**{k: log[k] for k in ("address", "topics", "data")},
                              "event": self.event_names.get(log["topics"][0], "Unknown")}
                             for log in receipt["logs"]],
                  "live_transaction_hash": None, "live_explorer_url": None}
        self.report["transactions"].append(record)
        return receipt, record

    def send(self, label, role, target, signature, *args):
        receipt, record = self.tx(label, role, target, encode(signature, *args))
        record["function"] = signature
        record["after"] = self.snapshot()
        return receipt

    def cpp_event(self, name, entry, expected_data):
        matches = [event for event in self.report["transactions"][-1]["events"]
                   if event["address"].lower() == ESCROW.lower() and event["event"] == name]
        require(len(matches) == 1 and matches[0]["topics"][1] == entry["payment_hash"], "CPP event/hash mismatch")
        require(words(matches[0]["data"]) == expected_data, "CPP event amount/parameters mismatch")

    def reject(self, label, role, target, signature, error, *args):
        tx = {"from": self.roles[role], "to": target, "data": encode(signature, *args)}
        before = self.snapshot()
        try:
            self.rpc.rpc("eth_call", [tx, "latest"])
        except LocalRevert as failure:
            selector = command("cast", "sig", error)
            require(isinstance(failure.data, str) and failure.data.startswith(selector), f"Unexpected rejection: {label}")
        else:
            raise RuntimeError(f"Forbidden action succeeded in simulation: {label}")
        require(before == self.snapshot(), "Read-only rejection changed state")
        self.report["negative_checks"].append({"label": label, "expected_error": error, "result": "REVERT", "transaction": tx})

    def order(self, scenario, funded=True):
        self.id = None
        now = int(self.rpc.rpc("eth_getBlockByNumber", ["latest", False])["timestamp"], 16)
        expiry = now + 7200
        self.send(f"{scenario}: create", "seller", self.operator,
                  "createOrder(address,uint120,uint48,uint48,address,bytes32)",
                  self.roles["buyer"], AMOUNT, now + 3600, expiry, self.roles["reviewer"],
                  command("cast", "keccak", f"Dealza {scenario} test terms"))
        log = self.report["transactions"][-1]["events"][0]
        require(log["address"].lower() == self.operator.lower(), "Missing order event")
        self.id = log["topics"][1]
        o = words(call(self.rpc, self.operator, "getOrder(bytes32)", self.id))
        require(len(o) == 16, "Order ABI changed")
        for index, value in ((0, self.operator), (1, self.roles["buyer"]), (2, self.roles["seller"]), (3, USDC),
                             (12, self.roles["reviewer"])):
            require(address(o[index]).lower() == value.lower(), "Payment/order address mismatch")
        require(o[4] == AMOUNT and o[5] == now + 3600 and o[6] == expiry and o[7] == expiry,
                "Payment amount/expiry mismatch")
        require(o[8:11] == [0, 0, 0] and o[11] == int(self.id, 16), "Payment fee/salt mismatch")
        values = [address(n) if i < 4 or i == 10 else str(n) for i, n in enumerate(o[:12])]
        payment = "(" + ",".join(values) + ")"
        require(words(call(self.rpc, ESCROW, f"getHash({PAYMENT})", payment))[0] == o[14], "CPP hash mismatch")
        entry = {"scenario": scenario, "order_id": self.id, "payment": values, "payment_hash": f"0x{o[14]:064x}",
                 "authorization_expiry": expiry}
        self.report["orders"].append(entry)
        balance = token_balance(self.rpc, self.roles["buyer"])
        self.send(f"{scenario}: approve", "buyer", USDC, "approve(address,uint256)", COLLECTOR, AMOUNT)
        self.send(f"{scenario}: preApprove", "buyer", COLLECTOR, f"preApprove({PAYMENT})", payment)
        require(token_balance(self.rpc, self.roles["buyer"]) == balance, "Approval unexpectedly moved USDC")
        if funded:
            self.send(f"{scenario}: fund", "buyer", self.operator, f"fund(bytes32,{PAYMENT})", self.id, payment)
            self.cpp_event("PaymentAuthorized", entry, o[:12] + [AMOUNT, int(COLLECTOR, 16)])
            require(self.snapshot()["cpp_state"] == [1, AMOUNT, 0], "CPP reservation mismatch")
            require(token_balance(self.rpc, self.roles["buyer"]) == balance - AMOUNT, "Buyer debit mismatch")
        return payment, expiry, entry

    def finish(self, entry, buyer_before, seller_before, release):
        self.cpp_event("PaymentCaptured" if release else "PaymentVoided", entry,
                       [AMOUNT, 0, 0] if release else [AMOUNT])
        state = self.snapshot()
        require(state["operator"] == 0 and state["token_store"] == 0, "Unexpected retained balance")
        require(state["cpp_state"] == [1, 0, AMOUNT if release else 0], "Terminal CPP state mismatch")
        require(state["buyer"] == buyer_before - (AMOUNT if release else 0), "Buyer settlement mismatch")
        require(state["seller"] == seller_before + (AMOUNT if release else 0), "Seller settlement mismatch")
        require(state["status"] == (4 if release else 5), "Dealza terminal status mismatch")
        entry["final_state"] = state

    def run(self):
        receipt, record = self.tx("deploy operator (no constructor arguments)", "deployer", None,
                                  self.artifact["bytecode"]["object"])
        self.operator = receipt["contractAddress"]
        self.store = address(words(call(self.rpc, ESCROW, "getTokenStore(address)", self.operator))[0])
        require(self.rpc.rpc("eth_getCode", [self.operator, "latest"]) == self.artifact["deployedBytecode"]["object"],
                "Operator runtime mismatch")
        for signature, expected in (("ESCROW()", ESCROW), ("COLLECTOR()", COLLECTOR), ("USDC()", USDC)):
            require(address(words(call(self.rpc, self.operator, signature))[0]).lower() == expected.lower(), "Deployment config mismatch")
        require(words(call(self.rpc, self.operator, "CHAIN_ID()"))[0] == CHAIN, "Operator chain mismatch")
        require(words(call(self.rpc, self.operator, "MAX_DURATION()"))[0] == 30 * 86400, "Duration mismatch")
        record["after"] = self.snapshot()
        self.report["simulated_operator_not_deployed"] = self.operator
        self.report["simulated_token_store"] = self.store
        evidence = command("cast", "keccak", "Dealza simulation evidence")
        for scenario in ("A buyer release", "B seller cancellation", "C reviewer release", "D reviewer void"):
            buyer_before = token_balance(self.rpc, self.roles["buyer"])
            seller_before = token_balance(self.rpc, self.roles["seller"])
            payment, _, entry = self.order(scenario)
            if scenario.startswith("A"):
                self.send("A: delivery claim only", "seller", self.operator, "noteDelivery(bytes32,bytes32)", self.id, evidence)
                require(self.snapshot()["cpp_state"] == [1, AMOUNT, 0], "Delivery claim changed reserve")
                self.reject("seller release", "seller", self.operator, "release(bytes32)", "Unauthorized()", self.id)
                self.reject("seller CPP capture", "seller", ESCROW, f"capture({PAYMENT},uint256,uint256,address)",
                            "InvalidSender(address,address)", payment, AMOUNT, 0, address(0))
                self.send("A: buyer release", "buyer", self.operator, "release(bytes32)", self.id)
                self.reject("duplicate release", "buyer", self.operator, "release(bytes32)", "InvalidState()", self.id)
            elif scenario.startswith("B"):
                self.send("B: seller void", "seller", self.operator, "cancel(bytes32)", self.id)
            else:
                self.send(scenario + ": dispute", "buyer", self.operator, "dispute(bytes32,bytes32)", self.id, evidence)
                self.reject("buyer cannot override dispute", "buyer", self.operator, "release(bytes32)", "InvalidState()", self.id)
                self.reject("seller cannot rule", "seller", self.operator, "resolve(bytes32,bool,bytes32)", "Unauthorized()", self.id, "true", evidence)
                self.send(scenario + ": ruling", "reviewer", self.operator, "resolve(bytes32,bool,bytes32)",
                          self.id, "true" if scenario.startswith("C") else "false", evidence)
            self.finish(entry, buyer_before, seller_before, scenario.startswith(("A", "C")))
        before = token_balance(self.rpc, self.roles["buyer"])
        payment, expiry, entry = self.order("E unresolved dispute expiry")
        self.send("E: dispute", "buyer", self.operator, "dispute(bytes32,bytes32)", self.id, evidence)
        self.reject("early reclaim", "buyer", ESCROW, f"reclaim({PAYMENT})", "BeforeAuthorizationExpiry(uint48,uint48)", payment)
        self.rpc.rpc("evm_setNextBlockTimestamp", [expiry])
        self.rpc.rpc("evm_mine", [])
        self.reject("late reviewer release", "reviewer", self.operator, "resolve(bytes32,bool,bytes32)", "Expired()", self.id, "true", evidence)
        self.send("E: payer direct CPP reclaim", "buyer", ESCROW, f"reclaim({PAYMENT})", payment)
        self.cpp_event("PaymentReclaimed", entry, [AMOUNT])
        state = self.snapshot()
        require(state["buyer"] == before and state["cpp_state"] == [1, 0, 0] and state["status"] == 7
                and state["stored_status"] == 3, "Disputed reclaim/status mismatch")
        self.send("E: sync recovery", "buyer", self.operator, "syncRecovery(bytes32)", self.id)
        entry["final_state"] = self.snapshot()
        payment, _, entry = self.order("F unfunded cancellation", funded=False)
        self.send("F: cancel unfunded", "seller", self.operator, "cancel(bytes32)", self.id)
        self.reject("fund cancelled order", "buyer", self.operator, f"fund(bytes32,{PAYMENT})", "InvalidState()", self.id, payment)
        self.send("F: revoke unused allowance", "buyer", USDC, "approve(address,uint256)", COLLECTOR, 0)
        require(self.snapshot()["cpp_state"] == [0, 0, 0], "Unfunded cancellation changed CPP")
        entry["final_state"] = self.snapshot()
        gas_by_role = {role: sum(tx["proposed_gas_limit"] for tx in self.report["transactions"]
                                  if tx["signer_role"] == role) for role in self.roles}
        self.report["proposed_execution_gas_limits_by_role"] = gas_by_role
        self.report["result"] = "PASS_LOCAL_FORK_ONLY"
        return self.report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=("preflight", "simulate"))
    parser.add_argument("--roles", type=Path, default=ROOT / "config/base-sepolia.roles.json")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    roles = load_roles(args.roles)
    require(not command("git", "diff", "2d611b0", "--", str(ROOT / "src/DealzaOperator.sol")), "Reviewed operator source changed")
    artifact = json.loads((ROOT / "out/DealzaOperator.sol/DealzaOperator.json").read_text())
    public = PublicRPC(os.environ.get("BASE_SEPOLIA_RPC_URL", "https://sepolia.base.org"))
    report = preflight(public, roles, artifact)
    args.output.write_text(json.dumps(report, indent=2) + "\n")
    if report["blockers"]:
        print("NO-GO: " + "; ".join(report["blockers"]))
        return 2
    if args.mode == "simulate":
        fork = LocalFork(public.url, report["block"])
        try:
            report = Rehearsal(fork, roles, report, artifact).run()
        finally:
            fork.close()
        args.output.write_text(json.dumps(report, indent=2) + "\n")
        print(f"PASS: {len(report['transactions'])} unsigned transactions rehearsed locally; no public broadcast")
    else:
        print("PASS: public prerequisites; no signing/broadcast; run local rehearsal next")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as failure:
        # Never print tracebacks or environment/URL-bearing subprocess errors.
        detail = str(failure) if isinstance(failure, RuntimeError) else type(failure).__name__
        print(f"NO-GO: {detail}. No live send/sign mode exists.")
        raise SystemExit(1)
