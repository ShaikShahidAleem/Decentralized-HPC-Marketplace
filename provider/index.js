/**
 * HPC Marketplace — Compute Provider Node
 * =========================================
 *
 * An autonomous provider agent that connects to the blockchain-based HPC marketplace,
 * advertises hardware capabilities, submits competitive bids, executes simulated
 * workloads, and reports computation proofs.
 *
 * Key Features:
 *   - Hardware benchmarking (simulated CPU, GPU, RAM, disk metrics)
 *   - Heartbeat/liveness reporting to demonstrate uptime
 *   - Resource-aware bid pricing (cost modeled on hardware tier + utilization)
 *   - Proof-of-computation stub (hash chain for verifiable execution)
 *   - Structured logging with severity levels and timestamps
 */

const { ethers } = require("ethers");
const crypto = require("crypto");
const fs = require("fs");
const child_process = require("child_process");
const path = require("path");
const http = require("http");
const CONFIG = require("./config");

// ─────────────────────────────────────────────────────────
//  Transaction Queue (Nonce Safety)
// ─────────────────────────────────────────────────────────
class TxQueue {
    constructor() {
        this.queue = Promise.resolve();
    }

    add(task) {
        this.queue = this.queue.then(() => task()).catch(err => console.error("TxQueue Error:", err));
        return this.queue;
    }
}
const globalTxQueue = new TxQueue();

// ─────────────────────────────────────────────────────────
//  ABI Definitions
// ─────────────────────────────────────────────────────────

const JOB_MARKET_ABI = [
    "event JobPosted(uint256 indexed jobId, address indexed client, uint256 budget, string dataHash, string description, uint256 deadline, uint8 requiredTier)",
    "event JobAssigned(uint256 indexed jobId, address indexed provider, uint256 amount, uint256 slaDeadline)",
    "event JobCompleted(uint256 indexed jobId, address indexed client, address indexed provider, uint256 payment, uint256 platformFee)",
    "event JobProgress(uint256 indexed jobId, string stage)",
    "event JobAssigned(uint256 indexed jobId, address indexed provider, uint256 amount, uint256 slaDeadline)",
    "event JobCompleted(uint256 indexed jobId, address indexed client, address indexed provider, uint256 payment, uint256 platformFee)",
    "function stakeAsProvider(uint8 _tier, uint256 _cpuCores, uint256 _gpuVRAM, uint256 _ramMB) payable",
    "function submitBid(uint256 _jobId, uint256 _amount, uint256 _estimatedDuration) external",
    "function submitResult(uint256 _jobId, string _resultHash) external",
    "function reportProgress(uint256 _jobId, string calldata _message) external",
    "function getJob(uint256 _jobId) view returns (tuple(uint256 id, address client, uint256 budget, uint256 deposit, uint8 status, address assignedProvider, string dataHash, string resultHash, uint256 createdAt, uint256 deadline, string description, uint8 requiredTier, uint256 slaDeadline))",
    "function isStaked(address _provider) view returns (bool)",
    "function getStake(address _provider) view returns (uint256)",
    "function getProviderProfile(address _provider) view returns (tuple(uint8 tier, uint256 cpuCores, uint256 gpuVRAM, uint256 ramMB, bool isRegistered, uint256 registeredAt))",
    "function jobCounter() view returns (uint256)",
    "function minimumStake() view returns (uint256)",
    "function getMarketStats() view returns (uint256, uint256, uint256, uint256)"
];

const REPUTATION_ABI = [
    "function getProviderStats(address _provider) view returns (uint256 score, uint256 successful, uint256 failed, uint256 total, uint256 streak, uint8 tier)",
    "function getScore(address _provider) view returns (uint256)",
    "function getProviderTier(address _provider) view returns (uint8)"
];

// ─────────────────────────────────────────────────────────
//  Hardware Benchmark (Simulated)
// ─────────────────────────────────────────────────────────

const HARDWARE_PROFILES = {
    CPU_STANDARD: {
        tier: 0,
        cpuCores: 8,
        gpuVRAM: 0,
        ramMB: 16384,
        diskIOPS: 50000,
        networkBandwidthMbps: 1000,
        costPerHourETH: 0.001,
        label: "CPU Standard — 8-core Xeon, 16 GB DDR4"
    },
    GPU_BASIC: {
        tier: 1,
        cpuCores: 16,
        gpuVRAM: 8192,
        ramMB: 32768,
        diskIOPS: 100000,
        networkBandwidthMbps: 2500,
        costPerHourETH: 0.005,
        label: "GPU Basic — RTX 4070, 16-core, 32 GB"
    },
    GPU_PRO: {
        tier: 2,
        cpuCores: 32,
        gpuVRAM: 24576,
        ramMB: 65536,
        diskIOPS: 250000,
        networkBandwidthMbps: 10000,
        costPerHourETH: 0.015,
        label: "GPU Pro — A100 40GB, 32-core, 64 GB"
    },
    HPC_CLUSTER: {
        tier: 3,
        cpuCores: 128,
        gpuVRAM: 81920,
        ramMB: 262144,
        diskIOPS: 1000000,
        networkBandwidthMbps: 100000,
        costPerHourETH: 0.05,
        label: "HPC Cluster — 4×A100, 128-core, 256 GB"
    }
};

const TIER_NAMES = ["CPU_STANDARD", "GPU_BASIC", "GPU_PRO", "HPC_CLUSTER"];
const TIER_LABELS = ["Unranked", "Bronze", "Silver", "Gold", "Platinum"];

// ─────────────────────────────────────────────────────────
//  Structured Logger
// ─────────────────────────────────────────────────────────

class Logger {
    constructor(providerName) {
        this.name = providerName;
        this.startTime = Date.now();
    }

    _ts() {
        const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
        return `[${new Date().toISOString().slice(11, 19)}][+${elapsed}s]`;
    }

    info(msg, data = null) {
        const d = data ? ` ${JSON.stringify(data)}` : "";
        console.log(`${this._ts()} [${this.name}] ℹ️  ${msg}${d}`);
    }

    success(msg, data = null) {
        const d = data ? ` ${JSON.stringify(data)}` : "";
        console.log(`${this._ts()} [${this.name}] ✅ ${msg}${d}`);
    }

    warn(msg, data = null) {
        const d = data ? ` ${JSON.stringify(data)}` : "";
        console.log(`${this._ts()} [${this.name}] ⚠️  ${msg}${d}`);
    }

    error(msg, data = null) {
        const d = data ? ` ${JSON.stringify(data)}` : "";
        console.error(`${this._ts()} [${this.name}] ❌ ${msg}${d}`);
    }

    metric(msg, data = null) {
        const d = data ? ` ${JSON.stringify(data)}` : "";
        console.log(`${this._ts()} [${this.name}] 📊 ${msg}${d}`);
    }

    heartbeat(msg) {
        console.log(`${this._ts()} [${this.name}] 💓 ${msg}`);
    }
}

// ─────────────────────────────────────────────────────────
//  Proof of Computation
// ─────────────────────────────────────────────────────────

class ProofOfComputation {
    /**
     * Generates a hash chain as a proof-of-work stub.
     * In production, this would be replaced by a proper verifiable
     * computation framework (e.g., TrueBit, zkSNARKs).
     */
    static generateHashChain(inputData, iterations = 100) {
        let current = inputData;
        const proofSteps = [];

        for (let i = 0; i < iterations; i++) {
            const hash = crypto.createHash("sha256").update(current).digest("hex");
            if (i % 25 === 0 || i === iterations - 1) {
                proofSteps.push({ step: i, hash: hash.substring(0, 16) });
            }
            current = hash;
        }

        return {
            inputHash: crypto.createHash("sha256").update(inputData).digest("hex"),
            outputHash: current,
            iterations,
            proofSteps,
            timestamp: Date.now()
        };
    }
}

// ─────────────────────────────────────────────────────────
//  Resource-Aware Bid Calculator
// ─────────────────────────────────────────────────────────

class BidCalculator {
    constructor(hardwareProfile, utilizationPercent = 40) {
        this.profile = hardwareProfile;
        this.utilization = utilizationPercent;
    }

    /**
     * Calculates an optimal bid based on resource cost modeling:
     *   bid = baseCost + utilization_adjustment - competitive_discount
     */
    calculateBid(jobBudget, estimatedHours) {
        const baseCost = this.profile.costPerHourETH * estimatedHours;
        const utilizationMultiplier = 1 + (this.utilization / 200); // Higher utilization = higher price
        const adjustedCost = baseCost * utilizationMultiplier;

        // Competitive pricing: bid between cost and 95% of budget
        const maxBid = parseFloat(ethers.formatEther(jobBudget)) * 0.95;
        const optimalBid = Math.min(adjustedCost, maxBid);
        const finalBid = Math.max(optimalBid, baseCost * 0.8); // Floor at 80% of base cost

        return {
            bidAmount: ethers.parseEther(finalBid.toFixed(6)),
            baseCost: baseCost.toFixed(6),
            adjustedCost: adjustedCost.toFixed(6),
            marginPercent: ((finalBid - baseCost) / baseCost * 100).toFixed(1)
        };
    }
}

// ─────────────────────────────────────────────────────────
//  Compute Provider Node
// ─────────────────────────────────────────────────────────

class ComputeProviderNode {
    constructor(options = {}) {
        this.accountIndex = parseInt(options.accountIndex || process.env.ACCOUNT_INDEX || "1");
        this.providerName = options.name || process.env.PROVIDER_NAME || `Provider-${this.accountIndex}`;
        this.hardwareTier = options.tier || process.env.HARDWARE_TIER || "GPU_BASIC";

        this.log = new Logger(this.providerName);
        this.hardware = HARDWARE_PROFILES[this.hardwareTier] || HARDWARE_PROFILES.GPU_BASIC;
        this.bidCalculator = new BidCalculator(this.hardware);
        this.activeJobs = new Map();
        this.completedJobs = 0;
        this.failedJobs = 0;
        this.heartbeatInterval = null;
        this.isRunning = false;
        
        // Predictable API Port based on account index (matches client/app.js registry)
        this.apiPort = 4000 + this.accountIndex;
    }

    // ─── Initialization ───

    async initialize() {
        this.log.info("═══════════════════════════════════════════════");
        this.log.info(`Initializing ${this.providerName}`);
        this.log.info("═══════════════════════════════════════════════");

        try {
            // Connect to blockchain
            const networkUrl = process.env.NETWORK_URL || CONFIG.NETWORK_URL;
            this.provider = new ethers.JsonRpcProvider(networkUrl);
            const accounts = await this.provider.listAccounts();

            if (this.accountIndex >= accounts.length) {
                this.log.error(`Account index ${this.accountIndex} out of range (${accounts.length} accounts)`);
                return;
            }

            this.wallet = await this.provider.getSigner(this.accountIndex);
            this.address = await this.wallet.getAddress();
            this.log.info(`Wallet: ${this.address}`);

            // Initialize contracts
            this.jobMarket = new ethers.Contract(CONFIG.CONTRACTS.JobMarket, JOB_MARKET_ABI, this.wallet);
            this.reputation = new ethers.Contract(CONFIG.CONTRACTS.Reputation, REPUTATION_ABI, this.wallet);

            // Run hardware benchmark
            this.runBenchmark();

            // Ensure staked
            await this.ensureStaked();

            // Subscribe to events
            this.subscribeToEvents();

            // Start heartbeat
            this.startHeartbeat();

            // Scan existing open jobs
            await this.scanOpenJobs();

            // Start HTTP API Server for manual execution triggers
            this.startApiServer();

            this.isRunning = true;
            this.log.success("Provider node fully operational ✓");

        } catch (err) {
            this.log.error("Initialization failed", { error: err.message });
        }
    }

    // ─── Hardware Benchmark (Simulated) ───

    runBenchmark() {
        this.log.info("Running hardware benchmark...");

        // Simulated benchmark results with slight randomization
        const jitter = () => (0.9 + Math.random() * 0.2).toFixed(2);

        this.benchmarkResults = {
            cpu: {
                cores: this.hardware.cpuCores,
                singleThreadScore: Math.floor(1200 * jitter()),
                multiThreadScore: Math.floor(1200 * this.hardware.cpuCores * 0.85 * jitter()),
            },
            gpu: this.hardware.gpuVRAM > 0 ? {
                vramMB: this.hardware.gpuVRAM,
                computeUnits: Math.floor(this.hardware.gpuVRAM / 128),
                fp32TFLOPS: (this.hardware.gpuVRAM / 1000 * 3.2 * jitter()).toFixed(1),
            } : null,
            memory: {
                totalMB: this.hardware.ramMB,
                bandwidthGBs: (this.hardware.ramMB / 1024 * 3.2 * jitter()).toFixed(1),
            },
            disk: {
                iops: Math.floor(this.hardware.diskIOPS * jitter()),
                sequentialReadMBs: Math.floor(this.hardware.diskIOPS / 200 * jitter()),
            },
            network: {
                bandwidthMbps: this.hardware.networkBandwidthMbps,
                latencyMs: Math.floor(2 + Math.random() * 8),
            }
        };

        this.log.metric("Benchmark results:", {
            tier: this.hardwareTier,
            cpu: `${this.benchmarkResults.cpu.cores} cores, ${this.benchmarkResults.cpu.multiThreadScore} pts`,
            gpu: this.benchmarkResults.gpu ? `${this.benchmarkResults.gpu.vramMB} MB VRAM, ${this.benchmarkResults.gpu.fp32TFLOPS} TFLOPS` : "N/A",
            ram: `${this.benchmarkResults.memory.totalMB} MB`,
            disk: `${this.benchmarkResults.disk.iops} IOPS`
        });
    }

    // ─── Staking ───

    async ensureStaked() {
        const isStaked = await this.jobMarket.isStaked(this.address);

        if (isStaked) {
            const stake = await this.jobMarket.getStake(this.address);
            this.log.info(`Already staked: ${ethers.formatEther(stake)} ETH`);
            return;
        }

        const minStake = await this.jobMarket.minimumStake();
        const stakeAmount = minStake * 2n; // Stake 2x minimum for higher reputation weight

        this.log.info(`Staking ${ethers.formatEther(stakeAmount)} ETH with tier ${this.hardwareTier}...`);

        try {
            const tx = await this.jobMarket.stakeAsProvider(
                this.hardware.tier,
                this.hardware.cpuCores,
                this.hardware.gpuVRAM,
                this.hardware.ramMB,
                { value: stakeAmount }
            );
            await tx.wait();
            this.log.success(`Staked successfully as ${this.hardware.label}`);
        } catch (err) {
            this.log.error("Staking failed", { error: err.message });
        }
    }

    // ─── Event Subscriptions ───

    subscribeToEvents() {
        this.log.info("Subscribing to marketplace events...");

        // New job posted
        this.jobMarket.on("JobPosted", async (jobId, client, budget, dataHash, description, deadline, requiredTier) => {
            this.log.info(`📋 New job #${jobId}: "${description.substring(0, 60)}..."`, {
                budget: ethers.formatEther(budget) + " ETH",
                requiredTier: TIER_NAMES[Number(requiredTier)] || "Unknown",
                deadline: new Date(Number(deadline) * 1000).toLocaleTimeString()
            });

            // Check if our tier qualifies
            if (Number(requiredTier) <= this.hardware.tier) {
                // await this.submitBid(jobId, budget, description); // Auto-bid disabled
            } else {
                this.log.warn(`Tier mismatch — job requires ${TIER_NAMES[Number(requiredTier)]}, we offer ${this.hardwareTier}`);
            }
        });

        // Job assigned to us
        this.jobMarket.on("JobAssigned", async (jobId, provider, amount, slaDeadline) => {
            if (provider.toLowerCase() === this.address.toLowerCase()) {
                this.log.success(`🎉 Assigned job #${jobId}!`, {
                    payment: ethers.formatEther(amount) + " ETH",
                    slaDeadline: new Date(Number(slaDeadline) * 1000).toLocaleTimeString()
                });
                // Auto-execute disabled. Triggered manually via API.
                // await this.executeJob(jobId);
            }
        });

        // Job completed and paid
        this.jobMarket.on("JobCompleted", (jobId, client, provider, payment, platformFee) => {
            if (provider.toLowerCase() === this.address.toLowerCase()) {
                this.completedJobs++;
                this.activeJobs.delete(Number(jobId));
                this.log.success(`💰 Payment received for job #${jobId}`, {
                    amount: ethers.formatEther(payment) + " ETH",
                    fee: ethers.formatEther(platformFee) + " ETH"
                });
            }
        });

        this.log.success("Event subscriptions active ✓");
    }

    // ─── Bidding ───

    async submitBid(jobId, budget, description) {
        try {
            // Estimate duration based on description heuristics
            const estimatedHours = this.estimateJobDuration(description);
            const estimatedSeconds = Math.floor(estimatedHours * 3600);

            // Calculate resource-aware bid
            const bidResult = this.bidCalculator.calculateBid(budget, estimatedHours);

            this.log.info(`📝 Submitting bid on job #${jobId}`, {
                bidAmount: ethers.formatEther(bidResult.bidAmount) + " ETH",
                baseCost: bidResult.baseCost + " ETH",
                margin: bidResult.marginPercent + "%",
                estimatedDuration: `${estimatedHours.toFixed(1)}h`
            });

            const tx = await this.jobMarket.submitBid(jobId, bidResult.bidAmount, estimatedSeconds);
            await tx.wait();

            this.log.success(`Bid submitted on job #${jobId}`);
        } catch (err) {
            if (err.message.includes("already bid")) {
                this.log.warn(`Already bid on job #${jobId}`);
            } else {
                this.log.error(`Bid failed for job #${jobId}`, { error: err.message });
            }
        }
    }

    estimateJobDuration(description) {
        const desc = description.toLowerCase();
        if (desc.includes("train") || desc.includes("fine-tun")) return 4.0;
        if (desc.includes("render") || desc.includes("simulat")) return 2.5;
        if (desc.includes("inference") || desc.includes("predict")) return 0.5;
        if (desc.includes("compile") || desc.includes("build")) return 1.0;
        return 1.5; // Default estimate
    }

    // ─── Job Execution ───

    async executeJob(jobId, jobMetadata = null) {
        const jobIdNum = Number(jobId);
        this.activeJobs.set(jobIdNum, { startTime: Date.now(), status: "executing" });

        try {
            const job = await this.jobMarket.getJob(jobId);
            const dataHash = job.dataHash;
            const description = jobMetadata || job.description;

            this.log.info(`⚙️  Executing job #${jobId}...`);
            this.log.info(`   Hardware: ${this.hardware.label}`);

            let resultHash = "";
            let metadata = { jobType: "GENERIC" };
            try {
                metadata = JSON.parse(description);
            } catch(e) {}

            if (metadata.jobType === "ML_PIPELINE") {
                this.log.info("   Detected ML_PIPELINE Task");
                
                const taskDir = path.join(__dirname, '..', 'tmp_tasks');
                const outDir = path.join(__dirname, '..', 'provider_results');
                if (!fs.existsSync(taskDir)) fs.mkdirSync(taskDir, { recursive: true });
                if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

                const scriptPath = path.join(taskDir, `ml_task_${jobIdNum}.py`);
                
                // Generate python script that outputs structured JSON logs line-by-line
                const pythonScript = `import time\nimport json\nimport random\nimport sys\n\ndef emit(stage, step, epoch=None, loss=None, accuracy=None, f1=None, message=""):\n    data = {"stage": stage, "step": step, "message": message}\n    if epoch is not None: data["epoch"] = epoch\n    if loss is not None: data["loss"] = loss\n    if accuracy is not None: data["accuracy"] = accuracy\n    if f1 is not None: data["f1"] = f1\n    print(json.dumps(data))\n    sys.stdout.flush()\n\nemit("preprocessing", "start", message="Cleaning data...")\ntime.sleep(1)\nemit("preprocessing", "middle", message="Handling missing values...")\ntime.sleep(1)\nemit("preprocessing", "end", message="Dataset ready")\ntime.sleep(1)\n\nloss = 1.5\nfor i in range(1, 6):\n    loss = loss * 0.8\n    emit("training", "epoch", epoch=i, loss=loss, message=f"Epoch {i} completed")\n    time.sleep(1)\n\nemit("evaluation", "start", message="Running test set evaluation...")\ntime.sleep(1)\nemit("evaluation", "end", accuracy=0.92, f1=0.89, message="Evaluation complete")\ntime.sleep(1)`;
                fs.writeFileSync(scriptPath, pythonScript);

                this.log.info("   Spawning python process...");
                let executionOutput = "";
                
                await new Promise((resolve, reject) => {
                    const process = child_process.spawn("python", [scriptPath]);
                    
                    process.stdout.on('data', async (data) => {
                        const lines = data.toString().split('\n').filter(l => l.trim() !== '');
                        for(let line of lines) {
                            executionOutput += line + "\n";
                            this.log.info(`   [Python] ${line}`);
                            try {
                                JSON.parse(line); // Ensure valid JSON
                                await globalTxQueue.add(async () => {
                                    const tx = await this.jobMarket.reportProgress(jobIdNum, line);
                                    await tx.wait();
                                    await this.sleep(500); // Rate limiting
                                });
                            } catch(e) {}
                        }
                    });

                    process.stderr.on('data', (data) => {
                        this.log.warn(`   [Python STDERR] ${data}`);
                    });

                    process.on('close', (code) => {
                        if (code === 0) resolve();
                        else reject(new Error(`Process exited with code ${code}`));
                    });
                });

                const resultPath = path.join(outDir, `job_${jobIdNum}_result.txt`);
                fs.writeFileSync(resultPath, executionOutput);

                const encodedOutput = Buffer.from(executionOutput).toString("base64");
                resultHash = `RESULT_B64:${encodedOutput}`;

            } else {
                this.log.info("   Running standard simulation task...");
                this.log.info(`   Input data: ${dataHash}`);
                await this.sleep(1000);
                const proof = ProofOfComputation.generateHashChain(dataHash, 100);
                resultHash = `QmResult_${proof.outputHash.substring(0, 32)}`;
                await this.sleep(500);
            }

            // Submit result on-chain using TxQueue
            this.log.info(`📤 Submitting result for job #${jobId}...`);
            await globalTxQueue.add(async () => {
                const tx = await this.jobMarket.submitResult(jobId, resultHash);
                await tx.wait();
            });

            this.activeJobs.set(jobIdNum, { ...this.activeJobs.get(jobIdNum), status: "completed" });
            this.log.success(`Job #${jobId} execution complete`, { resultHash: resultHash.length > 50 ? resultHash.substring(0, 50) + "..." : resultHash });

        } catch (err) {
            this.failedJobs++;
            this.activeJobs.set(jobIdNum, { ...this.activeJobs.get(jobIdNum), status: "failed" });
            this.log.error(`Job #${jobId} execution failed`, { error: err.message });
            
            // Try to report error to chain
            try {
                await globalTxQueue.add(async () => {
                    const tx = await this.jobMarket.reportProgress(jobIdNum, JSON.stringify({
                        stage: "error",
                        message: "Execution failed"
                    }));
                    await tx.wait();
                });
            } catch(e) {}
        }
    }

    // ─── Scan Existing Jobs ───

    async scanOpenJobs() {
        try {
            const jobCount = await this.jobMarket.jobCounter();
            this.log.info(`Scanning ${jobCount} existing jobs...`);

            for (let i = 1; i <= Number(jobCount); i++) {
                const job = await this.jobMarket.getJob(i);
                if (Number(job.status) === 0) { // Open
                    this.log.info(`Found open job #${i}: "${job.description.substring(0, 50)}..."`);
                    if (Number(job.requiredTier) <= this.hardware.tier) {
                        // await this.submitBid(i, job.budget, job.description); // Auto-bidding disabled
                    }
                }
            }
        } catch (err) {
            this.log.warn("Job scan skipped (no jobs yet)");
        }
    }

    // ─── Heartbeat / Liveness ───

    startHeartbeat() {
        const HEARTBEAT_INTERVAL = 30000; // 30 seconds

        this.heartbeatInterval = setInterval(async () => {
            try {
                const balance = await this.provider.getBalance(this.address);
                const stake = await this.jobMarket.getStake(this.address);
                const repScore = await this.reputation.getScore(this.address);
                const repTier = await this.reputation.getProviderTier(this.address);
                const stats = await this.jobMarket.getMarketStats();

                this.log.heartbeat(
                    `Uptime: ${this.getUptime()} | ` +
                    `Active: ${this.activeJobs.size} | ` +
                    `Done: ${this.completedJobs} | ` +
                    `Failed: ${this.failedJobs} | ` +
                    `Balance: ${parseFloat(ethers.formatEther(balance)).toFixed(3)} ETH | ` +
                    `Stake: ${ethers.formatEther(stake)} ETH | ` +
                    `Rep: ${repScore} (${TIER_LABELS[Number(repTier)]}) | ` +
                    `Network Jobs: ${stats[0]}`
                );
            } catch (err) {
                this.log.warn("Heartbeat check failed");
            }
        }, HEARTBEAT_INTERVAL);

        this.log.info(`Heartbeat started (every ${HEARTBEAT_INTERVAL / 1000}s)`);
    }

    // ─── Utilities ───

    getUptime() {
        const elapsed = Date.now() - this.log.startTime;
        const mins = Math.floor(elapsed / 60000);
        const secs = Math.floor((elapsed % 60000) / 1000);
        return `${mins}m ${secs}s`;
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ─── HTTP API Server ───
    startApiServer() {
        const setCORS = (res) => {
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
            res.setHeader('Access-Control-Max-Age', '86400');
        };

        const server = http.createServer(async (req, res) => {
            setCORS(res);

            // Handle CORS preflight
            if (req.method === 'OPTIONS') {
                res.writeHead(204);
                res.end();
                return;
            }

            // Health check
            if (req.method === 'GET' && req.url === '/health') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'ok', provider: this.providerName, port: this.apiPort }));
                return;
            }

            if (req.method === 'POST' && req.url === '/execute') {
                let body = '';
                req.on('data', chunk => { body += chunk.toString(); });
                req.on('end', async () => {
                    try {
                        const data = JSON.parse(body);
                        const jobId = data.jobId;
                        const metadata = data.jobMetadata;

                        this.log.info(`Received API request to execute job #${jobId}`);

                        // Run in background so request can return immediately
                        this.executeJob(jobId, metadata).catch(err =>
                            this.log.error(`Background execution error for job #${jobId}`, { error: err.message })
                        );

                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: true, message: `Execution started for job #${jobId}` }));
                    } catch (e) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: e.message }));
                    }
                });
            } else {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Not found' }));
            }
        });

        // Bind to all interfaces so both localhost and 127.0.0.1 resolve correctly
        server.listen(this.apiPort, '0.0.0.0', () => {
            this.log.info(`🚀 API Server listening on http://127.0.0.1:${this.apiPort}`);
        });

        server.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                this.log.error(`Port ${this.apiPort} already in use — is another provider instance running?`);
            } else {
                this.log.error(`API server error: ${err.message}`);
            }
        });
    }
    async shutdown() {
        this.log.info("Shutting down...");
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }
        this.isRunning = false;
        this.log.info("Provider node stopped.");
    }
}

// ─────────────────────────────────────────────────────────
//  Main Entry Point
// ─────────────────────────────────────────────────────────

async function main() {
    const tierMap = { "0": "CPU_STANDARD", "1": "GPU_BASIC", "2": "GPU_PRO", "3": "HPC_CLUSTER" };
    const tierArg = process.env.HARDWARE_TIER || tierMap[process.env.TIER_INDEX] || "GPU_BASIC";

    const node = new ComputeProviderNode({
        accountIndex: process.env.ACCOUNT_INDEX || "1",
        name: process.env.PROVIDER_NAME || `Provider-${process.env.ACCOUNT_INDEX || 1}`,
        tier: tierArg
    });

    await node.initialize();

    // Graceful shutdown
    process.on("SIGINT", () => node.shutdown().then(() => process.exit(0)));
    process.on("SIGTERM", () => node.shutdown().then(() => process.exit(0)));
}

main().catch(console.error);
