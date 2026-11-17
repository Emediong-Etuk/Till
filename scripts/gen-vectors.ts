// Generates EIP-712 CheckIn test vectors with viem and writes them as Fe
// constants to ingots/shop/src/vectors.fe.
//
// Two groups:
//  1. Pure vectors over a fixed shop address (0xcccc…cc) and chain ids 1,
//     11155111 and 31337. They never change.
//  2. Deployment vectors for the shop a Fe test deploys with
//     `deploy_shop(VECTOR_SALT)`. Its address is CREATE2 of the harness
//     address, the salt and keccak(out/Shop.bin ++ abi.encode(init args)),
//     so these are regenerated whenever Shop's bytecode changes
//     (`make vectors`; CI checks the committed file is fresh).
//
// Keys are anvil's well-known test keys. Never use them for real funds.
import { readFileSync, writeFileSync } from "node:fs";
import {
  type Hex,
  concat,
  encodeAbiParameters,
  getContractAddress,
  hashTypedData,
  keccak256,
  parseSignature,
  serializeSignature,
  serializeCompactSignature,
  signatureToCompactSignature,
  toHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const ROOT = new URL("..", import.meta.url).pathname;
const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;

// The address `fe test` runs tests from (evm.address()); chain id 1.
export const HARNESS = "0xbd770416a3345f91e4b34576cb804a576fa48eb1" as const;
export const HARNESS_CHAIN_ID = 1;
export const VECTOR_SALT = 100n;

const KEY0 = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;
const KEY1 = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as const;

// Must match ingots/shop/src/testkit.fe.
const NAME = "0x55796f20446576204d6565747570000000000000000000000000000000000000";
const SYMBOL = "0x55594f0000000000000000000000000000000000000000000000000000000000";
const URI0 = "0x687474703a2f2f6c6f63616c686f73743a333030302f6170692f706173732f00";
const URI_LEN = 31n;

export const checkInTypes = {
  CheckIn: [
    { name: "shop", type: "address" },
    { name: "pass", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export function checkInDigest(chainId: number, shop: Hex, pass: bigint, deadline: bigint): Hex {
  return hashTypedData({
    domain: { name: "Till", version: "1", chainId, verifyingContract: shop },
    types: checkInTypes,
    primaryType: "CheckIn",
    message: { shop, pass, deadline },
  });
}

async function sign(key: Hex, chainId: number, shop: Hex, pass: bigint, deadline: bigint) {
  const account = privateKeyToAccount(key);
  const sig = await account.signTypedData({
    domain: { name: "Till", version: "1", chainId, verifyingContract: shop },
    types: checkInTypes,
    primaryType: "CheckIn",
    message: { shop, pass, deadline },
  });
  const parsed = parseSignature(sig);
  const compact = serializeCompactSignature(signatureToCompactSignature(parsed));
  // The malleable twin: s' = n - s, v flipped. Valid for raw ecrecover,
  // rejected by canonical (low-s) recovery.
  const s = BigInt(parsed.s);
  const highS = serializeSignature({
    r: parsed.r,
    s: toHex(N - s, { size: 32 }),
    yParity: parsed.yParity === 0 ? 1 : 0,
  });
  return {
    signer: account.address,
    digest: checkInDigest(chainId, shop, pass, deadline),
    sig,
    compact,
    highS,
  };
}

function words(hex: Hex): string[] {
  const h = hex.slice(2);
  const out: string[] = [];
  for (let i = 0; i < h.length; i += 64) out.push("0x" + h.slice(i, i + 64).padEnd(64, "0"));
  return out;
}

/** Fe source for a `bytes` signature constant as words plus a length. */
function sigConst(name: string, hex: Hex): string {
  const w = words(hex);
  const len = (hex.length - 2) / 2;
  return [
    `pub const ${name}_LEN: usize = ${len}`,
    `pub const ${name}: [u256; ${w.length}] = [${w.join(", ")}]`,
  ].join("\n");
}

export function shopAddress(deployer: Hex, salt: bigint, owner: Hex, shopBin: Hex): Hex {
  const args = encodeAbiParameters(
    [
      { type: "address" },
      { type: "uint256" },
      { type: "uint256" },
      { type: "uint256" },
      { type: "uint256" },
      { type: "uint256" },
    ],
    [owner, BigInt(NAME), BigInt(SYMBOL), BigInt(URI0), 0n, URI_LEN],
  );
  const initCode = concat([shopBin, args]);
  return getContractAddress({
    opcode: "CREATE2",
    from: deployer,
    salt: toHex(salt, { size: 32 }),
    bytecodeHash: keccak256(initCode),
  });
}

async function main() {
  const shopBin = ("0x" + readFileSync(`${ROOT}out/Shop.bin`, "utf8").trim()) as Hex;
  const FIXED_SHOP = "0xcccccccccccccccccccccccccccccccccccccccc" as const;
  const DEADLINE = 2_000_000_000n;

  const pure1 = await sign(KEY0, 1, FIXED_SHOP, 7n, DEADLINE);
  const pureSepolia = await sign(KEY0, 11155111, FIXED_SHOP, 7n, DEADLINE);
  const pureLocal = await sign(KEY0, 31337, FIXED_SHOP, 7n, DEADLINE);
  const pureOther = await sign(KEY1, 1, FIXED_SHOP, 7n, DEADLINE);

  const shop = shopAddress(HARNESS, VECTOR_SALT, HARNESS, shopBin);
  const p1 = await sign(KEY0, HARNESS_CHAIN_ID, shop, 1n, DEADLINE);
  const p2 = await sign(KEY0, HARNESS_CHAIN_ID, shop, 2n, DEADLINE);
  const p1ByOther = await sign(KEY1, HARNESS_CHAIN_ID, shop, 1n, DEADLINE);
  const p1OtherShop = await sign(KEY0, HARNESS_CHAIN_ID, FIXED_SHOP, 1n, DEADLINE);
  const p1OtherChain = await sign(KEY0, 11155111, shop, 1n, DEADLINE);
  const p1Expired = await sign(KEY0, HARNESS_CHAIN_ID, shop, 1n, 0n);
  const p1Later = await sign(KEY0, HARNESS_CHAIN_ID, shop, 1n, DEADLINE + 1n);

  const fe = `// GENERATED by scripts/gen-vectors.ts — do not edit by hand.
// EIP-712 CheckIn vectors produced with viem ${(await import("viem/package.json", { with: { type: "json" } })).default.version}
// signTypedData / hashTypedData, keys = anvil test keys 0 and 1.
//
// Regenerate with \`make vectors\` after any change to Shop's bytecode.

pub const SIGNER0: u256 = ${pure1.signer.toLowerCase()}
pub const SIGNER1: u256 = ${pureOther.signer.toLowerCase()}
pub const FIXED_SHOP: u256 = ${FIXED_SHOP}
pub const DEADLINE: u256 = ${DEADLINE}

// --- pure: CheckIn(FIXED_SHOP, pass 7, DEADLINE) -------------------------
pub const PURE_DIGEST_CHAIN1: u256 = ${pure1.digest}
pub const PURE_DIGEST_SEPOLIA: u256 = ${pureSepolia.digest}
pub const PURE_DIGEST_LOCAL: u256 = ${pureLocal.digest}
${sigConst("PURE_SIG", pure1.sig)}
${sigConst("PURE_COMPACT", pure1.compact)}
${sigConst("PURE_HIGH_S", pure1.highS)}
${sigConst("PURE_SIG_OTHER", pureOther.sig)}

// --- deployment: the shop at deploy_shop(VECTOR_SALT) --------------------
pub const VECTOR_SALT: u256 = ${VECTOR_SALT}
pub const VECTOR_SHOP: u256 = ${shop.toLowerCase()}
pub const P1_DIGEST: u256 = ${p1.digest}
pub const P2_DIGEST: u256 = ${p2.digest}
${sigConst("P1_SIG", p1.sig)}
${sigConst("P1_COMPACT", p1.compact)}
${sigConst("P1_HIGH_S", p1.highS)}
${sigConst("P2_SIG", p2.sig)}
${sigConst("P2_COMPACT", p2.compact)}
${sigConst("P1_BY_OTHER", p1ByOther.sig)}
${sigConst("P1_OTHER_SHOP", p1OtherShop.sig)}
${sigConst("P1_OTHER_CHAIN", p1OtherChain.sig)}
${sigConst("P1_EXPIRED", p1Expired.sig)}
${sigConst("P1_LATER", p1Later.sig)}
pub const DEADLINE_LATER: u256 = ${DEADLINE + 1n}
`;
  writeFileSync(`${ROOT}ingots/shop/src/vectors.fe`, fe);
  writeFileSync(
    `${ROOT}ingots/shop/src/vectors.json`,
    JSON.stringify({ shop, harness: HARNESS, chainId: HARNESS_CHAIN_ID, salt: VECTOR_SALT.toString(), pure1, p1, p2 }, null, 2) + "\n",
  );
  console.log(`vectors: shop ${shop}, signer ${pure1.signer}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
