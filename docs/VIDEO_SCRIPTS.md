# Video scripts

Recording setup: `scripts/record-demo.md`. Browser at 390×844 (phone) for the
app, a terminal at 120 columns for code and tests.

## 1. Pitch video (hard limit 3:00)

| Time | Shot | Voice-over |
|---|---|---|
| 0:00–0:08 | Phone: Till home, "Every wei counted once." | "Ada runs a monthly dev meetup in Uyo. She sells two ticket tiers and a T-shirt." |
| 0:08–0:20 | Phone: storefront, Tobi adds 2 tickets, a shirt, a tip | "Tobi wants all of it in one tap, one payment, on his phone, with no wallet to install." |
| 0:20–0:35 | Editor: `ingots/std/src/evm/multicall.fe`, the `#[payable]` example and the warning highlighted | "Fe's standard multicall is how you batch calls. Its own example is payable, and its own docs warn: every entry sees the same msg.value." |
| 0:35–1:00 | Phone: `/lab`, tap "Run the attack on NaiveShop"; balances drop | "So Mallory pays 0.001 ETH once, batches five buys, refunds five passes. She walks away with other buyers' money. Same bug class as the 2021 MISO disclosure." |
| 1:00–1:12 | Phone: fresh visitor, wallet appears, "Get test ETH" | "Here's Till. The buyer gets a test wallet and test ETH with one tap." |
| 1:12–1:35 | Phone: cart → Review sheet (line items, exact total) → Pay → "Paid" | "Two tickets, a shirt, a tip. One transaction, one exact payment. A wei too much or too little and the contract refuses." |
| 1:35–1:50 | Phone: My passes → pass QR | "Passes arrive as NFTs. At the door, the pass shows a code signed by Tobi's key." |
| 1:50–2:10 | Second phone: door page scans → Valid → Admit; scan again → Already used | "Ada scans it. The contract checks Tobi's signature, marks the pass used, and only then moves his money from escrow to Ada." |
| 2:10–2:20 | Admin: Withdraw | "Ada withdraws. If she'd cancelled, Tobi could refund exactly what he paid." |
| 2:20–2:30 | `/lab`: attack on the Till shop → `Overspend` | "Mallory's exact attack on a Till shop: reverted, Overspend, nothing charged." |
| 2:30–2:50 | Editor: `pub fn purchase(...) uses (register: mut Till, catalog: mut Catalog, ...)`; then the compile error from `tests/compile_fail` | "Why Fe? The purchase logic has a Till effect and no Ctx and no Call. The compiler proves it can't read msg.value and can't run foreign code mid-batch. Not a code review: a type error." |
| 2:50–3:00 | Terminal: `make test` summary; README | "249 Fe tests, 960 random batches, 48 end-to-end and 17 UI tests. Till: every wei counted once." |

## 2. Technical walkthrough (6–10 minutes)

1. **Architecture (0:00–1:00).** The Mermaid diagram in `docs/ARCHITECTURE.md`:
   `till` library, `shop` product, `naive` and `actors` for tests, app and scripts.
2. **The Till API and state machine (1:00–2:30).** `ingots/till/src/effect.fe`
   (`trait Till`, `charge`), `transient.fe` (`begin`/`end`/`open_batch`/`close_batch`/
   `forbid_in_batch`), the state diagram. Point out the five `TSlot`s and that
   every success path clears them.
3. **Effects as the guarantee (2:30–4:00).** `ingots/shop/src/sales.fe`:
   `purchase` is `uses (register: mut Till, catalog, passes, books, log)`. Live:
   add `let x = ctx.value()` → `undefined variable ctx`; call a helper with
   `mut Call` → `missing effect Call`. Then `./tests/compile_fail/run.sh`.
4. **Transient storage and cross-frame (4:00–5:00).** `till/src/tests/evm.fe`
   `cross_frame_through_relay`, `shop/src/tests/batch.fe`
   `cross_frame_relay_cannot_reuse_batch_budget`; explain "one fe test = one
   transaction".
5. **EIP-712 check-in (5:00–6:00).** `checkin.fe`, `scripts/gen-vectors.ts`,
   `vectors.fe`, the high-s and compact tests, ERC-1271 holder.
6. **On-chain view (6:00–7:00).** Explorer view of the batched checkout tx:
   internal `DELEGATECALL`s to self, `Transfer` ×3, `Purchased` ×2, `Tipped`,
   `BatchSettled{entries: 3}`. (Sepolia link from `deployments/sepolia.json`;
   locally, `cast run <hash> --rpc-url http://127.0.0.1:8545`.)
7. **Tests (7:00–8:30).** `make test` live; `prop_shop_seed_*` and the
   `ShopPropFail{seed, case}` replay story; `docs/TEST_REPORT.md` tables and the
   gas table (Till ≈ 1.2k gas/entry).
8. **Limitations (8:30–9:30).** README → Limitations.
