import { useCallback, useEffect, useRef, useState } from "react";
import { friendlyError } from "./domain";
import type { Page } from "./gateway";

// Scope changes abort queued scans and discard late responses, including Load older.
// A page is committed only after every RPC chunk and enrichment read succeeds.
export function useHistory<T>(
  scope: string | null,
  fetchPage: (before?: bigint, signal?: AbortSignal) => Promise<Page<T>>,
  key: (item: T) => string,
) {
  const [page, setPage] = useState<Page<T> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const current = useRef({ fetchPage, key });
  current.current = { fetchPage, key };
  const request = useRef<AbortController | null>(null);
  const cursor = useRef<bigint | undefined>(undefined);
  const busy = useRef(false);
  const run = useCallback(async (before?: bigint) => {
    if (busy.current) return;
    const controller = new AbortController();
    request.current = controller;
    cursor.current = before;
    busy.current = true;
    setLoading(true);
    setError("");
    try {
      const result = await current.current.fetchPage(before, controller.signal);
      if (controller.signal.aborted) return;
      setPage((old) => {
        const items = [
          ...(before === undefined ? [] : old?.items || []),
          ...result.items,
        ];
        const seen = new Set<string>();
        return {
          ...result,
          through:
            before === undefined
              ? result.through
              : (old?.through ?? result.through),
          items: items.filter((item) => {
            const id = current.current.key(item);
            if (seen.has(id)) return false;
            seen.add(id);
            return true;
          }),
        };
      });
    } catch (e) {
      if (!controller.signal.aborted) setError(friendlyError(e));
    } finally {
      if (!controller.signal.aborted) {
        busy.current = false;
        setLoading(false);
      }
    }
  }, []);
  useEffect(() => {
    request.current?.abort();
    busy.current = false;
    setPage(null);
    setError("");
    setLoading(false);
    if (scope) void run();
    return () => {
      request.current?.abort();
    };
  }, [scope, version, run]);
  return {
    page,
    loading,
    error,
    older: () => page?.next !== undefined && run(page.next),
    retry: () => run(cursor.current),
    refresh: () => setVersion((v) => v + 1),
  };
}
