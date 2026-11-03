import { useEffect, useReducer } from "react";
import type { Address } from "viem";
import type { Session } from "./wallet";
import { pendingIntent } from "./pendingTransaction";
export function usePendingRequest(session: Session | null, operator?: Address) {
  const [, refresh] = useReducer((n) => n + 1, 0);
  useEffect(() => {
    window.addEventListener("dealza:pending", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("dealza:pending", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  if (!session || !operator) return false;
  try {
    return !!pendingIntent(session.account, operator);
  } catch {
    return true;
  }
}
