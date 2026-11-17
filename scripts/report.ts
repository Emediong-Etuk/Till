// Generates docs/TEST_REPORT.md (and the table in docs/THREAT_MODEL.md).
//
//   npx tsx scripts/report.ts            run fe test + compile-fail, read E2E/Playwright JSON
//   npx tsx scripts/report.ts --no-run   only re-render from the last saved results
//
// E2E and Playwright are not re-run here (they need anvil and the app); run
// `make e2e` and `make playwright` first and their JSON results are picked up.
import { execSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { ROOT } from "./lib/artifacts.ts";
import { INVARIANTS, THREATS, type Row } from "./test-map.ts";

const CACHE = `${ROOT}docs/.report-cache.json`;
const run = !process.argv.includes("--no-run");
const sh = (cmd: string) => execSync(cmd, { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "pipe"] });

type FeResult = { suite: string; name: string; ok: boolean; secs: number };
type Cache = { fe: FeResult[]; props: { seed: number; cases: number; gas: number }[]; compileFail: { name: string; ok: boolean; expect: string }[]; at: string };

function runFe(): Cache {
  const out = spawnSync("fe", ["test"], { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 28 });
  const text = (out.stdout ?? "") + (out.stderr ?? "");
  const fe: FeResult[] = [];
  for (const line of text.split("\n")) {
    const m = line.match(/^(PASS|FAIL)\s+\[([\d.]+)s\]\s+(\S+)\s+(\S+)/);
    if (m) fe.push({ ok: m[1] === "PASS", secs: Number(m[2]), suite: m[3]!, name: m[4]! });
  }
  // Gas and case counts logged by GasMeter (tag "prop") in the shop properties.
  const logs = spawnSync("fe", ["test", "--filter", "prop_shop", "--show-logs", "ingots/shop"], { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 28 }).stdout ?? "";
  const props: Cache["props"] = [];
  const tag = "0x0000000000000000000000000000000000000000000000000000000070726f70";
  for (const line of logs.split("\n")) {
    if (!line.includes(tag)) continue;
    const data = line.match(/data: 0x([0-9a-f]+)/)?.[1];
    if (!data) continue;
    const w = (i: number) => BigInt(`0x${data.slice(i * 64, i * 64 + 64)}`);
    props.push({ seed: Number(w(0)), cases: Number(w(1)), gas: Number(w(2)) });
  }
  const cf = spawnSync("./tests/compile_fail/run.sh", { cwd: ROOT, encoding: "utf8" }).stdout ?? "";
  const compileFail = [...cf.matchAll(/^(PASS|FAIL)\s+compile_fail::(\S+) \(expect ([^,)]+)/gm)].map((m) => ({ ok: m[1] === "PASS", name: m[2]!, expect: m[3]! }));
  return { fe, props, compileFail, at: new Date().toISOString() };
}

const cache: Cache = run ? runFe() : JSON.parse(readFileSync(CACHE, "utf8"));
if (run) writeFileSync(CACHE, JSON.stringify(cache, null, 1));

// --- E2E (vitest JSON) and Playwright JSON ----------------------------------
type Case = { name: string; ok: boolean; file: string };
function vitestCases(): Case[] | null {
  const f = `${ROOT}e2e/results.json`;
  if (!existsSync(f)) return null;
  const j = JSON.parse(readFileSync(f, "utf8")) as { testResults: { name: string; assertionResults: { fullName: string; status: string }[] }[] };
  return j.testResults.flatMap((r) => r.assertionResults.map((a) => ({ name: a.fullName, ok: a.status === "passed", file: r.name.split("/").pop()! })));
}
function playwrightCases(): Case[] | null {
  const f = `${ROOT}app/playwright-results.json`;
  if (!existsSync(f)) return null;
  type Suite = { title: string; specs?: { title: string; ok: boolean; tests: { projectName: string }[] }[]; suites?: Suite[] };
  const j = JSON.parse(readFileSync(f, "utf8")) as { suites: Suite[] };
  const out: Case[] = [];
  const walk = (s: Suite, file: string) => {
    for (const sp of s.specs ?? []) out.push({ name: `[${sp.tests[0]?.projectName}] ${sp.title}`, ok: sp.ok, file });
    for (const c of s.suites ?? []) walk(c, file);
  };
  for (const s of j.suites) walk(s, s.title);
  return out;
}
const e2e = vitestCases();
const ui = playwrightCases();

// --- resolve test ids --------------------------------------------------------
function resolve(id: string): { found: boolean; ok: boolean; label: string } {
  const [kind, ...rest] = id.split(":");
  const key = rest.join(":");
  if (kind === "fe") {
    const r = cache.fe.find((t) => t.name === key);
    return { found: !!r, ok: !!r?.ok, label: `\`${key}\`` };
  }
  if (kind === "cf") {
    const r = cache.compileFail.find((t) => t.name === key);
    return { found: !!r, ok: !!r?.ok, label: `compile_fail \`${key}\`` };
  }
  const list = kind === "e2e" ? e2e : ui;
  if (!list) return { found: false, ok: false, label: `${kind} "${key}" (not run)` };
  const hits = list.filter((t) => t.name.includes(key));
  return { found: hits.length > 0, ok: hits.length > 0 && hits.every((h) => h.ok), label: `${kind} "${key}"` };
}

const missing: string[] = [];
function rowTable(rows: Row[], withExpected: boolean): string {
  const head = withExpected ? "| # | Attack | Expected | Tests | Status |\n|---|---|---|---|---|" : "| # | Invariant | Tests | Status |\n|---|---|---|---|";
  const body = rows.map((r) => {
    const res = r.tests.map(resolve);
    for (const [i, x] of res.entries()) if (!x.found) missing.push(`${r.id}: ${r.tests[i]}`);
    const ok = res.every((x) => x.ok);
    const tests = res.map((x) => `${x.ok ? "✅" : x.found ? "❌" : "⚪"} ${x.label}`).join("<br>");
    return withExpected ? `| ${r.id} | ${r.title} | ${r.expected} | ${tests} | ${ok ? "pass" : "**check**"} |` : `| ${r.id} | ${r.title} | ${tests} | ${ok ? "pass" : "**check**"} |`;
  });
  return [head, ...body].join("\n");
}

// --- sizes, gas, deployments -------------------------------------------------
const sizeRows = existsSync(`${ROOT}out`)
  ? readdirSync(`${ROOT}out`)
      .filter((f) => f.endsWith(".runtime.bin"))
      .map((f) => {
        const name = f.replace(".runtime.bin", "");
        const rt = (readFileSync(`${ROOT}out/${f}`, "utf8").trim().length) / 2;
        const init = (readFileSync(`${ROOT}out/${name}.bin`, "utf8").trim().length) / 2;
        return { name, rt, init };
      })
      .sort((a, b) => b.rt - a.rt)
  : [];
const gas = existsSync(`${ROOT}docs/gas.json`) ? JSON.parse(readFileSync(`${ROOT}docs/gas.json`, "utf8")) : null;
const dep = (net: string) => (existsSync(`${ROOT}deployments/${net}.json`) ? JSON.parse(readFileSync(`${ROOT}deployments/${net}.json`, "utf8")) : null);
const sepolia = dep("sepolia");

const feVersion = (() => {
  try {
    return sh("fe --version").trim();
  } catch {
    return "unknown";
  }
})();
const sha = sh("git rev-parse HEAD").trim();
const bySuite = (s: string) => cache.fe.filter((t) => t.suite === s);
const count = (xs: { ok: boolean }[]) => `${xs.filter((x) => x.ok).length} passed, ${xs.filter((x) => !x.ok).length} failed`;
const layer = (pred: (t: FeResult) => boolean) => cache.fe.filter(pred);
const isProp = (t: FeResult) => t.name.startsWith("prop_");
const PURE = new Set([
  ...cache.fe.filter((t) => t.suite === "till" && /^(ledger_|charge_|checkout_cart|payment_(exact|unspent|overspend|is))/.test(t.name)).map((t) => t.name),
  "purchase_ok_when_active_and_available", "purchase_rejects_inactive", "purchase_rejects_zero_qty", "purchase_supply_boundary", "purchase_wallet_cap_boundary",
  "purchase_huge_qty_is_sold_out_not_overflow", "new_item_rules", "update_rules", "extend_rules", "release_rules", "refund_rules", "status_transitions",
  "label_length_and_uri_helpers", "typehash_matches_type_string", "digest_matches_viem_chain_1", "digest_matches_viem_sepolia", "digest_matches_viem_anvil",
  "digest_depends_on_every_field", "recover_65_byte_vector", "recover_64_byte_compact_vector", "recover_rejects_high_s_twin", "recover_other_key_vector",
]);
const l1 = layer((t) => PURE.has(t.name));
const l3 = layer(isProp);
const l2 = layer((t) => !PURE.has(t.name) && !isProp(t));

const md = `# Test report

Generated by \`scripts/report.ts\` — do not edit by hand.

| | |
|---|---|
| Fe | \`${feVersion}\` |
| Commit | \`${sha}\` |
| Fe tests run at | ${cache.at} |
| Report generated | ${new Date().toISOString()} |

## Summary

| Layer | What | Result |
|---|---|---|
| 1 | Fe pure unit tests (LedgerTill, Payment, rules, EIP-712 vectors) | ${count(l1)} |
| 2 | Fe EVM integration tests (\`uses (evm: mut Evm)\`) | ${count(l2)} |
| 3 | Fe seeded property tests | ${count(l3)} |
| — | Fe total (\`fe test\`, ${[...new Set(cache.fe.map((t) => t.suite))].join(", ")}) | **${count(cache.fe)}** |
| — | Negative compile tests (\`tests/compile_fail\`) | ${count(cache.compileFail)} |
| 4 | E2E on anvil \`--hardfork osaka\`, real bytecode (vitest + viem) | ${e2e ? count(e2e) : "not run (make e2e)"} |
| 5 | Playwright UI (desktop + Pixel 7) | ${ui ? count(ui) : "not run (make playwright)"} |

By ingot: till ${count(bySuite("till"))}; shop ${count(bySuite("shop"))}.

${missing.length ? "" : ""}## Invariants → tests

${rowTable(INVARIANTS, false)}

## Threat model → tests

${rowTable(THREATS, true)}

${missing.length ? `### Unresolved test ids\n\n${missing.map((m) => `- ${m}`).join("\n")}\n` : "Every test id in `scripts/test-map.ts` resolved to a test that ran.\n"}

## Property tests

Seeded with \`std::evm::random::KeccakRng::seeded(seed)\`; a failing case reverts with \`PropFail\`/\`ShopPropFail { seed, case, mutation, step }\` so it can be replayed.

| Suite | Seeds | Cases per seed | Mutations | Gas per seed (shop, measured in-test) |
|---|---|---|---|---|
| till (\`prop_till_*\`) | 1, 2, 3, 4, 5, 0xfe | 60 | exact, +1 wei, −1 wei, duplicate entry, nested batch, forbidden handler | — |
| shop (\`prop_shop_*\`) | ${cache.props.map((p) => p.seed).join(", ") || "1, 2, 3, 4, 5, 0xfe"} | ${cache.props[0]?.cases ?? 100} | the six above + non-metered seller handler | ${cache.props.map((p) => `${p.seed}: ${(p.gas / 1e6).toFixed(1)}M`).join("; ") || "—"} |

Total random cases: ${6 * 60 + (cache.props.length || 6) * (cache.props[0]?.cases ?? 100)}.

## Gas (anvil, osaka; from \`e2e/gas.test.ts\`)

${gas ? `### Till's own overhead (TillProbe vs the same logic without Till)

| Entries | With Till | Without | Overhead | Per entry |
|---|---|---|---|---|
${(gas.tillIsolated ?? []).map((r: Record<string, string>) => `| ${r.entries} | ${r.till} | ${r.plain} | ${r.tillOverhead} | ${r.overheadPerEntry} |`).join("\n")}

### Shop vs NaiveShop, batched \`buy\` (Shop also keeps per-item escrow, caps and ERC-721 balances)

| Entries | Shop | NaiveShop | Shop per entry | Naive per entry |
|---|---|---|---|---|
${(gas.batchedBuys ?? []).map((r: Record<string, string>) => `| ${r.entries} | ${r.till} | ${r.naive} | ${r.tillPerEntry} | ${r.naivePerEntry} |`).join("\n")}

| Operation | Gas |
|---|---|
| Direct \`buy\` (1 pass, warm) | ${gas.directBuy} |
| One-entry \`multicall\` | ${gas.oneEntryBatch} |
| \`redeem\` (EIP-712 digest + ecrecover) | ${gas.redeem} |
| \`refund\` (burn + send) | ${gas.refund} |
| \`open\` a shop (CREATE2 from the factory) | ${gas.openShop} |
` : "Not measured yet: run `make e2e`."}

## Contract sizes (\`fe build\`, EIP-170 limit 24,576 bytes runtime)

| Contract | Runtime bytes | Init bytes | Headroom |
|---|---|---|---|
${sizeRows.map((r) => `| ${r.name} | ${r.rt.toLocaleString("en")} | ${r.init.toLocaleString("en")} | ${(24576 - r.rt).toLocaleString("en")} |`).join("\n")}

Test-only contracts (TillProbe, actors, NaiveShop, …) are built too because \`fe build\` builds every contract in the workspace.

## E2E (layer 4)

${e2e ? e2e.map((c) => `- ${c.ok ? "✅" : "❌"} ${c.file}: ${c.name}`).join("\n") : "Not run."}

## Playwright (layer 5)

${ui ? ui.map((c) => `- ${c.ok ? "✅" : "❌"} ${c.file}: ${c.name}`).join("\n") : "Not run."}

## Sepolia

${sepolia ? `| | Address / tx |
|---|---|
| ShopFactory | [${sepolia.factory.address}](https://sepolia.etherscan.io/address/${sepolia.factory.address}) |
| Demo shop | [${sepolia.demoShop.address}](https://sepolia.etherscan.io/address/${sepolia.demoShop.address}) |
| NaiveShop (lab) | [${sepolia.naiveShop.address}](https://sepolia.etherscan.io/address/${sepolia.naiveShop.address}) |
| Lab Till shop | [${sepolia.labShop?.address}](https://sepolia.etherscan.io/address/${sepolia.labShop?.address}) |
${Object.entries(sepolia.examples ?? {}).map(([k, v]) => `| ${k} | [${String(v).slice(0, 18)}…](https://sepolia.etherscan.io/tx/${v}) |`).join("\n")}
` : "Not deployed from this environment yet (see README → Demo). `make deploy-sepolia` writes `deployments/sepolia.json`, and this section fills in on the next `make report`."}

## Known failures

${[...cache.fe.filter((t) => !t.ok).map((t) => `- fe: ${t.suite}::${t.name}`), ...(e2e ?? []).filter((t) => !t.ok).map((t) => `- e2e: ${t.name}`), ...(ui ?? []).filter((t) => !t.ok).map((t) => `- ui: ${t.name}`)].join("\n") || "None."}

## How to reproduce

\`\`\`bash
make setup          # Fe 26.6.0, Foundry, node deps
make test           # fe fmt --check, fe test (all ingots), compile_fail, lint
make e2e            # anvil --hardfork osaka + vitest on real bytecode
make playwright     # anvil + deploy + next dev + Playwright
make report         # this file
\`\`\`
`;

mkdirSync(`${ROOT}docs`, { recursive: true });
writeFileSync(`${ROOT}docs/TEST_REPORT.md`, md);

// The threat-model doc carries the same table between markers.
const tm = `${ROOT}docs/THREAT_MODEL.md`;
if (existsSync(tm)) {
  const doc = readFileSync(tm, "utf8");
  const table = `<!-- table:start (generated by scripts/report.ts) -->\n${rowTable(THREATS, true)}\n<!-- table:end -->`;
  writeFileSync(tm, doc.replace(/<!-- table:start[\s\S]*?<!-- table:end -->/, table));
}
console.log(`wrote docs/TEST_REPORT.md (${cache.fe.length} Fe tests, ${missing.length} unresolved ids)`);
if (missing.length) console.log(missing.join("\n"));
