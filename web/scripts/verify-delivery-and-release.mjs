import { baseSepolia } from "viem/chains";
import { publicActionsL2 } from "viem/op-stack";
// Public RPC reads and ephemeral simulations only. No keys, signing or broadcast.
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
const root = new URL("../../", import.meta.url),
  out = new URL("docs/verification/first-live-payment/delivery-release/", root);
const stringify = (x) =>
  JSON.stringify(x, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2);
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
const load = async (p) => JSON.parse(await readFile(new URL(p, root), "utf8"));
const encode = (abi, functionName, args) =>
  encodeFunctionData({ abi, functionName, args });
let report = {};
await mkdir(out, { recursive: true });
await rm(new URL("transaction-6-unsigned.json", out), { force: true });
try {
  const prior = await load(
    "docs/verification/checkout-continuation/snapshot.json",
  );
  const reserved = await load(
    "docs/verification/first-live-payment/reservation/evidence.json",
  );
  const prepared = await load(
    "docs/verification/first-live-payment/reservation/transaction-5-unsigned.json",
  );
  const protocol = await load("docs/verification/base-sepolia.json");
  const { buyer, seller, operator, collector, escrow, usdc } = prior;
  const id =
    "0x610384701397935f144496cca9496417e029c7d9089f019993da4373a618769f";
  const paymentHash =
    "0xa10594af1b0f41399573bb2c493a03df0736cf8ff8b96bdfb1cf007da0996b59";
  const hash =
    "0xacfb28da439caa95bc7d40172d01d83b20f9da64c182d4dcb073a5c3cbaad786";
  const origins = [
    "https://base-sepolia-rpc.publicnode.com",
    "https://sepolia.base.org",
  ];
  const [client, second] = origins.map((url) =>
    createPublicClient({
      transport: http(url, { timeout: 30000, retryCount: 1 }),
    }),
  );
  check(
    (await client.getChainId()) === 84532 &&
      (await second.getChainId()) === 84532,
    "Wrong chain",
  );
  const header = await client.getBlock({
    blockNumber: (await client.getBlockNumber({ cacheTime: 0 })) - 2n,
  });
  const blockNumber = header.number;
  report = {
    queriedAt: new Date().toISOString(),
    rpcOrigins: origins,
    chainId: 84532,
    block: {
      number: blockNumber,
      hash: header.hash,
      timestamp: header.timestamp,
      utc: new Date(Number(header.timestamp) * 1000).toISOString(),
    },
    checks: {},
  };
  const read = (address, abi, functionName, args = [], c = client) =>
    c.readContract({ address, abi, functionName, args, blockNumber });
  const artifact = await load(
    "contracts/out/DealzaOperator.sol/DealzaOperator.json",
  );
  check(
    same(artifact.abi, operatorAbi) &&
      keccak256(artifact.deployedBytecode.object) === operatorRuntimeHash,
    "ABI/artifact mismatch",
  );
  report.runtimeChecks = [];
  for (const c of [client, second])
    for (const [address, expected] of [
      [operator, operatorRuntimeHash],
      [escrow, protocol.escrow.runtime_keccak256],
      [collector, protocol.collector.runtime_keccak256],
    ]) {
      const actual = keccak256(await c.getCode({ address, blockNumber }));
      check(actual === expected, "Runtime mismatch " + address);
      report.runtimeChecks.push({
        rpc: origins[c === client ? 0 : 1],
        address,
        expected,
        actual,
      });
    }
  check(
    same(await read(operator, operatorAbi, "ESCROW"), escrow) &&
      same(await read(operator, operatorAbi, "COLLECTOR"), collector) &&
      same(await read(operator, operatorAbi, "USDC"), usdc) &&
      (await read(operator, operatorAbi, "CHAIN_ID")) === 84532n &&
      same(await read(collector, collectorAbi, "authCaptureEscrow"), escrow),
    "Contract bindings",
  );
  const receipts = await Promise.all(
    [client, second].map((c) => c.getTransactionReceipt({ hash })),
  );
  const receipt = receipts[0];
  report.transaction5 = {
    hash,
    receipts,
    confirmations: blockNumber - receipt.blockNumber + 1n,
  };
  check(
    same(receipts[0], receipts[1]) &&
      receipt.status === "success" &&
      receipt.blockNumber === 53879876n,
    "Receipt disagreement/failure",
  );
  const [mined, otherMined, transaction] = await Promise.all([
    client.getBlock({
      blockNumber: receipt.blockNumber,
      includeTransactions: true,
    }),
    second.getBlock({ blockNumber: receipt.blockNumber }),
    client.getTransaction({ hash }),
  ]);
  check(
    mined.hash === receipt.blockHash &&
      otherMined.hash === receipt.blockHash &&
      mined.transactions.some((t) => t.hash === hash),
    "Noncanonical transaction",
  );
  const acknowledgment = await readFile(
    new URL(
      "docs/verification/first-live-payment/reservation/controlled-test-acknowledgment.txt",
      root,
    ),
    "utf8",
  );
  check(
    acknowledgment === prepared.acknowledgment &&
      keccak256(toHex(acknowledgment)) === prepared.evidenceHash,
    "Intended evidence mismatch",
  );
  const deliveryLogs = receipt.logs.filter((l) => same(l.address, operator));
  check(deliveryLogs.length === 1, "Unexpected operator event count");
  const delivery = decodeEventLog({
    abi: operatorAbi,
    ...deliveryLogs[0],
    strict: true,
  });
  check(
    delivery.eventName === "DeliveryNoted" &&
      delivery.args.orderId === id &&
      delivery.args.evidenceHash === prepared.evidenceHash &&
      !deliveryLogs[0].removed,
    "Wrong delivery event",
  );
  report.transaction5 = {
    ...report.transaction5,
    outerTransaction: transaction,
    minedTime: new Date(Number(mined.timestamp) * 1000).toISOString(),
    deliveryLog: deliveryLogs[0],
    decodedDelivery: delivery,
    acknowledgment,
    evidenceHash: prepared.evidenceHash,
    eventAbi: getAbiItem({ abi: operatorAbi, name: "DeliveryNoted" }),
  };
  // Decode actual wallet routing rather than assuming outer sender is seller.
  const managerSource = await load(
    "docs/verification/first-live-payment/reservation/delegation-manager-verified.json",
  );
  const manager = managerSource.address;
  check(
    managerSource.runtimeMatch === "exact_match" &&
      same(
        await client.getCode({ address: manager, blockNumber }),
        managerSource.runtimeBytecode.onchainBytecode,
      ),
    "Manager runtime mismatch",
  );
  if (same(transaction.to, manager)) {
    const envelope = decodeFunctionData({
      abi: managerSource.abi,
      data: transaction.input,
    });
    check(
      envelope.functionName === "redeemDelegations" &&
        envelope.args.every((a) => a.length === 1) &&
        envelope.args[1][0] === toHex(0n, { size: 32 }),
      "Unexpected wallet batch",
    );
    const execution = envelope.args[2][0];
    check(
      same(execution.slice(0, 42), operator) &&
        BigInt("0x" + execution.slice(42, 106)) === 0n &&
        same("0x" + execution.slice(106), prepared.transaction.data),
      "Wrong inner call",
    );
    report.transaction5.decodedEnvelope = envelope;
  } else
    check(
      same(transaction.from, seller) &&
        same(transaction.to, operator) &&
        same(transaction.input, prepared.transaction.data),
      "Unrecognized acknowledgment route",
    );
  check(
    transaction.chainId === 84532 && transaction.value === 0n,
    "Wrong chain/value",
  );
  const tokenStore = await read(escrow, escrowAbi, "getTokenStore", [operator]);
  check(same(tokenStore, reserved.tokenStore), "Custody destination changed");
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
  report.historical = { before, after };
  report.current = current;
  report.tokenStore = tokenStore;
  for (const state of [before, after, current]) {
    check(
      same(state.orders.original, reserved.current.orders.original),
      "Order/payment/delivery storage changed",
    );
    check(
      same(state.orders.duplicate, reserved.current.orders.duplicate) &&
        state.orders.duplicate.status === 5,
      "Duplicate changed",
    );
    check(
      same(state.balances, reserved.current.balances) &&
        state.balances.buyer === 20000000n &&
        state.balances.seller === 0n &&
        state.balances.tokenStore === 1000000n &&
        state.allowance === 0n,
      "Unexpected financial state",
    );
    check(
      same(await snapshot(state.blockNumber, second), state),
      "RPC state disagreement",
    );
  }
  check(
    (await second.getBlock({ blockNumber })).hash === header.hash,
    "RPC block disagreement",
  );
  const history = { token: [], operator: [], escrow: [] };
  for (
    let from = BigInt(reserved.block.number) + 1n;
    from <= blockNumber;
    from += 9999n
  ) {
    const to = from + 9998n < blockNumber ? from + 9998n : blockNumber;
    const logs = await Promise.all(
      [usdc, operator, escrow].map((address) =>
        client.getLogs({ address, fromBlock: from, toBlock: to }),
      ),
    );
    for (const l of logs[0])
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
              [buyer, seller, tokenStore, operator, escrow, collector].some(
                (w) => same(w, a),
              ),
          )
        )
          history.token.push({ ...l, decoded: e });
      }
    for (const l of logs[1]) {
      const e = decodeEventLog({ abi: operatorAbi, ...l, strict: true });
      if ([id, prior.duplicate.id].includes(e.args.orderId))
        history.operator.push({ ...l, decoded: e });
    }
    for (const l of logs[2]) {
      const e = decodeEventLog({ abi: escrowAbi, ...l, strict: true });
      if (
        [paymentHash, prior.duplicate.paymentHash].includes(
          e.args.paymentInfoHash,
        )
      )
        history.escrow.push({ ...l, decoded: e });
    }
  }
  report.lifecycleHistory = {
    fromBlock: BigInt(reserved.block.number) + 1n,
    toBlock: blockNumber,
    ...history,
  };
  check(
    history.token.length === 0 &&
      history.escrow.length === 0 &&
      history.operator.length === 1 &&
      history.operator[0].transactionHash === hash &&
      history.operator[0].decoded.eventName === "DeliveryNoted",
    "Unexpected transfer/capture/refund/lifecycle event",
  );
  const p = current.orders.original.order.payment;
  check(
    same(p.payer, buyer) &&
      same(p.receiver, seller) &&
      same(p.operator, operator) &&
      same(p.token, usdc) &&
      p.maxAmount === 1000000n &&
      p.minFeeBps === 0 &&
      p.maxFeeBps === 0 &&
      BigInt(p.feeReceiver) === 0n,
    "Wrong payment terms",
  );
  const typeHash = keccak256(
    toHex(
      "PaymentInfo(address operator,address payer,address receiver,address token,uint120 maxAmount,uint48 preApprovalExpiry,uint48 authorizationExpiry,uint48 refundExpiry,uint16 minFeeBps,uint16 maxFeeBps,address feeReceiver,uint256 salt)",
    ),
  );
  const structHash = keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        getAbiItem({ abi: operatorAbi, name: "fund" }).inputs[1],
      ],
      [typeHash, p],
    ),
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
    "Payment hash mismatch",
  );
  report.hashVerification = { typeHash, structHash, computedHash, payment: p };
  report.deadline = {
    authorizationExpiry: p.authorizationExpiry,
    utc: new Date(p.authorizationExpiry * 1000).toISOString(),
    chainTime: header.timestamp,
    secondsRemaining: BigInt(p.authorizationExpiry) - header.timestamp,
  };
  check(report.deadline.secondsRemaining > 0n, "Authorization expired");
  report.deliveryState =
    "DeliveryNoted is an informational event only. No delivery flag or evidence hash is stored in Order; complete order storage is unchanged.";
  report.checks.phase1 =
    "PASS: two RPC receipts/state, exact evidence, unchanged custody, no token/payment lifecycle movements, duplicate Voided, unexpired";
  console.error("PASS Phase 1: delivery acknowledgment and financial state");
  await writeFile(
    new URL("evidence.json", out),
    stringify({ ...report, result: "PHASE_1_PASS_ONLY" }) + "\n",
  );
  const fn = getAbiItem({ abi: operatorAbi, name: "release" });
  const direct = {
    from: buyer,
    to: operator,
    value: "0x0",
    data: encode(operatorAbi, "release", [id]),
  };
  for (const c of [client, second])
    await c.call({ ...direct, account: buyer, blockNumber });
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
      name === "seller"
        ? 1000000n
        : name === "tokenStore"
          ? 0n
          : current.balances[name],
    ]);
  reads.push([usdc, erc20Abi, "allowance", [buyer, collector], 0n]);
  for (const [label, item] of Object.entries(current.orders))
    reads.push(
      [
        operator,
        operatorAbi,
        "getOrder",
        [item.id],
        label === "original" ? { ...item.order, status: 4 } : item.order,
      ],
      [
        operator,
        operatorAbi,
        "status",
        [item.id],
        label === "original" ? 4 : item.status,
      ],
      [
        escrow,
        escrowAbi,
        "paymentState",
        [item.order.paymentHash],
        label === "original" ? [true, 0n, 1000000n] : item.paymentState,
      ],
      [
        collector,
        collectorAbi,
        "isPreApproved",
        [item.order.paymentHash],
        item.preApproved,
      ],
    );
  async function simulate(label, first) {
    const request = {
      blockStateCalls: [
        {
          calls: [
            first,
            ...reads.map(([to, abi, name, args]) => ({
              from: buyer,
              to,
              data: encode(abi, name, args),
            })),
            direct,
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
      calls.length === reads.length + 2 &&
        calls.slice(0, -1).every((c) => c.status === "0x1"),
      label + " failed",
    );
    const events = calls[0].logs.map((l) => {
      const abi = same(l.address, operator)
        ? operatorAbi
        : same(l.address, escrow)
          ? escrowAbi
          : same(l.address, usdc)
            ? erc20Abi
            : null;
      check(abi, "Unknown release log");
      return {
        address: l.address,
        ...decodeEventLog({ abi, ...l, strict: true }),
      };
    });
    check(
      same(
        events.map((e) => e.eventName),
        ["PaymentCaptured", "TokenStoreCreated", "Transfer", "OrderReleased"],
      ),
      "Unexpected release events",
    );
    check(
      events[0].args.paymentInfoHash === paymentHash &&
        events[0].args.amount === 1000000n &&
        events[0].args.feeAmount === 0n &&
        BigInt(events[0].args.feeReceiver) === 0n,
      "Wrong capture",
    );
    check(
      same(events[2].args.from, tokenStore) &&
        same(events[2].args.to, seller) &&
        events[2].args.value === 1000000n,
      "Wrong settlement transfer",
    );
    check(
      events[3].args.orderId === id && same(events[3].args.authorizedBy, buyer),
      "Wrong release authorization",
    );
    check(
      same(events[1].address, escrow) &&
        same(events[1].args.operator, operator) &&
        same(events[1].args.tokenStore, tokenStore),
      "Wrong lazy TokenStore creation",
    );
    const assertions = reads.map(
      ([address, abi, functionName, args, expected], i) => {
        const actual = decodeFunctionResult({
          abi,
          functionName,
          data: calls[i + 1].returnData,
        });
        check(same(actual, expected), label + " unexpected " + functionName);
        return { address, functionName, args, expected, actual, passed: true };
      },
    );
    const duplicate = calls.at(-1);
    check(
      duplicate.status === "0x0" && duplicate.logs.length === 0,
      "Duplicate release accepted",
    );
    const error = decodeErrorResult({
      abi: operatorAbi,
      data: duplicate.error.data,
    });
    check(error.errorName === "InvalidState", "Wrong duplicate revert");
    return {
      label,
      request,
      result,
      events,
      assertions,
      duplicateRevert: error,
      passed: true,
    };
  }
  report.directSimulation = await simulate("Buyer direct release", direct);
  const delegate = "0x63c0c19a282a1b52b07dd5a65b58948a07dae32b";
  check(
    same(current.accounts.buyer.code, concat(["0xef0100", delegate])),
    "Unknown buyer delegation",
  );
  check(
    keccak256(await client.getCode({ address: delegate, blockNumber })) ===
      "0x83805f9ac7395294043b10c3b7c1839b7e4582a3e693028c36df84978b09d4e2",
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
  report.routedSimulation = await simulate(
    "Current buyer delegated self-execution",
    routed,
  );
  for (const c of [client, second])
    await c.call({ ...routed, account: buyer, blockNumber });
  const gasPrice = await client.getGasPrice();
  const gas = await Promise.all(
    [direct, routed].map((tx) =>
      client
        .request({
          method: "eth_estimateGas",
          params: [tx, toHex(blockNumber)],
        })
        .then(BigInt),
    ),
  );
  const feeClient = createPublicClient({
    chain: baseSepolia,
    transport: http(origins[0]),
  }).extend(publicActionsL2());
  const totalFeeEstimates = await Promise.all(
    [direct, routed].map((tx) =>
      feeClient.estimateTotalFee({
        account: buyer,
        to: tx.to,
        data: tx.data,
        value: 0n,
      }),
    ),
  );
  report.totalFeeEstimates = {
    directWei: totalFeeEstimates[0],
    routedWei: totalFeeEstimates[1],
    includes:
      "L1 data + L2 execution + operator fee; latest-state public estimate",
  };
  check(
    totalFeeEstimates.every((fee) => current.accounts.buyer.ethWei > fee),
    "Insufficient estimated total fee",
  );
  const pendingNonce = await client.getTransactionCount({
    address: buyer,
    blockTag: "pending",
  });
  check(
    pendingNonce === current.accounts.buyer.nonce,
    "Pending buyer transaction",
  );
  check(
    current.accounts.buyer.ethWei > gas[0] * gasPrice &&
      current.accounts.buyer.ethWei > gas[1] * gasPrice,
    "Insufficient execution gas",
  );
  report.preparedTransaction = {
    transaction: { chainId: "0x14a34", ...direct },
    function: toFunctionSignature(fn),
    arguments: [id],
    paymentHash,
    approvedPaymentInfo: p,
    seller,
    amountRaw: 1000000n,
    platformFeeRaw: 0n,
    estimatedGas: gas[0],
    gasPriceWei: gasPrice,
    estimatedExecutionCostWei: gas[0] * gasPrice,
    buyerEthWei: current.accounts.buyer.ethWei,
    buyerNonce: current.accounts.buyer.nonce,
    pendingNonce,
    routedSelfExecutionTransaction: { chainId: "0x14a34", ...routed },
    routedEstimatedGas: gas[1],
    routedExecutionCostWei: gas[1] * gasPrice,
    totalFeeEstimates: report.totalFeeEstimates,
    feeCaveat:
      "Execution-only amounts are separate from totalFeeEstimates, which include Base L1 data/operator fees for these two routes; future wallet routing may differ. Review refreshed total fee in MetaMask; no fixed nonce or gas limit prescribed.",
    restriction: "Unsigned Transaction 6 only. Settlement remains unperformed.",
  };
  check(same(await snapshot(blockNumber), current), "Persistent state changed");
  check(
    (await client.getBlock({ blockNumber })).hash === header.hash,
    "Snapshot reorg",
  );
  const freshHeader = await client.getBlock({
    blockNumber: (await client.getBlockNumber({ cacheTime: 0 })) - 2n,
  });
  const freshStates = await Promise.all(
    [client, second].map((c) => snapshot(freshHeader.number, c)),
  );
  for (const state of freshStates)
    check(
      same({ ...state, blockNumber }, current),
      "Financial state changed during preparation",
    );
  check(
    (await second.getBlock({ blockNumber: freshHeader.number })).hash ===
      freshHeader.hash,
    "Refresh RPC block disagreement",
  );
  check(
    freshHeader.timestamp < BigInt(p.authorizationExpiry),
    "Expired during preparation",
  );
  for (const c of [client, second])
    for (const tx of [direct, routed])
      await c.call({ ...tx, account: buyer, blockNumber: freshHeader.number });
  report.finalRefresh = {
    block: {
      number: freshHeader.number,
      hash: freshHeader.hash,
      timestamp: freshHeader.timestamp,
      utc: new Date(Number(freshHeader.timestamp) * 1000).toISOString(),
    },
    states: freshStates,
    directAndRoutedEthCallBothRPCs: true,
  };
  report.checks.phase2 =
    "PASS: buyer access, exact stored payment, direct/current EIP-7702 simulation, full poststate and duplicate rejection, execution gas affordable";
  report.result = "GO_TRANSACTION_6_ONLY";
  report.signingPerformed = false;
  report.broadcastPerformed = false;
  report.stateOverridesUsed = false;
  await writeFile(new URL("evidence.json", out), stringify(report) + "\n");
  await writeFile(
    new URL("transaction-6-unsigned.json", out),
    stringify(report.preparedTransaction) + "\n",
  );
  console.log(
    stringify({
      result: report.result,
      block: report.block,
      deadline: report.deadline,
      balances: current.balances,
      preparedTransaction: report.preparedTransaction,
    }),
  );
} catch (error) {
  report.result = "NO_GO_TRANSACTION_6";
  report.failure = error.shortMessage ?? error.message;
  await rm(new URL("transaction-6-unsigned.json", out), { force: true });
  await writeFile(new URL("evidence.json", out), stringify(report) + "\n");
  throw error;
}
