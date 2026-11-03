// Public RPC reads, canonical receipt discovery and ephemeral approve simulation.
// No wallet, signing, broadcasting, approvals or persistent financial changes.
import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import {
  createPublicClient,
  custom,
  erc20Abi,
  getAbiItem,
  decodeEventLog,
  decodeFunctionData,
  decodeErrorResult,
  encodeAbiParameters,
  parseAbiParameters,
  encodeFunctionData,
  keccak256,
  toHex,
  formatEther,
} from "viem";
import {
  operatorAbi,
  operatorRuntimeHash,
  collectorAbi,
  escrowAbi,
} from "../src/lib/contracts.generated.ts";
const root = new URL("../../", import.meta.url),
  out = new URL("docs/verification/checkpoint-7-gate-1/", root);
const load = async (path) =>
  JSON.parse(await readFile(new URL(path, root), "utf8"));
const proposal = await load(
  "docs/verification/checkpoint-6/fresh-ui-checkout-proposal.json",
);
const preflight = await load(
  "docs/verification/checkpoint-7/gate-1-preflight.json",
);
const protocol = await load("docs/verification/base-sepolia.json");
const manager = await load(
  "docs/verification/first-live-payment/reservation/delegation-manager-verified.json",
);
const { operator, seller, buyer, reviewer, collector, escrow, usdc } =
  proposal.addresses;
const id = "0x0267766d20ca737e4c13b696dfb2134c512ca1af13c12848dcf2d985e7c9aedd";
const origins = [
  "https://sepolia.base.org",
  "https://base-sepolia-rpc.publicnode.com",
];
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
        : typeof x === "string"
          ? x.toLowerCase()
          : x;
const same = (a, b) => json(canonical(a)) === json(canonical(b));
const check = (ok, msg) => {
  if (!ok) throw Error(msg);
};
function rpc(url, method, params = []) {
  check(
    /^(eth_chainId|eth_blockNumber|eth_getBlockByNumber|eth_getCode|eth_getBalance|eth_getTransactionCount|eth_call|eth_estimateGas|eth_gasPrice|eth_getLogs|eth_getTransactionReceipt|eth_getTransactionByHash)$/.test(
      method,
    ),
    "Non-read RPC forbidden",
  );
  return new Promise((resolve, reject) => {
    const p = spawn("curl", [
      "-4",
      "--fail",
      "--silent",
      "--show-error",
      "--max-time",
      "25",
      url,
      "-H",
      "Content-Type: application/json",
      "--data-binary",
      "@-",
    ]);
    let stdout = "",
      stderr = "";
    p.stdout.on("data", (x) => (stdout += x));
    p.stderr.on("data", (x) => (stderr += x));
    p.on("error", reject);
    p.on("close", (code) => {
      try {
        if (code) throw Error(stderr);
        const r = JSON.parse(stdout);
        if (r.error) throw Object.assign(Error(r.error.message), r.error);
        resolve(r.result);
      } catch (e) {
        reject(e);
      }
    });
    p.stdin.end(JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }));
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
function errorName(error) {
  let e = error;
  while (e) {
    if (e.data?.errorName) return e.data.errorName;
    if (typeof e.data === "string") {
      try {
        return decodeErrorResult({ abi: operatorAbi, data: e.data }).errorName;
      } catch {}
    }
    e = e.cause;
  }
  return undefined;
}
const read = (c, bn, address, abi, functionName, args = []) =>
  c.readContract({ address, abi, functionName, args, blockNumber: bn });
async function orderAt(c, bn) {
  try {
    return await read(c, bn, operator, operatorAbi, "getOrder", [id]);
  } catch (e) {
    if (errorName(e) === "UnknownOrder") return null;
    throw e;
  }
}
let report = {
  queriedAt: new Date().toISOString(),
  rpcOrigins: origins,
  orderId: id,
  userReportedUI: [
    "Your order link is ready",
    "Receipt confirmed",
    "Terms read back",
  ],
  userReportedSubmission: "Actual frontend and MetaMask, without Foundry",
  signingPerformed: false,
  broadcastPerformed: false,
  approvalsPerformed: false,
};
await mkdir(out, { recursive: true });
try {
  for (const c of clients)
    check((await c.getChainId()) === 84532, "Wrong chain");
  const head = (await clients[0].getBlockNumber({ cacheTime: 0 })) - 2n;
  const headers = await Promise.all(
    clients.map((c) => c.getBlock({ blockNumber: head })),
  );
  check(headers[0].hash === headers[1].hash, "Head disagreement");
  report.block = {
    number: head,
    hash: headers[0].hash,
    utc: new Date(Number(headers[0].timestamp) * 1000).toISOString(),
  };
  const atHead = await Promise.all(clients.map((c) => orderAt(c, head)));
  check(
    atHead.every(Boolean) && same(atHead[0], atHead[1]),
    "Order absent or RPC disagreement",
  );
  let low = BigInt(preflight.block.number) + 1n,
    high = head;
  check(
    (await orderAt(clients[0], low - 1n)) === null,
    "Earlier checkpoint lower bound invalid",
  );
  let probes = 0;
  while (low < high) {
    const mid = (low + high) / 2n;
    if (await orderAt(clients[0], mid)) high = mid;
    else low = mid + 1n;
    probes++;
  }
  const creationBlock = low;
  for (const c of clients)
    check(
      (await orderAt(c, creationBlock - 1n)) === null &&
        !!(await orderAt(c, creationBlock)),
      "Creation block boundary mismatch",
    );
  const logs = await Promise.all(
    clients.map((c) =>
      c.getLogs({
        address: operator,
        event: getAbiItem({ abi: operatorAbi, name: "OrderCreated" }),
        args: { orderId: id },
        fromBlock: creationBlock,
        toBlock: creationBlock,
        strict: true,
      }),
    ),
  );
  check(
    same(logs[0], logs[1]) && logs[0].length === 1,
    "Not one exact canonical creation event",
  );
  const hash = logs[0][0].transactionHash;
  report.discovery = {
    method:
      "Binary-search immutable getOrder existence after independently verified UnknownOrder checkpoint, then exact indexed event query",
    existenceProbes: probes,
    fromBlock: creationBlock,
    toBlock: creationBlock,
    inclusiveLogRange: 1,
    logs,
    hash,
  };
  const receipts = await Promise.all(
      clients.map((c) => c.getTransactionReceipt({ hash })),
    ),
    txs = await Promise.all(clients.map((c) => c.getTransaction({ hash }))),
    blocks = await Promise.all(
      clients.map((c) => c.getBlock({ blockNumber: creationBlock })),
    );
  const receipt = receipts[0],
    tx = txs[0];
  check(
    same(receipts[0], receipts[1]) &&
      receipt.status === "success" &&
      receipt.transactionHash === hash &&
      receipt.blockNumber === creationBlock,
    "Receipt failed/disagrees",
  );
  check(
    same(txs[0], txs[1]) &&
      tx.chainId === 84532 &&
      tx.hash === hash &&
      tx.blockHash === receipt.blockHash &&
      tx.blockNumber === creationBlock &&
      tx.value === 0n,
    "Transaction identity/value mismatch",
  );
  check(
    blocks.every(
      (b) => b.hash === receipt.blockHash && b.transactions.includes(hash),
    ),
    "Noncanonical block inclusion",
  );
  check(head >= creationBlock + 1n, "Insufficient confirmations");
  report.transaction = {
    hash,
    receipts,
    transaction: tx,
    blockHash: receipt.blockHash,
    blockNumber: creationBlock,
    minedUTC: new Date(Number(blocks[0].timestamp) * 1000).toISOString(),
    confirmations: head - creationBlock + 1n,
  };
  report.runtimeChecks = [];
  for (const [i, c] of clients.entries())
    for (const [address, expected] of [
      [operator, operatorRuntimeHash],
      [escrow, protocol.escrow.runtime_keccak256],
      [collector, protocol.collector.runtime_keccak256],
    ]) {
      const actual = keccak256(
        await c.getCode({ address, blockNumber: creationBlock }),
      );
      check(actual === expected, "Pinned runtime mismatch");
      report.runtimeChecks.push({ rpc: origins[i], address, expected, actual });
    }
  const decoded = receipt.logs.map((l) => {
    const abi = same(l.address, operator)
      ? operatorAbi
      : same(l.address, escrow)
        ? escrowAbi
        : same(l.address, collector)
          ? collectorAbi
          : same(l.address, usdc)
            ? erc20Abi
            : same(l.address, manager.address)
              ? manager.abi
              : undefined;
    return {
      address: l.address,
      logIndex: l.logIndex,
      ...(abi
        ? decodeEventLog({ abi, ...l, strict: true })
        : { eventName: "Auxiliary wallet event; raw retained" }),
    };
  });
  const relevant = decoded.filter((l) =>
    [operator, escrow, collector, usdc].some((a) => same(a, l.address)),
  );
  check(
    relevant.length === 1 && relevant[0].eventName === "OrderCreated",
    "Unexpected creation/payment/token events",
  );
  const event = relevant[0].args;
  const expected = {
    ...proposal.payment,
    maxAmount: 1000000n,
    salt: BigInt(id),
  };
  check(
    event.orderId === id &&
      same(event.seller, seller) &&
      same(event.buyer, buyer) &&
      same(event.reviewer, reviewer) &&
      event.descriptionHash === proposal.descriptionHash &&
      same(event.payment, expected),
    "Creation event terms mismatch",
  );
  check(
    same(atHead[0].payment, expected) &&
      atHead[0].descriptionHash === proposal.descriptionHash &&
      same(atHead[0].reviewer, reviewer) &&
      atHead[0].paymentHash === event.paymentHash,
    "Stored terms mismatch",
  );
  report.transaction.decodedLogs = decoded;
  report.route = {
    type: tx.type,
    outerFrom: tx.from,
    outerTo: tx.to,
    outerValue: tx.value,
    direct:
      same(tx.from, seller) &&
      same(tx.to, operator) &&
      tx.input === proposal.creation.data,
  };
  if (same(tx.to, manager.address)) {
    check(
      same(
        await clients[0].getCode({
          address: manager.address,
          blockNumber: creationBlock,
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
      "Unexpected manager execution count/mode",
    );
    const call = envelope.args[2][0];
    check(
      same(call.slice(0, 42), operator) &&
        BigInt("0x" + call.slice(42, 106)) === 0n &&
        same("0x" + call.slice(106), proposal.creation.data),
      "Wrong routed inner call",
    );
    check(
      decoded.some(
        (e) =>
          e.eventName === "RedeemedDelegation" &&
          same(e.args.rootDelegator, seller),
      ),
      "Wrong effective seller",
    );
    report.route.managerEnvelope = envelope;
    report.route.innerCallExact = true;
  } else if (same(tx.to, operator))
    check(report.route.direct, "Wrong direct call");
  else
    report.route.note =
      "Opaque outer route; genuine pinned operator event and exact authoritative state establish creation, not the outer sender alone.";
  const paymentHash = event.paymentHash;
  async function snapshot(c, bn) {
    const order = await orderAt(c, bn),
      store = await read(c, bn, escrow, escrowAbi, "getTokenStore", [operator]);
    const balances = Object.fromEntries(
      await Promise.all(
        Object.entries({ buyer, seller, operator, store }).map(
          async ([k, a]) => [
            k,
            await read(c, bn, usdc, erc20Abi, "balanceOf", [a]),
          ],
        ),
      ),
    );
    return {
      blockNumber: bn,
      order,
      status: order
        ? await read(c, bn, operator, operatorAbi, "status", [id])
        : null,
      paymentState: await read(c, bn, escrow, escrowAbi, "paymentState", [
        paymentHash,
      ]),
      preApproved: await read(c, bn, collector, collectorAbi, "isPreApproved", [
        paymentHash,
      ]),
      allowance: await read(c, bn, usdc, erc20Abi, "allowance", [
        buyer,
        collector,
      ]),
      tokenStore: store,
      balances,
      buyerETHWei: await c.getBalance({ address: buyer, blockNumber: bn }),
      sellerNonce: await read(c, bn, operator, operatorAbi, "sellerNonce", [
        seller,
      ]),
    };
  }
  report.states = {};
  for (const [label, bn] of [
    ["before", creationBlock - 1n],
    ["after", creationBlock],
    ["current", head],
  ]) {
    const states = await Promise.all(clients.map((c) => snapshot(c, bn)));
    check(same(states[0], states[1]), "State disagreement " + label);
    report.states[label] = states[0];
  }
  check(
    same(report.states.before.balances, report.states.after.balances),
    "USDC balances changed across creation block",
  );
  check(report.states.before.order === null, "Order already existed");
  for (const s of [report.states.after, report.states.current])
    check(
      s.order.status === 1 &&
        s.status === 1 &&
        same(s.paymentState, [false, 0n, 0n]) &&
        !s.preApproved,
      "Fresh order is not Pending/unfunded/unapproved",
    );
  report.sellerOrders = [];
  for (const c of clients) {
    const count = await read(c, head, operator, operatorAbi, "sellerNonce", [
      seller,
    ]);
    check(count <= 200n, "Seller enumeration bound exceeded");
    const rows = [];
    for (let nonce = 0n; nonce < count; nonce++) {
      const oid = keccak256(
        encodeAbiParameters(
          parseAbiParameters("uint256,address,address,uint256"),
          [84532n, operator, seller, nonce],
        ),
      );
      const order = await read(c, head, operator, operatorAbi, "getOrder", [
        oid,
      ]);
      rows.push({
        nonce,
        id: oid,
        order,
        status: await read(c, head, operator, operatorAbi, "status", [oid]),
        matchingFingerprint: order.descriptionHash === proposal.descriptionHash,
      });
    }
    report.sellerOrders.push(rows);
  }
  check(
    same(report.sellerOrders[0], report.sellerOrders[1]),
    "Seller enumeration disagreement",
  );
  const matches = report.sellerOrders[0].filter((o) => o.matchingFingerprint);
  check(
    matches.length === 1 && matches[0].id === id,
    "Matching duplicate creation",
  );
  check(
    report.sellerOrders[0].find((o) => o.nonce === 0n).status === 4 &&
      report.sellerOrders[0].find((o) => o.nonce === 1n).status === 5,
    "Historical order state changed",
  );
  for (const c of clients)
    check(
      (await read(c, head, escrow, escrowAbi, "getHash", [
        atHead[0].payment,
      ])) === paymentHash,
      "CPP hash mismatch",
    );
  report.gate1 = "PASS_ONCHAIN";
  const current = report.states.current;
  const approval = {
    from: buyer,
    to: usdc,
    value: "0x0",
    function: "approve",
    spender: collector,
    amountRaw: 1000000n,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [collector, 1000000n],
    }),
  };
  check(
    current.balances.buyer >= 1000000n && current.buyerETHWei > 0n,
    "Buyer balance/gas insufficient",
  );
  report.gate2 = {
    state: current,
    approval,
    simulation: [],
    readiness:
      current.allowance === 0n
        ? "READY_FOR_ONE_MANUAL_EXACT_APPROVAL"
        : "ALLOWANCE_ALREADY_EXISTS_DO_NOT_REPEAT",
    deadlineSecondsRemaining:
      BigInt(expected.preApprovalExpiry) - headers[0].timestamp,
  };
  check(
    report.gate2.deadlineSecondsRemaining > 3600n,
    "Reserve deadline too close/expired",
  );
  if (current.allowance === 0n)
    for (const [i, c] of clients.entries()) {
      const call = {
        address: usdc,
        abi: erc20Abi,
        functionName: "approve",
        args: [collector, 1000000n],
        account: buyer,
        value: 0n,
        blockNumber: head,
      };
      const sim = await c.simulateContract(call);
      check(sim.result === true, "Approval simulation did not return true");
      const gas = await c.estimateContractGas(call),
        gasPrice = await c.getGasPrice();
      check(
        (await read(c, head, usdc, erc20Abi, "allowance", [
          buyer,
          collector,
        ])) === 0n,
        "Simulation unexpectedly changed allowance",
      );
      report.gate2.simulation.push({
        rpc: origins[i],
        result: sim.result,
        ephemeralOnly: true,
        value: "0x0",
        gasEstimate: gas,
        gasPriceWei: gasPrice,
        directExecutionEstimateWei: gas * gasPrice,
      });
    }
  report.shareURL = `http://127.0.0.1:5174/#/order/${id}?terms=${encodeURIComponent(proposal.description)}`;
  report.buyerETH = formatEther(current.buyerETHWei);
  report.result = "PASS_GATE_1_ONCHAIN_GATE_2_PREPARED";
} catch (e) {
  report.result = "FAIL";
  report.error = String(e.stack || e);
  process.exitCode = 1;
}
await writeFile(new URL("evidence.json", out), json(report) + "\n");
console.log(
  report.result,
  report.discovery?.hash,
  report.gate2?.readiness,
  report.error ?? "Read only.",
);
