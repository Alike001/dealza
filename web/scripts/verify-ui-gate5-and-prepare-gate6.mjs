// Read-only RPC allowlist; ephemeral simulations only. No wallet or signing.
import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import {
  createPublicClient,
  custom,
  erc20Abi,
  encodeFunctionData,
  decodeFunctionData,
  decodeFunctionResult,
  decodeErrorResult,
  decodeEventLog,
  keccak256,
  toHex,
  concat,
  parseAbi,
  getAbiItem,
  toFunctionSignature,
  encodeAbiParameters,
  parseAbiParameters,
} from "viem";
import {
  operatorAbi,
  operatorRuntimeHash,
  collectorAbi,
  escrowAbi,
} from "../src/lib/contracts.generated.ts";
const root = new URL("../../", import.meta.url);
const load = async (p) => JSON.parse(await readFile(new URL(p, root), "utf8"));
const prior = await load("docs/verification/real-ui-gate4/evidence.json");
const protocol = await load("docs/verification/base-sepolia.json");
const proposal = await load(
  "docs/verification/checkpoint-6/fresh-ui-checkout-proposal.json",
);
const { operator, buyer, seller, collector, escrow, usdc } = proposal.addresses;
const id = "0x0267766d20ca737e4c13b696dfb2134c512ca1af13c12848dcf2d985e7c9aedd";
const hash =
  "0x2dec3e64944f1bc6db00051079e8f86edf671d454de99977cdacf3a8b081e0c0";
const json = (x) =>
  JSON.stringify(x, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2);
const canon = (x) =>
  typeof x === "bigint"
    ? x.toString()
    : typeof x === "string"
      ? x.toLowerCase()
      : Array.isArray(x)
        ? x.map(canon)
        : x && typeof x === "object"
          ? Object.fromEntries(
              Object.keys(x)
                .sort()
                .map((k) => [k, canon(x[k])]),
            )
          : x;
const same = (a, b) => json(canon(a)) === json(canon(b));
const check = (ok, msg) => {
  if (!ok) throw Error(msg);
};
function rpc(url, method, params = []) {
  check(
    /^(eth_chainId|eth_blockNumber|eth_getBlockByNumber|eth_getCode|eth_getBalance|eth_getTransactionCount|eth_call|eth_estimateGas|eth_gasPrice|eth_getLogs|eth_getTransactionReceipt|eth_getTransactionByHash|eth_simulateV1)$/.test(
      method,
    ),
    "Forbidden RPC " + method,
  );
  return new Promise((resolve, reject) => {
    const p = spawn("curl", [
      "-4",
      "--fail",
      "--silent",
      "--show-error",
      "--retry",
      "2",
      "--retry-all-errors",
      "--max-time",
      "30",
      url,
      "-H",
      "Content-Type: application/json",
      "--data-binary",
      "@-",
    ]);
    let out = "",
      err = "";
    p.stdout.on("data", (x) => (out += x));
    p.stderr.on("data", (x) => (err += x));
    p.on("error", reject);
    p.on("close", (code) => {
      try {
        if (code) throw Error(err);
        const r = JSON.parse(out);
        if (r.error) throw Object.assign(Error(r.error.message), r.error);
        resolve(r.result);
      } catch (e) {
        reject(e);
      }
    });
    p.stdin.end(JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }));
  });
}
const origins = [
  "https://sepolia.base.org",
  "https://base-sepolia-rpc.publicnode.com",
];
const clients = origins.map((url) =>
  createPublicClient({
    transport: custom(
      { request: ({ method, params }) => rpc(url, method, params) },
      { retryCount: 0 },
    ),
  }),
);
const out = new URL("docs/verification/real-ui-gate5/", root);
await mkdir(out, { recursive: true });
const report = {
  queriedAt: new Date().toISOString(),
  orderId: id,
  rpcOrigins: origins,
  signingPerformed: false,
  broadcastPerformed: false,
  stateOverridesUsed: false,
};
try {
  check(
    (await Promise.all(clients.map((c) => c.getChainId()))).every(
      (x) => x === 84532,
    ),
    "Wrong chain",
  );
  const bn = (await clients[0].getBlockNumber({ cacheTime: 0 })) - 2n;
  const headers = await Promise.all(
    clients.map((c) => c.getBlock({ blockNumber: bn })),
  );
  check(headers[0].hash === headers[1].hash, "Snapshot disagreement");
  report.block = {
    number: bn,
    hash: headers[0].hash,
    utc: new Date(Number(headers[0].timestamp) * 1000).toISOString(),
  };
  const read = (c, address, abi, functionName, args = [], blockNumber = bn) =>
    c.readContract({ address, abi, functionName, args, blockNumber });
  const encode = (abi, functionName, args) =>
    encodeFunctionData({ abi, functionName, args });
  const receipts = await Promise.all(
    clients.map((c) => c.getTransactionReceipt({ hash })),
  );
  const txs = await Promise.all(clients.map((c) => c.getTransaction({ hash })));
  const receipt = receipts[0],
    tx = txs[0];
  check(
    same(receipts[0], receipts[1]) && same(txs[0], txs[1]),
    "Receipt/transaction disagreement",
  );
  check(
    receipt.status === "success" &&
      receipt.blockNumber < bn &&
      tx.chainId === 84532 &&
      tx.value === 0n,
    "Failed/wrong transaction",
  );
  for (const c of clients) {
    const b = await c.getBlock({ blockNumber: receipt.blockNumber });
    check(
      b.hash === receipt.blockHash && b.transactions.includes(hash),
      "Noncanonical receipt",
    );
  }
  report.delivery = {
    receipt,
    transaction: tx,
    confirmations: bn - receipt.blockNumber + 1n,
  };
  report.runtimeChecks = await Promise.all(
    clients.flatMap((c) =>
      [
        [operator, operatorRuntimeHash],
        [collector, protocol.collector.runtime_keccak256],
        [escrow, protocol.escrow.runtime_keccak256],
      ].map(async ([address, expected]) => {
        const actual = keccak256(await c.getCode({ address, blockNumber: bn }));
        check(actual === expected, "Runtime mismatch " + address);
        return { address, actual, expected };
      }),
    ),
  );
  for (const c of clients)
    check(
      same(await read(c, operator, operatorAbi, "COLLECTOR"), collector) &&
        same(await read(c, operator, operatorAbi, "ESCROW"), escrow) &&
        same(await read(c, operator, operatorAbi, "USDC"), usdc) &&
        same(
          await read(c, collector, collectorAbi, "authCaptureEscrow"),
          escrow,
        ),
      "Dependency mismatch",
    );
  const evidenceHash =
    "0x01a8beb04f77d61e4883b5addc28c3e40f1fa61e4219bbe33afe1b42f02c2e6b";
  check(
    prior.gate5.evidenceHash === evidenceHash &&
      keccak256(
        new TextEncoder().encode(
          prior.gate5.evidenceText.normalize("NFC").trim(),
        ),
      ) === evidenceHash,
    "Evidence mismatch",
  );
  const expectedData = encode(operatorAbi, "noteDelivery", [id, evidenceHash]);
  check(
    expectedData === prior.gate5.transaction.data,
    "Prepared delivery calldata mismatch",
  );
  const manager = await load(
    "docs/verification/first-live-payment/reservation/delegation-manager-verified.json",
  );
  if (same(tx.to, operator))
    check(
      same(tx.from, seller) && same(tx.input, expectedData),
      "Wrong direct seller delivery",
    );
  else {
    check(same(tx.to, manager.address), "Unreviewed outer route");
    check(
      same(
        await clients[0].getCode({
          address: manager.address,
          blockNumber: receipt.blockNumber,
        }),
        manager.runtimeBytecode.onchainBytecode,
      ),
      "Manager runtime changed",
    );
    const envelope = decodeFunctionData({ abi: manager.abi, data: tx.input });
    check(
      envelope.functionName === "redeemDelegations" &&
        envelope.args.every((a) => a.length === 1) &&
        BigInt(envelope.args[1][0]) === 0n,
      "Unexpected calls/mode",
    );
    const inner = envelope.args[2][0];
    check(
      same(inner.slice(0, 42), operator) &&
        BigInt("0x" + inner.slice(42, 106)) === 0n &&
        same("0x" + inner.slice(106), expectedData),
      "Wrong inner delivery",
    );
    const redeems = receipt.logs
      .filter((l) => same(l.address, manager.address))
      .map((l) => decodeEventLog({ abi: manager.abi, ...l, strict: true }))
      .filter((x) => x.eventName === "RedeemedDelegation");
    check(
      redeems.some((e) => same(e.args.rootDelegator, seller)),
      "Wrong effective seller",
    );
    report.delivery.route = { envelope, innerCallExact: true, redeems };
  }
  const relevant = receipt.logs
    .filter((l) =>
      [operator, collector, escrow, usdc].some((a) => same(a, l.address)),
    )
    .map((l) => ({
      address: l.address,
      logIndex: l.logIndex,
      ...decodeEventLog({
        abi: same(l.address, operator)
          ? operatorAbi
          : same(l.address, collector)
            ? collectorAbi
            : same(l.address, escrow)
              ? escrowAbi
              : erc20Abi,
        ...l,
        strict: true,
      }),
    }));
  check(
    relevant.length === 1 &&
      same(relevant[0].address, operator) &&
      relevant[0].eventName === "DeliveryNoted" &&
      same(relevant[0].args, { orderId: id, evidenceHash }),
    "Wrong DeliveryNoted or extra payment events",
  );
  const transferTopic = keccak256(
    new TextEncoder().encode("Transfer(address,address,uint256)"),
  );
  check(
    !receipt.logs.some((l) => l.topics[0] === transferTopic),
    "Delivery transferred tokens",
  );
  report.delivery.relevantEvents = relevant;
  report.delivery.auxiliaryLogs = receipt.logs.filter(
    (l) => ![operator, collector, escrow, usdc].some((a) => same(a, l.address)),
  );
  const store = await read(clients[0], escrow, escrowAbi, "getTokenStore", [
    operator,
  ]);
  const h =
    "0x146b39003d621a9f7dbfc083bb8ce77c6ddb00022a5a384681114cc6cefcf1e6";
  async function snapshot(c, blockNumber) {
    const r = (address, abi, fn, args = []) =>
      read(c, address, abi, fn, args, blockNumber);
    const [order, status, paymentState, allowance, balances, accounts] =
      await Promise.all([
        r(operator, operatorAbi, "getOrder", [id]),
        r(operator, operatorAbi, "status", [id]),
        r(escrow, escrowAbi, "paymentState", [h]),
        r(usdc, erc20Abi, "allowance", [buyer, collector]),
        Promise.all(
          Object.entries({
            buyer,
            seller,
            store,
            operator,
            collector,
            escrow,
          }).map(async ([key, a]) => [
            key,
            await r(usdc, erc20Abi, "balanceOf", [a]),
          ]),
        ),
        Promise.all(
          Object.entries({ buyer, seller }).map(async ([key, address]) => [
            key,
            {
              address,
              ethWei: await c.getBalance({ address, blockNumber }),
              code: await c.getCode({ address, blockNumber }),
              nonce: await c.getTransactionCount({ address, blockNumber }),
            },
          ]),
        ),
      ]);
    return {
      order,
      status,
      paymentState,
      allowance,
      balances: Object.fromEntries(balances),
      accounts: Object.fromEntries(accounts),
      tokenStore: store,
    };
  }
  report.states = {};
  for (const [label, b] of [
    ["before", receipt.blockNumber - 1n],
    ["after", receipt.blockNumber],
    ["current", bn],
  ]) {
    const both = await Promise.all(clients.map((c) => snapshot(c, b)));
    check(same(both[0], both[1]), label + " state disagreement");
    report.states[label] = both[0];
  }
  const current = report.states.current,
    p = current.order.payment;
  for (const state of Object.values(report.states))
    check(
      state.order.status === 2 &&
        state.status === 2 &&
        same(state.order, prior.states.current.order) &&
        state.order.paymentHash === h &&
        same(state.paymentState, [true, 1000000n, 0n]) &&
        state.allowance === 0n &&
        same(state.balances, {
          buyer: 19000000n,
          seller: 1000000n,
          store: 1000000n,
          operator: 0n,
          collector: 0n,
          escrow: 0n,
        }),
      "Delivery changed reserved financial state",
    );
  for (const c of clients)
    check(
      (await read(c, escrow, escrowAbi, "getHash", [p])) === h,
      "Wrong stored payment hash",
    );
  const creation = await load(
    "docs/verification/checkpoint-7-gate-1/evidence.json",
  );
  const history = [];
  for (
    let from = BigInt(creation.transaction.blockNumber);
    from <= bn;
    from += 2000n
  ) {
    const to = from + 1999n < bn ? from + 1999n : bn;
    const rows = await Promise.all(
      [
        [operator, operatorAbi, id],
        [escrow, escrowAbi, h],
        [collector, collectorAbi, h],
      ].map(async ([address, abi, key]) => {
        const logs = await clients[1].request({
          method: "eth_getLogs",
          params: [
            {
              address,
              fromBlock: toHex(from),
              toBlock: toHex(to),
              topics: [null, key],
            },
          ],
        });
        return logs.map((l) => {
          check(!l.removed, "Removed event");
          return {
            address,
            transactionHash: l.transactionHash,
            blockNumber: l.blockNumber,
            ...decodeEventLog({ abi, ...l, strict: true }),
          };
        });
      }),
    );
    history.push(...rows.flat());
  }
  check(
    history.length === 5 &&
      [
        "OrderCreated",
        "PaymentPreApproved",
        "PaymentAuthorized",
        "OrderFunded",
        "DeliveryNoted",
      ].every(
        (name) => history.filter((e) => e.eventName === name).length === 1,
      ) &&
      history.find((e) => e.eventName === "DeliveryNoted").transactionHash ===
        hash,
    "Unexpected/duplicate/dispute/settlement history",
  );
  report.history = {
    fromBlock: creation.transaction.blockNumber,
    toBlock: bn,
    events: history,
  };
  report.gate5 = "PASS";
  console.log(
    "Gate 5 chain verification PASS; preparing buyer release simulation",
  );
  // Phase 2 begins after all Gate 5 checks pass.
  check(
    p.authorizationExpiry === 1793962800 &&
      BigInt(p.authorizationExpiry) > headers[0].timestamp,
    "Wrong/expired payment deadline",
  );
  check(
    same(p.payer, buyer) &&
      same(p.receiver, seller) &&
      p.minFeeBps === 0 &&
      p.maxFeeBps === 0,
    "Wrong release parties/fees",
  );
  report.deadline = {
    unix: p.authorizationExpiry,
    utc: new Date(p.authorizationExpiry * 1000).toISOString(),
    secondsRemaining: BigInt(p.authorizationExpiry) - headers[0].timestamp,
  };
  const direct = {
    from: buyer,
    to: operator,
    value: "0x0",
    data: encode(operatorAbi, "release", [id]),
  };
  report.gate6 = {
    transaction: { chainId: "0x14a34", ...direct },
    functionSignature: toFunctionSignature(
      getAbiItem({ abi: operatorAbi, name: "release" }),
    ),
    arguments: [id],
  };
  await clients[0].simulateContract({
    account: buyer,
    address: operator,
    abi: operatorAbi,
    functionName: "release",
    args: [id],
    blockNumber: bn,
  });
  function errorName(e) {
    while (e) {
      if (e.data?.errorName) return e.data.errorName;
      if (typeof e.data === "string") {
        try {
          return decodeErrorResult({ abi: operatorAbi, data: e.data })
            .errorName;
        } catch {}
      }
      e = e.cause;
    }
    return undefined;
  }
  let unauthorized = false;
  try {
    await clients[0].simulateContract({
      account: seller,
      address: operator,
      abi: operatorAbi,
      functionName: "release",
      args: [id],
      blockNumber: bn,
    });
  } catch (e) {
    unauthorized = errorName(e) === "Unauthorized";
  }
  check(unauthorized, "Seller-only release did not reject Unauthorized");
  report.gate6.sellerReleaseRejected = "Unauthorized";
  const reads = [
    [operator, operatorAbi, "getOrder", [id], { ...current.order, status: 4 }],
    [operator, operatorAbi, "status", [id], 4],
    [escrow, escrowAbi, "paymentState", [h], [true, 0n, 1000000n]],
    [usdc, erc20Abi, "allowance", [buyer, collector], 0n],
  ];
  for (const [key, address] of Object.entries({
    buyer,
    seller,
    store,
    operator,
    collector,
    escrow,
  }))
    reads.push([
      usdc,
      erc20Abi,
      "balanceOf",
      [address],
      current.balances[key] +
        (key === "seller" ? 1000000n : key === "store" ? -1000000n : 0n),
    ]);
  async function simulate(call) {
    const request = {
      blockStateCalls: [
        {
          calls: [
            call,
            call,
            ...reads.map(([to, abi, fn, args]) => ({
              from: buyer,
              to,
              data: encode(abi, fn, args),
            })),
          ],
        },
      ],
      validation: false,
    };
    const result = await clients[1].request({
      method: "eth_simulateV1",
      params: [request, toHex(bn)],
    });
    const calls = result[0].calls;
    check(
      calls.length === reads.length + 2 &&
        calls[0].status === "0x1" &&
        calls[1].status === "0x0" &&
        calls.slice(2).every((c) => c.status === "0x1"),
      "Release/duplicate simulation status mismatch",
    );
    const duplicateData =
      calls[1].returnData && calls[1].returnData !== "0x"
        ? calls[1].returnData
        : calls[1].error?.data;
    const duplicateError = decodeErrorResult({
      abi: operatorAbi,
      data: duplicateData,
    });
    check(
      duplicateError.errorName === "InvalidState" && calls[1].logs.length === 0,
      "Duplicate release not rejected InvalidState",
    );
    const logs = calls[0].logs;
    const events = logs.map((l) => ({
      address: l.address,
      ...decodeEventLog({
        abi: same(l.address, operator)
          ? operatorAbi
          : same(l.address, escrow)
            ? escrowAbi
            : erc20Abi,
        ...l,
        strict: true,
      }),
    }));
    check(events.length === 3, "Unexpected release events");
    const t = events.find((e) => e.eventName === "Transfer"),
      capture = events.find((e) => e.eventName === "PaymentCaptured"),
      released = events.find((e) => e.eventName === "OrderReleased");
    check(
      t &&
        same(t.address, usdc) &&
        same(t.args, { from: store, to: seller, value: 1000000n }),
      "Wrong release transfer",
    );
    check(
      capture &&
        same(capture.address, escrow) &&
        same(capture.args, {
          paymentInfoHash: h,
          amount: 1000000n,
          feeAmount: 0n,
          feeReceiver: "0x0000000000000000000000000000000000000000",
        }),
      "Wrong capture/fee",
    );
    check(
      released &&
        same(released.address, operator) &&
        same(released.args, { orderId: id, authorizedBy: buyer }),
      "Wrong release authority",
    );
    const checks = reads.map(
      ([address, abi, functionName, args, expected], i) => {
        const actual = decodeFunctionResult({
          abi,
          functionName,
          data: calls[i + 2].returnData,
        });
        check(same(actual, expected), "Release poststate " + functionName);
        return { address, functionName, args, actual, expected };
      },
    );
    return { request, result, events, checks, duplicateError, passed: true };
  }
  report.gate6.directSimulation = await simulate(direct);
  const delegator = "0x63c0c19a282a1b52b07dd5a65b58948a07dae32b";
  check(
    same(current.accounts.buyer.code, concat(["0xef0100", delegator])),
    "Buyer delegation changed",
  );
  check(
    keccak256(
      await clients[0].getCode({ address: delegator, blockNumber: bn }),
    ) === "0x83805f9ac7395294043b10c3b7c1839b7e4582a3e693028c36df84978b09d4e2",
    "Delegator runtime changed",
  );
  const routed = {
    from: buyer,
    to: buyer,
    value: "0x0",
    data: encode(
      parseAbi([
        "function execute(bytes32 mode,bytes executionCalldata) payable",
      ]),
      "execute",
      [
        toHex(0n, { size: 32 }),
        concat([operator, toHex(0n, { size: 32 }), direct.data]),
      ],
    ),
  };
  report.gate6.delegatedSimulation = await simulate(routed);
  const gas = BigInt(
      await clients[0].request({
        method: "eth_estimateGas",
        params: [direct, toHex(bn)],
      }),
    ),
    routedGas = BigInt(
      await clients[0].request({
        method: "eth_estimateGas",
        params: [routed, toHex(bn)],
      }),
    ),
    gasPrice = await clients[0].getGasPrice();
  const pendingNonce = await clients[0].getTransactionCount({
    address: buyer,
    blockTag: "pending",
  });
  check(
    pendingNonce === current.accounts.buyer.nonce,
    "Pending buyer transaction",
  );
  check(
    current.accounts.buyer.ethWei > routedGas * gasPrice,
    "Insufficient buyer estimated gas",
  );
  report.gate6.gas = {
    directGas: gas,
    delegatedGas: routedGas,
    gasPriceWei: gasPrice,
    estimatedDelegatedExecutionWei: routedGas * gasPrice,
    buyerEthWei: current.accounts.buyer.ethWei,
    pendingNonce,
    caveat:
      "Refresh MetaMask total fees including Base L1 data and actual routing overhead.",
  };
  check(
    (await clients[0].getBlock({ blockNumber: bn })).hash === headers[0].hash,
    "Snapshot reorg",
  );
  report.result = "PASS_GATE_5_READY_GATE_6_CHAIN";
  await writeFile(
    new URL("next-manual-transaction.json", out),
    json({
      transaction: report.gate6.transaction,
      functionSignature: report.gate6.functionSignature,
      arguments: [id],
      paymentHash: h,
      deadline: report.deadline,
      gas: report.gate6.gas,
    }) + "\n",
  );
  console.log(
    json({
      result: report.result,
      block: report.block,
      delivery: {
        hash,
        block: receipt.blockNumber,
        type: tx.type,
        from: tx.from,
        to: tx.to,
        events: relevant,
      },
      current,
      deadline: report.deadline,
      gate6: {
        transaction: report.gate6.transaction,
        gas: report.gate6.gas,
        direct: "PASS",
        delegated: "PASS",
        duplicate: "InvalidState",
      },
    }),
  );
} catch (e) {
  report.result = "NO_GO";
  report.error = String(e);
  console.error(e);
  process.exitCode = 1;
} finally {
  await writeFile(new URL("evidence.json", out), json(report) + "\n");
}
