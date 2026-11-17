#!/usr/bin/env bash
# Banned patterns (CI-enforced):
#  1. `forget(` in ingots/till and ingots/shop: it skips Payment's Drop guard.
#  2. `ctx.value()` anywhere in ingots/shop except as the argument of
#     `register.begin(...)`: metered handlers read msg.value exactly once,
#     through the till.
set -uo pipefail
cd "$(dirname "$0")/.."
status=0
forgets=$(grep -rn "forget(" ingots/till/src ingots/shop/src | grep -vE "^[^:]+:[0-9]+:\s*//" || true)
if [ -n "$forgets" ]; then
  echo "$forgets"
  echo "lint: forget( is banned in till and shop (it bypasses the Payment Drop guard)"
  status=1
fi
bad=$(grep -rn "ctx\.value()" ingots/shop/src | grep -v "register\.begin(ctx\.value()" || true)
if [ -n "$bad" ]; then
  echo "$bad"
  echo "lint: ctx.value() may only appear as register.begin(ctx.value(), ...) in ingots/shop"
  status=1
fi
# Every #[payable] handler in the shop is either metered or the multicall.
payable=$(grep -n -A1 "#\[payable\]" ingots/shop/src/shop.fe | grep -E "^\s*[0-9]+-\s+[A-Z]" | sed -E 's/^[0-9]+-\s+([A-Za-z]+).*/\1/' | sort | tr '\n' ' ')
expected="Buy BuyFor Multicall Note Tip "
if [ "$payable" != "$expected" ]; then
  echo "lint: payable handlers in shop.fe are [$payable], expected [$expected]"
  status=1
fi
[ $status -eq 0 ] && echo "lint: ok (no forget(, ctx.value() only in register.begin, payable = $payable)"
exit $status
