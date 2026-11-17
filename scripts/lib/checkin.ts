// EIP-712 CheckIn, shared by the app, E2E tests and scripts.
import type { Address, Hex, LocalAccount, WalletClient } from "viem";
import { hashTypedData } from "viem";

export const checkInTypes = {
  CheckIn: [
    { name: "shop", type: "address" },
    { name: "pass", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export function checkInDomain(chainId: number, shop: Address) {
  return { name: "Till", version: "1", chainId, verifyingContract: shop } as const;
}

export function checkInDigest(chainId: number, shop: Address, pass: bigint, deadline: bigint): Hex {
  return hashTypedData({
    domain: checkInDomain(chainId, shop),
    types: checkInTypes,
    primaryType: "CheckIn",
    message: { shop, pass, deadline },
  });
}

export async function signCheckIn(
  signer: LocalAccount | { account: LocalAccount; wallet: WalletClient },
  chainId: number,
  shop: Address,
  pass: bigint,
  deadline: bigint,
): Promise<Hex> {
  const account = "account" in signer ? signer.account : signer;
  return account.signTypedData({
    domain: checkInDomain(chainId, shop),
    types: checkInTypes,
    primaryType: "CheckIn",
    message: { shop, pass, deadline },
  });
}

/** The QR payload a pass shows at the door. */
export type CheckInPayload = { v: 1; chainId: number; shop: Address; pass: string; deadline: string; sig: Hex };

export function encodeCheckIn(p: Omit<CheckInPayload, "v">): string {
  return JSON.stringify({ v: 1, ...p });
}

export function decodeCheckIn(text: string): CheckInPayload {
  const p = JSON.parse(text) as CheckInPayload;
  if (p.v !== 1 || !p.shop || !p.pass || !p.deadline || !p.sig) throw new Error("not a Till check-in code");
  return p;
}
