# Commerce Payments Protocol research

Pinned [Base CPP v1.1.0](https://github.com/base/commerce-payments/tree/v1.1.0), annotated tag object `942ffdde73417eb831cebf08bd0397b2c39d499f`, commit `6b0a5ef3f0df973857f558e2d6b5dd645b5e97f9`. Relevant sources are vendored unchanged with their minimal compilation closure and original licenses. `contracts/dependencies.lock.json` records 77 file hashes and dependency commits. Updates require renewed review and verification.

## Exact interface inspected before implementation

Dealza imports the upstream contract type directly:

```solidity
struct PaymentInfo {
    address operator;
    address payer;
    address receiver;
    address token;
    uint120 maxAmount;
    uint48 preApprovalExpiry;
    uint48 authorizationExpiry;
    uint48 refundExpiry;
    uint16 minFeeBps;
    uint16 maxFeeBps;
    address feeReceiver;
    uint256 salt;
}

authorize(PaymentInfo calldata paymentInfo, uint256 amount, address tokenCollector, bytes calldata collectorData)
capture(PaymentInfo calldata paymentInfo, uint256 amount, uint256 feeAmount, address feeReceiver)
void(PaymentInfo calldata paymentInfo)
reclaim(PaymentInfo calldata paymentInfo)
refund(PaymentInfo calldata paymentInfo, uint256 amount, address tokenCollector, bytes calldata collectorData)
```

These operations are external with no return values. `authorize`, `capture`, `void`, and `refund` enforce `msg.sender == paymentInfo.operator`. Dealza constructs `operator = address(this)` and calls CPP through restricted methods. Sellers calling CPP directly fail its operator check. No registration or platform signer is required. `reclaim` instead requires the direct payer caller; Dealza cannot relay it.

`getHash(paymentInfo)` equals `keccak256(abi.encode(chainId, escrowAddress, keccak256(abi.encode(PAYMENT_INFO_TYPEHASH, paymentInfo))))`. This is CPP's domain-bound payment hash, not a Dealza EIP-712 release signature. CPP delegates funding consent to its collector.

Only `PreApprovalPaymentCollector` is supported: buyer calls `preApprove(paymentInfo)` for the exact hash and separately grants an ERC20 allowance to the collector. Only escrow can invoke its `collectTokens`. No EIP-3009, Permit2, ERC-6492, relayer, or Dealza signature interface is implemented.

`paymentState(hash)` returns `(bool hasCollectedPayment, uint120 capturableAmount, uint120 refundableAmount)`. One collection per hash is enforced even after void/reclaim. CPP checks the actual TokenStore balance increase. CPP permits partial captures; Dealza exposes only one full capture.

## Expiry and custody semantics

- Authorize requires `now < preApprovalExpiry` and `preApprovalExpiry <= authorizationExpiry <= refundExpiry`.
- Capture requires `now < authorizationExpiry`; at the exact boundary it fails.
- Payer reclaim requires `now >= authorizationExpiry`, including during a Dealza dispute.
- Operator void returns all remaining authorization at any time, including after expiry. It is distinct from payer reclaim.
- Assets stay in CPP's CREATE2 TokenStore per operator. TokenStore only obeys escrow. No duplicate protocol infrastructure is deployed on a network in this checkpoint.
- v1.1 capture takes an **absolute fee amount**, bounded by payment fee basis points. Dealza fixes both bounds and actual fee to zero.
- Refund requires new liquidity, is limited by previous captures/expiry, and cannot claw back seller funds. Dealza has no refund endpoint and sets `refundExpiry = authorizationExpiry`.

## Base Sepolia verification

Read-only RPC confirmed chain `84532`. Blockscout reports full verification for escrow `0xf96815976523E00e65Be8f34cA5e64b4f41EB19c`: solc `0.8.28`, Cancun, optimizer 100000, via IR. Its escrow source exactly matches the pinned tag. The complete compiled ABI matches the explorer ABI, saved at `contracts/abi/AuthCaptureEscrow.v1.1.0.json`. RPC runtime equals explorer runtime byte for byte: 10,978 bytes, keccak256 `0x33558f6cb34733174fdd6ec5ca8257834a8e4302abc08a4542f73ddf07d8702a`.

The existing collector `0xF1F9C408C787B2bC6CAEB91e5BbEc434a5c8d2Ea` is **partially verified** on Blockscout. Its published source differs from the tag in buyer/payer comments only; executable source is identical. RPC runtime equals explorer runtime, keccak256 `0x49757bee314a38822e6f25db499d07edcc18e5a1b32ed6935483a4baa0e8a6e8`. Fork tests assert both runtime hashes and the collector's escrow binding. This is not full collector metadata verification.

The predeployment review additionally reproduced escrow, collector, and TokenStore executable runtime from the pinned local sources. The verifier substitutes only compiler-declared immutable references and removes only trailing Solidity metadata; all executable bytes match deployed code. This resolves executable compatibility independently of the collector's partial explorer status. Fresh evidence and remaining metadata limitations: [predeployment review](06-PREDEPLOY-REVIEW.md), [runtime snapshot](verification/review/runtime.json).

Evidence and source URLs: [verification record](verification/base-sepolia.json). Basescan returned a browser challenge; verification used Blockscout plus RPC. The fork suite uses block **53589971** and existing Circle USDC, whose address is confirmed by [Circle's official testnet list](https://developers.circle.com/stablecoins/usdc-contract-addresses).

Context7 Base docs were consulted for operation semantics and Foundry docs for mappings/forks. Pinned Solidity sources and deployed-contract execution are authoritative for compatibility.
