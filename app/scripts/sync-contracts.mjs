// Copies ABIs from ../out and deployments from ../deployments into app/lib,
// with a SHA-256 manifest so a stale ABI is easy to spot.
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const root = new URL("../..", import.meta.url).pathname;
const app = new URL("..", import.meta.url).pathname;
mkdirSync(`${app}lib/abi`, { recursive: true });
mkdirSync(`${app}lib/deployments`, { recursive: true });
const manifest = {};
for (const name of ["Shop", "ShopFactory", "NaiveShop"]) {
  const src = `${root}out/${name}.abi.json`;
  if (!existsSync(src)) {
    console.error(`missing ${src}: run \`make fe-build\` first`);
    process.exit(1);
  }
  copyFileSync(src, `${app}lib/abi/${name}.json`);
  manifest[name] = createHash("sha256").update(readFileSync(src)).digest("hex");
}
writeFileSync(`${app}lib/abi/manifest.json`, JSON.stringify(manifest, null, 2) + "\n");
for (const net of ["local", "sepolia"]) {
  const src = `${root}deployments/${net}.json`;
  const dst = `${app}lib/deployments/${net}.json`;
  if (existsSync(src)) copyFileSync(src, dst);
  else if (!existsSync(dst)) writeFileSync(dst, JSON.stringify({ network: net, missing: true }, null, 2) + "\n");
}
console.log("synced ABIs and deployments into app/lib");
