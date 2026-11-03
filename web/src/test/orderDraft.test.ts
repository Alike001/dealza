import { describe, expect, it, vi } from "vitest";
import {
  emptyOrderForm,
  orderDraftKey,
  readOrderDraft,
  writeOrderDraft,
} from "../lib/orderDraft";
import { network } from "../lib/config";
import { api, buyer, seller, session, text } from "./fixtures";

const key = () => orderDraftKey(session(seller), api().deployment)!;
describe("untrusted order draft storage", () => {
  it("scopes by account, chain and deployment, with normalized account casing", () => {
    expect(key()).not.toBe(orderDraftKey(session(buyer), api().deployment));
    expect(key()).not.toBe(orderDraftKey(session(seller, 1), api().deployment));
    expect(key()).not.toBe(orderDraftKey(session(seller), null));
    expect(orderDraftKey(null, api().deployment)).toBeNull();
    const lower = network.usdc.toLowerCase() as typeof network.usdc;
    expect(orderDraftKey(session(network.usdc), api().deployment)).toBe(
      orderDraftKey(session(lower), api().deployment),
    );
  });
  it("persists only editable strings, excluding signatures, sessions and success claims", () => {
    const form = {
      ...emptyOrderForm(),
      description: text,
      signature: "SECRET",
      privateKey: "SECRET",
      session: session(),
      created: true,
      tx: { hash: "SECRET" },
    };
    writeOrderDraft(key(), form);
    expect(JSON.parse(localStorage.getItem(key())!)).toEqual({
      version: 2,
      form: { ...emptyOrderForm(), description: text },
    });
    expect(localStorage.getItem(key())).not.toContain("SECRET");
    expect(readOrderDraft(key())).toEqual({
      ...emptyOrderForm(),
      description: text,
    });
  });
  it.each([
    "{",
    "null",
    "[]",
    '{"version":1,"form":{}}',
    JSON.stringify({ version: 2, form: { ...emptyOrderForm(), amount: 123 } }),
    JSON.stringify({
      version: 2,
      form: { ...emptyOrderForm(), description: "x".repeat(1601) },
    }),
    "x".repeat(12001),
  ])("ignores corrupt or unsupported storage: %s", (raw) => {
    localStorage.setItem(key(), raw);
    expect(readOrderDraft(key())).toBeNull();
  });
  it("does not import a legacy draft with unknown ownership", () => {
    localStorage.setItem(
      "dealza:order-draft:v1",
      JSON.stringify({ ...emptyOrderForm(), description: text }),
    );
    expect(readOrderDraft(key())).toBeNull();
    expect(readOrderDraft(null)).toBeNull();
    expect(() => writeOrderDraft(null, emptyOrderForm())).toThrow(
      "Connect a wallet",
    );
  });
  it("tolerates blocked reads and reports blocked writes", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readOrderDraft(key())).toBeNull();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    expect(() => writeOrderDraft(key(), emptyOrderForm())).toThrow("quota");
  });
});
