// Playwright entry point for the six genuine UI checkout receipts.
// Run against the local DEV server on 5174 in an isolated browser context.
// Only identity reads are allowed on the provider. The real gateway rechecks
// canonical receipts and receipt-block effects over public RPC. No signing.
// Poll window.__dealzaUIReplay.done; save to a NEW evidence directory.
async (page) => {
  await page.goto("http://127.0.0.1:5174/");
  return page.evaluate(() => {
    window.__dealzaUIReplay = {
      done: false,
      steps: [],
      providerRequests: [],
      signingPerformed: false,
      broadcastPerformed: false,
      freshWalletCheckout: false,
    };
    (async () => {
      const report = window.__dealzaUIReplay;
      try {
        const { chainGateway: gateway } =
          await import("/src/lib/chainGateway.ts");
        const { beginIntent, pendingIntent } =
          await import("/src/lib/pendingTransaction.ts");
        const { encodeFunctionData, erc20Abi, createPublicClient, http } =
          await import("/node_modules/.vite/deps/viem.js");
        const { operatorAbi, collectorAbi } =
          await import("/src/lib/contracts.generated.ts");
        const { descriptionHash } = await import("/src/lib/domain.ts");
        const { creation, authorization, reservation, delivery, settlement } =
          await import("/scripts/ui-replay-evidence.mjs");
        const { network, rpcUrl, chain } = await import("/src/lib/config.ts");
        const reader = createPublicClient({ chain, transport: http(rpcUrl) });
        const id = settlement.orderId;
        const payment = creation.states.after.order.payment;
        const actorFor = (action) =>
          ["create", "delivery"].includes(action)
            ? payment.receiver
            : payment.payer;
        const terms = {
          buyer: payment.payer,
          reviewer: creation.states.after.order.reviewer,
          amount: BigInt(payment.maxAmount),
          fundingCutoff: payment.preApprovalExpiry,
          expiry: payment.authorizationExpiry,
          description:
            "Dealza Checkpoint 6: fresh UI-only 1 test-USDC checkout; controlled test, no physical delivery.",
        };
        const snapshot = async (state, block, preApproved) => ({
          id,
          order: {
            ...state.order,
            payment: {
              ...state.order.payment,
              maxAmount: BigInt(payment.maxAmount),
              salt: BigInt(payment.salt),
            },
          },
          derived: state.status,
          collected: state.paymentState[0],
          held: BigInt(state.paymentState[1]),
          captured: BigInt(state.paymentState[2]),
          allowance: BigInt(state.allowance),
          preApproved,
          buyerBalance: BigInt(state.balances.buyer),
          buyerGas: BigInt(
            state.buyerETHWei ??
              state.buyerEthWei ??
              state.accounts?.buyer?.ethWei ??
              creation.states.after.buyerETHWei,
          ),
          tokenStore: state.tokenStore,
          storeBalance: BigInt(state.balances.store),
          chainTime: Number(
            (await reader.getBlock({ blockNumber: BigInt(block) })).timestamp,
          ),
          block: BigInt(block),
        });
        const rows = [
          ["create", creation.transaction.hash, undefined],
          [
            "approve",
            settlement.gate2.hash,
            await snapshot(creation.states.after, 53979602, false),
          ],
          [
            "preApprove",
            authorization.authorization.receipt.transactionHash,
            await snapshot(authorization.beforeAuthorization, 53987355, false),
          ],
          [
            "fund",
            reservation.reservation.receipt.transactionHash,
            await snapshot(reservation.states.before, 53991658, true),
          ],
          [
            "delivery",
            delivery.delivery.receipt.transactionHash,
            await snapshot(delivery.states.before, 54002281, true),
          ],
          [
            "release",
            settlement.release.receipt.transactionHash,
            await snapshot(settlement.states.before, 54007443, true),
          ],
        ];
        const proof = delivery.delivery.relevantEvents.find(
          (event) => event.eventName === "DeliveryNoted",
        ).args.evidenceHash;
        for (const [action, hash, before] of rows) {
          const actor = actorFor(action);
          if (pendingIntent(actor, payment.operator))
            throw Error("Isolated replay context already has a pending intent");
          const target =
            action === "approve" ? payment.token : payment.operator;
          // The pinned collector is read from the production config.
          const exactTarget =
            action === "preApprove" ? network.collector : target;
          const abi =
            action === "approve"
              ? erc20Abi
              : action === "preApprove"
                ? collectorAbi
                : operatorAbi;
          const functionName =
            action === "create"
              ? "createOrder"
              : action === "delivery"
                ? "noteDelivery"
                : action;
          const args =
            action === "create"
              ? [
                  terms.buyer,
                  terms.amount,
                  terms.fundingCutoff,
                  terms.expiry,
                  terms.reviewer,
                  descriptionHash(terms.description),
                ]
              : action === "approve"
                ? [network.collector, terms.amount]
                : action === "preApprove"
                  ? [before.order.payment]
                  : action === "fund"
                    ? [id, before.order.payment]
                    : action === "delivery"
                      ? [id, proof]
                      : [id];
          beginIntent({
            version: 1,
            actor,
            operator: payment.operator,
            target: exactTarget,
            data: encodeFunctionData({ abi, functionName, args }),
            action,
            before,
            terms: action === "create" ? terms : undefined,
            proof:
              action === "create" ? descriptionHash(terms.description) : proof,
            hash,
          });
          const session = {
            account: actor,
            chainId: 84532,
            provider: {
              request: async ({ method }) => {
                report.providerRequests.push(method);
                if (method === "eth_accounts") return [actor];
                if (method === "eth_chainId") return "0x14a34";
                throw Error(
                  "Signing and sending forbidden in historical replay: " +
                    method,
                );
              },
            },
          };
          const updates = [];
          await gateway.resumePending(session, (state) => updates.push(state));
          if (
            !updates.some((state) => state.phase === "confirmed") ||
            pendingIntent(actor, payment.operator)
          )
            throw Error("Receipt was not reconciled");
          report.steps.push({ action, hash, updates });
        }
        report.current = await gateway.loadOrder(id);
        if (
          report.current.order.status !== 4 ||
          report.current.held !== 0n ||
          report.current.captured !== 1000000n
        )
          throw Error("Unexpected final settlement");
        report.result = "PASS";
      } catch (error) {
        report.result = "FAIL";
        report.error = String(error);
      }
      report.done = true;
    })();
    return { started: true, mode: "READ_ONLY_REAL_UI_RECEIPT_REPLAY" };
  });
};
