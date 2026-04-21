# 🚀 Decentralized HPC Marketplace: TRL-5 Demo Guide

This document serves as the comprehensive manual for the **High-Fidelity TRL-5 Demonstration** of the Decentralized HPC Marketplace. It summarizes all recent architectural enhancements, UI features, and provides a step-by-step execution guide for the panel.

---

## 🏗️ Major Feature Updates (The "New" HPC Experience)

We have transformed the prototype into a premium, interactive demonstration system. Key additions include:

### 1. Agentic Execution Trace (Live "Thinking" UI)
*   **What it is**: A vertical, interactive timeline that shows the step-by-step logic of the Provider Node as it executes a job.
*   **Aesthetics**: Uses a modern "agent chat" style with collapsible "Action Cards" that reveal underlying system details (e.g., specific file paths, buffer lengths, and CLI commands).
*   **Technology**: Structured JSON logs are emitted on-chain via `JobMarket.reportProgress` and parsed by the frontend into a rich UI.

### 2. Multi-Account Wallet Sandbox
*   **Instant Switching**: A dropdown menu in the "Connect Wallet" section allows switching between **5 distinct profiles** (Deployer, Client A, Provider A, Client B, Provider B) without external wallet delays.
*   **Pre-Funded**: All accounts are initialized with test ETH on the local Hardhat network.

### 3. Unified Activity Log
*   **Global View**: A new sidebar entry called **"Activity Log"** aggregates all platform activities—job postings, bid submissions, assignment events, and live agent traces—into a single, high-fidelity timeline.

### 4. Complex Python Workload Templates
*   **Templates**: 
    1.  **ML Fine-Tuning**: K-Means clustering simulation with epoch-based progress.
    2.  **Financial Monte Carlo**: Risk assessment modeling.
    3.  **Genomic Alignment**: Sequence mapping simulation.
*   **Native Execution**: The Provider Node now extracts the code, saves it to `tmp_tasks/`, executes it as a physical child process, captures STDOUT, and encodes the result in Base64 for the blockchain.

---

## 🏃 Execution Guide (Step-by-Step Demo)

Follow these steps to demonstrate the full system lifecycle to the panel:

### Phase 1: Preparation
1.  **Terminal**: Run `.\launch-demo.ps1`. This starts the Blockchain, the Provider Node, and the Web Server.
2.  **Browser**: Open `http://localhost:8080`.
3.  **Connection**: 
    *   Click **Connect Wallet** -> **💳 Account 2 (Client A)**.
    *   You are now the "Job Giver".

### Phase 2: Posting & Bidding
1.  **Create Job**: Go to "Create Job" in the sidebar.
2.  **Configure**: Check "This is a Python Execution Task". Select the "ML Fine-Tuning" template.
3.  **Submit**: Click **Post Job to Marketplace**.
4.  **Observer**: Note that the **Activity Log** instantly records the "Job Posted" event.
5.  **Bidding**: Wait 3-5 seconds. The background Provider Node will automatically detect the job and submit a bid. You will see this in the Activity Log and on your Dashboard.

### Phase 3: Selection & Trace
1.  **Accept Bid**: Open the Job Details from the Dashboard. Locate the Provider's bid and click **Accept Bid**.
2.  **Watch the Trace**: 
    *   The side panel will switch to the **Agent Execution Trace**.
    *   You will see the agent "thinking" and acting: "Downloading workload...", "Spawning physical child process...", "Executing python...".
    *   Expand the action cards to show the panel the technical steps happening under the hood.

### Phase 4: Verification
1.  **Results**: Once complete, a green confirmation appears. The **Task Execution Output (STDOUT)** box will show the raw logs from the native Python process.
2.  **Backend Integrity**: Show the user the `provider_results/` folder on your disk. You will find a file named `job_X_result.txt` containing the same output, proving the provider combined the process results and saved them physically before on-chain submission.

---

## 📁 Project Structure (HPC Core)

- **`/client`**: The glassmorphism UI. `app.js` contains the event listeners and log renderers.
- **`/provider`**: The autonomous node. `index.js` handles the job lifecycle and native execution.
- **`/contracts`**: Solidity files. `JobMarket.sol` is the hub for job state and progress reports.
- **`/provider_results`**: (Generated) local storage for physical compute outputs.
- **`/tmp_tasks`**: (Generated) temporary sandbox for script execution.

---

## 🛠️ Troubleshooting
- **Accept Bid Button Hidden?**: Ensure you are logged in as the same client who posted the job. If the button doesn't appear immediately, wait for the Provider to submit its bid (check Activity Log).
- **Python Missing?**: Ensure `python` is in your system PATH for the provider node to spawn child processes.

---

*This Marketplace represents a leap in trustless HPC, bridging the gap between blockchain escrow and native high-performance computation.*
