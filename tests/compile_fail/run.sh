#!/usr/bin/env bash
# Negative compile tests: each case must fail `fe check` with the error code
# on its first line (`// EXPECT: <code> ...`), or pass if it says `OK`.
set -uo pipefail
cd "$(dirname "$0")"
pass=0
fail=0
for dir in */; do
  case="${dir%/}"
  expect=$(head -1 "$case/src/lib.fe" | sed -n 's#^// EXPECT: \([^ ]*\).*#\1#p')
  out=$(fe check "$case" 2>&1)
  code=$?
  if [ "$expect" = "OK" ]; then
    if [ $code -eq 0 ]; then ok=1; else ok=0; fi
  else
    if [ $code -ne 0 ] && grep -q "error\[$expect\]" <<<"$out"; then ok=1; else ok=0; fi
  fi
  if [ $ok -eq 1 ]; then
    echo "PASS  compile_fail::$case (expect $expect)"
    pass=$((pass + 1))
  else
    echo "FAIL  compile_fail::$case (expect $expect, exit $code)"
    echo "$out" | head -20
    fail=$((fail + 1))
  fi
done
echo "compile_fail: $pass passed; $fail failed"
[ $fail -eq 0 ]
