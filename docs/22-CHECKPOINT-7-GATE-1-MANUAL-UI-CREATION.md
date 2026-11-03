# Checkpoint 7 — Gate 1 manual UI creation

**Read-only preflight PASS. Gate 1 NOT EXECUTED.** No real MetaMask connection, signature, transaction hash or newly created order is asserted. No buyer USDC allowance/preapproval/reservation/release, delegation change, deployment, Solidity change or GitHub push was performed.

## Verified preflight

The existing development server responds HTTP 200 at **http://127.0.0.1:5174/**. Open **http://127.0.0.1:5174/#/create** in your normal MetaMask-enabled browser. The runtime frontend configuration and live `gateway.verify()` match Base Sepolia **84532**, operator **0xd798Ec27019Bba2E6411986A2D58ff3D50F8C9c8**, deployment block **53676176**, pinned operator/CPP/collector code and bindings.

Official Base RPC and PublicNode independently agreed at block **53929992**, `0xb17c68a0276c723017ebe3b00e3d2c297945d9a4e11ecde42a7331624ab0bbb0`, **2026-11-03T12:11:07.000Z**:

- Seller native balance: **0.000049812291697244 ETH**, `49812291697244` wei.
- Seller order counter: **2**. Both existing deterministic order IDs were enumerated from storage: original Released (4), duplicate Voided (5). Neither has the fresh draft's fingerprint or matching fresh terms. The next predicted ID has `UnknownOrder()` on both providers.
- Seller account confirmed/pending nonces: **4 / 4**. These are distinct from the seller order counter. No nonce is prescribed for signing; let MetaMask choose current transaction parameters.
- Reserve deadline: **82133 seconds** away at snapshot; release deadline: **254933 seconds** away. Both are sufficiently future for manual testing and within the 30-day contract limit.
- Both providers' read-only direct `createOrder` simulations succeed and return the same predicted ID. No balance/code/storage overrides were used. The direct gas estimate is **288079**, with L2 execution-only estimate **1728474000000 wei** at the observed gas price. This is not a total fee quote: MetaMask must include current L1/L2/relayer costs and check available balance.

This is an onchain snapshot, not proof that no pending relayer call exists. Such a call may not increase the seller account nonce. Check MetaMask Activity and Dealza's Saved transaction panel immediately before submitting. If either shows an unresolved request, reconcile its actual hash instead of creating another order.

[Full two-provider preflight](verification/checkpoint-7/gate-1-preflight.json). Reproduce with `node web/scripts/preflight-ui-gate1.mjs`; it performs only reads/ephemeral simulation and keeps the existing proposed terms. It stops if deadlines need renewal, state disagrees, or matching orders exist. It does not modify drafts or send transactions.

## Exact fresh terms

Keep the existing unsubmitted Checkpoint 6 description and deadlines. Renaming it to Checkpoint 7 would change its fingerprint. This is a fresh proposed order, not reuse of the completed original.

| UI field                          | Exact value                                                          |
| --------------------------------- | -------------------------------------------------------------------- |
| Connected seller                  | `0xF74aD341e10187073a0eef55356D136F1be5E3Cf`                         |
| Buyer’s wallet address            | `0x4f7D38D29172f91F77d3050A9e0F75A1AAe5df25`                         |
| Agreed reviewer’s wallet address  | `0x7F1104F54b3957C2aCE8EEe6EE97489eec51B548`                         |
| Order amount                      | **1** test USDC, `1000000` raw                                       |
| Buyer must reserve by             | **November 4, 2026, 12:00 WAT** = **11:00 UTC**, Unix **1793790000** |
| Payment release & review deadline | **November 6, 2026, 12:00 WAT** = **11:00 UTC**, Unix **1793962800** |
| Platform fee                      | **0 USDC**                                                           |
| Terms fingerprint                 | `0x43f2dcc0b9930bc16b3b0d560a08dd7c00dae3949d2355e22b4387541d73b4c8` |

Exact description:

```text
Dealza Checkpoint 6: fresh UI-only 1 test-USDC checkout; controlled test, no physical delivery.
```

Predicted fresh ID: `0x0267766d20ca737e4c13b696dfb2134c512ca1af13c12848dcf2d985e7c9aedd`. **It does not exist onchain at the snapshot.** The actual ID is established only by the mined `OrderCreated` event and storage; another seller creation can change the prediction before signing.

## User steps — stop at MetaMask review until checks match

1. Open **http://127.0.0.1:5174/#/create** in the same browser/origin where you want the draft retained. Leave any existing completed-order links/drafts intact. If an existing draft differs, back up its fields/link before editing; do not use Clear draft or clear browser storage. If it matches this packet, keep it.
2. Click **Connect wallet**, choose MetaMask and manually connect the seller address above. Open the wallet panel and verify its full address. Choose **Base Sepolia (84532)**; if the app shows another network, use its switch prompt and review that network request yourself. Switching accounts must change the displayed address and restore that account/network's own draft. Return to the seller and Base Sepolia before continuing.
3. Inspect MetaMask Activity and the application's **Saved transaction** notice. Recheck any unresolved existing request before attempting creation. Do not assume an empty recent-history page means no order exists.
4. Enter/review the exact fields above. For a Lagos/WAT browser the date inputs are `2026-11-04T12:00` and `2026-11-06T12:00`. If the device uses another timezone, use the equivalent instants. Click **Save draft**, then **Review order**.
5. In the review panel compare seller, buyer, reviewer, 1 test USDC, both deadlines, 0 fee and the complete fingerprint. Leave the creation button untouched until these fields and the duplicate checks agree.
6. When you decide to execute **Gate 1 only**, click **Create order on Base Sepolia** yourself. In MetaMask review the expected call below. **The agent has stopped before this wallet confirmation.** You alone may confirm after the checks match. Stop if MetaMask asks for buyer USDC approval, an account delegation/implementation change or upgrade, or unrelated calls.
7. After your manual confirmation, retain the transaction hash and the UI result. On success copy the checkout link, open its detail page and refresh once. If the UI says pending/unverified/error, do not submit again: retain the hash and use read-only reconciliation. Provide the hash and, if available, the checkout link/UI result for independent verification.

The automation browser has no injected MetaMask extension. **Genuine connection and wallet switching remain NOT VERIFIED** until you perform these steps in your own MetaMask-enabled browser. Existing unit/adapter checks are not represented as a real MetaMask session.

## Expected creation call

```text
network: Base Sepolia, chainId 84532 (0x14a34)
effective seller: 0xF74aD341e10187073a0eef55356D136F1be5E3Cf
DealzaOperator target: 0xd798Ec27019Bba2E6411986A2D58ff3D50F8C9c8
function: createOrder(address,uint120,uint48,uint48,address,bytes32)
selector: 0x0b0c40bb
native ETH value: 0 (gas is separate)
buyer: 0x4f7D38D29172f91F77d3050A9e0F75A1AAe5df25
amount: 1000000
preApprovalExpiry: 1793790000
expiry: 1793962800
reviewer: 0x7F1104F54b3957C2aCE8EEe6EE97489eec51B548
descriptionHash: 0x43f2dcc0b9930bc16b3b0d560a08dd7c00dae3949d2355e22b4387541d73b4c8
```

[Exact calldata](verification/checkpoint-7/gate-1-preflight.json) and [actual frontend gateway/SDK packet capture](verification/checkpoint-7/frontend-call-capture.json). The capture used a session object without a signer, intercepted the request locally, and rejected it before any wallet confirmation. It was never forwarded to MetaMask or an RPC send endpoint. The SDK omits `value`, which has effective value **zero**. The capture matches the exact reviewed calldata and leaves no pending intent; existing drafts were unchanged. No transaction hash was generated.

MetaMask may route an existing EIP-7702 execution through a relayer/DelegationManager rather than send directly to the operator. The **inner** call must still target this operator with these exact arguments and zero ETH. A relayer's outer sender/destination need not equal seller/operator. Do not change account delegation/implementation configuration or accept an unrelated upgrade or infer success merely from an outer receipt. Stop if you cannot inspect the intended operation or see extra approvals/transfers.

## Verification after the user supplies the hash

Gate 1 stays pending until independent checks pass:

- Retrieve canonical receipt/transaction/block on Base Sepolia, preferably from both independent providers; require genuine successful creation events, not just successful outer status.
- Decode the pinned operator's exact `OrderCreated`. Match effective seller, buyer, reviewer, amount, zero fee terms, description hash and immutable deadlines. Validate the actual order ID, complete stored PaymentInfo and CPP hash.
- Confirm Pending/unfunded state, no buyer token allowance/preapproval/reservation, no USDC movement attributable to this creation and no second matching fresh order. Re-enumerate seller-created IDs, preserving original Released/duplicate Voided states.
- Check the frontend's success message or saved-hash reconciliation, correct detail page/terms, shareable checkout link with matching text fingerprint and restoration after refresh. Directly observe available UI; do not invent user-browser success feedback from the receipt alone.
- If EIP-7702 routed, authorize from genuine exact events and pinned access-controlled state; the outer sender alone is insufficient.

After Gate 1 passes, **stop and prepare Gate 2 separately**. No buyer USDC approval is authorized here.
