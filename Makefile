# Dayze — command reference
#
# Every forge, cast and script command in this project, behind a name you can read.
# `make help` lists them. `make ci` is what GitHub Actions runs.
#
# Two flags appear on every broadcast and both are required:
#   --account  chooses the keystore that SIGNS
#   --sender   sets msg.sender INSIDE the script
# Foundry infers neither from the other. If they disagree, the simulation runs as one address
# and the broadcast signs as another, so ownership of payroll, policy and the human registry
# ends up on the wrong key. `make check-deployer` compares them.

##@ Configuration

# Override any of these on the command line: make deploy CHAIN=base_sepolia
CHAIN       ?= arbitrum_sepolia
ACCOUNT     ?= sepolia-acc
SENDER      ?= $(shell grep -E '^DEPLOYER=' .env 2>/dev/null | cut -d= -f2)

# Length of one pay period in seconds. 600 makes "a month" ten minutes for the demo.
# Unset it (make deploy DEMO_PERIOD=) to deploy with the 30-day default.
DEMO_PERIOD ?= 600

# Chain ids, for the deployments/<chainId>.json files
CHAIN_ID_arbitrum_sepolia := 421614
CHAIN_ID_base_sepolia     := 84532
CHAIN_ID                  := $(CHAIN_ID_$(CHAIN))

# Shorthands, so the recipes below stay readable. CHAIN is an alias from foundry.toml's
# [rpc_endpoints]; forge reads the URL from .env, so it never appears on the command line.
DEPLOY_SCRIPT := script/deployment/Deploy.s.sol
BROADCAST     := --rpc-url $(CHAIN) --account $(ACCOUNT) --sender $(SENDER) --broadcast
READONLY      := --rpc-url $(CHAIN) --sender $(SENDER)

# Etherscan V2 verification. The key is ARBISCAN_API_KEY in .env and covers both Arbiscan and
# Basescan through foundry.toml's [etherscan] section, so --verify needs no key here.
VERIFY        := --verify

.DEFAULT_GOAL := help

# Fails with a readable message when a required variable is missing, instead of broadcasting
# with an empty --sender. Used as a prerequisite: `deploy: check-SENDER`.
check-%:
	@if [ -z "$($*)" ]; then \
		echo "error: $* is required."; \
		echo "       e.g. make $(MAKECMDGOALS) $*=..."; \
		exit 1; \
	fi

# Fails when CHAIN isn't one Dayze deploys to. CoFHE only runs on these testnets.
.PHONY: check-chain
check-chain:
	@if [ -z "$(CHAIN_ID)" ]; then \
		echo "error: CHAIN must be arbitrum_sepolia or base_sepolia (got '$(CHAIN)')"; \
		exit 1; \
	fi

##@ Everyday

.PHONY: help
help: ## List every command
	@awk 'BEGIN {FS = ":.*##"} \
		/^##@/ { printf "\n%s\n", substr($$0, 5); next } \
		/^[a-zA-Z0-9_-]+:.*##/ { printf "  %-22s %s\n", $$1, $$2 }' $(MAKEFILE_LIST)
	@echo ""

.PHONY: install
install: ## Fetch the git submodules (forge-std, openzeppelin, cofhe, fhenix contracts)
	git submodule update --init --recursive

.PHONY: ci
ci: fmt-check sizes test ## Run the full CI sequence locally, in the order GitHub runs it

.PHONY: fmt
fmt: ## Format every Solidity file
	forge fmt

.PHONY: fmt-check
fmt-check: ## Check formatting without changing anything (fails CI first)
	forge fmt --check

.PHONY: build
build: ## Compile
	forge build

.PHONY: sizes
sizes: ## Compile and print contract sizes against the 24KB limit
	forge build --sizes

.PHONY: test
test: ## Run the test suite on CoFHE mocks (fork tests skip themselves)
	forge test -vvv

.PHONY: coverage
coverage: ## Line and branch coverage summary (target: 80% lines on src/)
	forge coverage --report summary

.PHONY: clean
clean: ## Delete build artifacts and the fork cache
	forge clean

##@ Fork tests — real CoFHE TaskManager, no gas spent

# Runs the real deploy script against a fork, then checks deployments/<chainId>.json if it exists.
#
#   make test-fork                    # Arbitrum Sepolia
#   make test-fork CHAIN=base_sepolia
#   make test-fork-all

.PHONY: test-fork
test-fork: check-chain ## Run the fork tests on CHAIN
	forge test --match-path 'test/forks/*' --fork-url $(CHAIN) -vv

.PHONY: test-fork-all
test-fork-all: ## Run the fork tests on Arbitrum Sepolia and Base Sepolia
	$(MAKE) test-fork CHAIN=arbitrum_sepolia
	$(MAKE) test-fork CHAIN=base_sepolia

##@ Checkpoint 8 — deploy

# One script deploys and wires all ten contracts, then writes deployments/<chainId>.json.
# Check, dry-run, deploy, export, re-test:
#
#   make check-deployer
#   make balance
#   make deploy-dry
#   make deploy
#   make export-abis
#   make test-fork
#
# Repeat with CHAIN=base_sepolia. ATTESTER (07a) is read from .env and is immutable until
# setAttester, so check it before deploying.

.PHONY: check-deployer
check-deployer: check-SENDER ## Confirm the ACCOUNT keystore signs as SENDER (asks for the password)
	@addr=$$(cast wallet address --account $(ACCOUNT)) && \
	if [ "$$(echo $$addr | tr A-F a-f)" = "$$(echo $(SENDER) | tr A-F a-f)" ]; then \
		echo "ok: $(ACCOUNT) is $$addr"; \
	else \
		echo "error: $(ACCOUNT) is $$addr but SENDER is $(SENDER)"; exit 1; \
	fi

.PHONY: balance
balance: check-chain check-SENDER ## Show SENDER's ETH on CHAIN (deploy needs about 0.01)
	@echo "$(SENDER) on $(CHAIN): $$(cast balance $(SENDER) --ether --rpc-url $(CHAIN)) ETH"

.PHONY: deploy-dry
deploy-dry: check-chain check-SENDER ## Simulate the whole deploy on CHAIN, free. Writes nothing.
	DEMO_PERIOD=$(DEMO_PERIOD) forge script $(DEPLOY_SCRIPT) $(READONLY)

.PHONY: deploy
deploy: check-chain check-SENDER ## Deploy, wire and verify everything on CHAIN
	DEMO_PERIOD=$(DEMO_PERIOD) forge script $(DEPLOY_SCRIPT) $(BROADCAST) $(VERIFY) -vvvv

# Verification runs after the transactions land, so a failure here leaves deployed but
# unverified contracts. Nothing to redeploy, just re-run this. It reads the addresses from the
# broadcast log, so it needs no arguments.
.PHONY: verify
verify: check-chain check-SENDER ## Re-submit CHAIN's deployment to the explorer if --verify failed
	DEMO_PERIOD=$(DEMO_PERIOD) forge script $(DEPLOY_SCRIPT) $(READONLY) --verify --resume

.PHONY: deployment
deployment: check-chain ## Print CHAIN's deployed addresses
	@if [ -f deployments/$(CHAIN_ID).json ]; then jq . deployments/$(CHAIN_ID).json; \
	else echo "no deployment on $(CHAIN) yet"; fi

.PHONY: export-abis
export-abis: build ## Copy ABIs and every chain's addresses into frontend/lib/contracts/
	script/export-abis.sh

##@ Not written yet — targets land with their scripts

# Kept here so the command shape is decided once, in one place. Each target fails with a
# pointer until its script exists.

.PHONY: seed
seed: check-chain ## Checkpoint 8 step 2: org, policy, auditor, 4 streams (or seed via the UI)
	@test -f script/seed.sh || { echo "script/seed.sh does not exist yet (checkpoint 8 step 2)"; exit 1; }
	CHAIN=$(CHAIN) ACCOUNT=$(ACCOUNT) script/seed.sh

##@ Frontend — run from frontend/, never the repo root

.PHONY: fe-install
fe-install: ## Install frontend dependencies
	cd frontend && npm install

.PHONY: fe-dev
fe-dev: ## Start the Next.js dev server
	cd frontend && npm run dev

.PHONY: fe-build
fe-build: ## Production build
	cd frontend && npm run build

.PHONY: fe-lint
fe-lint: ## Lint (bare eslint, not next lint)
	cd frontend && npm run lint

.PHONY: fe-typecheck
fe-typecheck: ## Type-check the frontend, including the exported ABIs
	cd frontend && npx tsc --noEmit
