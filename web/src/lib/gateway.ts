import type { Address, Hash } from "viem";
import { deploymentConfig, type Deployment } from "./config";
import type {
  Action,
  Activity,
  CreateTerms,
  OrderSnapshot,
  TxState,
} from "./domain";
import type { Session } from "./wallet";

export type OrderItem = {
  id: Hash;
  seller: Address;
  buyer: Address;
  reviewer: Address;
  amount: bigint;
  expiry: number;
  block: bigint;
};
export type Page<T> = { items: T[]; next?: bigint; through: bigint };
export interface PaymentGateway {
  deployment: Deployment | null;
  verify(): Promise<void>;
  loadOrder(id: Hash): Promise<OrderSnapshot>;
  listOrders(account: Address, before?: bigint): Promise<Page<OrderItem>>;
  activity(s: OrderSnapshot, before?: bigint): Promise<Page<Activity>>;
  balances(account: Address): Promise<{ usdc: bigint; eth: bigint }>;
  create(
    terms: CreateTerms,
    session: Session,
    update: (state: TxState) => void,
  ): Promise<Hash>;
  act(
    action: Action,
    id: Hash,
    session: Session,
    update: (state: TxState) => void,
    evidence?: string,
  ): Promise<void>;
}

// The pending integration view needs no wallet/RPC client bundle. Load real chain code on demand.
const implementation = () => import("./chainGateway");
export const gateway: PaymentGateway = {
  deployment: deploymentConfig,
  verify: async () => (await implementation()).chainGateway.verify(),
  loadOrder: async (...args) =>
    (await implementation()).chainGateway.loadOrder(...args),
  listOrders: async (...args) =>
    (await implementation()).chainGateway.listOrders(...args),
  activity: async (...args) =>
    (await implementation()).chainGateway.activity(...args),
  balances: async (...args) =>
    (await implementation()).chainGateway.balances(...args),
  create: async (...args) =>
    (await implementation()).chainGateway.create(...args),
  act: async (...args) => (await implementation()).chainGateway.act(...args),
};
