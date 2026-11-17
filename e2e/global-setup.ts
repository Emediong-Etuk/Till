// Starts `anvil --hardfork osaka` for the E2E run unless E2E_RPC points at
// an existing node.
import { type ChildProcess, spawn } from "node:child_process";
import { existsSync } from "node:fs";

const PORT = Number(process.env.E2E_PORT ?? 8646);

async function ready(url: string): Promise<boolean> {
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

export default async function setup() {
  if (!existsSync(new URL("../out/Shop.bin", import.meta.url))) {
    throw new Error("out/Shop.bin missing: run `make build` before `make e2e`");
  }
  if (process.env.E2E_RPC) return () => {};
  const url = `http://127.0.0.1:${PORT}`;
  process.env.E2E_RPC = url;
  const bin = process.env.ANVIL ?? "anvil";
  const child: ChildProcess = spawn(
    bin,
    ["--hardfork", "osaka", "--port", String(PORT), "--accounts", "10", "--balance", "100000", "--gas-limit", "60000000", "--silent"],
    { stdio: "ignore" },
  );
  for (let i = 0; i < 100; i++) {
    if (await ready(url)) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!(await ready(url))) throw new Error(`anvil did not start on ${url}`);
  return () => {
    child.kill("SIGTERM");
  };
}
