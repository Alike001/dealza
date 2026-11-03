import { describe, expect, it, vi } from "vitest";
import { toHex, type Hash } from "viem";
import {
  createLogReader,
  historyRange,
  historyWindow,
  logBlockLimit,
} from "../lib/eventLogs";
import { operator } from "./fixtures";
const hash = (n: number) => toHex(n, { size: 32 }) as Hash;
const log = (block: number, index = 0) => ({
  address: operator,
  blockNumber: toHex(block),
  blockHash: hash(block),
  transactionHash: hash(block + 1000),
  logIndex: toHex(index),
  transactionIndex: "0x0",
  data: "0x",
  topics: [hash(42)],
  removed: false,
});
const options = { delayMs: 0, retryMs: 0 };

describe("bounded event retrieval", () => {
  it("caps configuration at 200 and accepts smaller provider limits", () => {
    expect(logBlockLimit()).toBe(200);
    expect(logBlockLimit("50")).toBe(50);
    for (const n of [0, -1, 201, 1.5, "x", Infinity])
      expect(() => logBlockLimit(n)).toThrow();
    expect(historyWindow()).toBe(2000);
    expect(() => historyWindow(10001)).toThrow();
  });
  it("covers inclusive 200-block boundaries exactly once across adjacent pages", async () => {
    const queries: [bigint, bigint][] = [];
    const request = vi.fn(async (f) => {
      const from = BigInt(f.fromBlock),
        to = BigInt(f.toBlock);
      queries.push([from, to]);
      return [1, 200, 201, 400, 401, 600]
        .filter((b) => BigInt(b) >= from && BigInt(b) <= to)
        .map((b) => log(b));
    });
    const read = createLogReader(request, options);
    const recent = historyRange(1n, 600n, 400),
      older = historyRange(1n, recent.next!, 400);
    const b = await read(operator, recent.from, recent.to),
      a = await read(operator, older.from, older.to);
    expect(queries).toEqual([
      [201n, 400n],
      [401n, 600n],
      [1n, 200n],
    ]);
    expect([...a, ...b].map((l) => l.blockNumber)).toEqual([
      1n,
      200n,
      201n,
      400n,
      401n,
      600n,
    ]);
    expect(older.next).toBeUndefined();
    expect(() => historyRange(53676176n, 53676175n, 200)).toThrow();
  });
  it("deduplicates by transaction hash and log index and sorts deterministically", async () => {
    const read = createLogReader(
      async () => [log(20, 1), log(10), log(20), log(10)],
      options,
    );
    expect(
      (await read(operator, 1n, 200n)).map((l) => [l.blockNumber, l.logIndex]),
    ).toEqual([
      [10n, 0],
      [20n, 0],
      [20n, 1],
    ]);
  });
  it("rejects conflicting duplicate records instead of hiding a reorg", async () => {
    const read = createLogReader(
      async () => [log(10), { ...log(10), data: "0x12" }],
      options,
    );
    await expect(read(operator, 1n, 200n)).rejects.toThrow("Conflicting");
  });
  it("shrinks the range and remembers the provider's smaller limit", async () => {
    const sizes: number[] = [];
    const read = createLogReader(async (f) => {
      const size = Number(BigInt(f.toBlock) - BigInt(f.fromBlock) + 1n);
      sizes.push(size);
      if (size > 50) throw Error("block range limit exceeded");
      return [];
    }, options);
    await expect(read(operator, 1n, 200n)).resolves.toEqual([]);
    await read(operator, 201n, 250n);
    expect(sizes).toEqual([200, 100, 50, 50, 50, 50, 50]);
  });
  it("retries transient rate limits at most twice", async () => {
    const request = vi
      .fn()
      .mockRejectedValueOnce(Error("429 rate limit"))
      .mockRejectedValueOnce(Error("503 temporarily unavailable"))
      .mockResolvedValue([]);
    await expect(
      createLogReader(request, options)(operator, 1n, 200n),
    ).resolves.toEqual([]);
    expect(request).toHaveBeenCalledTimes(3);
    const broken = vi.fn().mockRejectedValue(Error("network timeout"));
    await expect(
      createLogReader(broken, options)(operator, 1n, 200n),
    ).rejects.toThrow();
    expect(broken).toHaveBeenCalledTimes(3);
  });
  it("fails an entire page after a later chunk fails; retry restarts without a gap", async () => {
    let fail = true;
    const read = createLogReader(async (f) => {
      if (BigInt(f.fromBlock) === 201n && fail)
        throw Error("RPC invalid params");
      return [log(Number(BigInt(f.fromBlock)))];
    }, options);
    await expect(read(operator, 1n, 400n)).rejects.toThrow();
    fail = false;
    expect((await read(operator, 1n, 400n)).map((l) => l.blockNumber)).toEqual([
      1n,
      201n,
    ]);
  });
  it.each([
    null,
    {},
    [null],
    [{ ...log(1), removed: true }],
    [{ ...log(1), transactionHash: null }],
    [log(201)],
  ])(
    "rejects malformed, partial or out-of-range responses (%j)",
    async (result) => {
      await expect(
        createLogReader(async () => result, options)(operator, 1n, 200n),
      ).rejects.toThrow();
    },
  );
  it("accepts empty ranges without querying the provider", async () => {
    const request = vi.fn();
    expect(await createLogReader(request, options)(operator, 2n, 1n)).toEqual(
      [],
    );
    expect(request).not.toHaveBeenCalled();
  });
  it("serializes concurrent consumers and stops interrupted queued work", async () => {
    let release!: () => void;
    let entered!: () => void;
    const pending = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const request = vi.fn(async () => {
      entered();
      await new Promise<void>((r) => (release = r));
      return [];
    });
    const read = createLogReader(request, options),
      abort = new AbortController();
    const first = read(operator, 1n, 200n);
    await pending;
    const second = read(operator, 201n, 400n, undefined, abort.signal);
    abort.abort();
    const rejection = expect(second).rejects.toThrow();
    release();
    await first;
    await rejection;
    expect(request).toHaveBeenCalledTimes(1);
  });
});
