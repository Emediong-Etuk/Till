# Compiler and toolchain notes (Fe 26.6.0, `fe 26.6.0 (5b3f96a)`)

Everything here was hit while building Till, reduced to a minimal reproducer
and worked around. The Fe compiler was not modified. Item 1 is worth filing
at https://github.com/argotorg/fe/issues.

## 1. An effect binding named like a dependency ingot resolves to the module — worth filing

A `uses (name: ...)` binding whose name equals a dependency ingot's name is
shadowed by the ingot module inside the function body. A local `var` of the
same name works, so this looks like a resolution-order bug for effect
bindings (and for contract fields used as `with (Trait = field)`).

Reproducer (workspace with ingots `meter` and `app`, `app` depends on `meter`):

```fe
// meter/src/lib.fe
pub trait Meter {
    fn tick(mut self)
}
pub struct Counter { pub n: u256 }
impl Meter for Counter {
    fn tick(mut self) { self.n += 1 }
}
```

```fe
// app/src/lib.fe
use meter::{Counter, Meter}

fn tick_once() uses (meter: mut Meter) {
    meter.tick()          // error[8-0030]: value is expected — `mod` cannot be used as a value
}

#[test]
fn effect_binding_named_like_an_ingot() {
    var c = Counter { n: 0 }
    with (Meter = mut c) { tick_once() }
    assert!(c.n == 1)
}
```

The same happened with a contract field `mut till: TransientTill` in an
ingot that depends on the `till` ingot: `with (Till = till) { ... }` failed
with ``8-0030 `mod` cannot be used as a value`` and a follow-on
`8-0075 keyed effect binding requires invalid(Other) to implement Till`.

**Workaround:** the field and effect binding are called `register` (a till is
a cash register). See `ingots/shop/src/shop.fe`, `ingots/shop/src/sales.fe`.

## 2. `SELFDESTRUCT` is not reachable from user code

`std::evm::ops::selfdestruct` is `pub(ingot)` and no effect trait exposes it,
so a Fe contract cannot self-destruct. That is a reasonable default, but tests
of forced-ETH accounting (I6) need it.

**Workaround:** `ingots/actors/src/force.fe` builds the 22-byte init code
`PUSH20 <to> SELFDESTRUCT` by hand and runs it with `create.create_raw(value: ...)`.
Under EIP-6780 a contract that self-destructs in its creating transaction
still transfers its balance, and the recipient's code never runs.

## 3. Test modules in a directory need a parent file for `super`

Tests in `src/tests/a.fe` and `src/tests/b.fe` compile and run without a
`src/tests.fe`, but `use super::a::helper` in `b.fe` fails with
`error[2-0002]: super is not found`. Adding an empty `src/tests.fe` fixes it.
Not a bug, but the silent half-working state is surprising.

**Workaround used:** shared helpers live in a regular module,
`ingots/shop/src/testkit.fe`, and in the library (`till::entry`).

## 4. `#[test(should_revert, selector = ...)]` takes only a literal

The expected selector must be written as a number (`selector = 0x9539bfce`);
the error type's own `ErrorVariant::SELECTOR` cannot be used. Tests that need
the exact payload use `try_call` + `encode_error(E { .. })` comparison instead
(`assert_reverted_with` in `testkit.fe` and `till/src/tests/evm.fe`).

## 5. Immutables are appended to the runtime code

Fe stores non-`mut` contract fields after the runtime code and reads them with
`CODECOPY`. So `eth_getCode` of a deployed contract is
`out/<C>.runtime.bin ++ abi.encode(immutables)`, not `runtime.bin` alone.
`scripts/verify-bytecode.ts` and `e2e/protocol.test.ts` account for this.

## 6. `fe test` harness facts we relied on

- Each test is one transaction (transient storage persists across `evm.call`s).
- Block: `timestamp = 1`, `chainid = 1`, `number = 0`, `gasprice = 0`,
  gas limit `2^64 − 1`. There is no time travel, so release-time tests use
  release times in the past (`0`, `1`) or the future (`1000`).
- The harness account (`0xbd77…8eb1`) cannot receive ETH, so payouts in tests
  go to `Actor` contracts.
- `--show-logs` prints logs of passing tests, which `scripts/report.ts` uses to
  read the property tests' gas through `GasMeter`.
