import { describe, expect, it, beforeAll } from "vitest";
import { type Address, parseEther, parseSignature, serializeCompactSignature, signatureToCompactSignature, serializeSignature, toHex } from "viem";
import { ADA, KEMI, MALLORY, TOBI, accounts, addItem, client, data, freshShop, read, revertOf, write, now } from "./env.ts";
import { checkInDigest, signCheckIn } from "../scripts/lib/checkin.ts";

const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;

describe("EIP-712 check-in at the door", () => {
  let shop: Address;
  let item: bigint;
  let chainId: number;
  let deadline: bigint;
  beforeAll(async () => {
    ({ shop } = await freshShop());
    item = (await addItem(shop, parseEther("0.002"), 10n)).id;
    await write(TOBI, "Shop", shop, "buy", [item, 3n], parseEther("0.006"));
    chainId = await client.getChainId();
    deadline = (await now()) + 600n;
  });

  it("checkInDigest on-chain equals viem's hashTypedData", async () => {
    const onchain = await read<`0x${string}`>("Shop", shop, "checkInDigest", [1n, deadline]);
    expect(onchain).toBe(checkInDigest(chainId, shop, 1n, deadline));
  });

  it("the seller redeems with the holder's signature; escrow moves to the seller", async () => {
    const sig = await signCheckIn(accounts[TOBI]!, chainId, shop, 1n, deadline);
    const { receipt } = await write(ADA, "Shop", shop, "redeem", [1n, deadline, sig]);
    expect(receipt.status).toBe("success");
    const p = await read<{ redeemed: boolean }>("Shop", shop, "passOf", [1n]);
    expect(p.redeemed).toBe(true);
    const b = await read<{ seller_available: bigint; total_escrow: bigint }>("Shop", shop, "accounting");
    expect(b.seller_available).toBe(parseEther("0.002"));
    expect(b.total_escrow).toBe(parseEther("0.004"));
  });

  it("a replayed signature reverts with AlreadyRedeemed", async () => {
    const sig = await signCheckIn(accounts[TOBI]!, chainId, shop, 1n, deadline);
    expect((await revertOf(ADA, "Shop", shop, "redeem", [1n, deadline, sig])).name).toBe("AlreadyRedeemed");
  });

  it("the seller cannot fake a check-in with their own key", async () => {
    const sig = await signCheckIn(accounts[ADA]!, chainId, shop, 2n, deadline);
    const r = await revertOf(ADA, "Shop", shop, "redeem", [2n, deadline, sig]);
    expect(r.name).toBe("BadSignature");
  });

  it("a signature for another chain or shop is rejected", async () => {
    const other = await signCheckIn(accounts[TOBI]!, 1, shop, 2n, deadline);
    expect((await revertOf(ADA, "Shop", shop, "redeem", [2n, deadline, other])).name).toBe("BadSignature");
    const otherShop = await signCheckIn(accounts[TOBI]!, chainId, accounts[KEMI]!.address, 2n, deadline);
    expect((await revertOf(ADA, "Shop", shop, "redeem", [2n, deadline, otherShop])).name).toBe("BadSignature");
  });

  it("an expired deadline reverts with SignatureExpired", async () => {
    const past = (await now()) - 1n;
    const sig = await signCheckIn(accounts[TOBI]!, chainId, shop, 2n, past);
    expect((await revertOf(ADA, "Shop", shop, "redeem", [2n, past, sig])).name).toBe("SignatureExpired");
  });

  it("the malleable high-s twin is rejected, the 64-byte compact form accepted", async () => {
    const sig = await signCheckIn(accounts[TOBI]!, chainId, shop, 2n, deadline);
    const p = parseSignature(sig);
    const high = serializeSignature({ r: p.r, s: toHex(N - BigInt(p.s), { size: 32 }), yParity: p.yParity === 0 ? 1 : 0 });
    expect((await revertOf(ADA, "Shop", shop, "redeem", [2n, deadline, high])).name).toBe("BadSignature");
    const compact = serializeCompactSignature(signatureToCompactSignature(p));
    await write(ADA, "Shop", shop, "redeem", [2n, deadline, compact]);
    expect((await read<{ redeemed: boolean }>("Shop", shop, "passOf", [2n])).redeemed).toBe(true);
  });

  it("only the seller may submit a check-in", async () => {
    const sig = await signCheckIn(accounts[TOBI]!, chainId, shop, 3n, deadline);
    expect((await revertOf(MALLORY, "Shop", shop, "redeem", [3n, deadline, sig])).name).toBe("NotOwner");
  });

  it("after a transfer only the new holder's signature works", async () => {
    await write(TOBI, "Shop", shop, "transferFrom", [accounts[TOBI]!.address, accounts[KEMI]!.address, 3n]);
    const old = await signCheckIn(accounts[TOBI]!, chainId, shop, 3n, deadline);
    expect((await revertOf(ADA, "Shop", shop, "redeem", [3n, deadline, old])).name).toBe("BadSignature");
    const fresh = await signCheckIn(accounts[KEMI]!, chainId, shop, 3n, deadline);
    await write(ADA, "Shop", shop, "redeem", [3n, deadline, fresh]);
  });

  it("the door can redeem a queue in one zero-value batch", async () => {
    await write(TOBI, "Shop", shop, "buy", [item, 2n], parseEther("0.004"));
    const s4 = await signCheckIn(accounts[TOBI]!, chainId, shop, 4n, deadline);
    const s5 = await signCheckIn(accounts[TOBI]!, chainId, shop, 5n, deadline);
    await write(ADA, "Shop", shop, "multicall", [[data("Shop", "redeem", [4n, deadline, s4]), data("Shop", "redeem", [5n, deadline, s5])]]);
    expect((await read<{ redeemed: boolean }>("Shop", shop, "passOf", [5n])).redeemed).toBe(true);
  });
});
