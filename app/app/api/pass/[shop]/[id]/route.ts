// ERC-721 metadata for a pass: GET /api/pass/<shop>/<id> (the tokenURI).
import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { KIND, STATUS, readItems, readPass, readShopMeta } from "@/lib/contracts";
import { eth } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ shop: string; id: string }> }) {
  const { shop, id } = await params;
  if (!isAddress(shop) || !/^\d+$/.test(id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  try {
    const pass = await readPass(shop, BigInt(id));
    if (pass.owner === "0x0000000000000000000000000000000000000000") return NextResponse.json({ error: "not found" }, { status: 404 });
    const [meta, items] = await Promise.all([readShopMeta(shop), readItems(shop)]);
    const item = items[Number(pass.item)]!;
    const origin = new URL(req.url).origin;
    return NextResponse.json({
      name: `${item.label} #${id}`,
      description: `A pass for ${meta.name}, sold with Till. Its price waits in escrow until check-in.`,
      image: `${origin}/api/pass/${shop}/${id}/image`,
      external_url: `${origin}/s/${shop}`,
      attributes: [
        { trait_type: "Shop", value: meta.name },
        { trait_type: "Kind", value: KIND[item.kind] },
        { trait_type: "Paid (ETH)", value: eth(pass.paid) },
        { trait_type: "Status", value: pass.redeemed ? "Used" : STATUS[item.status] },
      ],
    });
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 502 });
  }
}
