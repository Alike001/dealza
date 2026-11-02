#!/usr/bin/env python3
"""Verify pinned files/ABI locally; --online adds read-only RPC and explorer checks."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT.parent / "docs/verification/base-sepolia.json"


def require(condition, message):
    if not condition:
        raise SystemExit(message)


def get_bytes(url):
    return subprocess.check_output(
        ["curl", "--fail", "--silent", "--show-error", "--location", "--max-time", "30", url], timeout=35
    )


def get_json(url):
    return json.loads(get_bytes(url))


def rpc(url, method, params):
    # Cast handles the public RPC's HTTP client requirements; these methods are read-only.
    return json.loads(subprocess.check_output(
        ["cast", "rpc", "--rpc-url", url, method,
         *[p if isinstance(p, str) else json.dumps(p) for p in params]], text=True, timeout=45
    ))


def codehash(code):
    return subprocess.check_output(["cast", "keccak", code], text=True).strip()


def normalized_abi(abi):
    return sorted(json.dumps(entry, sort_keys=True) for entry in abi)


def executable_source(source):
    # Used only for the known comment-only difference in the collector source.
    return re.sub(r"\s+", "", re.sub(r"/\*.*?\*/|//[^\n]*", "", source, flags=re.S))


def executable_runtime(code):
    """Remove only the Solidity 0.8.28 CBOR trailer, retaining every executable byte."""
    raw = bytes.fromhex(code.removeprefix("0x"))
    require(len(raw) > 2, "Missing runtime")
    size = int.from_bytes(raw[-2:], "big")
    require(0 < size < min(512, len(raw) - 2), "Unexpected metadata trailer length")
    metadata = raw[-size - 2:-2]
    require(bytes.fromhex("64736f6c634300081c") in metadata, "Expected solc 0.8.28 metadata")
    return raw[:-size - 2]


def compare_compiled_runtime(url, evidence):
    """Independent compilation check; explorer verification flags are not used here."""
    block = rpc(url, "eth_blockNumber", [])
    escrow = evidence["escrow"]["address"]
    collector = evidence["collector"]["address"]
    usdc = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"

    def call(address, signature):
        selector = subprocess.check_output(["cast", "sig", signature], text=True).strip()
        return rpc(url, "eth_call", [{"to": address, "data": selector}, block])

    def address_result(value):
        require(len(bytes.fromhex(value[2:])) == 32, "Invalid address return value")
        require(int(value, 16) < 2**160, "Address return value has nonzero high bits")
        return "0x" + value[-40:]

    store = address_result(call(escrow, "tokenStoreImplementation()"))
    require(address_result(call(collector, "authCaptureEscrow()")).lower() == escrow.lower(),
            "Collector bound to wrong escrow")
    results = {"chain_id": 84532, "block": int(block, 16), "contracts": {}}
    for name, address, immutable in (("AuthCaptureEscrow", escrow, store),
                                     ("PreApprovalPaymentCollector", collector, escrow),
                                     ("TokenStore", store, escrow)):
        artifact = json.loads((ROOT / f"out/{name}.sol/{name}.json").read_text())
        require(artifact["metadata"]["compiler"]["version"].startswith("0.8.28+"), "Wrong compiler")
        deployed = artifact["deployedBytecode"]
        require(not deployed["linkReferences"], "Unexpected unlinked libraries")
        compiled = bytearray.fromhex(deployed["object"].removeprefix("0x"))
        refs = deployed["immutableReferences"]
        require(len(refs) == 1, f"Unexpected immutable layout: {name}")
        offsets = next(iter(refs.values()))
        executable_size = len(executable_runtime(compiled.hex()))
        for patch in offsets:
            start, size = patch["start"], patch["length"]
            require(size == 32 and start + size <= executable_size, "Invalid immutable offset")
            require(compiled[start:start + size] == bytes(size), "Nonzero immutable placeholder")
            compiled[start:start + size] = int(immutable, 16).to_bytes(size, "big")
        runtime = rpc(url, "eth_getCode", [address, block])
        local_executable = executable_runtime(compiled.hex())
        require(local_executable == executable_runtime(runtime), f"Compiled/deployed executable differs: {name}")
        results["contracts"][name] = {
            "address": address, "immutable_value": immutable, "immutable_offsets": offsets,
            "executable_bytes": len(local_executable), "executable_match": True,
            "full_runtime_keccak256": codehash(runtime),
            "executable_keccak256": codehash("0x" + local_executable.hex()),
            "comparison": "Exact after patching compiler-declared immutables and removing CBOR metadata only"
        }
        print(f"PASS: locally compiled {name} matches deployed executable ({len(local_executable)} bytes)")

    decimals = int(call(usdc, "decimals()"), 16)
    require(decimals == 6, "USDC precision differs")
    symbol = call(usdc, "symbol()")
    data = bytes.fromhex(symbol[2:])
    require(int.from_bytes(data[:32], "big") == 32, "Invalid symbol encoding")
    length = int.from_bytes(data[32:64], "big")
    require(data[64:64 + length] == b"USDC", "Unexpected token symbol")
    token_code = rpc(url, "eth_getCode", [usdc, block])
    require(token_code != "0x", "Missing USDC proxy")
    implementation = address_result(call(usdc, "implementation()"))
    implementation_code = rpc(url, "eth_getCode", [implementation, block])
    require(implementation_code != "0x", "Missing USDC implementation")
    results["usdc"] = {"address": usdc, "decimals": decimals, "symbol": "USDC",
                       "proxy_runtime_keccak256": codehash(token_code),
                       "implementation": implementation,
                       "implementation_runtime_keccak256": codehash(implementation_code),
                       "note": "Circle-issued address independently checked against Circle docs; token is upgradeable"}
    print(f"PASS: Circle test USDC has code, symbol USDC, and 6 decimals at block {int(block, 16)}")
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--online", action="store_true")
    parser.add_argument("--runtime-report", type=Path, help="Write independently compiled runtime evidence (requires --online)")
    args = parser.parse_args()
    require(not args.runtime_report or args.online, "--runtime-report requires --online")
    manifest = json.loads((ROOT / "dependencies.lock.json").read_text())
    for path, expected in manifest["files"].items():
        actual = hashlib.sha256((ROOT / path).read_bytes()).hexdigest()
        require(actual == expected, f"Pinned file changed: {path}")
    abi = json.loads((ROOT / "abi/AuthCaptureEscrow.v1.1.0.json").read_text())
    artifact = ROOT / "out/AuthCaptureEscrow.sol/AuthCaptureEscrow.json"
    require(artifact.exists(), "Run forge build from contracts/ first")
    require(normalized_abi(json.loads(artifact.read_text())["abi"]) == normalized_abi(abi),
            "Compiled CPP ABI differs from verified v1.1.0 ABI")
    print(f"PASS: {len(manifest['files'])} pinned files and complete compiled CPP ABI")
    if not args.online:
        return

    evidence = json.loads(EVIDENCE.read_text())
    rpc_url = os.environ.get("BASE_SEPOLIA_RPC_URL", "https://sepolia.base.org")
    require(int(rpc(rpc_url, "eth_chainId", []), 16) == 84532, "Wrong chain: expected Base Sepolia")
    for key in ("escrow", "collector"):
        expected = evidence[key]
        address = expected["address"]
        runtime = rpc(rpc_url, "eth_getCode", [address, "latest"])
        require(codehash(runtime) == expected["runtime_keccak256"], f"{key}: RPC runtime changed")
        verified = get_json(f"https://base-sepolia.blockscout.com/api/v2/smart-contracts/{address}")
        require(verified["is_verified"], f"{key}: explorer no longer reports verification")
        require(runtime.lower() == verified["deployed_bytecode"].lower(), f"{key}: explorer/RPC differ")
        if key == "escrow":
            require(verified["is_fully_verified"], "Escrow is not fully verified")
            require(normalized_abi(verified["abi"]) == normalized_abi(abi), "Explorer ABI differs")
            sources = {"src/AuthCaptureEscrow.sol": verified["source_code"]}
            sources.update({s["file_path"]: s["source_code"] for s in verified["additional_sources"]})
            for path in (ROOT / "vendor/commerce-payments").rglob("*.sol"):
                upstream_path = str(path.relative_to(ROOT / "vendor/commerce-payments"))
                require(path.read_text() == sources.get(upstream_path), f"Verified source differs: {upstream_path}")
            print("PASS: fully verified escrow, RPC runtime, full ABI, all vendored compilation sources")
        else:
            source = (ROOT / "vendor/commerce-payments/src/collectors/PreApprovalPaymentCollector.sol").read_text()
            require(executable_source(verified["source_code"]) == executable_source(source),
                    "Collector executable source differs")
            print("PASS: collector RPC runtime and executable source; explorer reports partial verification")
    commit = manifest["commerce_payments"]["commit"]
    for path in ("src/AuthCaptureEscrow.sol", "src/TokenStore.sol", "src/collectors/TokenCollector.sol",
                 "src/collectors/PreApprovalPaymentCollector.sol"):
        url = f"https://raw.githubusercontent.com/base/commerce-payments/{commit}/{path}"
        require(get_bytes(url) == (ROOT / "vendor/commerce-payments" / path).read_bytes(),
                f"Pinned upstream commit differs: {path}")
    print(f"PASS: all four CPP sources at {commit}; all network operations were read-only")
    runtime_evidence = compare_compiled_runtime(rpc_url, evidence)
    if args.runtime_report:
        args.runtime_report.write_text(json.dumps(runtime_evidence, indent=2) + "\n")


if __name__ == "__main__":
    main()
