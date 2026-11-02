import { describe, expect, it } from "vitest";
import {
  allowedActions,
  amountFromText,
  financialStatus,
  validateTerms,
} from "../lib/domain";
import { configuredDeployment } from "../lib/config";
import { buyer, reviewer, seller, snapshot, text } from "./fixtures";

describe("financial permissions and status", () => {
  it("fails closed when actual TokenStore USDC is below this order authorization", () => {
    const s = snapshot({ storeBalance: 0n });
    expect(() => financialStatus(s)).toThrow("reserve balance");
    expect(() => allowedActions(s, buyer)).toThrow("reserve balance");
  });
  it("only the buyer can ordinarily release; delivery is not authorization", () => {
    expect(allowedActions(snapshot(), buyer)).toContain("release");
    expect(allowedActions(snapshot(), seller)).not.toContain("release");
    expect(allowedActions(snapshot(), reviewer)).not.toContain(
      "resolveRelease",
    );
    expect(allowedActions(snapshot(), undefined)).toEqual([]);
  });
  it("blocks buyer release during a dispute and permits only recorded reviewer decisions", () => {
    const s = snapshot();
    s.order.status = 3;
    s.derived = 3;
    expect(allowedActions(s, buyer)).not.toContain("release");
    expect(allowedActions(s, buyer)).not.toContain("cancel");
    expect(allowedActions(s, reviewer)).toEqual([
      "resolveRelease",
      "resolveVoid",
    ]);
    expect(allowedActions(s, seller)).toContain("cancel");
  });
  it("at expiry an unresolved dispute can be reclaimed, with no reviewer release", () => {
    const s = snapshot({ chainTime: 3000, derived: 6 });
    s.order.status = 3;
    expect(financialStatus(s)).toBe("Recovery available");
    expect(allowedActions(s, buyer)).toContain("reclaim");
    expect(allowedActions(s, buyer)).not.toContain("release");
    expect(allowedActions(s, reviewer)).toEqual([]);
  });
  it("recognizes direct CPP reclaim even when the stored dispute status lags", () => {
    const s = snapshot({ chainTime: 3000, held: 0n, captured: 0n, derived: 7 });
    s.order.status = 3;
    expect(financialStatus(s)).toBe("Recovered by buyer");
    expect(allowedActions(s, buyer)).toEqual(["sync"]);
  });
  it("does not call a reservation paid; requires matching captured accounting", () => {
    const s = snapshot();
    expect(financialStatus(s)).toBe("Payment reserved");
    s.order.status = 4;
    expect(() => financialStatus(s)).toThrow("do not agree");
    s.held = 0n;
    s.captured = 1_000_000n;
    s.derived = 4;
    expect(financialStatus(s)).toBe("Paid to seller");
    expect(allowedActions(s, buyer)).not.toContain("reclaim");
  });
  it("expired pending orders cannot be funded or pre-approved", () => {
    const s = snapshot({
      collected: false,
      held: 0n,
      preApproved: false,
      chainTime: 2000,
      derived: 6,
    });
    s.order.status = 1;
    expect(financialStatus(s)).toBe("Payment window closed");
    expect(allowedActions(s, buyer)).toEqual(["cancel"]);
  });
  it("requires actual allowance, terms approval, token balance and gas before funding", () => {
    const s = snapshot({
      collected: false,
      held: 0n,
      preApproved: false,
      derived: 1,
    });
    s.order.status = 1;
    expect(allowedActions(s, buyer)).not.toContain("fund");
    s.preApproved = true;
    s.allowance = 1_000_000n;
    expect(allowedActions(s, buyer)).toContain("fund");
    s.buyerGas = 0n;
    expect(allowedActions(s, buyer)).not.toContain("fund");
  });
});
describe("terms and deployment configuration", () => {
  it.each(["0", "-1", "1e6", "1,000", "0.0000001", ""])(
    "rejects invalid monetary input %s",
    (value) => expect(() => amountFromText(value)).toThrow(),
  );
  it("preserves six-decimal USDC precision without floating point arithmetic", () => {
    expect(amountFromText("1.000001")).toBe(1_000_001n);
    expect(amountFromText("999999999.999999")).toBe(999999999999999n);
  });
  it("rejects substituted participant roles and dates outside contract bounds", () => {
    const input = {
      buyer,
      reviewer,
      amount: "1",
      description: text,
      fundingCutoff: new Date(2_000_000).toISOString(),
      expiry: new Date(3_000_000).toISOString(),
    };
    expect(validateTerms(input, seller, 1000).amount).toBe(1_000_000n);
    expect(() =>
      validateTerms({ ...input, reviewer: buyer }, seller, 1000),
    ).toThrow("different wallets");
    expect(() => validateTerms(input, undefined, 1000)).toThrow("Connect");
    expect(() => validateTerms(input, seller, 4000)).toThrow("deadlines");
  });
  it("leaves missing deployment null and rejects accidental mainnet or invalid operator configuration", () => {
    expect(
      configuredDeployment({
        chainId: 84532,
        operator: null,
        deploymentBlock: null,
      }),
    ).toBeNull();
    expect(() =>
      configuredDeployment({
        chainId: 8453,
        operator: seller,
        deploymentBlock: 1,
      }),
    ).toThrow("Only Base Sepolia");
    expect(() =>
      configuredDeployment({
        chainId: 84532,
        operator: "0x0",
        deploymentBlock: 1,
      }),
    ).toThrow("incomplete");
  });
});
