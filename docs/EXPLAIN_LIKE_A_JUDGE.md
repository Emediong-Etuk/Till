# Explain like a judge: 25 questions, short answers

**1. What does Till do, in one breath?**
It makes `#[payable]` batching safe in Fe: a batch gets one budget equal to
`msg.value`, every handler draws from it, and the batch must spend it exactly,
so one payment is counted exactly once.

**2. What exactly is the bug?**
std's `multicall` `DELEGATECALL`s each entry to the contract itself, and
`DELEGATECALL` keeps `msg.value`. A handler that checks `ctx.value() == price`
passes the check once per entry. Pay 1 ETH, batch five 1 ETH buys, get five.
`ingots/shop/src/tests/exploit.fe` drains `NaiveShop` this way; std's own
doc comment and its `value_reaches_every_entry` test describe the behavior.

**3. Why not just write a `checkout(lines[])` function?**
That fixes one contract and one combination of calls. Multicall lets a front
end compose any handlers (buy, gift, tip, note, transfer, admin ops) without
the author predicting them. Till fixes the pattern for every Fe contract that
adopts std multicall, and could become `std::evm::multicall::metered`
(`STDLIB_PROPOSAL.md`).

**4. Where is the Fe-specific part?**
The business logic is typed `uses (register: mut Till, ...)` with no `Ctx` and
no `Call`. The compiler then guarantees it can't read `msg.value` (so the only
way to get paid is `take`) and can't run foreign code mid-batch. Try adding
either: `tests/compile_fail/` shows the `missing effect` errors, and CI checks
them.

**5. What if a developer forgets `register.begin`?**
`take` then draws from a zero budget and reverts `Overspend`, unless a batch
is open, in which case the batch owns the budget. Forgetting `end` in a direct
call means `Unspent` isn't checked, but the lint and tests catch it: every
metered handler in the shop is bracketed, and `scripts/lint.sh` pins the set
of payable handlers.

**6. What if they read `ctx.value()` anyway in the handler?**
The handler itself has `Ctx`, so the compiler allows it there. That is why
logic lives in effect-limited functions, and why CI greps the shop for
`ctx.value()` outside `register.begin(...)`.

**7. Why transient storage and not storage?**
The budget only exists during one call frame or batch. Transient storage is
cheaper (~100 gas per access vs 2,100–20,000), starts at zero in every
transaction, and never pollutes state. The risk is that it survives across
frames in the same transaction, which is invariant I3.

**8. What is the cross-frame leak?**
A transient value left set at the end of a call is visible to the next call
in the same transaction: the next UserOperation in an ERC-4337 bundle, a
router's second call. Till zeroes every slot in `close_batch` and requires a
zero budget in `end`. Tests: a `Relay` contract pays a batch then tries a
zero-value buy in the same frame; it gets `Overspend` (Fe and real anvil txs).

**9. What about ERC-4337 bundles?**
No smart account in the MVP, but each `fe test` is one transaction, so the
cross-frame tests are exactly "two calls in one bundle". `Relay` reproduces a
bundler on anvil.

**10. Why is `ForeignFrame` there if handlers can't call out?**
Defense in depth. If a future handler forgets `forbid_in_batch` and lets
foreign code run mid-batch, that code could call a metered handler directly
and spend the payer's budget. `begin` refuses any frame whose caller isn't the
batch payer (`foreign_frame_mid_batch_is_rejected` uses a deliberately leaky
contract to prove it).

**11. Why are non-metered handlers non-payable?**
So stray ETH can't get stuck in a handler that never expected it. The cost:
they can't appear in a paid batch (they revert on the inherited value). Admin
batches are zero-value, so that's fine. `note` exists to show a zero-wei
handler that *can* join paid batches by being metered.

**12. Gas overhead?**
About 1.2k gas per entry plus ~1.4k per batch, measured against the same
logic without Till (`docs/TEST_REPORT.md`).

**13. Why EIP-712 check-in instead of the seller just marking passes used?**
Escrow moves to the seller on check-in. If the seller could mark passes used,
they could unlock escrow without holding the event. With `CheckIn{shop, pass,
deadline}` signed by the current holder, only the holder can release their
pass's money.

**14. How do you know your EIP-712 matches wallets?**
`scripts/gen-vectors.ts` signs with viem and writes `vectors.fe`; Fe tests
assert the digest and recovered signer match, including Sepolia and anvil chain
ids, a high-s twin (rejected) and the 64-byte compact form (accepted). The
deployed `checkInDigest` view matches viem in E2E too.

**15. Replay?**
Each pass redeems once (`AlreadyRedeemed`); the domain binds chain and shop;
the struct binds pass and deadline; high-s twins are rejected; a transfer
changes the holder, which kills the old holder's signature.

**16. Smart-contract wallets?**
`std::evm::signature::is_valid_signature_now` falls back to ERC-1271. Tested
with an `Actor` that approves a digest.

**17. Can the seller rug?**
Not escrow before check-in or `release_at`: withdraw moves only
`seller_available`; price changes don't touch paid passes (each pass records
its price); supply can't drop below sold; `release_at` only moves later;
cancel is final and opens 100% refunds. After `release_at` the seller can
release escrow: escrow protects only until then (documented limitation).

**18. Reentrancy?**
Payouts update books first, hold a transient `Mutex`, refuse batches, and
revert on a failed send. A refund receiver that re-enters gets `PayoutLocked`;
one that tries to buy re-entrantly must pay its own way.

**19. What does `core::mem::forget` do to your Drop guard?**
It skips `Payment`'s destructor, so the `Unspent` check never runs. CI bans
`forget(` in `till` and `shop`. The shop uses `TransientTill` anyway; `Payment`
is the single-frame option.

**20. Forced ETH?**
Self-destruct or a pre-deployment transfer can raise the balance without a
handler. Books only ever count what handlers received, so the balance
covers them (I6); `sweep` moves only the excess. `ForceSend` builds a
`SELFDESTRUCT` init code by hand because Fe doesn't expose the opcode.

**21. How heavy is the testing?**
249 Fe tests (pure, EVM, 12 seeded property tests over 960 random batches with
mutations), 6 negative compile tests, 48 E2E tests on real bytecode, 17
Playwright specs. Every invariant and threat row maps to named tests
(`scripts/test-map.ts`), and `make report` checks they all pass.

**22. How do I know the deployed bytecode is what you tested?**
`scripts/verify-bytecode.ts` compares `eth_getCode` with
`out/<C>.runtime.bin ++ immutables`. The Fe vector test also checks that the
CREATE2 address derived from `out/Shop.bin` equals the one the Fe test deploys.

**23. Why a burner wallet?**
Zero-friction onboarding: the buyer gets a wallet and test ETH in one tap.
It's testnet-only, the key never leaves the device, and "Use my wallet"
supports EIP-6963 wallets.

**24. What would you do next?**
Upstream `metered` to std; a scoped `begin/end` guard; ERC-4337 paymaster
checkout; seller-signed promo vouchers; a compiler lint for payable + multicall.

**25. What's the biggest limitation?**
Till protects only handlers that use it, and Fe is pre-production. Within the
shop, the effect system, lint and tests close the gaps we know about; outside
it, adoption is the developer's choice (hence the std proposal).
