# 🛡️ Decentralized HPC Marketplace: Comprehensive Project Report (TRL 5)

This document is the definitive record of the **Decentralized HPC Marketplace** development cycle, covering architectural decisions, feature implementations, and the technical logic behind the TRL-5 demonstration system.

---

## 1. Project Overview & TRL 5 Status
The Decentralized HPC Marketplace is a blockchain-native platform for securely buying and selling high-performance compute resources. 
*   **TRL 5 Validation**: The system has been validated in a relevant environment (local distributed network simulation) using real-world Python workloads (ML, Finance, Genomics).
*   **Core Goal**: To eliminate intermediaries in the compute market while maintaining trust through automated escrow and transparent, agentic execution.

---

## 2. Technical Architecture

### A. The Smart Contract Layer (Ethereum/Solidity)
The backbone of the project consists of four interconnected contracts:
- **`JobMarket.sol`**: Handles the full job lifecycle (Posted -> Bidding -> Assigned -> Completed). Includes financial escrow logic.
- **`Reputation.sol`**: Tracks provider success rates and assigns "Success Streaks" to incentivize quality.
- **`DisputeResolution.sol`**: A multi-phase arbitration system for handling failed or contested jobs.
- **`GovernanceToken.sol`**: An ERC-20 token allowing the community to vote on platform parameters.

### B. The Provider "Autonomous" Node (Node.js + Python)
The provider node is a persistent process that:
1.  **Monitors Events**: Scans the blockchain for new `JobPosted` events.
2.  **Autonomous Bidding**: Submits bids based on job budget and required compute tier.
3.  **Native Sandbox Execution**:
    - Allocates a temporary directory (`tmp_tasks/`).
    - Spawns a physical child process to run the Python payload natively.
    - Captures real-time output (STDOUT).
    - Encodes the result as a Base64 string for on-chain submission.

### C. The Frontend UI (Vanilla JS + Ethers.js v6)
A high-fidelity dashboard built with a **Premium Glassmorphism** design system, featuring:
- **Wallet Profile Switcher**: Instant switching between 5 hardcoded account profiles (Client/Provider/Deployer).
- **Agentic Timeline**: A vertical execution trace that parses on-chain JSON strings into a rich, interactive log.
- **Unified Activity Log**: A platform-wide event stream for real-time monitoring.

---

## 3. The "Processing" Logic: Step-by-Step

Understanding how a job moves from a click to a completed computation:

1.  **Ingestion**: Client selects a template (e.g., ML Fine-Tuning). The Python code is stored in the `description` or `dataHash` field of the contract transaction.
2.  **Escrow**: The client’s ETH is locked in the `JobMarket` contract. It cannot be released until the job is done or canceled.
3.  **Discovery**: The Provider Node sees the `JobPosted` event and triggers its internal `executeJob` function.
4.  **Sandbox Isolation**: The code is written physically to `tmp_tasks/task_X.py`.
5.  **Native Runtime**: `child_process.execSync` is called within the Provider's local environment. This is where the actual CPU/GPU work happens.
6.  **Streaming Proof**: While running, the Provider calls `reportProgress` multiple times with JSON objects. The UI listens for these and updates the **Agentic Execution Trace** live.
7.  **Result Capture**: Once complete, the STDOUT is saved to `provider_results/job_X_result.txt` on the provider's machine.
8.  **Finalization**: The STDOUT is encoded into Base64 and submitted to `submitResult`. The client then "Accepts" the result, releasing the ETH to the provider.

---

## 4. Major Feature History (Development Journey)

- **Phase 1: Foundation**: Established the Basic JobMarket contract and simple CLI interaction.
- **Phase 2: Visual Overhaul**: Built the Glassmorphism UI, replacing terminal logs with a dashboard.
- **Phase 3: Transparency**: Implemented the **Agentic Trace** to show the panel exactly what the autonomous agent is "thinking" during a job.
- **Phase 4: Multi-Account Utility**: Added the 5-profile switcher so one user can simulate an entire marketplace in one browser.
- **Phase 5: Native Compute**: Integrated the Python `subprocess` engine, moving from "simulated jobs" to **real, native computations**.

---

## 5. Demonstration Instructions

### Prerequisites
- PowerShell (Windows environment).
- Node.js installed.
- `python` installed and in your system PATH.

### Launch Procedure
1.  Navigate to the project root: `d:\Capstone Project\Decentralized-HPC-Marketplace`.
2.  Run the master script: `.\launch-demo.ps1`.
3.  Open `http://localhost:8080`.

### The "Perfect" Demo Flow
1.  **Connect** as **Account 2 (Client A)**.
2.  **Post** a "Python Execution Task" using the **ML Fine-Tuning Template**.
3.  **Open** the **Activity Log** in the sidebar to show the panel the blockchain events.
4.  **Select** the job in the Dashboard once a bid appears.
5.  **Click Accept Bid** and immediately watch the **Agent Execution Trace** unfold.
6.  **Verify** the final STDOUT logs in the job detail panel once complete.

---

## 6. Project Credentials (Hardcoded for Demo)
For the panel’s reference, the following accounts are pre-configured:
- **Account 1**: Deployer (`0xf39...`)
- **Account 2**: Client A (`0x709...`) - *Suggested for Job Creation*
- **Account 3**: Provider A (`0x3c4...`) - *Runs the background nodes*
- **Account 4**: Client B (`0x90f...`)
- **Account 5**: Provider B (`0x15d...`)

---

*This report documents the completion of a TRL-5 decentralized ecosystem ready for high-level technical scrutiny.*
