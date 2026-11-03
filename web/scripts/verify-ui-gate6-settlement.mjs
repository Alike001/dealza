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
const prior = await load("docs/verification/real-ui-gate5/evidence.json");
const protocol = await load("docs/verification/base-sepolia.json");
const proposal = await load(
  "docs/verification/checkpoint-6/fresh-ui-checkout-proposal.json",
);
const { operator, buyer, seller, collector, escrow, usdc } = proposal.addresses;
const id = "0x0267766d20ca737e4c13b696dfb2134c512ca1af13c12848dcf2d985e7c9aedd";
const hash =
  "0x6408f9a480cd2b46927237e3ed7d14052eb49bbaefa2b1e3df65d2275360c023";
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
const out = new URL("docs/verification/real-ui-gate6/", root);
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
  report.release = {
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
  const expectedData = encode(operatorAbi, "release", [id]);
  check(
    expectedData === prior.gate6.transaction.data,
    "Prepared release mismatch",
  );
  const manager = await load(
    "docs/verification/first-live-payment/reservation/delegation-manager-verified.json",
  );
  if (same(tx.to, operator))
    check(
      same(tx.from, buyer) && same(tx.input, expectedData),
      "Wrong direct buyer release",
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
      "Wrong inner release",
    );
    const redeems = receipt.logs
      .filter((l) => same(l.address, manager.address))
      .map((l) => decodeEventLog({ abi: manager.abi, ...l, strict: true }))
      .filter((x) => x.eventName === "RedeemedDelegation");
    check(
      redeems.some((e) => same(e.args.rootDelegator, buyer)),
      "Wrong effective buyer",
    );
    report.release.route = { envelope, innerCallExact: true, redeems };
  }
  const store = await read(clients[0], escrow, escrowAbi, "getTokenStore", [
    operator,
  ]);
  const h =
    "0x146b39003d621a9f7dbfc083bb8ce77c6ddb00022a5a384681114cc6cefcf1e6";
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
  check(relevant.length === 3, "Unexpected release payment events");
  const t = relevant.find((e) => e.eventName === "Transfer"),
    capture = relevant.find((e) => e.eventName === "PaymentCaptured"),
    released = relevant.find((e) => e.eventName === "OrderReleased");
  check(
    t &&
      same(t.address, usdc) &&
      same(t.args, { from: store, to: seller, value: 1000000n }),
    "Wrong settlement transfer",
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
    "Wrong captured payment/fee",
  );
  check(
    released &&
      same(released.address, operator) &&
      same(released.args, { orderId: id, authorizedBy: buyer }),
    "Wrong release authority",
  );
  const transferTopic = keccak256(
    new TextEncoder().encode("Transfer(address,address,uint256)"),
  );
  check(
    receipt.logs.filter((l) => l.topics[0] === transferTopic).length === 1,
    "Unexpected token transfers",
  );
  report.release.relevantEvents = relevant;
  report.release.auxiliaryLogs = receipt.logs.filter(
    (l) => ![operator, collector, escrow, usdc].some((a) => same(a, l.address)),
  );
  async function snapshot(c, blockNumber) {
    const r = (address, abi, fn, args = []) =>
      read(c, address, abi, fn, args, blockNumber);
    const [order, status, paymentState, allowance, balances] =
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
      ]);
    return {
      order,
      status,
      paymentState,
      allowance,
      balances: Object.fromEntries(balances),
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
  check(
    same(report.states.before.order, prior.states.current.order) &&
      report.states.before.status === 2 &&
      same(report.states.before.paymentState, [true, 1000000n, 0n]),
    "Unexpected pre-release state",
  );
  for (const s of [report.states.after, report.states.current])
    check(
      s.order.status === 4 &&
        s.status === 4 &&
        same({ ...s.order, status: 2 }, prior.states.current.order) &&
        s.order.paymentHash === h &&
        same(s.paymentState, [true, 0n, 1000000n]) &&
        s.allowance === 0n &&
        same(s.balances, {
          buyer: 19000000n,
          seller: 2000000n,
          store: 0n,
          operator: 0n,
          collector: 0n,
          escrow: 0n,
        }),
      "Incorrect final settlement state",
    );
  for (const [key, value] of Object.entries(report.states.before.balances))
    check(
      report.states.current.balances[key] ===
        value +
          (key === "seller" ? 1000000n : key === "store" ? -1000000n : 0n),
      "Wrong release balance delta " + key,
    );
  for (const c of clients)
    check(
      (await read(c, escrow, escrowAbi, "getHash", [
        report.states.current.order.payment,
      ])) === h,
      "Wrong payment hash",
    );
  const creation = await load(
    "docs/verification/checkpoint-7-gate-1/evidence.json",
  );
  const history = [],
    approvals = [];
  const approvalTopic = keccak256(
    new TextEncoder().encode("Approval(address,address,uint256)"),
  );
  const addressTopic = (a) => "0x" + a.slice(2).toLowerCase().padStart(64, "0");
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
    const logs = await clients[1].request({
      method: "eth_getLogs",
      params: [
        {
          address: usdc,
          fromBlock: toHex(from),
          toBlock: toHex(to),
          topics: [approvalTopic, addressTopic(buyer), addressTopic(collector)],
        },
      ],
    });
    approvals.push(...logs);
  }
  check(
    history.length === 7 &&
      [
        "OrderCreated",
        "PaymentPreApproved",
        "PaymentAuthorized",
        "OrderFunded",
        "DeliveryNoted",
        "PaymentCaptured",
        "OrderReleased",
      ].every(
        (name) => history.filter((e) => e.eventName === name).length === 1,
      ) &&
      history
        .filter((e) =>
          ["PaymentCaptured", "OrderReleased"].includes(e.eventName),
        )
        .every((e) => e.transactionHash === hash),
    "Unexpected/duplicate lifecycle history",
  );
  report.history = {
    fromBlock: creation.transaction.blockNumber,
    toBlock: bn,
    events: history,
  };
  check(approvals.length === 1, "Unexpected exact-collector approval count");
  const approval = decodeEventLog({
    abi: erc20Abi,
    ...approvals[0],
    strict: true,
  });
  check(
    same(approval.args, { owner: buyer, spender: collector, value: 1000000n }),
    "Wrong Gate 2 approval",
  );
  const approvalHash = approvals[0].transactionHash,
    approvalReceipts = await Promise.all(
      clients.map((c) => c.getTransactionReceipt({ hash: approvalHash })),
    );
  check(
    same(approvalReceipts[0], approvalReceipts[1]) &&
      approvalReceipts[0].status === "success" &&
      !approvalReceipts[0].logs.some((l) => l.topics[0] === transferTopic),
    "Gate 2 receipt disagreement/transfer",
  );
  for (const c of clients) {
    const b = await c.getBlock({
      blockNumber: approvalReceipts[0].blockNumber,
    });
    check(
      b.hash === approvalReceipts[0].blockHash &&
        b.transactions.includes(approvalHash),
      "Gate 2 noncanonical",
    );
  }
  report.gate2 = {
    hash: approvalHash,
    event: approval,
    receipt: approvalReceipts[0],
  };
  report.duplicateRelease = [];
  for (const c of clients) {
    let rejected;
    try {
      await c.simulateContract({
        account: buyer,
        address: operator,
        abi: operatorAbi,
        functionName: "release",
        args: [id],
        blockNumber: bn,
      });
    } catch (e) {
      let cause = e;
      while (cause) {
        if (cause.data?.errorName) {
          rejected = cause.data.errorName;
          break;
        }
        if (typeof cause.data === "string") {
          try {
            rejected = decodeErrorResult({
              abi: operatorAbi,
              data: cause.data,
            }).errorName;
            break;
          } catch {}
        }
        cause = cause.cause;
      }
    }
    check(
      rejected === "InvalidState",
      "Duplicate release did not reject InvalidState",
    );
    report.duplicateRelease.push({ error: rejected, passed: true });
  }
  check(
    (await clients[0].getBlock({ blockNumber: bn })).hash === headers[0].hash,
    "Snapshot reorg",
  );
  report.result = "PASS_GATE_6_SETTLED";
  console.log(
    json({
      result: report.result,
      block: report.block,
      release: {
        hash,
        block: receipt.blockNumber,
        type: tx.type,
        events: relevant,
      },
      current: report.states.current,
      gate2: { hash: approvalHash, event: approval },
      duplicateRelease: report.duplicateRelease,
    }),
  );
} catch (e) {
  report.result = "FAIL_GATE_6";
  report.error = String(e);
  console.error(e);
  process.exitCode = 1;
} finally {
  await writeFile(new URL("evidence.json", out), json(report) + "\n");
}
