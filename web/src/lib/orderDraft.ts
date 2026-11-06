import type { Deployment } from "./config";
import type { Session } from "./wallet";

export const emptyOrderForm = () => ({
  description: "",
  buyer: "",
  reviewer: "",
  amount: "",
  fundingCutoff: "",
  expiry: "",
});
export type OrderForm = ReturnType<typeof emptyOrderForm>;
const limits: Record<keyof OrderForm, number> = {
  description: 1600,
  buyer: 42,
  reviewer: 42,
  amount: 64,
  fundingCutoff: 32,
  expiry: 32,
};

// Never adopt the legacy unscoped v1 draft: its owner and network are unknown.
export function orderDraftKey(
  session: Session | null,
  deployment: Deployment | null,
) {
  return session
    ? `dealza:order-draft:v2:${session.chainId}:${session.account.toLowerCase()}:${deployment?.operator.toLowerCase() ?? "undeployed"}`
    : null;
}

// Storage is untrusted. Only these editable strings may cross this boundary;
// wallet objects, signatures, transaction results and reviewed terms never do.
function editableFields(value: unknown): OrderForm | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const form = emptyOrderForm();
  for (const name of Object.keys(form) as (keyof OrderForm)[]) {
    const field = (value as Record<string, unknown>)[name];
    if (typeof field !== "string" || field.length > limits[name]) return null;
    form[name] = field;
  }
  return form;
}
export function readOrderDraft(key: string | null): OrderForm | null {
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw || raw.length > 12_000) return null;
    const record = JSON.parse(raw);
    return record?.version === 2 ? editableFields(record.form) : null;
  } catch {
    return null;
  }
}
export function writeOrderDraft(key: string | null, value: OrderForm) {
  if (!key)
    throw new Error("Connect a wallet before saving an account-scoped draft.");
  const form = editableFields(value);
  if (!form)
    throw new Error(
      "Draft fields are too long to save. Shorten them and try again.",
    );
  localStorage.setItem(key, JSON.stringify({ version: 2, form }));
}
export function removeOrderDraft(key: string | null) {
  if (key) {
    localStorage.removeItem(key);
    localStorage.removeItem(`${key}:progress`);
  }
}

// Progress is only a navigation hint. It never restores review or authorization.
export function readDraftStage(key: string | null): number {
  if (!key) return 0;
  try {
    const stage = JSON.parse(localStorage.getItem(`${key}:progress`) ?? "null");
    return Number.isInteger(stage) && stage >= 0 && stage <= 2 ? stage : 0;
  } catch {
    return 0;
  }
}
export function writeDraftStage(key: string | null, stage: number) {
  if (key)
    localStorage.setItem(
      `${key}:progress`,
      JSON.stringify(Math.min(2, Math.max(0, stage))),
    );
}
