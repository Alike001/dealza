// Public reads and ephemeral simulations only. No signer, wallet, or broadcast methods.
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import {
  createPublicClient,
  http,
  erc20Abi,
  encodeFunctionData,
  decodeFunctionResult,
  decodeEventLog,
  decodeFunctionData,
  decodeErrorResult,
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
const out = new URL("docs/verification/first-live-payment/reservation/", root);
const stringify = (x) =>
  JSON.stringify(x, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2);
let report = {};
try {
  await mkdir(out, { recursive: true });
  await rm(new URL("transaction-5-unsigned.json", out), { force: true });
  const load = async (p) =>
    JSON.parse(await readFile(new URL(p, root), "utf8"));
  const prior = await load(
    "docs/verification/checkout-continuation/snapshot.json",
  );
  const protocol = await load("docs/verification/base-sepolia.json");
  const { buyer, seller, operator, collector, escrow, usdc } = prior;
  const canonical = (x) =>
    Array.isArray(x)
      ? x.map(canonical)
      : x && typeof x === "object"
        ? Object.fromEntries(
            Object.keys(x)
              .sort()
              .map((k) => [k, canonical(x[k])]),
          )
        : typeof x === "bigint"
          ? x.toString()
          : x;
  const same = (a, b) =>
    stringify(canonical(a)).toLowerCase() ===
    stringify(canonical(b)).toLowerCase();
  const check = (ok, msg) => {
    if (!ok) throw Error(msg);
  };
  const client = createPublicClient({
    transport: http("https://base-sepolia-rpc.publicnode.com", {
      timeout: 30000,
      retryCount: 1,
    }),
  });
  const second = createPublicClient({
    transport: http("https://sepolia.base.org", {
      timeout: 30000,
      retryCount: 1,
    }),
  });
  check(
    (await client.getChainId()) === 84532 &&
      (await second.getChainId()) === 84532,
    "Wrong chain",
  );
  const header = await client.getBlock({
    blockNumber: (await client.getBlockNumber({ cacheTime: 0 })) - 2n,
  });
  const blockNumber = header.number;
  const read = (address, abi, functionName, args = [], c = client) =>
    c.readContract({ address, abi, functionName, args, blockNumber });
  const encode = (abi, functionName, args) =>
    encodeFunctionData({ abi, functionName, args });
  report = {
    queriedAt: new Date().toISOString(),
    chainId: 84532,
    block: {
      number: blockNumber,
      hash: header.hash,
      timestamp: header.timestamp,
      utc: new Date(Number(header.timestamp) * 1000).toISOString(),
    },
    checks: {},
    rpcOrigins: [
      "https://base-sepolia-rpc.publicnode.com",
      "https://sepolia.base.org",
    ],
  };
  for (const [address, expected] of [
    [operator, operatorRuntimeHash],
    [escrow, protocol.escrow.runtime_keccak256],
    [collector, protocol.collector.runtime_keccak256],
  ])
    check(
      keccak256(await client.getCode({ address, blockNumber })) === expected,
      "Runtime mismatch " + address,
    );
  check(
    same(await read(operator, operatorAbi, "COLLECTOR"), collector) &&
      same(await read(operator, operatorAbi, "ESCROW"), escrow) &&
      same(await read(operator, operatorAbi, "USDC"), usdc) &&
      (await read(operator, operatorAbi, "CHAIN_ID")) === 84532n &&
      same(await read(collector, collectorAbi, "authCaptureEscrow"), escrow),
    "Binding mismatch",
  );
  report.checks.runtimesAndBindings = true;
  const hash =
    "0xd59acd2377d61f58f4dbe3d483f0dc75613d145f0484f8f665b0c8279a0c0e08";
  const id =
    "0x610384701397935f144496cca9496417e029c7d9089f019993da4373a618769f";
  const paymentHash =
    "0xa10594af1b0f41399573bb2c493a03df0736cf8ff8b96bdfb1cf007da0996b59";
  check(
    prior.original.id === id && prior.original.paymentHash === paymentHash,
    "Prior identity mismatch",
  );
  const approved = await load(
    "docs/verification/buyer-reservation/evidence.json",
  );
  const prepared = await load(
    "docs/verification/buyer-reservation/next-manual-transaction.json",
  );
  const [receipt, transaction, minedBlock] = await Promise.all([
    client.getTransactionReceipt({ hash }),
    client.getTransaction({ hash }),
    client.getBlock({ blockNumber: 53871777n, includeTransactions: true }),
  ]);
  check(
    receipt.status === "success" &&
      receipt.blockNumber === 53871777n &&
      receipt.blockNumber < blockNumber,
    "Wrong/failed receipt",
  );
  check(
    minedBlock.hash === receipt.blockHash &&
      minedBlock.transactions.some((t) => t.hash === hash),
    "Noncanonical receipt",
  );
  const manager = "0xdb9b1e94b5b69df7e401ddbede43491141047db3";
  const managerSource = await load(
    "docs/verification/first-live-payment/reservation/delegation-manager-verified.json",
  );
  check(
    managerSource.runtimeMatch === "exact_match" &&
      same(managerSource.address, manager),
    "Manager source mismatch",
  );
  check(
    same(
      await client.getCode({ address: manager, blockNumber }),
      managerSource.runtimeBytecode.onchainBytecode,
    ),
    "Manager runtime mismatch",
  );
  check(
    same(transaction.to, manager) &&
      same(transaction.from, "0xb01caea8c6c47bbf4f4b4c5080ca642043359c2e") &&
      transaction.chainId === 84532 &&
      transaction.value === 0n,
    "Unexpected outer transaction",
  );
  check(
    same(receipt.from, transaction.from) && same(receipt.to, transaction.to),
    "Receipt envelope mismatch",
  );
  const envelope = decodeFunctionData({
    abi: managerSource.abi,
    data: transaction.input,
  });
  check(
    envelope.functionName === "redeemDelegations" &&
      envelope.args.every((a) => a.length === 1),
    "Unexpected envelope batch",
  );
  check(
    envelope.args[1][0] === toHex(0n, { size: 32 }),
    "Nondefault execution mode",
  );
  const execution = envelope.args[2][0];
  check(
    same(execution.slice(0, 42), operator) &&
      BigInt("0x" + execution.slice(42, 106)) === 0n &&
      same("0x" + execution.slice(106), prepared.transaction.data),
    "Wrong inner target/value/calldata",
  );
  const inner = decodeFunctionData({
    abi: operatorAbi,
    data: "0x" + execution.slice(106),
  });
  check(
    inner.functionName === "fund" &&
      inner.args[0] === id &&
      same(inner.args[1], approved.original.order.payment),
    "Wrong inner payment",
  );
  const limited = "0x04658b29f6b82ed55274221a06fc97d318e25416";
  // Exact event declaration from MetaMask delegation-framework v1.3.0 source, saved beside evidence.
  const limitedAbi = parseAbi([
    "event IncreasedCount(address indexed sender,address indexed redeemer,bytes32 indexed delegationHash,uint256 limit,uint256 callCount)",
  ]);
  const abiAt = (address) =>
    same(address, usdc)
      ? erc20Abi
      : same(address, escrow)
        ? escrowAbi
        : same(address, operator)
          ? operatorAbi
          : same(address, collector)
            ? collectorAbi
            : same(address, manager)
              ? managerSource.abi
              : same(address, limited)
                ? limitedAbi
                : undefined;
  const events = receipt.logs.map((l) => {
    check(!l.removed && abiAt(l.address), "Unexpected/removed log");
    return {
      address: l.address,
      logIndex: l.logIndex,
      ...decodeEventLog({ abi: abiAt(l.address), ...l, strict: true }),
    };
  });
  const names = events.map((e) => e.eventName);
  check(
    same(names, [
      "IncreasedCount",
      "PaymentAuthorized",
      "Transfer",
      "OrderFunded",
      "RedeemedDelegation",
    ]),
    "Unexpected event sequence",
  );
  const authorization = events[1].args,
    transfer = events[2].args,
    funded = events[3].args;
  check(
    authorization.paymentInfoHash === paymentHash &&
      same(authorization.paymentInfo, inner.args[1]) &&
      authorization.amount === 1000000n &&
      same(authorization.tokenCollector, collector),
    "Wrong CPP authorization",
  );
  check(
    funded.orderId === id && funded.paymentHash === paymentHash,
    "Wrong funded event",
  );
  check(
    same(events[4].args.rootDelegator, buyer) &&
      same(events[4].args.redeemer, transaction.from) &&
      same(events[4].args.delegation.delegator, buyer),
    "Wrong authenticated buyer",
  );
  check(
    events[0].args.limit === 1n &&
      events[0].args.callCount === 1n &&
      same(events[0].args.sender, manager) &&
      same(events[0].args.redeemer, transaction.from),
    "Unexpected delegation use",
  );
  const tokenStore = await read(escrow, escrowAbi, "getTokenStore", [operator]);
  check(
    same(tokenStore, prepared.custodyDestination) &&
      same(transfer.from, buyer) &&
      same(transfer.to, tokenStore) &&
      transfer.value === 1000000n,
    "Wrong token custody",
  );
  report.transaction4 = {
    hash,
    receipt,
    outerTransaction: transaction,
    decodedEnvelope: envelope,
    innerCall: inner,
    events,
    confirmations: blockNumber - receipt.blockNumber + 1n,
    explorer: `https://sepolia.basescan.org/tx/${hash}`,
    blockscout: `https://base-sepolia.blockscout.com/tx/${hash}`,
  };
  const at = (address, abi, functionName, args, bn, c = client) =>
    c.readContract({ address, abi, functionName, args, blockNumber: bn });
  async function snapshot(bn, c = client) {
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
          await at(usdc, erc20Abi, "balanceOf", [a], bn, c),
        ]),
      ),
    );
    const accounts = Object.fromEntries(
      await Promise.all(
        Object.entries({ buyer, seller }).map(async ([k, address]) => [
          k,
          {
            address,
            ethWei: await c.getBalance({ address, blockNumber: bn }),
            code: (await c.getCode({ address, blockNumber: bn })) ?? "0x",
            nonce: await c.getTransactionCount({ address, blockNumber: bn }),
          },
        ]),
      ),
    );
    const orders = Object.fromEntries(
      await Promise.all(
        ["original", "duplicate"].map(async (label) => {
          const oid = prior[label].id,
            order = await at(operator, operatorAbi, "getOrder", [oid], bn, c);
          return [
            label,
            {
              id: oid,
              order,
              status: await at(operator, operatorAbi, "status", [oid], bn, c),
              paymentState: await at(
                escrow,
                escrowAbi,
                "paymentState",
                [order.paymentHash],
                bn,
                c,
              ),
              preApproved: await at(
                collector,
                collectorAbi,
                "isPreApproved",
                [order.paymentHash],
                bn,
                c,
              ),
            },
          ];
        }),
      ),
    );
    return {
      blockNumber: bn,
      balances,
      accounts,
      orders,
      allowance: await at(
        usdc,
        erc20Abi,
        "allowance",
        [buyer, collector],
        bn,
        c,
      ),
    };
  }
  const [before, after, current] = await Promise.all([
    snapshot(receipt.blockNumber - 1n),
    snapshot(receipt.blockNumber),
    snapshot(blockNumber),
  ]);
  check(
    before.orders.original.status === 1 &&
      same(before.orders.original.paymentState, [false, 0n, 0n]) &&
      before.orders.original.preApproved &&
      before.allowance === 1000000n,
    "Wrong prestate",
  );
  for (const state of [before, after, current]) {
    check(
      same(
        state.orders.original.order.payment,
        approved.original.order.payment,
      ) && state.orders.original.order.paymentHash === paymentHash,
      "Original terms changed",
    );
    check(
      same(state.orders.duplicate.order, prior.duplicate.order) &&
        state.orders.duplicate.status === 5 &&
        same(state.orders.duplicate.paymentState, [false, 0n, 0n]) &&
        !state.orders.duplicate.preApproved,
      "Duplicate no longer voided",
    );
  }
  for (const state of [after, current]) {
    check(
      state.orders.original.order.status === 2 &&
        state.orders.original.status === 2 &&
        same(state.orders.original.paymentState, [true, 1000000n, 0n]) &&
        state.orders.original.preApproved,
      "Not reserved",
    );
    check(
      state.balances.buyer === before.balances.buyer - 1000000n &&
        state.balances.seller === 0n &&
        before.balances.seller === 0n &&
        state.balances.tokenStore === 1000000n &&
        before.balances.tokenStore === 0n &&
        state.balances.operator === 0n &&
        state.allowance === 0n,
      "Balance/allowance mismatch",
    );
    for (const k of ["escrow", "collector"])
      check(
        state.balances[k] === before.balances[k],
        "Unexpected retained funds",
      );
  }
  report.historical = { before, after };
  report.current = current;
  report.tokenStore = tokenStore;
  check(
    same(
      { ...current.orders.original.order, status: 1 },
      approved.original.order,
    ),
    "Original nonpayment terms changed",
  );
  check(
    same(before.accounts.buyer.code, after.accounts.buyer.code) &&
      same(before.accounts.seller.code, after.accounts.seller.code),
    "Account delegation changed during reservation",
  );
  const p = current.orders.original.order.payment;
  const fundFn = getAbiItem({ abi: operatorAbi, name: "fund" });
  const typeHash = keccak256(
    toHex(
      "PaymentInfo(address operator,address payer,address receiver,address token,uint120 maxAmount,uint48 preApprovalExpiry,uint48 authorizationExpiry,uint48 refundExpiry,uint16 minFeeBps,uint16 maxFeeBps,address feeReceiver,uint256 salt)",
    ),
  );
  const structHash = keccak256(
    encodeAbiParameters([{ type: "bytes32" }, fundFn.inputs[1]], [typeHash, p]),
  );
  const computedHash = keccak256(
    encodeAbiParameters(parseAbiParameters("uint256,address,bytes32"), [
      84532n,
      escrow,
      structHash,
    ]),
  );
  check(
    computedHash === paymentHash &&
      (await read(escrow, escrowAbi, "getHash", [p])) === paymentHash &&
      (await read(escrow, escrowAbi, "getHash", [p], second)) === paymentHash,
    "Independent payment hash mismatch",
  );
  report.hashVerification = {
    typeHash,
    structHash,
    computedHash,
    protocolVersion: "v1.1.0",
    protocolCommit: protocol.protocol_commit,
  };
  check(
    BigInt(p.preApprovalExpiry) > minedBlock.timestamp &&
      BigInt(p.authorizationExpiry) > header.timestamp,
    "Expired payment",
  );
  report.deadlines = Object.fromEntries(
    ["preApprovalExpiry", "authorizationExpiry", "refundExpiry"].map((k) => [
      k,
      {
        unix: p[k],
        utc: new Date(p[k] * 1000).toISOString(),
        secondsRemaining: BigInt(p[k]) - header.timestamp,
      },
    ]),
  );
  for (const role of ["buyer", "seller"]) {
    const a = current.accounts[role];
    a.pendingNonce = await client.getTransactionCount({
      address: a.address,
      blockTag: "pending",
    });
    check(a.pendingNonce === a.nonce, "Pending " + role + " transaction");
  }
  // Cross-check historical balances, current orders, accounts, authorization and allowance independently.
  check(
    (await second.getBlock({ blockNumber })).hash === header.hash,
    "RPC snapshot disagreement",
  );
  const otherReceipt = await second.getTransactionReceipt({ hash });
  check(
    same(otherReceipt.logs, receipt.logs) &&
      otherReceipt.status === "success" &&
      otherReceipt.blockHash === receipt.blockHash,
    "RPC receipt disagreement",
  );
  for (const state of [before, after, current]) {
    const other = await snapshot(state.blockNumber, second);
    const comparable = structuredClone(state);
    for (const role of ["buyer", "seller"])
      delete comparable.accounts[role].pendingNonce;
    check(same(other, comparable), "Independent RPC state disagreement");
  }
  // All token movements/approvals involving participants since the reviewed pre-reservation checkpoint.
  const tokenHistory = [];
  for (
    let from = BigInt(approved.block.number) + 1n;
    from <= blockNumber;
    from += 9999n
  ) {
    const to = from + 9998n < blockNumber ? from + 9998n : blockNumber;
    const logs = await client.getLogs({
      address: usdc,
      fromBlock: from,
      toBlock: to,
    });
    for (const l of logs)
      if (
        [
          keccak256(toHex("Transfer(address,address,uint256)")),
          keccak256(toHex("Approval(address,address,uint256)")),
        ].includes(l.topics[0])
      ) {
        const e = decodeEventLog({ abi: erc20Abi, ...l, strict: true });
        if (
          Object.values(e.args).some(
            (a) =>
              typeof a === "string" &&
              [buyer, seller, tokenStore, operator].some((w) => same(w, a)),
          )
        )
          tokenHistory.push({
            transactionHash: l.transactionHash,
            blockNumber: l.blockNumber,
            ...e,
          });
      }
  }
  check(
    tokenHistory.length === 1 &&
      tokenHistory[0].transactionHash === hash &&
      tokenHistory[0].eventName === "Transfer",
    "Unexpected token movement/approval",
  );
  report.tokenHistory = {
    fromBlock: BigInt(approved.block.number) + 1n,
    toBlock: blockNumber,
    events: tokenHistory,
  };
  report.checks.phase1 =
    "PASS: inner events, exact approved terms, pre/post/current balances, authorization, duplicate, deadlines, independent RPC";
  console.error(
    "PASS Phase 1: actual reservation, historical custody, independent RPC",
  );
  // Save only failure-safe evidence until both later phases succeed.
  await writeFile(
    new URL("evidence.json", out),
    stringify({ ...report, result: "PHASE_1_PASS_ONLY" }) + "\n",
  );
  async function denied(
    label,
    address,
    abi,
    functionName,
    args,
    errorName,
    errorArgs,
  ) {
    const data = encode(abi, functionName, args);
    const result = await client.request({
      method: "eth_simulateV1",
      params: [
        {
          blockStateCalls: [{ calls: [{ from: seller, to: address, data }] }],
          validation: false,
        },
        toHex(blockNumber),
      ],
    });
    const call = result[0].calls[0];
    check(
      call.status === "0x0" && call.error?.data,
      "Expected security revert: " + label,
    );
    const decoded = decodeErrorResult({ abi, data: call.error.data });
    check(
      decoded.errorName === errorName &&
        (!errorArgs || same(decoded.args, errorArgs)),
      "Wrong security reason " + label,
    );
    check(call.logs.length === 0, "Rejected capture emitted events");
    return {
      label,
      from: seller,
      to: address,
      data,
      result,
      decoded,
      passed: true,
    };
  }
  report.buyerProtection = await Promise.all([
    denied(
      "Seller cannot release via Dealza",
      operator,
      operatorAbi,
      "release",
      [id],
      "Unauthorized",
    ),
    denied(
      "Seller cannot capture CPP directly",
      escrow,
      escrowAbi,
      "capture",
      [p, 1000000n, 0n, "0x0000000000000000000000000000000000000000"],
      "InvalidSender",
      [seller, operator],
    ),
  ]);
  report.checks.phase2 =
    "PASS: Unauthorized() and InvalidSender(seller,operator); simulation only";
  console.error("PASS Phase 2: exact access-control reverts");
  // Controlled acknowledgment, explicitly not evidence of physical delivery.
  const acknowledgment = `Dealza controlled test delivery acknowledgment; Base Sepolia chain 84532; order ${id}; reservation ${hash}; no physical delivery asserted; no payment release authorized.`;
  const evidenceHash = keccak256(toHex(acknowledgment));
  const fn = getAbiItem({ abi: operatorAbi, name: "noteDelivery" });
  const artifact = await load(
    "contracts/out/DealzaOperator.sol/DealzaOperator.json",
  );
  check(
    same(fn, getAbiItem({ abi: artifact.abi, name: "noteDelivery" })),
    "Delivery ABI mismatch",
  );
  const tx = {
    chainId: "0x14a34",
    from: seller,
    to: operator,
    value: "0x0",
    data: encode(operatorAbi, "noteDelivery", [id, evidenceHash]),
  };
  const call = {
    account: seller,
    address: operator,
    abi: operatorAbi,
    functionName: "noteDelivery",
    args: [id, evidenceHash],
    blockNumber,
  };
  await client.simulateContract(call);
  await second.simulateContract(call);
  const estimatedGas = await client.estimateContractGas(call),
    gasPrice = await client.getGasPrice();
  check(
    current.accounts.seller.ethWei > estimatedGas * gasPrice,
    "Seller lacks execution gas",
  );
  const reads = [];
  for (const [name, address] of Object.entries({
    buyer,
    seller,
    tokenStore,
    operator,
    collector,
    escrow,
  }))
    reads.push([
      usdc,
      erc20Abi,
      "balanceOf",
      [address],
      current.balances[name],
    ]);
  reads.push([usdc, erc20Abi, "allowance", [buyer, collector], 0n]);
  for (const item of Object.values(current.orders))
    reads.push(
      [operator, operatorAbi, "getOrder", [item.id], item.order],
      [operator, operatorAbi, "status", [item.id], item.status],
      [
        escrow,
        escrowAbi,
        "paymentState",
        [item.order.paymentHash],
        item.paymentState,
      ],
      [
        collector,
        collectorAbi,
        "isPreApproved",
        [item.order.paymentHash],
        item.preApproved,
      ],
    );
  async function deliverySimulation(label, first) {
    const request = {
      blockStateCalls: [
        {
          calls: [
            first,
            ...reads.map(([to, abi, functionName, args]) => ({
              from: seller,
              to,
              data: encode(abi, functionName, args),
            })),
            {
              from: seller,
              to: operator,
              data: encode(operatorAbi, "release", [id]),
            },
            {
              from: seller,
              to: escrow,
              data: encode(escrowAbi, "capture", [
                p,
                1000000n,
                0n,
                "0x0000000000000000000000000000000000000000",
              ]),
            },
          ],
        },
      ],
      validation: false,
    };
    const result = await client.request({
      method: "eth_simulateV1",
      params: [request, toHex(blockNumber)],
    });
    const calls = result[0].calls;
    check(
      calls.length === reads.length + 3 &&
        calls.slice(0, reads.length + 1).every((c) => c.status === "0x1"),
      label + " simulation failure",
    );
    check(
      calls[0].logs.length === 1 && same(calls[0].logs[0].address, operator),
      "Delivery emitted unexpected transfer/events",
    );
    const event = decodeEventLog({
      abi: operatorAbi,
      ...calls[0].logs[0],
      strict: true,
    });
    check(
      event.eventName === "DeliveryNoted" &&
        event.args.orderId === id &&
        event.args.evidenceHash === evidenceHash,
      "Wrong delivery event",
    );
    const checks = reads.map(
      ([address, abi, functionName, args, expected], i) => {
        const actual = decodeFunctionResult({
          abi,
          functionName,
          data: calls[i + 1].returnData,
        });
        check(same(actual, expected), label + " changed " + functionName);
        return { address, functionName, args, expected, actual, passed: true };
      },
    );
    for (const [i, abi, name, args] of [
      [reads.length + 1, operatorAbi, "Unauthorized", undefined],
      [reads.length + 2, escrowAbi, "InvalidSender", [seller, operator]],
    ]) {
      check(
        calls[i].status === "0x0" && calls[i].error?.data,
        label + " seller capture permitted after evidence",
      );
      const e = decodeErrorResult({ abi, data: calls[i].error.data });
      check(
        e.errorName === name && (!args || same(e.args, args)),
        label + " wrong post-delivery revert",
      );
    }
    return { label, request, result, event, checks, passed: true };
  }
  const { chainId, ...direct } = tx;
  report.deliverySimulation = await deliverySimulation(
    "Direct seller acknowledgment",
    direct,
  );
  report.preparedTransaction = {
    transaction: tx,
    function: "noteDelivery",
    signature: toFunctionSignature(fn),
    arguments: [id, evidenceHash],
    acknowledgment,
    evidenceHash,
    estimatedGas,
    gasPriceWei: gasPrice,
    estimatedExecutionCostWei: estimatedGas * gasPrice,
    sellerEthWei: current.accounts.seller.ethWei,
    gasCaveat:
      "Refresh gas and Base L1 data fee in MetaMask. This is an estimate, not a fixed gas limit or nonce.",
    restriction:
      "Transaction 5 only: controlled test acknowledgment. No physical delivery asserted and no USDC release authorized.",
  };
  const sellerCode = current.accounts.seller.code;
  if (sellerCode !== "0x") {
    const delegator = "0x63c0c19a282a1b52b07dd5a65b58948a07dae32b";
    check(
      same(sellerCode, concat(["0xef0100", delegator])),
      "Unknown seller delegation",
    );
    check(
      keccak256(await client.getCode({ address: delegator, blockNumber })) ===
        "0x83805f9ac7395294043b10c3b7c1839b7e4582a3e693028c36df84978b09d4e2",
      "Seller delegator changed",
    );
    const routed = {
      from: seller,
      to: seller,
      value: "0x0",
      data: encode(
        parseAbi([
          "function execute(bytes32 mode,bytes executionCalldata) payable",
        ]),
        "execute",
        [
          toHex(0n, { size: 32 }),
          concat([operator, toHex(0n, { size: 32 }), tx.data]),
        ],
      ),
    };
    report.routedDeliverySimulation = await deliverySimulation(
      "Current seller delegated self-execution; no overrides",
      routed,
    );
    const routedGas = BigInt(
      await client.request({
        method: "eth_estimateGas",
        params: [routed, toHex(blockNumber)],
      }),
    );
    check(
      current.accounts.seller.ethWei > routedGas * gasPrice,
      "Seller lacks routed gas",
    );
    report.preparedTransaction.routedSelfExecutionTransaction = {
      chainId,
      ...routed,
    };
    report.preparedTransaction.routedSelfExecutionGas = routedGas;
  }
  const refreshed = await snapshot(blockNumber);
  const comparable = structuredClone(current);
  for (const role of ["buyer", "seller"])
    delete comparable.accounts[role].pendingNonce;
  check(same(refreshed, comparable), "Simulation changed persistent state");
  check(
    (await client.getBlock({ blockNumber })).hash === header.hash,
    "Snapshot reorg",
  );
  report.checks.phase3 =
    "PASS: direct and actual seller account simulation; only DeliveryNoted; balances/orders/CPP/allowance unchanged; seller still cannot capture";
  report.result = "GO_TRANSACTION_5_ONLY";
  report.signingPerformed = false;
  report.broadcastPerformed = false;
  report.stateOverridesUsed = false;
  report.routingLimitations =
    "Direct operator call and current delegated self-execution tested. A future relayer envelope must contain only the exact noteDelivery execution. No new delegation or token approval is needed. Verify actual DeliveryNoted and unchanged escrow after mining.";
  await writeFile(new URL("evidence.json", out), stringify(report) + "\n");
  await writeFile(
    new URL("transaction-5-unsigned.json", out),
    stringify(report.preparedTransaction) + "\n",
  );
  await writeFile(
    new URL("controlled-test-acknowledgment.txt", out),
    acknowledgment,
  ); // Hash exact UTF-8 bytes, no trailing newline.
  console.log(
    stringify({
      result: report.result,
      block: report.block,
      events: events.map((e) => ({ eventName: e.eventName, args: e.args })),
      balances: current.balances,
      accounts: current.accounts,
      deadlines: report.deadlines,
      preparedTransaction: report.preparedTransaction,
    }),
  );
} catch (error) {
  report.result = "NO_GO_TRANSACTION_5";
  report.failure = error.shortMessage ?? error.message;
  await rm(new URL("transaction-5-unsigned.json", out), { force: true });
  await writeFile(new URL("evidence.json", out), stringify(report) + "\n");
  throw error;
}
