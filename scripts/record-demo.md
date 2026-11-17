# Recording the demo

Repeatable steps with seeded data. Everything runs locally; for Sepolia, use
the deployed addresses in `deployments/sepolia.json` instead.

1. `make demo` (fresh anvil, deploys factory + "Uyo Dev Meetup" + the lab pair
   with 9 honest purchases each, records example txs, starts the app).
2. Chrome → DevTools device toolbar → iPhone 12 Pro (390×844). Open
   `http://localhost:3000` in a **new incognito window** so the burner wallet
   is fresh (Tobi).
3. Second incognito window for the door (Ada = anvil key 0, the deployer). In
   its DevTools console run once, then reload:
   `localStorage.setItem("till.burner.v1", JSON.stringify("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"))`
4. Third window for Mallory at `/lab` (fresh burner).
5. Shot list: follow `docs/VIDEO_SCRIPTS.md`. The cart for the pitch is
   2 × General admission, 1 × Meetup T-shirt, tip 0.0005 ETH = 0.004 ETH.
6. Terminal shots:
   - `npx tsx scripts/demo-exploit.ts --target naive` then `--target till`
   - `./tests/compile_fail/run.sh`
   - `make test 2>&1 | tail -5`
7. To reset, stop `make demo` and run it again (anvil restarts empty).
