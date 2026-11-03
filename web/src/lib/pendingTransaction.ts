import type { Address, Hash, Hex } from "viem";
import type { Action, CreateTerms, OrderSnapshot } from "./domain";
export type Intent = {
  version: 1;
  actor: Address;
  operator: Address;
  data: Hex;
  target: Address;
  action: Action | "create";
  before?: OrderSnapshot;
  terms?: CreateTerms;
  proof: Hash;
  hash?: Hash;
  hashes?: Hash[];
  cancelled?: boolean;
};
export const pendingKey = (actor: Address, operator: Address) =>
  `dealza:pending:84532:${operator.toLowerCase()}:${actor.toLowerCase()}`;
const encode = (v: unknown) =>
  JSON.stringify(v, (_, x) =>
    typeof x === "bigint" ? { bigint: x.toString() } : x,
  );
const decode = (v: string) =>
  JSON.parse(v, (_, x) =>
    x &&
    typeof x === "object" &&
    Object.keys(x).length === 1 &&
    typeof x.bigint === "string"
      ? BigInt(x.bigint)
      : x,
  );
export function pendingIntent(
  actor: Address,
  operator: Address,
): Intent | null {
  const value = localStorage.getItem(pendingKey(actor, operator));
  if (!value) return null;
  try {
    const p = decode(value) as Intent;
    if (
      p.version !== 1 ||
      p.actor.toLowerCase() !== actor.toLowerCase() ||
      p.operator.toLowerCase() !== operator.toLowerCase()
    )
      throw Error();
    return p;
  } catch {
    throw Error(
      "Saved transaction data cannot be read. Inspect this wallet’s transaction history before submitting anything.",
    );
  }
}
export function saveIntent(intent: Intent) {
  localStorage.setItem(
    pendingKey(intent.actor, intent.operator),
    encode(intent),
  );
  window.dispatchEvent(new Event("dealza:pending"));
}
export function clearIntent(intent: Intent) {
  localStorage.removeItem(pendingKey(intent.actor, intent.operator));
  window.dispatchEvent(new Event("dealza:pending"));
}
export function beginIntent(intent: Intent) {
  if (pendingIntent(intent.actor, intent.operator))
    throw Error(
      "This wallet has an unresolved transaction. Recheck the saved transaction before submitting again.",
    );
  saveIntent(intent);
}
export function savedCreation(
  actor: Address,
  operator: Address,
  data: Hex,
): Hash | null {
  const value = localStorage.getItem(pendingKey(actor, operator) + ":created");
  if (!value) return null;
  const p = decode(value);
  return p.data === data ? p.id : null;
}
export function rememberCreation(intent: Intent, id: Hash) {
  localStorage.setItem(
    pendingKey(intent.actor, intent.operator) + ":created",
    encode({ data: intent.data, id }),
  );
}
export class SubmittedTransactionError extends Error {
  readonly name = "SubmittedTransactionError";
  constructor(
    message: string,
    readonly hash?: Hash,
  ) {
    super(message);
  }
}

export function trackHash(intent: Intent, hash: Hash) {
  intent.hashes = [
    ...new Set([
      ...(intent.hashes ?? []),
      ...(intent.hash ? [intent.hash] : []),
      hash,
    ]),
  ];
  intent.hash = hash;
  saveIntent(intent);
}
