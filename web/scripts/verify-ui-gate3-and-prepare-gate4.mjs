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
const prior = await load("docs/verification/checkpoint-7-gate-1/evidence.json");
const protocol = await load("docs/verification/base-sepolia.json");
const proposal = await load(
  "docs/verification/checkpoint-6/fresh-ui-checkout-proposal.json",
);
const { operator, buyer, seller, collector, escrow, usdc } = proposal.addresses;
const id = "0x0267766d20ca737e4c13b696dfb2134c512ca1af13c12848dcf2d985e7c9aedd";
const hash =
  "0x3bdd6c65eea5c193abc0dce78b0a92314d459f9cfb38615469977977652ee62c";
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
        if (r.error) throw Error(json(r.error));
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
const out = new URL("docs/verification/real-ui-gate3/", root);
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
  check(headers[0].hash === headers[1].hash, "Header disagreement");
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
    "Receipt/tx disagreement",
  );
  check(
    receipt.status === "success" &&
      receipt.blockNumber < bn &&
      tx.value === 0n &&
      tx.chainId === 84532,
    "Receipt identity/value",
  );
  for (const c of clients) {
    const b = await c.getBlock({ blockNumber: receipt.blockNumber });
    check(
      b.hash === receipt.blockHash && b.transactions.includes(hash),
      "Noncanonical receipt",
    );
  }
  report.authorization = {
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
        check(actual === expected, "Runtime mismatch");
        return { address, expected, actual };
      }),
    ),
  );
  const fn = getAbiItem({ abi: collectorAbi, name: "preApprove" }),
    eventAbi = getAbiItem({ abi: collectorAbi, name: "PaymentPreApproved" });
  const artifact = await load(
    "contracts/out/PreApprovalPaymentCollector.sol/PreApprovalPaymentCollector.json",
  );
  check(
    same(fn, getAbiItem({ abi: artifact.abi, name: "preApprove" })) &&
      same(
        eventAbi,
        getAbiItem({ abi: artifact.abi, name: "PaymentPreApproved" }),
      ),
    "Pinned ABI mismatch",
  );
  report.abi = {
    preApprove: fn,
    event: eventAbi,
    fundSignature: toFunctionSignature(
      getAbiItem({ abi: operatorAbi, name: "fund" }),
    ),
  };
  for (const c of clients)
    check(
      same(await read(c, operator, operatorAbi, "COLLECTOR"), collector) &&
        same(await read(c, operator, operatorAbi, "ESCROW"), escrow) &&
        same(await read(c, operator, operatorAbi, "USDC"), usdc) &&
        same(
          await read(c, collector, collectorAbi, "authCaptureEscrow"),
          escrow,
        ),
      "Binding mismatch",
    );
  async function snapshot(c, blockNumber) {
    const r = (address, abi, fn, args = []) =>
      read(c, address, abi, fn, args, blockNumber);
    const order = await r(operator, operatorAbi, "getOrder", [id]);
    const store = await r(escrow, escrowAbi, "getTokenStore", [operator]);
    const [
      status,
      state,
      preApproved,
      allowance,
      eth,
      nonce,
      pendingNonce,
      code,
      balances,
    ] = await Promise.all([
      r(operator, operatorAbi, "status", [id]),
      r(escrow, escrowAbi, "paymentState", [order.paymentHash]),
      r(collector, collectorAbi, "isPreApproved", [order.paymentHash]),
      r(usdc, erc20Abi, "allowance", [buyer, collector]),
      c.getBalance({ address: buyer, blockNumber }),
      c.getTransactionCount({ address: buyer, blockNumber }),
      c.getTransactionCount({ address: buyer, blockTag: "pending" }),
      c.getCode({ address: buyer, blockNumber }),
      Promise.all(
        Object.entries({
          buyer,
          seller,
          operator,
          collector,
          escrow,
          store,
        }).map(async ([k, a]) => [
          k,
          await r(usdc, erc20Abi, "balanceOf", [a]),
        ]),
      ),
    ]);
    return {
      order,
      status,
      paymentState: state,
      preApproved,
      allowance,
      buyerEthWei: eth,
      nonce,
      pendingNonce,
      code,
      tokenStore: store,
      balances: Object.fromEntries(balances),
    };
  }
  const states = await Promise.all(clients.map((c) => snapshot(c, bn)));
  check(same(states[0], states[1]), "Current state disagreement");
  report.current = states[0];
  const s = report.current,
    p = s.order.payment,
    h = s.order.paymentHash;
  check(
    same(s.order, prior.states.current.order),
    "Fresh immutable order changed",
  );
  check(
    p.maxAmount === 1000000n &&
      same(p.payer, buyer) &&
      same(p.operator, operator) &&
      p.salt === BigInt(id),
    "Wrong fresh terms",
  );
  check(
    s.status === 1 &&
      s.order.status === 1 &&
      same(s.paymentState, [false, 0n, 0n]) &&
      s.preApproved,
    "Fresh order not Pending/unfunded/approved",
  );
  check(
    s.allowance === 1000000n &&
      s.balances.buyer >= 1000000n &&
      s.nonce === s.pendingNonce,
    "Allowance/balance/pending transaction",
  );
  const typehash = keccak256(
    new TextEncoder().encode(
      "PaymentInfo(address operator,address payer,address receiver,address token,uint120 maxAmount,uint48 preApprovalExpiry,uint48 authorizationExpiry,uint48 refundExpiry,uint16 minFeeBps,uint16 maxFeeBps,address feeReceiver,uint256 salt)",
    ),
  );
  const tuple = fn.inputs[0];
  const localInner = keccak256(
    encodeAbiParameters([{ type: "bytes32" }, tuple], [typehash, p]),
  );
  const localHash = keccak256(
    encodeAbiParameters(parseAbiParameters("uint256,address,bytes32"), [
      84532n,
      escrow,
      localInner,
    ]),
  );
  for (const c of clients)
    check(
      (await read(c, escrow, escrowAbi, "getHash", [p])) === h,
      "Onchain hash mismatch",
    );
  check(localHash === h, "Local typed payment hash mismatch");
  report.paymentHash = { stored: h, locallyRecomputed: localHash };
  const approvalLogs = receipt.logs
    .filter((l) => same(l.address, collector))
    .map((l) => decodeEventLog({ abi: collectorAbi, ...l, strict: true }));
  check(
    approvalLogs.length === 1 &&
      approvalLogs[0].eventName === "PaymentPreApproved" &&
      approvalLogs[0].args.paymentInfoHash === h,
    "Wrong actual preapproval event",
  );
  check(
    !receipt.logs.some(
      (l) =>
        same(l.address, usdc) &&
        l.topics[0] ===
          keccak256(
            new TextEncoder().encode("Transfer(address,address,uint256)"),
          ),
    ),
    "Authorization moved USDC",
  );
  report.authorization.decodedCollectorEvents = approvalLogs;
  const manager = await load(
    "docs/verification/first-live-payment/reservation/delegation-manager-verified.json",
  );
  check(same(tx.to, manager.address), "Unreviewed authorization route");
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
    "Unexpected routed calls/mode",
  );
  const inner = envelope.args[2][0];
  check(
    same(inner.slice(0, 42), collector) &&
      BigInt("0x" + inner.slice(42, 106)) === 0n &&
      same("0x" + inner.slice(106), encode(collectorAbi, "preApprove", [p])),
    "Wrong inner preApprove",
  );
  report.authorization.route = {
    manager: manager.address,
    envelope,
    innerCallExact: true,
  };
  for (const key of ["buyer", "seller", "operator", "store"])
    check(
      s.balances[key] === BigInt(prior.states.current.balances[key]),
      "USDC balance changed since fresh creation: " + key,
    );
  report.balancesUnchangedSinceFreshCreation = true;
  report.beforeAuthorization = await snapshot(
    clients[0],
    receipt.blockNumber - 1n,
  );
  report.afterAuthorization = await snapshot(clients[0], receipt.blockNumber);
  check(
    !report.beforeAuthorization.preApproved &&
      report.afterAuthorization.preApproved &&
      same(
        report.beforeAuthorization.balances,
        report.afterAuthorization.balances,
      ) &&
      same(report.beforeAuthorization.order, report.afterAuthorization.order),
    "Unexpected authorization effects",
  );
  check(
    p.preApprovalExpiry === 1793790000 &&
      BigInt(p.preApprovalExpiry) > headers[0].timestamp,
    "Wrong/expired deadline",
  );
  report.reservationDeadline = {
    unix: p.preApprovalExpiry,
    utc: new Date(p.preApprovalExpiry * 1000).toISOString(),
    secondsRemaining: BigInt(p.preApprovalExpiry) - headers[0].timestamp,
  };
  // Complete bounded indexed event history for this fresh order/payment only.
  const history = [];
  const start = BigInt(prior.transaction.blockNumber);
  for (let from = start; from <= bn; from += 2000n) {
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
    history.length === 2 &&
      history.some((x) => x.eventName === "OrderCreated") &&
      history.some(
        (x) =>
          x.eventName === "PaymentPreApproved" && x.transactionHash === hash,
      ),
    "Unexpected fresh payment history",
  );
  report.history = { fromBlock: start, toBlock: bn, events: history };
  console.log(
    "Receipt, pinned ABI/runtimes, exact fresh hash, Pending/unfunded state and complete payment history PASS",
  );
  const direct = {
    from: buyer,
    to: operator,
    value: "0x0",
    data: encode(operatorAbi, "fund", [id, p]),
  };
  await clients[0].simulateContract({
    account: buyer,
    address: operator,
    abi: operatorAbi,
    functionName: "fund",
    args: [id, p],
    blockNumber: bn,
  });
  report.preparedTransaction = {
    chainId: "0x14a34",
    ...direct,
    function: "fund",
    arguments: [id, p],
    selector: direct.data.slice(0, 10),
  };
  const delegator = "0x63c0c19a282a1b52b07dd5a65b58948a07dae32b";
  check(
    same(s.code, concat(["0xef0100", delegator])),
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
        "function execute(bytes32 mode, bytes executionCalldata) payable",
      ]),
      "execute",
      [
        toHex(0n, { size: 32 }),
        concat([operator, toHex(0n, { size: 32 }), direct.data]),
      ],
    ),
  };
  const expectedOrder = { ...s.order, status: 2 };
  const reads = [
    [operator, operatorAbi, "getOrder", [id], expectedOrder],
    [operator, operatorAbi, "status", [id], 2],
    [escrow, escrowAbi, "paymentState", [h], [true, 1000000n, 0n]],
    [collector, collectorAbi, "isPreApproved", [h], true],
    [usdc, erc20Abi, "allowance", [buyer, collector], 0n],
  ];
  for (const [label, address] of Object.entries({
    buyer,
    seller,
    operator,
    collector,
    escrow,
    store: s.tokenStore,
  }))
    reads.push([
      usdc,
      erc20Abi,
      "balanceOf",
      [address],
      s.balances[label] +
        (label === "buyer" ? -1000000n : label === "store" ? 1000000n : 0n),
    ]);
  async function simulate(call, c) {
    const request = {
      blockStateCalls: [
        {
          calls: [
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
    const result = await c.request({
      method: "eth_simulateV1",
      params: [request, toHex(bn)],
    });
    const calls = result[0].calls;
    check(
      calls.length === reads.length + 1 &&
        calls.every((x) => x.status === "0x1"),
      "Fund simulation reverted",
    );
    const events = calls[0].logs.map((l) => {
      const abi = same(l.address, operator)
        ? operatorAbi
        : same(l.address, escrow)
          ? escrowAbi
          : same(l.address, usdc)
            ? erc20Abi
            : undefined;
      return {
        address: l.address,
        ...(abi
          ? decodeEventLog({ abi, ...l, strict: true })
          : { eventName: "Auxiliary" }),
      };
    });
    check(
      events.filter((x) => x.eventName === "Transfer").length === 1,
      "Unexpected transfer count",
    );
    const t = events.find((x) => x.eventName === "Transfer");
    check(
      same(t.address, usdc) &&
        same(t.args, { from: buyer, to: s.tokenStore, value: 1000000n }),
      "Wrong token transfer",
    );
    const a = events.find((x) => x.eventName === "PaymentAuthorized");
    check(
      a &&
        same(a.address, escrow) &&
        same(a.args.paymentInfo, p) &&
        a.args.amount === 1000000n &&
        same(a.args.tokenCollector, collector),
      "Wrong PaymentAuthorized",
    );
    const f = events.find((x) => x.eventName === "OrderFunded");
    check(
      f &&
        same(f.address, operator) &&
        same(f.args, { orderId: id, paymentHash: h }),
      "Wrong OrderFunded",
    );
    check(
      !events.some((x) => /Captur|Released/.test(x.eventName)),
      "Unexpected release",
    );
    const checks = reads.map(
      ([address, abi, functionName, args, expected], i) => {
        const actual = decodeFunctionResult({
          abi,
          functionName,
          data: calls[i + 1].returnData,
        });
        check(same(actual, expected), "Simulated poststate " + functionName);
        return { address, functionName, args, expected, actual };
      },
    );
    return { request, result, events, checks, passed: true };
  }
  report.directSimulation = await simulate(direct, clients[1]);
  report.delegatedSimulation = await simulate(routed, clients[1]);
  const gas = await clients[0].request({
    method: "eth_estimateGas",
    params: [direct, toHex(bn)],
  });
  const routedGas = await clients[0].request({
    method: "eth_estimateGas",
    params: [routed, toHex(bn)],
  });
  const gasPrice = await clients[0].getGasPrice();
  check(
    s.buyerEthWei > BigInt(routedGas) * gasPrice,
    "Insufficient estimated gas",
  );
  report.gas = {
    directGas: BigInt(gas),
    delegatedGas: BigInt(routedGas),
    gasPriceWei: gasPrice,
    estimatedDelegatedExecutionWei: BigInt(routedGas) * gasPrice,
    caveat:
      "Execution estimate only; MetaMask refreshes total fees including L1 data and actual relayer overhead.",
  };
  check(same(await snapshot(clients[0], bn), s), "Persistent snapshot changed");
  check(
    (await clients[0].getBlock({ blockNumber: bn })).hash === headers[0].hash,
    "Reorg",
  );
  report.result = "GO_GATE_4_CHAIN_SIMULATION";
  await writeFile(
    new URL("next-manual-transaction.json", out),
    json(report.preparedTransaction) + "\n",
  );
  console.log(
    json({
      result: report.result,
      block: report.block,
      authorization: {
        status: receipt.status,
        blockNumber: receipt.blockNumber,
        confirmations: report.authorization.confirmations,
        type: tx.type,
        from: tx.from,
        to: tx.to,
        events: approvalLogs,
      },
      current: s,
      paymentHash: report.paymentHash,
      reservationDeadline: report.reservationDeadline,
      gas: report.gas,
      preparedTransaction: report.preparedTransaction,
      simulations:
        "PASS direct + actual delegated self-execution, no overrides",
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
