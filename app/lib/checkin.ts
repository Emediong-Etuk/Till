import type { Address, Hex } from "viem";
import { hashTypedData, recoverTypedDataAddress } from "viem";

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

export function checkInTypedData(chainId: number, shop: Address, pass: bigint, deadline: bigint) {
  return {
    domain: checkInDomain(chainId, shop),
    types: checkInTypes,
    primaryType: "CheckIn" as const,
    message: { shop, pass, deadline },
  };
}

export function checkInDigest(chainId: number, shop: Address, pass: bigint, deadline: bigint): Hex {
  return hashTypedData(checkInTypedData(chainId, shop, pass, deadline));
}

export async function recoverCheckIn(chainId: number, shop: Address, pass: bigint, deadline: bigint, sig: Hex): Promise<Address> {
  return recoverTypedDataAddress({ ...checkInTypedData(chainId, shop, pass, deadline), signature: sig });
}

/** The QR payload a pass shows at the door. */
export type CheckInPayload = { v: 1; chainId: number; shop: Address; pass: string; deadline: string; sig: Hex };

export function encodeCheckIn(p: Omit<CheckInPayload, "v">): string {
  return JSON.stringify({ v: 1, ...p });
}

export function decodeCheckIn(text: string): CheckInPayload {
  let p: CheckInPayload;
  try {
    p = JSON.parse(text.trim()) as CheckInPayload;
  } catch {
    throw new Error("That isn't a Till pass code");
  }
  if (p.v !== 1 || !p.shop || !p.pass || !p.deadline || !p.sig) throw new Error("That isn't a Till pass code");
  return p;
}
