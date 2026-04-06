/**
 * ═══════════════════════════════════════════════════════════════
 *  HPC MARKETPLACE — LIVE DEMO SCRIPT
 *  Full Job Lifecycle: Post → Bid → Assign → Execute → Pay
 * ═══════════════════════════════════════════════════════════════
 *
 *  ⚠️  ALL FAKE ETH — Nothing real, runs on local Hardhat node
 *  Run: node scripts/demo.js
 */

const { ethers } = require("hardhat");

// ── Pretty logging ───────────────────────────────────────────
const COLORS = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    green: "\x1b[32m",
    cyan: "\x1b[36m",
    yellow: "\x1b[33m",
    magenta: "\x1b[35m",
    red: "\x1b[31m",
    blue: "\x1b[34m",
    dim: "\x1b[2m"
};

function banner(text) {
    const line = "═".repeat(60);
    console.log(`\n${COLORS.cyan}${line}${COLORS.reset}`);
    console.log(`${COLORS.bright}${COLORS.cyan}  ${text}${COLORS.reset}`);
    console.log(`${COLORS.cyan}${line}${COLORS.reset}\n`);
}

function step(num, text) {
    console.log(`${COLORS.bright}${COLORS.yellow}  [Step ${num}]${COLORS.reset} ${text}`);
}

function info(label, value) {
    console.log(`${COLORS.dim}           ${label}: ${COLORS.reset}${COLORS.bright}${value}${COLORS.reset}`);
}

function success(text) {
    console.log(`${COLORS.green}       ✅ ${text}${COLORS.reset}`);
}

function money(label, eth) {
    console.log(`${COLORS.magenta}       💰 ${label}: ${COLORS.bright}${eth} ETH${COLORS.reset}${COLORS.dim} (fake — local only)${COLORS.reset}`);
}

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Main demo ────────────────────────────────────────────────
async function main() {
    banner("⚠️  FAKE ETH DEMO — Local Hardhat Blockchain Only");
    console.log(`${COLORS.red}${COLORS.bright}  No real money is involved. All ETH is fake test currency.${COLORS.reset}`);
    console.log(`${COLORS.dim}  Network: localhost:8545 | Chain ID: 31337${COLORS.reset}\n`);

    // ── Get signers (Hardhat test accounts with fake ETH) ────
    const [deployer, client, provider] = await ethers.getSigners();

    console.log(`${COLORS.dim}  Deployer:  ${deployer.address}${COLORS.reset}`);
    console.log(`${COLORS.dim}  Client:    ${client.address}${COLORS.reset}`);
    console.log(`${COLORS.dim}  Provider:  ${provider.address}${COLORS.reset}\n`);

    // Show initial balances
    const clientStartBal = await ethers.provider.getBalance(client.address);
    const providerStartBal = await ethers.provider.getBalance(provider.address);
    money("Client starting balance", ethers.formatEther(clientStartBal));
    money("Provider starting balance", ethers.formatEther(providerStartBal));
    console.log();

    await wait(1000);

    // ── Deploy fresh contracts for this demo ─────────────────
    banner("Phase 1: Contract Deployment");
    step(1, "Deploying smart contracts...");

    const Reputation = await ethers.getContractFactory("Reputation");
    const reputation = await Reputation.deploy();
    await reputation.waitForDeployment();
    info("Reputation", await reputation.getAddress());

    const DisputeResolution = await ethers.getContractFactory("DisputeResolution");
    const disputeResolution = await DisputeResolution.deploy(deployer.address);
    await disputeResolution.waitForDeployment();
    info("DisputeResolution", await disputeResolution.getAddress());

    const JobMarket = await ethers.getContractFactory("JobMarket");
    const jobMarket = await JobMarket.deploy(
        await reputation.getAddress(),
        await disputeResolution.getAddress()
    );
    await jobMarket.waitForDeployment();
    info("JobMarket", await jobMarket.getAddress());

    // Link contracts
    await reputation.setJobMarketContract(await jobMarket.getAddress());
    await disputeResolution.setJobMarketContract(await jobMarket.getAddress());
    success("All contracts deployed and linked!");

    await wait(1000);

    // ── Provider Registration ────────────────────────────────
    banner("Phase 2: Provider Registration");
    step(2, "Provider stakes 0.5 ETH and registers GPU hardware...");

    const STAKE = ethers.parseEther("0.5");
    const GPU_PRO = 2; // ComputeTier.GPU_PRO

    const stakeTx = await jobMarket.connect(provider).stakeAsProvider(
        GPU_PRO,   // tier
        32,        // CPU cores
        24576,     // GPU VRAM (MB)
        65536,     // RAM (MB)
        { value: STAKE }
    );
    await stakeTx.wait();

    money("Provider staked", ethers.formatEther(STAKE));
    info("Hardware", "32-core CPU, 24GB GPU VRAM, 64GB RAM");
    info("Compute Tier", "GPU_PRO");
    success("Provider registered and ready for jobs!");

    await wait(1000);

    // ── Job Posting ──────────────────────────────────────────
    banner("Phase 3: Client Posts a Compute Job");
    step(3, "Client posts an ML training job with 2 ETH budget...");

    const BUDGET = ethers.parseEther("2.0");
    const block = await ethers.provider.getBlock("latest");
    const deadline = block.timestamp + 86400; // 24h from now

    const postTx = await jobMarket.connect(client).postJob(
        "QmX7b3k9...abc123",                                    // IPFS data hash
        "Fine-tune LLaMA-3 8B on medical Q&A dataset (LoRA)",   // description
        deadline,                                                 // deadline
        1,                                                        // GPU_BASIC tier required
        { value: BUDGET }
    );
    const postReceipt = await postTx.wait();

    money("Job budget (escrowed)", ethers.formatEther(BUDGET));
    info("Description", "Fine-tune LLaMA-3 8B on medical Q&A dataset (LoRA)");
    info("Required Tier", "GPU_BASIC (minimum)");
    info("Data", "QmX7b3k9...abc123 (IPFS CID)");
    info("Deadline", "24 hours from now");
    info("Job ID", "1");
    success("Job posted! Budget locked in smart contract escrow.");

    const clientAfterPost = await ethers.provider.getBalance(client.address);
    money("Client balance after posting", ethers.formatEther(clientAfterPost));
    console.log(`${COLORS.dim}           (decreased by ~2 ETH + gas fees)${COLORS.reset}`);

    await wait(1000);

    // ── Provider Bids ────────────────────────────────────────
    banner("Phase 4: Provider Submits Bid");
    step(4, "Provider analyzes job and submits competitive bid...");

    const BID_AMOUNT = ethers.parseEther("1.8");
    const BID_DURATION = 7200; // 2 hours estimated compute time

    const bidTx = await jobMarket.connect(provider).submitBid(
        1,              // job ID
        BID_AMOUNT,     // bid price
        BID_DURATION    // estimated duration (seconds)
    );
    await bidTx.wait();

    money("Bid amount", ethers.formatEther(BID_AMOUNT));
    info("Estimated time", "2 hours");
    info("Savings for client", `${ethers.formatEther(BUDGET - BID_AMOUNT)} ETH under budget`);
    success("Bid submitted!");

    await wait(1000);

    // ── Client Accepts Bid ───────────────────────────────────
    banner("Phase 5: Client Accepts Bid");
    step(5, "Client reviews and accepts the provider's bid...");

    const acceptTx = await jobMarket.connect(client).acceptBid(1, provider.address);
    await acceptTx.wait();

    info("Assigned to", provider.address);
    info("SLA", "Provider must deliver within estimated duration");
    success("Bid accepted! Job is now ASSIGNED with SLA deadline.");

    await wait(1000);

    // ── Provider Submits Result ──────────────────────────────
    banner("Phase 6: Provider Executes & Submits Result");

    console.log(`${COLORS.dim}  [Simulating computation...]${COLORS.reset}`);
    const phases = [
        "📥 Downloading training data from IPFS...",
        "🔧 Preprocessing: tokenizing medical Q&A pairs...",
        "🧠 Training: LoRA fine-tuning LLaMA-3 8B (4 epochs)...",
        "📦 Packaging: exporting model weights..."
    ];

    for (let i = 0; i < phases.length; i++) {
        await wait(800);
        console.log(`${COLORS.blue}       ${phases[i]}${COLORS.reset}`);
    }
    await wait(500);

    step(6, "Provider submits computation result...");

    const resultTx = await jobMarket.connect(provider).submitResult(
        1,
        "QmResult...xyz789"  // IPFS hash of trained model weights
    );
    await resultTx.wait();

    info("Result hash", "QmResult...xyz789 (IPFS CID of model weights)");
    success("Result submitted! Job status: COMPLETED. Awaiting client verification.");

    await wait(1000);

    // ── Client Confirms & Payment ────────────────────────────
    banner("Phase 7: Client Confirms & Payment Released");
    step(7, "Client verifies result and confirms completion...");

    const providerBefore = await ethers.provider.getBalance(provider.address);

    const confirmTx = await jobMarket.connect(client).confirmCompletion(1);
    await confirmTx.wait();

    const providerAfter = await ethers.provider.getBalance(provider.address);
    const providerEarned = providerAfter - providerBefore;

    // Platform fee is 2%, so provider gets 98% of bid amount
    const platformFee = BID_AMOUNT * 2n / 100n;
    const providerPayment = BID_AMOUNT - platformFee;
    const clientRefund = BUDGET - BID_AMOUNT;

    money("Provider earned", ethers.formatEther(providerPayment));
    money("Platform fee (2%)", ethers.formatEther(platformFee));
    money("Client refund (bid < budget)", ethers.formatEther(clientRefund));
    success("Payment released from escrow! Job status: CONFIRMED.");

    await wait(500);

    // ── Final State ──────────────────────────────────────────
    banner("Final State");

    const job = await jobMarket.getJob(1);
    const statusNames = ["Open", "Assigned", "Completed", "Confirmed", "Cancelled", "Disputed"];
    info("Job Status", statusNames[Number(job.status)]);

    const clientEndBal = await ethers.provider.getBalance(client.address);
    const providerEndBal = await ethers.provider.getBalance(provider.address);

    console.log();
    console.log(`${COLORS.bright}  Balance Changes:${COLORS.reset}`);
    console.log(`${COLORS.dim}  ┌────────────┬─────────────────────┬─────────────────────┐${COLORS.reset}`);
    console.log(`${COLORS.dim}  │ Account    │ Before              │ After               │${COLORS.reset}`);
    console.log(`${COLORS.dim}  ├────────────┼─────────────────────┼─────────────────────┤${COLORS.reset}`);
    console.log(`${COLORS.dim}  │ Client     │ ${ethers.formatEther(clientStartBal).substring(0, 17).padEnd(17)} ETH │ ${ethers.formatEther(clientEndBal).substring(0, 17).padEnd(17)} ETH │${COLORS.reset}`);
    console.log(`${COLORS.dim}  │ Provider   │ ${ethers.formatEther(providerStartBal).substring(0, 17).padEnd(17)} ETH │ ${ethers.formatEther(providerEndBal).substring(0, 17).padEnd(17)} ETH │${COLORS.reset}`);
    console.log(`${COLORS.dim}  └────────────┴─────────────────────┴─────────────────────┘${COLORS.reset}`);

    // Reputation
    const stats = await reputation.getProviderStats(provider.address);
    const tier = await reputation.getProviderTier(provider.address);
    const tierNames = ["Unranked", "Bronze", "Silver", "Gold", "Platinum"];

    console.log();
    console.log(`${COLORS.bright}  Provider Reputation:${COLORS.reset}`);
    info("Score", stats[0].toString());
    info("Successful jobs", stats[1].toString());
    info("Tier", tierNames[Number(tier)]);

    // Market stats
    const marketStats = await jobMarket.getMarketStats();
    console.log();
    console.log(`${COLORS.bright}  Platform Statistics:${COLORS.reset}`);
    info("Total jobs", marketStats[0].toString());
    info("Completed", marketStats[1].toString());
    info("Total volume", `${ethers.formatEther(marketStats[3])} ETH`);

    banner("✅ DEMO COMPLETE — All Fake ETH, Zero Real Cost");
    console.log(`${COLORS.red}${COLORS.bright}  Reminder: This ran on a local Hardhat blockchain.`);
    console.log(`  No real Ethereum network was used. No real money was spent.${COLORS.reset}\n`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
