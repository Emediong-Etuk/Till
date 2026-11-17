# Till: one-command build, test, demo and deploy.
#
#   make setup   install Fe 26.6.0, Foundry and node deps
#   make test    fe fmt --check, fe test (all ingots), compile-fail, lint
#   make build   fe build + copy ABIs/deployments into the app
#   make e2e     anvil (osaka) + real-bytecode E2E tests
#   make demo    anvil + deploy + seed + next dev   <- the judge path
#   make report  regenerate docs/TEST_REPORT.md
SHELL := /bin/bash
FE_VERSION ?= v26.6.0
export PATH := $(HOME)/.fe/bin:$(HOME)/.foundry/bin:$(PATH)
ANVIL_PORT ?= 8545
ANVIL_FLAGS := --hardfork osaka --port $(ANVIL_PORT) --balance 100000 --gas-limit 60000000 --silent

.PHONY: setup fe foundry node build fe-build test fe-test fmt fmt-check compile-fail lint vectors vectors-check \
	e2e anvil demo demo-chain report deploy-sepolia examples-sepolia verify-sepolia playwright app-build clean

setup: fe foundry node

fe:
	@if fe --version 2>/dev/null | grep -q "26.6.0"; then fe --version; else \
	  curl -fsSL https://raw.githubusercontent.com/argotorg/fe/master/feup/feup.sh | bash -s -- --version $(FE_VERSION) --no-modify-path; fi

foundry:
	@if command -v anvil >/dev/null; then anvil --version | head -1; else \
	  mkdir -p $(HOME)/.foundry/bin && curl -fsSL https://github.com/foundry-rs/foundry/releases/download/stable/foundry_stable_linux_amd64.tar.gz \
	  | tar xz -C $(HOME)/.foundry/bin; fi

node:
	npm ci --no-audit --no-fund
	cd app && npm ci --no-audit --no-fund

fe-build:
	fe build --emit bytecode,runtime-bytecode,abi .

build: fe-build
	node app/scripts/sync-contracts.mjs

fmt:
	@for d in ingots/*/src tests/compile_fail/*/src; do fe fmt $$d >/dev/null; done

fmt-check:
	@for d in ingots/*/src; do fe fmt --check $$d || exit 1; done

fe-test:
	fe test

compile-fail:
	./tests/compile_fail/run.sh

lint:
	./scripts/lint.sh

test: fmt-check fe-test compile-fail lint

# EIP-712 vectors depend on Shop's bytecode; regenerate after contract changes.
vectors: fe-build
	npx tsx scripts/gen-vectors.ts
	fe fmt ingots/shop/src/vectors.fe

vectors-check: vectors
	git diff --exit-code ingots/shop/src/vectors.fe ingots/shop/src/vectors.json

e2e: fe-build
	npx vitest run --config e2e/vitest.config.ts

demo-chain:
	@pkill -f "anvil .*--port $(ANVIL_PORT)" 2>/dev/null || true
	@(anvil $(ANVIL_FLAGS) > .anvil.log 2>&1 &) ; sleep 2
	npx tsx scripts/deploy.ts --network local
	npx tsx scripts/examples.ts --network local

demo: build demo-chain
	node app/scripts/sync-contracts.mjs
	@echo ""
	@echo "  Till is running locally:"
	@echo "    app       http://localhost:3000"
	@echo "    lab       http://localhost:3000/lab"
	@echo "    chain     http://127.0.0.1:$(ANVIL_PORT) (anvil, osaka, chain id 31337)"
	@echo "    test keys anvil's default mnemonic; the app makes burner wallets and the faucet funds them"
	@echo ""
	cd app && NEXT_PUBLIC_CHAIN=local npm run dev

playwright: build demo-chain
	node app/scripts/sync-contracts.mjs
	cd app && NEXT_PUBLIC_CHAIN=local npx playwright test

app-build: build
	cd app && npm run build

report:
	npx tsx scripts/report.ts

deploy-sepolia: build
	npx tsx scripts/deploy.ts --network sepolia
	npx tsx scripts/examples.ts --network sepolia
	npx tsx scripts/verify-bytecode.ts --network sepolia
	node app/scripts/sync-contracts.mjs

verify-sepolia: fe-build
	npx tsx scripts/verify-bytecode.ts --network sepolia

clean:
	rm -rf out ingots/*/out e2e/results.json app/.next
