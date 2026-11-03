// Test fixtures only. Production never imports this module or displays these balances/transactions.
import { vi } from "vitest";
import type { Address, Hash } from "viem";
import { descriptionHash, type OrderSnapshot } from "../lib/domain";
import type { PaymentGateway } from "../lib/gateway";
import type { Session, WalletState } from "../lib/wallet";
import { network } from "../lib/config";

export const buyer = "0x1111111111111111111111111111111111111111" as Address;
export const seller = "0x2222222222222222222222222222222222222222" as Address;
export const reviewer = "0x3333333333333333333333333333333333333333" as Address;
export const operator = "0x4444444444444444444444444444444444444444" as Address;
export const id = `0x${"ab".repeat(32)}` as Hash;
export const hash = `0x${"cd".repeat(32)}` as Hash;
export const text = "A handmade bowl, with agreed delivery and review terms.";
export function snapshot(
  overrides: Partial<OrderSnapshot> = {},
): OrderSnapshot {
  return {
    id,
    order: {
      payment: {
        operator,
        payer: buyer,
        receiver: seller,
        token: network.usdc,
        maxAmount: 1_000_000n,
        preApprovalExpiry: 2000,
        authorizationExpiry: 3000,
        refundExpiry: 3000,
        minFeeBps: 0,
        maxFeeBps: 0,
        feeReceiver: `0x${"0".repeat(40)}`,
        salt: BigInt(id),
      },
      reviewer,
      descriptionHash: descriptionHash(text),
      paymentHash: hash,
      status: 2,
    },
    derived: 2,
    collected: true,
    held: 1_000_000n,
    captured: 0n,
    allowance: 0n,
    preApproved: true,
    buyerBalance: 9_000_000n,
    buyerGas: 1_000_000n,
    tokenStore: "0x5555555555555555555555555555555555555555",
    storeBalance: 1_000_000n,
    chainTime: 1500,
    block: 500n,
    ...overrides,
  };
}
export function session(account = buyer, chainId = 84532): Session {
  return {
    account,
    chainId,
    provider: {
      request: vi.fn(async ({ method }) =>
        method === "eth_chainId" ? `0x${chainId.toString(16)}` : [account],
      ),
    },
  };
}
export function wallet(s: Session | null = session()): WalletState {
  return {
    session: s,
    choices: [],
    selected: "",
    connecting: false,
    error: "",
    select: vi.fn(),
    connect: vi.fn(),
    switchNetwork: vi.fn(),
    disconnect: vi.fn(),
  };
}
export function api(overrides: Partial<PaymentGateway> = {}): PaymentGateway {
  return {
    deployment: { operator, block: 1n },
    verify: vi.fn(async () => {}),
    resumePending: vi.fn(async () => undefined),
    loadOrder: vi.fn(async () => snapshot()),
    listOrders: vi.fn(async () => ({ items: [], through: 500n })),
    activity: vi.fn(async () => ({ items: [], through: 500n })),
    balances: vi.fn(async () => ({ usdc: 1_000_000n, eth: 1_000_000n })),
    create: vi.fn(async () => id),
    act: vi.fn(async () => {}),
    ...overrides,
  };
}
