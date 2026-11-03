import {
  formatLog,
  toHex,
  type Address,
  type Hash,
  type Hex,
  type Log,
  type RpcLog,
} from "viem";

export type ConfirmedLog = Log & {
  blockNumber: bigint;
  logIndex: number;
  transactionHash: Hash;
};
export function logBlockLimit(value: unknown = 200): number {
  const size = Number(value);
  if (!Number.isInteger(size) || size < 1 || size > 200)
    throw new Error("VITE_RPC_LOG_BLOCKS must be an integer from 1 to 200.");
  return size;
}
export function historyWindow(value: unknown = 2000): number {
  const size = Number(value);
  if (!Number.isInteger(size) || size < 1 || size > 10000)
    throw new Error("VITE_HISTORY_BLOCKS must be an integer from 1 to 10000.");
  return size;
}
export function historyRange(deployment: bigint, head: bigint, size: number) {
  if (head < deployment)
    throw new Error(
      "The history cursor is before the verified deployment block.",
    );
  const from =
    head - BigInt(size) + 1n > deployment
      ? head - BigInt(size) + 1n
      : deployment;
  return { from, to: head, next: from > deployment ? from - 1n : undefined };
}
export function checkAbort(signal?: AbortSignal) {
  signal?.throwIfAborted();
}
const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    checkAbort(signal);
    const abort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", abort, { once: true });
  });
export function mergeLogs(logs: ConfirmedLog[]): ConfirmedLog[] {
  const unique = new Map<string, ConfirmedLog>();
  for (const log of logs) {
    const key = `${log.transactionHash.toLowerCase()}:${log.logIndex}`;
    const old = unique.get(key);
    if (
      old &&
      (old.blockHash !== log.blockHash ||
        old.data !== log.data ||
        old.topics.join() !== log.topics.join())
    )
      throw new Error(
        "Conflicting history records. Refresh to read the canonical chain again.",
      );
    unique.set(key, log);
  }
  return [...unique.values()].sort((a, b) =>
    a.blockNumber === b.blockNumber
      ? a.logIndex - b.logIndex
      : a.blockNumber < b.blockNumber
        ? -1
        : 1,
  );
}
type LogFilter = {
  address: Address;
  fromBlock: Hex;
  toBlock: Hex;
  topics?: (Hex | null | Hex[])[];
};
type Request = (filter: LogFilter) => Promise<unknown>;
// One shared reader serializes *all* frontend log scans, including multiple components.
// Results are atomic: a failed later chunk never advances a page or hides a gap.
export function createLogReader(
  request: Request,
  options: { maxBlocks?: number; delayMs?: number; retryMs?: number } = {},
) {
  let learnedLimit = logBlockLimit(options.maxBlocks);
  let queue = Promise.resolve();
  async function scheduled<T>(
    work: () => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    const previous = queue;
    let release!: () => void;
    queue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      checkAbort(signal);
      await sleep(options.delayMs ?? 100, signal);
      return await work();
    } finally {
      release();
    }
  }
  return async (
    address: Address,
    from: bigint,
    to: bigint,
    topics?: LogFilter["topics"],
    signal?: AbortSignal,
  ): Promise<ConfirmedLog[]> => {
    checkAbort(signal);
    const logs: ConfirmedLog[] = [];
    for (let start = from; start <= to;) {
      checkAbort(signal);
      let end = start + BigInt(learnedLimit) - 1n;
      if (end > to) end = to;
      let result: unknown;
      let attempts = 0;
      for (;;) {
        try {
          result = await scheduled(
            () =>
              request({
                address,
                fromBlock: toHex(start),
                toBlock: toHex(end),
                ...(topics ? { topics } : {}),
              }),
            signal,
          );
          checkAbort(signal);
          break;
        } catch (error) {
          checkAbort(signal);
          const message = String(error);
          const rangeError =
            /block.*range|range.*(?:limit|large|maximum|exceed)|too many (?:blocks|results)|response size|query returned more|limited to.*range/i.test(
              message,
            );
          if (rangeError && end > start) {
            learnedLimit = Math.max(
              1,
              Math.floor(Number(end - start + 1n) / 2),
            );
            end = start + BigInt(learnedLimit) - 1n;
            attempts = 0;
            continue;
          }
          if (
            !rangeError &&
            /429|50[234]|timeout|timed out|fetch|network|rate.?limit|temporar|connection/i.test(
              message,
            ) &&
            attempts < 2
          ) {
            await sleep((options.retryMs ?? 500) * 2 ** attempts++, signal);
            continue;
          }
          throw error;
        }
      }
      if (!Array.isArray(result))
        throw new Error(
          "RPC returned incomplete history data. Retry this page.",
        );
      for (const raw of result) {
        if (
          !raw ||
          typeof raw !== "object" ||
          !/^0x[0-9a-f]+$/i.test(raw.blockNumber ?? "") ||
          !/^0x[0-9a-f]+$/i.test(raw.logIndex ?? "") ||
          !/^0x[0-9a-f]{64}$/i.test(raw.transactionHash ?? "") ||
          !/^0x[0-9a-f]{64}$/i.test(raw.blockHash ?? "") ||
          !Array.isArray(raw.topics) ||
          !raw.topics.every(
            (t: unknown) =>
              typeof t === "string" && /^0x[0-9a-f]{64}$/i.test(t),
          ) ||
          !/^0x(?:[0-9a-f]{2})*$/i.test(raw.data ?? "") ||
          raw.removed !== false ||
          raw.address?.toLowerCase() !== address.toLowerCase()
        )
          throw new Error(
            "RPC returned an invalid or unconfirmed history record. Retry this page.",
          );
        const item = formatLog(raw as RpcLog) as ConfirmedLog;
        if (
          item.blockNumber < start ||
          item.blockNumber > end ||
          (topics &&
            topics.some(
              (topic, index) =>
                topic !== null &&
                !(Array.isArray(topic) ? topic : [topic]).some(
                  (t) => t.toLowerCase() === item.topics[index]?.toLowerCase(),
                ),
            ))
        )
          throw new Error(
            "RPC returned a history record outside the requested filter.",
          );
        logs.push(item);
      }
      start = end + 1n;
    }
    return mergeLogs(logs);
  };
}
