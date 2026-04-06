# Decentralized HPC Marketplace

A blockchain-based marketplace for high-performance computing resources, featuring smart contract escrow, tiered reputation, multi-phase dispute arbitration, and DAO governance.

[![Solidity](https://img.shields.io/badge/Solidity-0.8.20-363636?logo=solidity)](https://soliditylang.org/)
[![Hardhat](https://img.shields.io/badge/Hardhat-2.x-FFF100?logo=ethereum)](https://hardhat.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## Features

| Feature | Description |
|---------|-------------|
| **Job Marketplace** | Post compute jobs with ETH escrow, tiered hardware requirements, and SLA enforcement |
| **Provider Reputation** | Weighted scoring with streak bonuses, epoch freshness, and Sybil-resistant stake weighting |
| **Dispute Resolution** | Multi-phase arbitration: evidence submission → escalation → resolution with stake slashing |
| **DAO Governance** | HPCGov ERC-20 token for proposal creation, weighted voting, and advisory parameter changes |
| **Provider Node** | Autonomous agent with hardware benchmarking, resource-aware bidding, and proof-of-computation |
| **Web Interface** | Dashboard, leaderboard, dispute management, governance voting, and network topology visualization |

---

## Quick Start

> **Note:** `hardhat-gas-reporter` is bundled by `@nomicfoundation/hardhat-toolbox` and must **not** be added as a separate `devDependency`. Adding it independently (especially v2.x) causes an `ERESOLVE` peer-dependency conflict. If you encounter npm install errors, run:
> ```bash
> npm install --legacy-peer-deps
> ```

```bash
# Install dependencies
npm install

# Compile contracts
npm run compile

# Run test suite (55 tests)
npm test

# Start local blockchain
npm run node

# Deploy contracts (in a new terminal)
npm run deploy

# Start a provider node (in a new terminal)
npm run provider

# Launch web interface (in a new terminal, opens at http://localhost:3000)
npm run client
```

### Docker

```bash
docker compose up --build
```

This starts 5 services: blockchain node, deployer, 3 provider nodes, and the web client.

---

## Project Structure

```
├── contracts/
│   ├── JobMarket.sol          # Core marketplace with escrow & SLA
│   ├── Reputation.sol         # Tiered reputation with leaderboard
│   ├── DisputeResolution.sol  # Multi-phase arbitration protocol
│   └── GovernanceToken.sol    # HPCGov ERC-20 DAO token
├── test/
│   ├── JobMarket.test.js      # 45 tests — marketplace + reputation + disputes
│   └── GovernanceToken.test.js # 10 tests — proposal lifecycle + voting
├── scripts/
│   └── deploy.js              # Deploys and links all 4 contracts
├── provider/
│   └── index.js               # Autonomous provider node
├── client/
│   ├── index.html             # Web interface
│   ├── app.js                 # Client logic
│   ├── styles.css             # Dark glassmorphism theme
│   └── contracts.js           # ABIs for all contracts
├── docker/                    # Dockerfiles for each service
├── ARCHITECTURE.md            # System architecture with diagrams
├── RESEARCH.md                # Literature review & theoretical context
└── docker-compose.yml         # Multi-service orchestration
```

---

## Smart Contract Architecture

```
JobMarket.sol ──► Reputation.sol      (incrementReputation on job completion)
     │
     └──────────► DisputeResolution.sol (raiseDispute on contested results)

GovernanceToken.sol ──► Advisory parameter changes via events
```

**Security:** ReentrancyGuard, checks-effects-interactions, stake-weighted Sybil resistance

---

## Testing

```bash
npm test
```

**55 tests** covering:
- Contract deployment and linking
- Provider staking with hardware profiles
- Job posting with compute tier requirements
- Tier-verified bidding and SLA enforcement
- Payment release with platform fee distribution
- Full dispute resolution lifecycle
- Reputation tiers, streaks, and leaderboard
- DAO proposal creation, voting, quorum, and execution
- End-to-end workflow integration

---

## Documentation

- **[ARCHITECTURE.md](ARCHITECTURE.md)** — System diagrams, data flows, security model
- **[RESEARCH.md](RESEARCH.md)** — Literature review on mechanism design, Sybil resistance, arbitration theory

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Smart Contracts | Solidity 0.8.20, OpenZeppelin 5.0.0 |
| Development | Hardhat, Chai, ethers.js v6 |
| Provider Node | Node.js |
| Client | HTML/CSS/JS, ethers.js v6 |
| Containerization | Docker Compose |

---

## License

MIT
