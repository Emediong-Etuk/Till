# Proposal: `std::evm::multicall::metered`

## Problem

`std::evm::multicall`'s own doc example puts `#[payable]` on the batch
handler, and its doc comment warns that "a `#[payable]` handler could count
one payment several times". Fe's test suite asserts that behavior
(`value_reaches_every_entry`). Developers who want payable batching today must
either avoid it or write their own accounting. Till is that accounting,
packaged so the std could ship it next to `multicall`.

## API

```fe
//! std::evm::multicall::metered
pub trait Till {
    fn take(mut self, _ amount: Wei)      // revert Overspend { wanted, left }
    fn left(self) -> Wei
    fn in_batch(self) -> bool
}

pub fn charge(price: Wei, qty: u256) -> Wei uses (till: mut Till)

pub struct TransientTill { /* five TSlots */ }
impl TransientTill {
    pub fn begin(mut self, _ paid: Wei, from: Address)  // first line of a metered handler
    pub fn end(mut self)                                  // last line; Unspent if direct and not fully drawn
    pub fn forbid_in_batch(self)                          // first line of handlers that call out
    pub fn state(self) -> TillState
}
impl Till for TransientTill

pub fn metered_multicall(_ data: DynArray<Bytes>) -> (DynArray<Bytes>, BatchReceipt)
uses (ctx: Ctx, call: mut Call, till: mut TransientTill)

#[error] pub struct Overspend { pub wanted: Wei, pub left: Wei }
#[error] pub struct Unspent { pub left: Wei }
#[error] pub struct NestedBatch {}
#[error] pub struct ExternalCallInBatch {}
#[error] pub struct ForeignFrame { pub caller: Address }

// for tests and single-frame handlers
pub struct LedgerTill { pub budget: Wei, ... }   // in-memory
pub struct Payment { ... }                        // linear: Drop reverts Unspent
```

It reuses `multicall::multicall` unchanged; nothing in the existing module
moves.

## Proposed doc-comment wording for `multicall.fe`

> Every entry is `DELEGATECALL`ed to the contract itself, so it runs with the
> original caller and value. **Do not mark handlers `#[payable]` and read
> `ctx.value()` in them if the contract also handles `MulticallMsg`:** every
> entry would count the same payment. For payable batching use
> [`metered::metered_multicall`]: handlers draw from one budget of
> `msg.value` with `till.take`, the batch must spend it exactly, and business
> logic typed `uses (till: mut Till)` provably cannot read `msg.value` or call
> out.

and the example becomes

```fe
recv MulticallMsg {
    #[payable]
    Multicall { data } -> DynArray<Bytes> uses (ctx, mut call, mut till) {
        let (results, _) = with (TransientTill = till) { metered::metered_multicall(data) }
        results
    }
}
```

## Migration

1. Add a `mut till: TransientTill` field (transient: no storage layout change).
2. In each payable handler: replace `let paid = ctx.value()` and the equality
   check with `till.begin(ctx.value(), from: ctx.caller())`, move the logic
   into a function typed `uses (till: mut Till, ...)` that calls
   `till.take(amount)` / `charge(price, qty)`, then `till.end()`.
3. Swap `multicall::multicall(data)` for `metered_multicall(data)`.
4. In handlers that send ETH or call out, add `till.forbid_in_batch()` first.
5. Remove `#[payable]` from handlers that never take value.

Existing direct (non-batched) callers see no change except that over- and
under-payment now revert with typed errors instead of string asserts.

## Cost

Measured on anvil (`docs/TEST_REPORT.md`): about 1.2k gas per batched entry
plus about 1.4k per batch over the same logic without Till; one `TLOAD`/`TSTORE`
pair per `begin`/`take`/`end`.

## Open questions for the Fe team

- Name: `metered`, `paid`, or `till`?
- Should `begin`/`end` become a scoped guard once Fe's `Drop` can hold an
  effect handle, so forgetting `end()` is impossible too?
- Could the compiler warn on a `#[payable]` handler that reads `ctx.value()`
  in a contract that also handles `MulticallMsg`?
