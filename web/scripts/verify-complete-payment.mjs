// Read-only public RPC evidence. No wallet, signer, broadcast, or overrides.
import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import {
  createPublicClient,
  custom,
  erc20Abi,
  decodeEventLog,
  decodeFunctionData,
  encodeFunctionData,
  decodeErrorResult,
  toHex,
  keccak256,
} from "viem";
import {
  operatorAbi,
  operatorRuntimeHash,
  collectorAbi,
  escrowAbi,
} from "../src/lib/contracts.generated.ts";
const root = new URL("../../", import.meta.url);
const out = new URL("docs/verification/first-live-payment/settlement/", root);
const load = async (p) => JSON.parse(await readFile(new URL(p, root), "utf8"));
const json = (x) =>
  JSON.stringify(x, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2);
const canonical = (x) =>
  typeof x === "bigint"
    ? x.toString()
    : Array.isArray(x)
      ? x.map(canonical)
      : x && typeof x === "object"
        ? Object.fromEntries(
            Object.keys(x)
              .sort()
              .map((k) => [k, canonical(x[k])]),
          )
        : x;
const same = (a, b) =>
  json(canonical(a)).toLowerCase() === json(canonical(b)).toLowerCase();
const check = (ok, msg) => {
  if (!ok) throw Error(msg);
};
const prior = await load(
  "docs/verification/checkout-continuation/snapshot.json",
);
const delivery = await load(
  "docs/verification/first-live-payment/delivery-release/evidence.json",
);
const protocol = await load("docs/verification/base-sepolia.json");
const manager = await load(
  "docs/verification/first-live-payment/reservation/delegation-manager-verified.json",
);
const { buyer, seller, operator, collector, escrow, usdc } = prior;
const id = prior.original.id,
  paymentHash = prior.original.paymentHash,
  tokenStore = delivery.tokenStore;
const origins = [
  "https://base-sepolia-rpc.publicnode.com",
  "https://sepolia.base.org",
];
// curl -4 avoids this host's failing Node dual-stack connections. Input uses stdin.
async function rpc(url, method, params = []) {
  check(
    /^(eth_chainId|eth_blockNumber|eth_getBlockByNumber|eth_getTransactionReceipt|eth_getTransactionByHash|eth_getCode|eth_call|eth_getLogs)$/.test(
      method,
    ),
    "Non-read RPC method rejected",
  );
  return new Promise((resolve, reject) => {
    const child = spawn("curl", [
      "-4",
      "--silent",
      "--show-error",
      "--max-time",
      "20",
      "--retry",
      "2",
      url,
      "-H",
      "Content-Type: application/json",
      "--data-binary",
      "@-",
    ]);
    let stdout = "",
      stderr = "";
    child.stdout.on("data", (x) => (stdout += x));
    child.stderr.on("data", (x) => (stderr += x));
    child.on("error", reject);
    child.on("close", (code) => {
      try {
        if (code) throw Error("RPC transport " + url + ": " + stderr);
        const r = JSON.parse(stdout);
        if (r.error) {
          const e = Error(r.error.message);
          Object.assign(e, r.error);
          reject(e);
        } else resolve(r.result);
      } catch (e) {
        reject(e);
      }
    });
    child.stdin.end(JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }));
  });
}
const clients = origins.map((url) =>
  createPublicClient({
    transport: custom(
      { request: ({ method, params }) => rpc(url, method, params) },
      { retryCount: 0 },
    ),
  }),
);
const hashes = [
  prior.creationProofs[0].transactionHash,
  "0x3095767bde9c695c83daf53c7fc78965559d69496ee2435612b1a873b84c782e",
  "0x78cd5930a57b51edccb09a54c6c8e6edd8e85c6c78cfef7549bb9d280a26ba70",
  "0xd59acd2377d61f58f4dbe3d483f0dc75613d145f0484f8f665b0c8279a0c0e08",
  "0xacfb28da439caa95bc7d40172d01d83b20f9da64c182d4dcb073a5c3cbaad786",
  "0x63f302e19c08ffae721c7b9705e322eb331132b5216dd05256a6a4789f472c53",
];
let report = {
  queriedAt: new Date().toISOString(),
  rpcOrigins: origins,
  chainId: 84532,
  addresses: { buyer, seller, operator, collector, escrow, usdc, tokenStore },
  orderId: id,
  paymentHash,
  transactions: [],
  checks: [],
  signingPerformed: false,
  broadcastPerformed: false,
  stateOverridesUsed: false,
};
await mkdir(out, { recursive: true });
try {
  for (const c of clients)
    check((await c.getChainId()) === 84532, "Wrong chain");
  const head = (await clients[0].getBlockNumber({ cacheTime: 0 })) - 2n;
  const header = await clients[0].getBlock({ blockNumber: head });
  check(
    (await clients[1].getBlock({ blockNumber: head })).hash === header.hash,
    "Head disagreement",
  );
  report.block = {
    number: head,
    hash: header.hash,
    utc: new Date(Number(header.timestamp) * 1000).toISOString(),
  };
  const artifact = await load(
    "contracts/out/DealzaOperator.sol/DealzaOperator.json",
  );
  check(
    same(artifact.abi, operatorAbi) &&
      keccak256(artifact.deployedBytecode.object) === operatorRuntimeHash,
    "Operator artifact mismatch",
  );
  report.runtimeChecks = [];
  for (const [i, c] of clients.entries())
    for (const [address, expected] of [
      [operator, operatorRuntimeHash],
      [escrow, protocol.escrow.runtime_keccak256],
      [collector, protocol.collector.runtime_keccak256],
    ]) {
      const actual = keccak256(await c.getCode({ address, blockNumber: head }));
      check(actual === expected, "Runtime mismatch");
      report.runtimeChecks.push({ rpc: origins[i], address, expected, actual });
    }
  const read = (c, bn, address, abi, functionName, args = []) =>
    c.readContract({ address, abi, functionName, args, blockNumber: bn });
  async function snapshot(c, bn) {
    const balances = Object.fromEntries(
      await Promise.all(
        Object.entries({
          buyer,
          seller,
          tokenStore,
          operator,
          collector,
          escrow,
        }).map(async ([k, a]) => [
          k,
          await read(c, bn, usdc, erc20Abi, "balanceOf", [a]),
        ]),
      ),
    );
    const orders = Object.fromEntries(
      await Promise.all(
        ["original", "duplicate"].map(async (k) => {
          const oid = prior[k].id;
          if (
            bn <
            BigInt(prior.creationProofs[k === "original" ? 0 : 1].blockNumber)
          )
            return [k, { id: oid, exists: false }];
          const order = await read(c, bn, operator, operatorAbi, "getOrder", [
            oid,
          ]);
          return [
            k,
            {
              id: oid,
              order,
              status: await read(c, bn, operator, operatorAbi, "status", [oid]),
              paymentState: await read(
                c,
                bn,
                escrow,
                escrowAbi,
                "paymentState",
                [order.paymentHash],
              ),
              preApproved: await read(
                c,
                bn,
                collector,
                collectorAbi,
                "isPreApproved",
                [order.paymentHash],
              ),
            },
          ];
        }),
      ),
    );
    return {
      blockNumber: bn,
      balances,
      orders,
      allowance: await read(c, bn, usdc, erc20Abi, "allowance", [
        buyer,
        collector,
      ]),
      tokenStore: await read(c, bn, escrow, escrowAbi, "getTokenStore", [
        operator,
      ]),
    };
  }
  const abiFor = (a) =>
    same(a, operator)
      ? operatorAbi
      : same(a, escrow)
        ? escrowAbi
        : same(a, collector)
          ? collectorAbi
          : same(a, usdc)
            ? erc20Abi
            : same(a, manager.address)
              ? manager.abi
              : undefined;
  for (const [index, hash] of hashes.entries()) {
    const receipts = await Promise.all(
      clients.map((c) => c.getTransactionReceipt({ hash })),
    );
    check(
      same(receipts[0], receipts[1]) && receipts[0].status === "success",
      "Receipt disagreement/failure",
    );
    const r = receipts[0];
    const blocks = await Promise.all(
      clients.map((c) => c.getBlock({ blockNumber: r.blockNumber })),
    );
    check(
      blocks.every((b) => b.hash === r.blockHash),
      "Canonical block disagreement",
    );
    const txs = await Promise.all(
      clients.map((c) => c.getTransaction({ hash })),
    );
    check(same(txs[0], txs[1]), "Transaction disagreement");
    const decodedLogs = r.logs.map((l) => ({
      address: l.address,
      logIndex: l.logIndex,
      ...(abiFor(l.address)
        ? decodeEventLog({ abi: abiFor(l.address), ...l, strict: true })
        : { eventName: "Auxiliary wallet event; raw log retained" }),
    }));
    const states = await Promise.all(
      clients.map(async (c) => ({
        before: await snapshot(c, r.blockNumber - 1n),
        after: await snapshot(c, r.blockNumber),
      })),
    );
    check(same(states[0], states[1]), "Historical state disagreement");
    report.transactions.push({
      number: index + 1,
      hash,
      receipts,
      transaction: txs[0],
      minedTime: new Date(Number(blocks[0].timestamp) * 1000).toISOString(),
      confirmations: head - r.blockNumber + 1n,
      decodedLogs,
      historical: states[0],
    });
    console.error("Verified transaction", index + 1, hash);
  }
  const release = report.transactions[5],
    r = release.receipts[0],
    tx = release.transaction;
  check(r.blockNumber === 53885645n, "Unexpected release block");
  const expectedData = encodeFunctionData({
    abi: operatorAbi,
    functionName: "release",
    args: [id],
  });
  check(tx.chainId === 84532 && tx.value === 0n, "Wrong chain/value");
  if (same(tx.to, manager.address)) {
    check(
      same(
        await clients[0].getCode({
          address: manager.address,
          blockNumber: r.blockNumber,
        }),
        manager.runtimeBytecode.onchainBytecode,
      ),
      "Manager code mismatch",
    );
    const env = decodeFunctionData({ abi: manager.abi, data: tx.input });
    check(
      env.functionName === "redeemDelegations" &&
        env.args.every((a) => a.length === 1) &&
        BigInt(env.args[1][0]) === 0n,
      "Unexpected execution envelope",
    );
    const exec = env.args[2][0];
    check(
      same(exec.slice(0, 42), operator) &&
        BigInt("0x" + exec.slice(42, 106)) === 0n &&
        same("0x" + exec.slice(106), expectedData),
      "Wrong inner release call",
    );
    release.decodedEnvelope = env;
  } else
    check(
      same(tx.from, buyer) &&
        same(tx.to, operator) &&
        same(tx.input, expectedData),
      "Unknown release route",
    );
  const events = release.decodedLogs;
  const expected = [
    ["PaymentCaptured", escrow],
    ["TokenStoreCreated", escrow],
    ["Transfer", usdc],
    ["OrderReleased", operator],
  ];
  const financial = events.filter((e) =>
    [operator, escrow, usdc, collector, tokenStore].some((a) =>
      same(a, e.address),
    ),
  );
  check(
    financial.length === 4 &&
      expected.every(
        ([n, a], i) =>
          financial[i].eventName === n && same(financial[i].address, a),
      ),
    "Unexpected settlement events",
  );
  const [captured, created, transfer, released] = financial;
  check(
    same(created.args.operator, operator) &&
      same(created.args.tokenStore, tokenStore),
    "Wrong TokenStore deployment",
  );
  check(
    captured.args.paymentInfoHash === paymentHash &&
      captured.args.amount === 1000000n &&
      captured.args.feeAmount === 0n &&
      BigInt(captured.args.feeReceiver) === 0n,
    "Capture mismatch",
  );
  check(
    same(transfer.args.from, tokenStore) &&
      same(transfer.args.to, seller) &&
      transfer.args.value === 1000000n,
    "Transfer mismatch",
  );
  check(
    released.args.orderId === id && same(released.args.authorizedBy, buyer),
    "Buyer authorization mismatch",
  );
  const currents = await Promise.all(clients.map((c) => snapshot(c, head)));
  check(same(currents[0], currents[1]), "Current state disagreement");
  report.current = currents[0];
  const before = release.historical.before;
  check(
    same(before.orders.original, delivery.current.orders.original) &&
      same(before.balances, delivery.current.balances),
    "Pre-release state changed",
  );
  for (const state of [release.historical.after, report.current]) {
    check(
      same(state.balances, {
        buyer: 20000000n,
        seller: 1000000n,
        tokenStore: 0n,
        operator: 0n,
        collector: 0n,
        escrow: 0n,
      }) &&
        state.allowance === 0n &&
        same(state.tokenStore, tokenStore),
      "Unexpected final balances",
    );
    check(
      state.orders.original.status === 4 &&
        state.orders.original.order.status === 4 &&
        same(state.orders.original.paymentState, [true, 0n, 1000000n]),
      "Not released",
    );
    check(
      same(state.orders.original.order, {
        ...before.orders.original.order,
        status: 4,
      }),
      "Changed payment terms",
    );
    check(
      same(state.orders.duplicate, delivery.current.orders.duplicate) &&
        state.orders.duplicate.status === 5,
      "Duplicate changed",
    );
  }
  for (const c of clients) {
    check(
      (await read(c, head, escrow, escrowAbi, "getHash", [
        report.current.orders.original.order.payment,
      ])) === paymentHash,
      "Payment hash mismatch",
    );
  }
  report.custodyCode = [];
  for (const [i, c] of clients.entries()) {
    const beforeCode =
      (await c.getCode({
        address: tokenStore,
        blockNumber: r.blockNumber - 1n,
      })) ?? "0x";
    const afterCode = await c.getCode({
      address: tokenStore,
      blockNumber: r.blockNumber,
    });
    check(
      beforeCode === "0x" && afterCode && afterCode !== "0x",
      "Unexpected TokenStore deployment state",
    );
    report.custodyCode.push({ rpc: origins[i], beforeCode, afterCode });
  }
  report.repeatRelease = [];
  for (const [i, c] of clients.entries()) {
    let result;
    try {
      await c.call({
        account: buyer,
        to: operator,
        data: expectedData,
        blockNumber: head,
      });
      throw Error("Release unexpectedly succeeded");
    } catch (e) {
      let cause = e;
      while (cause) {
        if (typeof cause.data === "string") {
          try {
            result = {
              data: cause.data,
              ...decodeErrorResult({ abi: operatorAbi, data: cause.data }),
            };
            break;
          } catch {}
        }
        cause = cause.cause;
      }
      if (!result) throw e;
    }
    check(result.errorName === "InvalidState", "Wrong repeat-release error");
    report.repeatRelease.push({ rpc: origins[i], ...result });
  }
  // Scan relevant transfer/approval and lifecycle logs since the last verified readback.
  report.interval = {
    fromBlock:
      BigInt(delivery.finalRefresh?.block?.number ?? delivery.block.number) +
      1n,
    toBlock: head,
    logs: [],
  };
  for (let from = report.interval.fromBlock; from <= head; from += 200n) {
    const to = from + 199n < head ? from + 199n : head;
    for (const address of [usdc, operator, escrow, collector]) {
      const all = await Promise.all(
        clients.map((c) =>
          c.getLogs({ address, fromBlock: from, toBlock: to }),
        ),
      );
      check(same(all[0], all[1]), "Interval logs disagree");
      for (const l of all[0]) {
        if (
          same(address, usdc) &&
          ![
            "Transfer(address,address,uint256)",
            "Approval(address,address,uint256)",
          ]
            .map((s) => keccak256(toHex(s)))
            .includes(l.topics[0])
        )
          continue;
        const e = decodeEventLog({ abi: abiFor(address), ...l, strict: true });
        if (
          e.eventName === "TokenStoreCreated" &&
          same(e.args.operator, operator)
        ) {
          report.interval.logs.push({ ...l, decoded: e });
          continue;
        }
        if (
          same(address, usdc)
            ? Object.values(e.args).some(
                (a) =>
                  typeof a === "string" &&
                  [buyer, seller, tokenStore, operator].some((w) => same(w, a)),
              )
            : Object.values(e.args).some((a) =>
                [
                  id,
                  prior.duplicate.id,
                  paymentHash,
                  prior.duplicate.paymentHash,
                ].includes(a),
              )
        )
          report.interval.logs.push({ ...l, decoded: e });
      }
    }
  }
  check(
    report.interval.logs.length === 4 &&
      report.interval.logs.every((l) => l.transactionHash === hashes[5]),
    "Unexpected intervening movement",
  );
  report.checks = [
    "Two RPCs agree on all six receipts, canonical headers and historical/current states",
    "Pinned operator/CPP/collector runtime hashes match",
    "Exact release envelope and buyer-authorized genuine OrderReleased event",
    "Exactly one 1000000-unit custody-to-seller transfer; zero fee",
    "Buyer 20; seller 1; TokenStore/operator/escrow/collector 0 USDC",
    "Original Released; duplicate unchanged Voided; CPP capturable zero",
    "Two RPC eth_call repeat releases revert InvalidState",
    "No other relevant transfers or payment events since prior verified readback",
  ];
  report.result = "PASS";
} catch (e) {
  report.result = "FAIL";
  report.error = e.stack;
  process.exitCode = 1;
  console.error(e);
}
await writeFile(new URL("evidence.json", out), json(report) + "\n");
console.error(report.result);
