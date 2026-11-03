# Transaction 3 verified; Transaction 4 prepared

**GO for Transaction 4 only: manual reservation of exactly 1 test USDC for the original order.** No signing, broadcasting, persistent fund reservation, Solidity modification, deployment or GitHub push was performed.

Verified snapshot: Base Sepolia **53868481**, `0x74ef746997b771ed2bc2410fdec703ee35121311cb6e68c52a638e8f63ca804b`, **2026-11-03T08:46:05.000Z**. PublicNode and the official Base Sepolia RPC agree on receipt/logs, canonical block, exact stored orders, CPP state, pre-approval, allowance and buyer balances. Both independently simulated the direct reservation successfully. [Full evidence](verification/buyer-reservation/evidence.json).

Final live refresh at **2026-11-03T08:48:26.000Z**, block **53869188**, reconfirmed buyer balances, exact allowance/pre-approval, Pending/unfunded original, Voided duplicate and both exact direct/delegated `eth_call` successes. [Refresh evidence](verification/buyer-reservation/final-refresh.json).

## Transaction 3 and corrected transaction hash

The supplied hash has **62 hex digits (31 bytes)** and is invalid as a transaction hash. It omits `ef` between `...c78cf` and `7549...`. Independently queried the entire supplied block **53865872** and its collector logs, found the unique exact-payment pre-approval, and verified this complete canonical transaction on both RPCs:

`0x78cd5930a57b51edccb09a54c6c8e6edd8e85c6c78cfef7549bb9d280a26ba70`

[Transaction explorer](https://base-sepolia.blockscout.com/tx/0x78cd5930a57b51edccb09a54c6c8e6edd8e85c6c78cfef7549bb9d280a26ba70). Receipt status **success**, block hash `0xd362d5092a412a353627a2c84d3778f0166099a82f33c95569ecd1ebe0a8da0d`, **2610 confirmations** at the snapshot. The outer transaction is EIP-1559, sender `0xb01caea8c6c47bbf4f4b4c5080ca642043359c2e`, destination `0xdb9b1e94b5b69df7e401ddbede43491141047db3` (delegation manager). The effective collector caller is established by the genuine event plus the deployed collector's payer access check; outer sender need not equal buyer. This transaction uses the buyer's existing delegation and is not itself type 4.

Decoded log, **logIndex 1**:

```text
emitter: 0xF1F9C408C787B2bC6CAEB91e5BbEc434a5c8d2Ea
event: PaymentPreApproved(bytes32 indexed paymentInfoHash)
paymentInfoHash: 0xa10594af1b0f41399573bb2c493a03df0736cf8ff8b96bdfb1cf007da0996b59
data: 0x
```

The receipt has no USDC Transfer events. Direct onchain `isPreApproved(paymentHash)` is **true**. Both onchain `getHash(stored PaymentInfo)` and independent local CPP hashing match the exact event/payment hash, including chain 84532 and escrow address. The complete original order matches its prior snapshot in every field.

## Current state and deadline

| Check | Verified result |
|---|---|
| Buyer | `0x4f7D38D29172f91F77d3050A9e0F75A1AAe5df25` |
| Buyer USDC | **21 USDC** / `21000000` raw |
| Buyer ETH | **0.0001 ETH** / `100000000000000` wei |
| Collector allowance | **exactly 1000000 raw USDC** |
| Original order | `0x610384701397935f144496cca9496417e029c7d9089f019993da4373a618769f`; stored/derived **Pending (1)** |
| Original CPP state | `(hasCollectedPayment=false, capturableAmount=0, refundableAmount=0)` |
| Original pre-approval | **true**, exact payment hash `0xa10594af1b0f41399573bb2c493a03df0736cf8ff8b96bdfb1cf007da0996b59` |
| Duplicate order | `0x808f178c3b45536f8ff74e05d8ae13392f0a8ce7330985b4f865b0e27ed51a97`; stored/derived **Voided (5)** |
| Duplicate CPP state / pre-approval | `(false,0,0)` / false |
| Seller USDC | `0` raw |
| CPP operator TokenStore | `0x57EC2910410C3Ef888c6127A3684d04171D5a11a`; **0 USDC** |
| Operator USDC | 0 |
| Reservation deadline | **November 3, 2026, 17:00 UTC / 18:00 WAT**; Unix **1793725200** |
| Deadline time remaining at snapshot | 29635 seconds |
| Authorization/refund expiry | November 5, 2026, 17:00 UTC; Unix 1793898000 |
| Buyer nonce / pending nonce | 1 / 1 |

The complete event scan from deployment block 53676176 contains two OrderCreated events, the duplicate OrderVoided, and the original PaymentPreApproved; no funding, capture, release or other payment lifecycle events for either hash. The deadline is strict: reservation must be mined **before** 17:00 UTC; a transaction at the deadline reverts.

## Exact Transaction 4 and official interface

[Prepared transaction, full arguments, direct and self-execution calldata](verification/buyer-reservation/next-manual-transaction.json).

```text
network: Base Sepolia
chainId: 84532 (0x14a34)
sender/effective payer: 0x4f7D38D29172f91F77d3050A9e0F75A1AAe5df25
contract: 0xd798Ec27019Bba2E6411986A2D58ff3D50F8C9c8 (DealzaOperator)
function: fund(bytes32,(address,address,address,address,uint120,uint48,uint48,uint48,uint16,uint16,address,uint256))
value: 0 wei
orderId: 0x610384701397935f144496cca9496417e029c7d9089f019993da4373a618769f
paymentHash: 0xa10594af1b0f41399573bb2c493a03df0736cf8ff8b96bdfb1cf007da0996b59
estimated gas: 144284 (direct); 150936 (buyer self-execution)
observed gas price: 6000000 wei
estimated direct execution cost: 865704000000 wei
```

Exact direct calldata (**420 bytes**, selector `0xb5d6529c`):

```text
0xb5d6529c610384701397935f144496cca9496417e029c7d9089f019993da4373a618769f000000000000000000000000d798ec27019bba2e6411986a2d58ff3d50f8c9c80000000000000000000000004f7d38d29172f91f77d3050a9e0f75a1aae5df25000000000000000000000000f74ad341e10187073a0eef55356d136f1be5e3cf000000000000000000000000036cbd53842c5426634e7929541ec2318f3dcf7e00000000000000000000000000000000000000000000000000000000000f4240000000000000000000000000000000000000000000000000000000006aea1310000000000000000000000000000000000000000000000000000000006aecb610000000000000000000000000000000000000000000000000000000006aecb610000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000610384701397935f144496cca9496417e029c7d9089f019993da4373a618769f
```

Already-approved PaymentInfo, in ABI tuple order:

```json
[
  "0xd798Ec27019Bba2E6411986A2D58ff3D50F8C9c8",
  "0x4f7D38D29172f91F77d3050A9e0F75A1AAe5df25",
  "0xF74aD341e10187073a0eef55356D136F1be5E3Cf",
  "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  "1000000",
  1793725200,
  1793898000,
  1793898000,
  0,
  0,
  "0x0000000000000000000000000000000000000000",
  "43880560905866266055948392929988289598113490721418948285209098488899572364959"
]
```

The deployed operator calls escrow `0xf96815976523E00e65Be8f34cA5e64b4f41EB19c` using the exact official CPP **v1.1.0** interface:

```text
authorize((address,address,address,address,uint120,uint48,uint48,uint48,uint16,uint16,address,uint256),uint256,address,bytes)
authorize(exactPaymentInfo, 1000000, 0xF1F9C408C787B2bC6CAEB91e5BbEc434a5c8d2Ea, 0x)
```

The wallet calls **operator fund**, because CPP `authorize` requires `msg.sender == paymentInfo.operator`. Full internal calldata and exact ABI entries are retained in evidence. [Official authorization source](https://github.com/base/commerce-payments/blob/v1.1.0/src/AuthCaptureEscrow.sol), [official collector source](https://github.com/base/commerce-payments/blob/v1.1.0/src/collectors/PreApprovalPaymentCollector.sol). Pinned commit `6b0a5ef3f0df973857f558e2d6b5dd645b5e97f9`; fresh official source, full ABI, and independently compiled deployed executable checks passed. Collector explorer verification is partial; its executable source/runtime was independently verified. [Provenance](verification/buyer-reservation/source-provenance.json), [protocol checks](verification/buyer-reservation/protocol-verification.txt), [runtime proof](verification/buyer-reservation/protocol-runtime.json).

## Simulations and custody proof

`eth_call` for the exact direct `fund` passed on both RPCs. Two full `eth_simulateV1` sequences passed on PublicNode: direct buyer → operator, and buyer → its current EIP-7702 implementation → operator. No state, balance or code overrides were used. No new delegation authorization or signatures were created. Simulation is ephemeral and did not reserve onchain funds.

The actual buyer account code is `0xef010063c0c19a282a1b52b07dd5a65b58948a07dae32b`; implementation `0x63c0c19a282a1b52b07dd5a65b58948a07dae32b`, pinned runtime hash `0x83805f9ac7395294043b10c3b7c1839b7e4582a3e693028c36df84978b09d4e2`. The existing verified implementation's `execute(bytes32,bytes)` uses single/default mode zero and packed `operator || uint256(0) || exact fund calldata`. Full self-execution transaction and gas estimate are in prepared JSON. Unknown future relayer/signature envelopes are outside these simulations.

Both paths emitted exactly the expected `PaymentAuthorized`, USDC `Transfer`, and `OrderFunded` events and passed every subsequent state assertion:

| Effect | Simulated result |
|---|---|
| Transfer | exactly **1,000,000 raw USDC**, buyer → CPP TokenStore `0x57EC2910410C3Ef888c6127A3684d04171D5a11a` |
| Buyer USDC | 21 → **20 USDC** |
| TokenStore USDC | 0 → **1 USDC** |
| Seller USDC | **0 → 0** |
| Operator USDC | **0 → 0** |
| Allowance | 1,000,000 → **0** |
| Original order | Pending → **Reserved (2)**; all other fields unchanged |
| CPP payment state | **(true,1000000,0)** |
| Original pre-approval | remains true (official collector does not clear it) |
| Duplicate | complete order unchanged, **Voided**, `(false,0,0)`, pre-approval false |

CPP authorization places tokens in its operator-specific TokenStore custody; the receiver field does not trigger payment to the seller during reservation. The source explicitly uses `safeTransferFrom(payer, tokenStore, amount)` and CPP checks that TokenStore balance increased by exactly amount. Gas estimates are refreshed estimates, not fixed limits; MetaMask must include current Base L1 data fees and any actual routing costs. Buyer ETH exceeds both estimated execution costs, with total wallet fee review still required.

## Exact next manual MetaMask action

1. Open the [verified operator write interface](https://base-sepolia.blockscout.com/address/0xd798Ec27019Bba2E6411986A2D58ff3D50F8C9c8?tab=contract), connect buyer `0x4f7D38D29172f91F77d3050A9e0F75A1AAe5df25` on **Base Sepolia (84532)**, select **fund**.
2. Enter the original order ID and the **complete exact PaymentInfo tuple above**, or prepare the exact direct calldata from JSON. Set **0 ETH**. Submit **one reservation request** to MetaMask.
3. In MetaMask confirm effective buyer, operator target, `fund` selector, exact original order/tuple, test-USDC token `0x036CbD53842c5426634e7929541eC2318f3dCF7e`, **1 USDC**, and CPP TokenStore custody. Confirm refreshed total fee is affordable and the transaction can be mined before **17:00 UTC November 3**. Use current wallet nonce and gas; no historical gas or nonce is prescribed.
4. If MetaMask routes through the existing delegated buyer, decode and match the inner call to this exact operator/calldata/value. A different outer sender or delegation-manager destination can be legitimate, but an unknown envelope is not proven by the direct/self-execution simulations. Stop if the inner call cannot be checked, there are additional calls, an extra token approval, a changed amount/recipient/tuple, or a new delegation/upgrade request.
5. Manually confirm only that single matching reservation. Stop after it and retain its transaction hash for independent verification. Do not retry based solely on the UI: require canonical successful receipt, genuine CPP `PaymentAuthorized` and operator `OrderFunded` for this hash/order, the exact USDC custody transfer, Reserved status and CPP `(true,1000000,0)`. An outer successful receipt alone does not prove reservation.

Reproduce: `node web/scripts/verify-buyer-reservation.mjs`. [Output](verification/buyer-reservation/read-only-check.txt). The verifier has no wallet client, private key, signing, broadcast or persistent mutation methods. This report and evidence are preserved in a focused local Git commit; pre-existing unrelated work is retained outside that commit.
