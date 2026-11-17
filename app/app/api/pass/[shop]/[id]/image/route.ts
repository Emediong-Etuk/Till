// SVG artwork for a pass, rendered from on-chain data.
import { isAddress } from "viem";
import { readItems, readPass, readShopMeta } from "@/lib/contracts";
import { eth } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export async function GET(_req: Request, { params }: { params: Promise<{ shop: string; id: string }> }) {
  const { shop, id } = await params;
  if (!isAddress(shop) || !/^\d+$/.test(id)) return new Response("not found", { status: 404 });
  const pass = await readPass(shop, BigInt(id)).catch(() => null);
  if (!pass) return new Response("unavailable", { status: 502 });
  const [meta, items] = await Promise.all([readShopMeta(shop), readItems(shop)]);
  const item = items[Number(pass.item)];
  const used = pass.redeemed;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 340" width="600" height="340">
  <rect width="600" height="340" rx="28" fill="${used ? "#3b4a41" : "#0a7746"}"/>
  <circle cx="0" cy="170" r="26" fill="#f7f5ef"/><circle cx="600" cy="170" r="26" fill="#f7f5ef"/>
  <line x1="420" y1="30" x2="420" y2="310" stroke="#f7f5ef" stroke-opacity=".5" stroke-dasharray="6 8" stroke-width="3"/>
  <text x="40" y="70" font-family="system-ui,sans-serif" font-size="22" fill="#d1fae1">${esc(meta.name)}</text>
  <text x="40" y="140" font-family="system-ui,sans-serif" font-weight="800" font-size="40" fill="#fff">${esc(item?.label ?? "Pass")}</text>
  <text x="40" y="190" font-family="ui-monospace,monospace" font-size="22" fill="#d1fae1">${eth(pass.paid)} ETH in escrow</text>
  <text x="40" y="290" font-family="system-ui,sans-serif" font-size="18" fill="#d1fae1">Till · every wei counted once</text>
  <text x="510" y="160" text-anchor="middle" font-family="ui-monospace,monospace" font-weight="700" font-size="44" fill="#fff">#${esc(id)}</text>
  <text x="510" y="205" text-anchor="middle" font-family="system-ui,sans-serif" font-weight="700" font-size="20" fill="${used ? "#f2c14e" : "#a6f3c6"}">${used ? "USED" : "VALID"}</text>
</svg>`;
  return new Response(svg, { headers: { "content-type": "image/svg+xml", "cache-control": "public, max-age=30" } });
}
