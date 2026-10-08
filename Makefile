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
DEPLOY_SCRIPT := script/deployment/DeployScript.s.sol
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
ci: fmt-check check-sizes test ## Run the full CI sequence locally, in the order GitHub runs it

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

# foundry.toml raises code_size_limit for the CoFHE mocks, so forge never enforces EIP-170 itself.
# This checks the contracts that actually go onchain against the real 24,576-byte limit.
DEPLOYED := ApprovalPolicy AuditRegistry ConfidentialNative ConfidentialToken DayzePayroll ERC20ConfidentialLib \
            ERC20_Harness HumanRegistry IncomeCredential JoinRequests

.PHONY: check-sizes
check-sizes: ## Fail if any deployed contract is over the 24,576-byte EIP-170 limit
	@forge build --sizes 2>/dev/null | awk -v names="$(DEPLOYED)" ' \
		BEGIN { n = split(names, list, " "); for (i = 1; i <= n; i++) want[list[i]] = 1 } \
		$$1 == "|" && ($$2 in want) { size = $$4; gsub(",", "", size); seen++; \
			status = (size + 0 > 24576) ? "OVER" : "ok"; if (status == "OVER") bad++; \
			printf "  %-22s %6d B  %s\n", $$2, size, status } \
		END { if (seen < n) { print "error: missing contracts in forge output"; exit 1 } \
			if (bad) { print "error: " bad " contract(s) over 24,576 bytes"; exit 1 } }'

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
#   make deploy-arb                   # or make deploy-base, or make deploy-all for both
#   make export-abis
#   make test-fork
#
# Every target here also takes CHAIN=base_sepolia. ATTESTER (07a) is read from .env and is immutable until
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

# The script writes deployments/<chainId>.json while it simulates, before any transaction is sent.
# If the broadcast then fails, that file holds addresses that don't exist, so delete it.
.PHONY: deploy
deploy: check-chain check-SENDER check-sizes ## Deploy, wire and verify everything on CHAIN
	DEMO_PERIOD=$(DEMO_PERIOD) forge script $(DEPLOY_SCRIPT) $(BROADCAST) $(VERIFY) -vvvv || \
		{ rm -f deployments/$(CHAIN_ID).json; echo "deploy failed: removed deployments/$(CHAIN_ID).json"; exit 1; }

.PHONY: deploy-arb
deploy-arb: ## Deploy to Arbitrum Sepolia (same as make deploy)
	$(MAKE) deploy CHAIN=arbitrum_sepolia

.PHONY: deploy-base
deploy-base: ## Deploy to Base Sepolia (same as make deploy CHAIN=base_sepolia)
	$(MAKE) deploy CHAIN=base_sepolia

# Stops at the first failure, so Base never deploys after a failed Arbitrum run.
.PHONY: deploy-all
deploy-all: ## Deploy to Arbitrum Sepolia, then Base Sepolia, then export to the frontend
	$(MAKE) deploy-arb
	$(MAKE) deploy-base
	$(MAKE) export-abis

# Adds JoinRequests to a deployment made before it existed. Writes joinRequests into deployments/<chainId>.json.
.PHONY: deploy-join-requests
deploy-join-requests: check-chain check-SENDER check-sizes ## Add JoinRequests to CHAIN's existing deployment, then export
	forge script script/deployment/DeployJoinRequestsScript.s.sol $(BROADCAST) $(VERIFY) -vvvv
	$(MAKE) export-abis

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

##@ Interactions — plaintext calls into CHAIN's deployment

# script/interaction/InteractionsScript.s.sol, one function per target. Reads deployments/<chainId>.json,
# so deploy first. Encrypted calls (fundVault, createStream, setThreshold, withdraw) and resolvePolicy
# need Fhenix's off-chain encryption or decryption: do those in the app.
#
#   make mint-demo                        # 10,000 USDC + 1,000 ARB to you
#   make shield-usdc AMOUNT=5000000000    # 5,000 USDC → cUSDC (6 decimals)
#   make set-operator                     # let payroll pull your confidential tokens
#   make create-org NAME="Acme Labs"
#   make set-policy APPROVERS="[0xabc...,0xdef...]" REQUIRED=2
#   make status                           # read-only, no password
#
# Amounts are raw integers in the token's decimals. Add CHAIN=base_sepolia for Base.

INTERACT := script/interaction/InteractionsScript.s.sol
USDC     ?= 10000000000
ARB      ?= 1000000000000000000000
ETH_WEI  ?= 10000000000000000
WHO      ?= $(SENDER)

.PHONY: mint-demo
mint-demo: check-chain check-SENDER ## Mint demo USDC and ARB to you (USDC=, ARB= raw amounts)
	forge script $(INTERACT) --sig "mintDemoTokens(uint256,uint256)" $(USDC) $(ARB) $(BROADCAST)

.PHONY: shield-usdc
shield-usdc: check-chain check-SENDER check-AMOUNT ## Shield USDC into cUSDC (AMOUNT, 6 decimals)
	forge script $(INTERACT) --sig "shieldUsdc(uint256)" $(AMOUNT) $(BROADCAST)

.PHONY: shield-arb
shield-arb: check-chain check-SENDER check-AMOUNT ## Shield ARB into cARB (AMOUNT, 18 decimals)
	forge script $(INTERACT) --sig "shieldArb(uint256)" $(AMOUNT) $(BROADCAST)

.PHONY: shield-eth
shield-eth: check-chain check-SENDER ## Shield native ETH into cETH (ETH_WEI, default 0.01 ETH)
	forge script $(INTERACT) --sig "shieldEth(uint256)" $(ETH_WEI) $(BROADCAST)

.PHONY: set-operator
set-operator: check-chain check-SENDER ## Let payroll pull your cUSDC, cARB and cETH (needed before funding)
	forge script $(INTERACT) --sig "setPayrollOperator()" $(BROADCAST)

.PHONY: create-org
create-org: check-chain check-SENDER check-NAME ## Register as an employer (NAME="Acme Labs")
	forge script $(INTERACT) --sig "createOrg(string)" "$(NAME)" $(BROADCAST)

.PHONY: add-auditor
add-auditor: check-chain check-SENDER check-AUDITOR ## Appoint an auditor (AUDITOR=0x...)
	forge script $(INTERACT) --sig "addAuditor(address)" $(AUDITOR) $(BROADCAST)

.PHONY: remove-auditor
remove-auditor: check-chain check-SENDER check-AUDITOR ## Remove an auditor (AUDITOR=0x...)
	forge script $(INTERACT) --sig "removeAuditor(address)" $(AUDITOR) $(BROADCAST)

.PHONY: set-policy
set-policy: check-chain check-SENDER check-APPROVERS check-REQUIRED ## Set k-of-n approvers (APPROVERS="[0x..,0x..]" REQUIRED=2)
	forge script $(INTERACT) --sig "setPolicy(address[],uint8)" "$(APPROVERS)" $(REQUIRED) $(BROADCAST)

.PHONY: approve
approve: check-chain check-SENDER check-PAYER check-STREAM ## Approve a pending stream (PAYER=0x... STREAM=1)
	forge script $(INTERACT) --sig "approve(address,uint256)" $(PAYER) $(STREAM) $(BROADCAST)

.PHONY: activate
activate: check-chain check-SENDER check-STREAM ## Activate a pending stream with enough approvals (STREAM=1)
	forge script $(INTERACT) --sig "activateApproved(uint256)" $(STREAM) $(BROADCAST)

.PHONY: cancel-stream
cancel-stream: check-chain check-SENDER check-STREAM ## Cancel one of your streams (STREAM=1)
	forge script $(INTERACT) --sig "cancelStream(uint256)" $(STREAM) $(BROADCAST)

.PHONY: add-token
add-token: check-chain check-SENDER check-TOKEN ## Allowlist another wrapper, owner only (TOKEN=0x...)
	forge script $(INTERACT) --sig "addToken(address)" $(TOKEN) $(BROADCAST)

.PHONY: remove-token
remove-token: check-chain check-SENDER check-TOKEN ## Remove a wrapper from the allowlist, owner only (TOKEN=0x...)
	forge script $(INTERACT) --sig "removeToken(address)" $(TOKEN) $(BROADCAST)

.PHONY: set-attester
set-attester: check-chain check-SENDER check-NEW_ATTESTER ## Rotate the World ID attester, owner only (NEW_ATTESTER=0x...)
	forge script $(INTERACT) --sig "setAttester(address)" $(NEW_ATTESTER) $(BROADCAST)

.PHONY: status
status: check-chain check-WHO ## Print the deployment's wiring and an account's state (WHO=0x..., default you)
	@forge script $(INTERACT) --sig "status(address)" $(WHO) --rpc-url $(CHAIN) 2>&1 | sed -n '/== Logs ==/,/^$$/p'

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
