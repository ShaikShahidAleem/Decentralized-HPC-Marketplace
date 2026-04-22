/**
 * HPC Marketplace — Client Application
 * ======================================
 * Enhanced web interface with dispute management, provider leaderboard,
 * governance voting, and real-time network topology visualization.
 */

// ─────────────────────────────────────────────────────────
//  State
// ─────────────────────────────────────────────────────────

let provider, signer, userAddress;
let jobMarketContract, reputationContract, disputeContract, governanceContract;
let currentView = "dashboard";
window.liveJobLogs = {}; // Store live task execution logs
let currentSlideOverJobId = null;
let currentRole = "CLIENT"; // Explicit role selection

const PROVIDER_REGISTRY = {
    // Hardhat test addresses (standard list)
    "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266": 4000, // Account 1
    "0x70997970C51812dc3A010C7d01b50e0d17dc79C8": 4001, // Account 2
    "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC": 4002, // Account 3
    "0x90F79bf6EB2c4f870365E785982E1f101E93b906": 4003, // Account 4
    "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65": 4004  // Account 5
};

const STATUS_MAP = ["Open", "Assigned", "Completed", "Confirmed", "Cancelled", "Disputed"];
const STATUS_CLASS = ["status-open", "status-assigned", "status-completed", "status-confirmed", "status-cancelled", "status-disputed"];
const TIER_NAMES = ["CPU Standard", "GPU Basic", "GPU Pro", "HPC Cluster"];
const REP_TIERS = ["Unranked", "Bronze", "Silver", "Gold", "Platinum"];
const PROPOSAL_STATUS = ["Active", "Passed", "Rejected", "Executed", "Expired"];

const PYTHON_TEMPLATES = {
    "ml": `import math\nimport random\nimport time\n\nprint("Initializing HPC Node Environment...")\ntime.sleep(1)\n\nprint("[1/3] Generating 50,000 point multidimensional dataset vector...")\npoints = [(random.random() * 100, random.random() * 100) for _ in range(50000)]\ntime.sleep(2)\n\nprint("[2/3] Running clustering optimization algorithm...")\nfor epoch in range(1, 6):\n    print(f"   > Epoch {epoch}/5: Loss {0.5 / epoch:.4f}")\n    time.sleep(1)\n\nprint("[3/3] Optimization converged successfully.")\nprint()`,
    "monte_carlo": `import random\nimport time\n\nprint("Starting Monte Carlo Pi Approximation...")\ntime.sleep(1)\ntotal_points = 1000000\npoints_inside = 0\n\nprint("[1/3] Setting up probability matrix...")\ntime.sleep(1)\n\nprint(f"[2/3] Simulating {total_points} execution paths...")\nfor i in range(1, 6):\n    print(f"   > Batch {i}/5 running in parallel workers...")\n    time.sleep(1)\n\npi_estimate = 3.14159\nprint(f"\\n[3/3] Aggregating results...")\nprint("Final computed result: ", pi_estimate)`,
    "genomics": `import time\n\nprint("Genomic Sequence Alignment Task Started")\ntime.sleep(1)\n\nreference = "ATCG" * 10000\ntarget = "ATGC" * 5\n\nprint("[1/3] Loading genomic database into memory...")\ntime.sleep(2)\n\nprint("[2/3] Applying heuristic alignment algorithm...")\nfor i in range(1, 4):\n    print(f"   > Scanning segment {i}/3...")\n    time.sleep(1)\n\nprint("\\n[3/3] Alignment match found at offset 41022 with 98% confidence.")\n`
};

function selectJobTemplate() {
    const sel = document.getElementById("job-template-select");
    const codeBox = document.getElementById("job-python-code");
    if (sel && codeBox && PYTHON_TEMPLATES[sel.value]) {
        codeBox.value = PYTHON_TEMPLATES[sel.value];
    }
}

// ─────────────────────────────────────────────────────────
//  Initialization
// ─────────────────────────────────────────────────────────

function toggleConnectMenu() {
    const menu = document.getElementById('connect-menu');
    menu.style.display = menu.style.display === 'none' ? 'flex' : 'none';
}

async function initWeb3(method = 'metamask') {
    document.getElementById('connect-menu').style.display = 'none';

    try {
        if (method === 'metamask') {
            if (typeof window.ethereum === "undefined") {
                systemLog("MetaMask not detected — install MetaMask to interact", "error");
                return;
            }
            await window.ethereum.request({ method: "eth_requestAccounts" });
            provider = new ethers.BrowserProvider(window.ethereum);
            signer = await provider.getSigner();
        } else if (method === 'local') {
            const rpcInput = document.getElementById('custom-rpc-url');
            const rpcUrl = rpcInput ? rpcInput.value : "http://127.0.0.1:8545";
            let accountIndex = 0;
            if (arguments.length > 1) {
                accountIndex = arguments[1];
            }
            systemLog(`Connecting to node at ${rpcUrl} with test account ${accountIndex + 1}...`, "info");
            
            const HARDHAT_KEYS = [
                "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
                "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
                "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
                "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
                "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a"
            ];
            const PRIVATE_KEY = HARDHAT_KEYS[accountIndex] || HARDHAT_KEYS[0];
            provider = new ethers.JsonRpcProvider(rpcUrl);
            signer = new ethers.Wallet(PRIVATE_KEY, provider);
        }

        userAddress = await signer.getAddress();

        // Initialize contracts
        jobMarketContract = new ethers.Contract(CONFIG.CONTRACTS.JobMarket, JOB_MARKET_ABI, signer);
        reputationContract = new ethers.Contract(CONFIG.CONTRACTS.Reputation, REPUTATION_ABI, signer);

        if (CONFIG.CONTRACTS.DisputeResolution) {
            disputeContract = new ethers.Contract(CONFIG.CONTRACTS.DisputeResolution, DISPUTE_ABI, signer);
        }
        if (CONFIG.CONTRACTS.GovernanceToken) {
            governanceContract = new ethers.Contract(CONFIG.CONTRACTS.GovernanceToken, GOVERNANCE_ABI, signer);
        }

        // Update header
        const addrShort = `${userAddress.slice(0, 6)}...${userAddress.slice(-4)}`;
        document.getElementById("wallet-address").textContent = addrShort;
        // Hide entire dropdown container instead of just the button
        document.querySelector(".connect-dropdown").style.display = "none";
        document.getElementById("wallet-info").style.display = "flex";

        const balance = await provider.getBalance(userAddress);
        document.getElementById("wallet-balance").textContent = parseFloat(ethers.formatEther(balance)).toFixed(4) + " ETH";

        // Auto-assign role based on wallet index if using local simulation
        if (method === 'local') {
            const index = arguments.length > 1 ? arguments[1] : 0;
            if (index === 2 || index === 4) {
                currentRole = 'PROVIDER';
            } else {
                currentRole = 'CLIENT';
            }
        } else {
            currentRole = 'CLIENT'; // Default for metamask
        }

        systemLog(`Connected: ${addrShort} as ${currentRole}`, "success");
        await refreshData();

        // Subscribe to real-time events
        subscribeToEvents();
    } catch (err) {
        systemLog("Connection failed: " + err.message, "error");
    }
}

function toggleProfileMenu() {
    const menu = document.getElementById('profile-menu');
    menu.style.display = menu.style.display === 'none' ? 'flex' : 'none';
}

function signOut() {
    document.getElementById('profile-menu').style.display = 'none';
    document.getElementById("wallet-info").style.display = "none";
    document.querySelector(".connect-dropdown").style.display = "inline-block";
    provider = null;
    signer = null;
    userAddress = null;
    jobMarketContract = null;
    systemLog("Signed out successfully", "info");
    document.getElementById("view-title").textContent = "Signed Out";
}

function blockchainLog(contract, func, event) {
    const panel = document.getElementById("blockchain-insight-output");
    if (!panel || !event) return;
    
    let txHash = event.transactionHash || (event.log && event.log.transactionHash) || "0x00...00";
    let blockNumber = event.blockNumber || (event.log && event.log.blockNumber) || "Pending";
    
    const time = new Date().toLocaleTimeString();
    const entry = document.createElement("div");
    entry.className = `log-entry`;
    entry.innerHTML = `<span class="log-time">[${time}]</span> <span class="mono" style="color:var(--primary)">${contract}</span>.<span class="mono" style="color:var(--info)">${func}</span> <span class="mono" style="color:var(--text-muted); font-size:10px;" title="${txHash}">${txHash.slice(0,10)}...</span> <span style="color:var(--success); font-size:10px;">Blk:${blockNumber}</span>`;
    panel.appendChild(entry);
    panel.scrollTop = panel.scrollHeight;
}

function showActivityLog() {
    hideAllViews();
    document.getElementById('view-activity').style.display = 'block';
    renderActivityLog();
}

let activityLogs = [];

function renderActivityLog() {
    const container = document.getElementById('activity-log-container');
    container.innerHTML = '';
    activityLogs.slice().reverse().forEach(entry => {
        container.innerHTML += generateLogHtml(entry.stage, new Date(entry.time));
    });
}

function subscribeToEvents() {
    if (!jobMarketContract) return;

    jobMarketContract.on("JobPosted", (jobId, client, budget, dataHash, description, deadline, requiredTier, event) => {
        // Fallback for different parameter counts based on ABI matches
        let ev = arguments[arguments.length - 1];
        blockchainLog("JobMarket", "postJob", ev);
        const stage = JSON.stringify({ type: "action", title: "Job Posted", badge: "Job", steps: [
            `Job #${jobId}`,
            `Budget: ${ethers.formatEther(budget)} ETH`
        ]});
        activityLogs.push({ stage, time: Date.now() });
        systemLog(`New job #${jobId} posted...`, "info");
        refreshData();
    });

    jobMarketContract.on("BidSubmitted", (jobId, provider, amount, estimatedDuration, event) => {
        let ev = arguments[arguments.length - 1];
        blockchainLog("JobMarket", "submitBid", ev);
        const stage = JSON.stringify({ type: "action", title: "Bid Submitted", badge: "Bid", steps: [
            `Job #${jobId}`,
            `Provider: ${provider.slice(0,8)}...`,
            `Amount: ${ethers.formatEther(amount)} ETH`
        ]});
        activityLogs.push({ stage, time: Date.now() });
        systemLog(`New bid on Job #${jobId} from ${provider.slice(0,8)}...`, "info");
        refreshData();
        if (currentSlideOverJobId === Number(jobId)) {
            showJobDetail(Number(jobId)); // Refresh panel to show the new bid
        }
    });

    jobMarketContract.on("JobAssigned", (jobId, provider, amount, slaDeadline, event) => {
        let ev = arguments[arguments.length - 1];
        blockchainLog("JobMarket", "acceptBid", ev);
        const stage = JSON.stringify({ type: "action", title: "Job Assigned", badge: "Job", steps: [
            `Job #${jobId}`,
            `Provider: ${provider.slice(0,8)}...`,
            `Amount: ${ethers.formatEther(amount)} ETH`
        ]});
        activityLogs.push({ stage, time: Date.now() });
        systemLog(`Job #${jobId} assigned to ${provider.slice(0,8)}...`, "info");
        refreshData();
    });

    jobMarketContract.on("JobCompleted", (jobId, client, provider, payment, platformFee, event) => {
        let ev = arguments[arguments.length - 1];
        blockchainLog("JobMarket", "confirmCompletion", ev);
        systemLog(`Job #${jobId} completed — ${ethers.formatEther(payment)} ETH paid`, "success");
        refreshData();
    });

    jobMarketContract.on("DisputeRaisedForJob", (jobId, client, disputeId, event) => {
        let ev = arguments[arguments.length - 1];
        blockchainLog("JobMarket", "raiseDispute", ev);
        systemLog(`⚠️ Dispute #${disputeId} raised for job #${jobId}`, "warning");
        refreshData();
    });

    jobMarketContract.on("ResultSubmitted", (jobId, provider, resultHash, event) => {
        let ev = arguments[arguments.length - 1];
        blockchainLog("JobMarket", "submitResult", ev);
        const stage = JSON.stringify({ type: "action", title: "Result Submitted", badge: "Result", steps: [
            `Job #${jobId}`,
            `Provider: ${provider.slice(0,8)}...`
        ]});
        activityLogs.push({ stage, time: Date.now() });
        systemLog(`Result submitted for Job #${jobId}`, "info");
        refreshData();
    });

    jobMarketContract.on("JobProgress", (jobId, stage, event) => {
        let ev = arguments[arguments.length - 1];
        blockchainLog("JobMarket", "reportProgress", ev);
        activityLogs.push({ stage, time: Date.now() });
        const id = Number(jobId);
        if (!window.liveJobLogs[id]) window.liveJobLogs[id] = [];
        window.liveJobLogs[id].push({ stage: stage, time: new Date() });
        
        if (currentSlideOverJobId === id) {
            // Re-render the job detail panel to update progress bar and metrics
            showJobDetail(id);
        }
        systemLog(`Job #${id} progress update received`, "info");
    });
}

function generateLogHtml(stageStr, time) {
    try {
        const data = JSON.parse(stageStr);
        if (data.type === 'chat') {
            return `
            <div class="agent-chat-message">
                <p>${escapeHtml(data.text).replace(/\n/g, '<br>')}</p>
            </div>`;
        } else if (data.type === 'action') {
            return `
            <details class="agent-action" open>
                <summary>
                    <span class="action-title">${escapeHtml(data.title)} <span style="font-size:10px; color:var(--text-muted); font-weight:normal; font-family:var(--mono);">(${time.toLocaleTimeString()})</span></span>
                    <span class="action-badge">${escapeHtml(data.badge || "System")}</span>
                </summary>
                <div class="action-steps">
                    ${(data.steps || []).map(step => `<div class="action-step"><span class="step-icon">&gt;_</span> <span class="mono">${escapeHtml(step)}</span></div>`).join('')}
                    <div class="action-step done"><span class="step-icon">✓</span> <span class="mono">Completed</span></div>
                </div>
            </details>`;
        }
    } catch (e) {
        // Fallback for simple strings
    }
    return `
        <div class="timeline-step">\n            <div class="timeline-icon">✓</div>\n            <div class="timeline-content">\n                <span class="timeline-time">${time.toLocaleTimeString()}</span>\n                <span class="timeline-text">${escapeHtml(stageStr)}</span>\n            </div>\n        </div>`;
}

// ─────────────────────────────────────────────────────────
//  Data Refresh
// ─────────────────────────────────────────────────────────

async function refreshData() {
    if (!jobMarketContract) return;

    try {
        // Load dashboard metrics
        await loadDashboardMetrics();

        // Load view-specific data
        switch (currentView) {
            case "dashboard": await loadDashboardJobs(); break;
            case "jobs": await loadMyJobs(); break;
            case "nodes": await loadNodesView(); break;
            case "disputes": await loadDisputesView(); break;
            case "governance": await loadGovernanceView(); break;
        }
    } catch (err) {
        systemLog("Data refresh error: " + err.message, "error");
    }
}

// ─────────────────────────────────────────────────────────
//  Dashboard
// ─────────────────────────────────────────────────────────

async function loadDashboardMetrics() {
    try {
        const stats = await jobMarketContract.getMarketStats();
        const totalJobs = Number(stats[0]);
        const completedJobs = Number(stats[1]);
        const activeProviders = Number(stats[2]);
        const totalVolume = ethers.formatEther(stats[3]);

        setMetric("metric-total-jobs", totalJobs);
        setMetric("metric-completed", completedJobs);
        setMetric("metric-providers", activeProviders);
        setMetric("metric-volume", parseFloat(totalVolume).toFixed(2) + " ETH");

        // Calculate open jobs
        const openJobs = await jobMarketContract.getOpenJobs();
        setMetric("metric-open", openJobs.length);
    } catch (err) {
        // Metrics not critical
    }
}

function setMetric(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

async function loadDashboardJobs() {
    try {
        const openJobs = await jobMarketContract.getOpenJobs();
        renderJobTable("dashboard-table-body", openJobs);
    } catch (err) {
        systemLog("Failed to load jobs: " + err.message, "error");
    }
}

// ─────────────────────────────────────────────────────────
//  Job Table Rendering
// ─────────────────────────────────────────────────────────

function renderJobTable(tbodyId, jobs) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;

    if (jobs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-secondary);padding:2rem;">No jobs found</td></tr>`;
        return;
    }

    tbody.innerHTML = jobs.map(job => {
        const status = Number(job.status);
        const tier = Number(job.requiredTier);
        const budget = parseFloat(ethers.formatEther(job.budget)).toFixed(4);
        const deadline = new Date(Number(job.deadline) * 1000).toLocaleString();

        return `
            <tr class="data-row" onclick="showJobDetail(${Number(job.id)})">
                <td><span class="job-id">#${Number(job.id)}</span></td>
                <td><span class="description-cell">${escapeHtml(job.description).substring(0, 50)}${job.description.length > 50 ? '...' : ''}</span></td>
                <td><span class="tier-badge tier-${tier}">${TIER_NAMES[tier]}</span></td>
                <td><strong>${budget}</strong> ETH</td>
                <td><span class="status-badge ${STATUS_CLASS[status]}">${STATUS_MAP[status]}</span></td>
                <td>${deadline}</td>
            </tr>
        `;
    }).join("");
}

// ─────────────────────────────────────────────────────────
//  Job Detail Panel
// ─────────────────────────────────────────────────────────

async function showJobDetail(jobId) {
    try {
        const job = await jobMarketContract.getJob(jobId);
        const bids = await jobMarketContract.getJobBids(jobId);
        const status = Number(job.status);
        const tier = Number(job.requiredTier);
        const isClient = job.client.toLowerCase() === userAddress.toLowerCase();
        
        currentSlideOverJobId = Number(jobId);

        let isMLPipeline = false;
        let jobMeta = { jobType: "GENERIC" };
        let displayDesc = job.description;
        try {
            jobMeta = JSON.parse(job.description);
            if (jobMeta.jobType === "ML_PIPELINE") {
                isMLPipeline = true;
                displayDesc = jobMeta.text || "ML Training Task";
            }
        } catch(e) {}

        let detailHTML = `
            <div class="detail-header">
                <h3>Job #${Number(job.id)}</h3>
                <span class="status-badge ${STATUS_CLASS[status]}">${STATUS_MAP[status]}</span>
            </div>

            <div class="detail-grid">
                <div class="detail-item">
                    <label>Client</label>
                    <span class="mono">${job.client.slice(0, 10)}...${job.client.slice(-6)}</span>
                </div>
                <div class="detail-item">
                    <label>Budget</label>
                    <span>${ethers.formatEther(job.budget)} ETH</span>
                </div>
                <div class="detail-item">
                    <label>Compute Tier</label>
                    <span class="tier-badge tier-${tier}">${TIER_NAMES[tier]}</span>
                </div>
                <div class="detail-item">
                    <label>Data Hash</label>
                    <span class="mono">${job.dataHash || 'N/A'}</span>
                </div>
                <div class="detail-item">
                    <label>Created</label>
                    <span>${new Date(Number(job.createdAt) * 1000).toLocaleString()}</span>
                </div>
                <div class="detail-item">
                    <label>Deadline</label>
                    <span>${new Date(Number(job.deadline) * 1000).toLocaleString()}</span>
                </div>
                ${job.assignedProvider !== ethers.ZeroAddress ? `
                <div class="detail-item">
                    <label>Assigned Provider</label>
                    <span class="mono">${job.assignedProvider.slice(0, 10)}...${job.assignedProvider.slice(-6)}</span>
                </div>` : ''}
                ${job.resultHash ? `
                <div class="detail-item">
                    <label>Result Hash</label>
                    <span class="mono">${job.resultHash}</span>
                </div>` : ''}
                ${Number(job.slaDeadline) > 0 ? `
                <div class="detail-item">
                    <label>SLA Deadline</label>
                    <span>${new Date(Number(job.slaDeadline) * 1000).toLocaleString()}</span>
                </div>` : ''}
            </div>

            <div class="detail-description">
                <label>Description</label>
                <p>${escapeHtml(displayDesc)}</p>
            </div>
        `;

        if (isMLPipeline) {
            let pStage = "pending";
            let epoch = 0;
            let loss = "N/A";
            let acc = "N/A";
            let f1 = "N/A";
            const logs = window.liveJobLogs[Number(jobId)] || [];
            logs.forEach(log => {
                try {
                    const lData = JSON.parse(log.stage);
                    if (lData.stage === "preprocessing") pStage = "preprocessing";
                    if (lData.stage === "training") {
                        pStage = "training";
                        if (lData.epoch) epoch = lData.epoch;
                        if (lData.loss) loss = lData.loss.toFixed(4);
                    }
                    if (lData.stage === "evaluation") {
                        pStage = "evaluation";
                        if (lData.accuracy) acc = lData.accuracy;
                        if (lData.f1) f1 = lData.f1;
                    }
                } catch(e) {}
            });
            if (status === 2 || status === 3) pStage = "completed";

            const isPre = pStage === "preprocessing" || pStage === "training" || pStage === "evaluation" || pStage === "completed";
            const isTrain = pStage === "training" || pStage === "evaluation" || pStage === "completed";
            const isEval = pStage === "evaluation" || pStage === "completed";

            let progWidth = "0%";
            if (pStage === "preprocessing") progWidth = "15%";
            else if (pStage === "training") progWidth = "50%";
            else if (pStage === "evaluation") progWidth = "85%";
            else if (pStage === "completed") progWidth = "100%";

            detailHTML += `
            <div class="detail-section" style="margin-top: 1rem;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <label style="margin: 0;">ML Training Pipeline</label>
                    <span style="font-size: 11px; color: var(--primary); font-weight: bold;">${progWidth}</span>
                </div>
                <div style="width: 100%; height: 6px; background: var(--border-light); border-radius: 3px; overflow: hidden; margin-bottom: 16px; box-shadow: inset 0 1px 3px rgba(0,0,0,0.2);">
                    <div style="height: 100%; background: linear-gradient(90deg, var(--primary), var(--info)); transition: width 0.5s ease; width: ${progWidth}; border-radius: 3px; box-shadow: 0 0 10px rgba(59, 130, 246, 0.5);"></div>
                </div>
                <div class="pipeline-container">
                    <div class="pipeline-stage ${isPre ? 'completed' : 'active'}">
                        <div class="stage-icon">1</div>
                        <span class="stage-label">Preprocessing</span>
                    </div>
                    <div class="pipeline-stage ${isTrain ? 'completed' : (pStage==='preprocessing'?'active':'')}">
                        <div class="stage-icon">2</div>
                        <span class="stage-label">Training</span>
                    </div>
                    <div class="pipeline-stage ${isEval ? 'completed' : (pStage==='training'?'active':'')}">
                        <div class="stage-icon">3</div>
                        <span class="stage-label">Evaluation</span>
                    </div>
                </div>
                <div class="metrics-panel">
                    <div class="metric-box">
                        <span class="metric-box-label">Epoch</span>
                        <span class="metric-box-value">${epoch}</span>
                    </div>
                    <div class="metric-box">
                        <span class="metric-box-label">Loss</span>
                        <span class="metric-box-value">${loss}</span>
                    </div>
                    <div class="metric-box">
                        <span class="metric-box-label">Accuracy</span>
                        <span class="metric-box-value">${acc}</span>
                    </div>
                    <div class="metric-box">
                        <span class="metric-box-label">F1 Score</span>
                        <span class="metric-box-value">${f1}</span>
                    </div>
                </div>
            </div>`;
        }

        if (status === 1) { // Assigned (Executing)
            detailHTML += `
            <div class="detail-section" style="margin-top: 1rem;">
                <label style="display:flex; align-items:center; gap:8px;">Agent Execution Trace <span class="status-dot online"></span></label>
                <div class="agent-timeline" id="live-logs-${Number(job.id)}">
                    ${(window.liveJobLogs[Number(job.id)] || []).map(log => {
                        return `
                            <div class="timeline-step">\n                                <div class="timeline-icon">✓</div>\n                                <div class="timeline-content">\n                                    <span class="timeline-time">${log.time.toLocaleTimeString()}</span>\n                                    <span class="timeline-text">${escapeHtml(typeof log.stage === 'string' && log.stage.startsWith('{') ? JSON.parse(log.stage).message || log.stage : log.stage)}</span>\n                                </div>\n                            </div>`;
                    }).join("")}
                    <div class="timeline-step in-progress" id="timeline-loading-${Number(job.id)}">
                        <div class="timeline-icon spinner"></div>
                        <div class="timeline-content">
                            <span class="timeline-text">Awaiting provider logs...</span>
                        </div>
                    </div>
                </div>
            </div>
            `;
        }

        if (job.resultHash && job.resultHash.startsWith("RESULT_B64:")) {
            try {
                const b64Data = job.resultHash.replace("RESULT_B64:", "");
                const decodedOutput = atob(b64Data);
                detailHTML += `
                <div class="detail-section" style="margin-top: 1rem;">
                    <label>Task Execution Output (STDOUT)</label>
                    <div style="background:#000; color:#0f0; padding:12px; border-radius:var(--radius-sm); font-family:var(--mono); font-size:12px; white-space:pre-wrap; border-left:3px solid var(--primary); max-height:200px; overflow-y:auto;">${escapeHtml(decodedOutput)}</div>
                </div>`;
            } catch(e) {
                console.error("Decode err", e);
            }
        }

        // Bids section
        if (bids.length > 0) {
            detailHTML += `
                <div class="detail-section">
                    <h4>Bids (${bids.length})</h4>
                    <div class="bids-list">
                        ${bids.map((bid, i) => `
                            <div class="bid-card ${bid.accepted ? 'bid-accepted' : ''}">
                                <div class="bid-info">
                                    <span class="mono">${bid.provider.slice(0, 10)}...${bid.provider.slice(-4)}</span>
                                    <strong>${ethers.formatEther(bid.amount)} ETH</strong>
                                    <span>Est: ${Math.floor(Number(bid.estimatedDuration) / 60)} min</span>
                                    ${bid.accepted ? '<span class="accepted-tag">✓ Accepted</span>' : ''}
                                </div>
                                ${currentRole === "CLIENT" && isClient && status === 0 && !bid.accepted ? `
                                <button class="btn-sm btn-primary" onclick="acceptBid(${jobId}, '${bid.provider}')">Accept Bid</button>
                                ` : ''}
                            </div>
                        `).join("")}
                    </div>
                </div>
            `;
        }

        const hasBid = bids.some(b => b.provider.toLowerCase() === (userAddress || "").toLowerCase());

        if (currentRole === "PROVIDER" && status === 0) {
            if (!hasBid) {
                detailHTML += `
                <div class="detail-section" style="margin-top: 1rem;" id="manual-bid-section">
                    <h4>Submit Manual Bid</h4>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Price (ETH)</label>
                            <input type="number" id="manual-bid-price" step="0.001" min="0.001" value="${ethers.formatEther(job.budget)}">
                        </div>
                        <div class="form-group">
                            <label>Est. Duration (hrs)</label>
                            <input type="number" id="manual-bid-duration" step="0.1" min="0.1" value="1.0">
                        </div>
                    </div>
                    <button class="btn btn-primary btn-full" onclick="submitManualBid(${jobId})">Submit Bid</button>
                </div>
                `;
            } else {
                detailHTML += `
                <div class="detail-section" style="margin-top: 1rem; text-align: center; color: var(--success); font-weight: 500; background: rgba(34, 197, 94, 0.1); border-radius: var(--radius-sm); padding: 1rem; border: 1px solid rgba(34, 197, 94, 0.3);">
                    ✅ Your bid has been successfully submitted and is awaiting client review.
                </div>
                `;
            }
        }

        if (currentRole === "PROVIDER" && status === 1 && job.assignedProvider.toLowerCase() === userAddress.toLowerCase()) {
            detailHTML += `<div class="detail-actions" style="margin-top:1rem;" id="execution-action-section">
                <button class="btn btn-success btn-full" onclick="startProviderExecution(${jobId}, decodeURIComponent('${encodeURIComponent(job.description)}'))">🚀 Start Execution</button>
            </div>`;
        }

        let trustHTML = '';
        if (status === 0) {
            trustHTML = `<span style="color:var(--info);">Escrow Locked:</span> <strong>${ethers.formatEther(job.budget)} ETH</strong> locked in <code>JobMarket.sol</code>. Funds are secured on-chain and await a signed provider bid.`;
        } else if (status === 1) {
            trustHTML = `<span style="color:var(--success);">Execution Enforced:</span> Provider <strong>${job.assignedProvider.slice(0,8)}</strong> has staked ETH. Execution logs are actively being cryptographically hashed and committed to the chain via <code>reportProgress()</code>.`;
        } else if (status === 2) {
            trustHTML = `<span style="color:var(--primary);">Awaiting Settlement:</span> Proof of Computation (<code>${(job.resultHash || "").slice(0,15)}...</code>) is verified on-chain. Client can invoke <code>confirmCompletion()</code> to release the escrow, or raise a dispute to freeze funds.`;
        } else if (status === 3) {
            trustHTML = `<span style="color:var(--success);">Settlement Executed:</span> Escrow successfully released to the Provider via smart contract. Immutable reputation points have been minted on-chain to both parties.`;
        } else if (status === 5) {
            trustHTML = `<span style="color:var(--danger);">Arbitration Triggered:</span> Funds are completely frozen in <code>JobMarket.sol</code>. The decentralized arbitration module will review immutable execution logs to rule on the outcome.`;
        }

        if (trustHTML) {
            detailHTML += `
            <div class="detail-section" style="margin-top: 1.5rem; background: rgba(0, 0, 0, 0.2); border: 1px solid var(--border-light); border-left: 3px solid var(--primary); padding: 1rem; border-radius: var(--radius-sm);">
                <h4 style="margin-top:0; margin-bottom: 8px; display:flex; align-items:center; gap:8px;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
                    Blockchain Trust Layer
                </h4>
                <div style="font-size:12px; color:var(--text-secondary); line-height: 1.5;">
                    ${trustHTML}
                </div>
            </div>`;
        }

        // Action buttons
        let actions = '';
        if (currentRole === "CLIENT" && isClient) {
            if (status === 0) {
                actions += `<button class="btn btn-danger" onclick="cancelJob(${jobId})">Cancel Job</button>`;
            }
            if (status === 2) {
                actions += `<button class="btn btn-primary" onclick="confirmCompletion(${jobId})">Confirm & Pay</button>`;
                actions += `<button class="btn btn-warning" onclick="raiseDispute(${jobId})">Raise Dispute</button>`;
            }
            if (status === 1) {
                actions += `<button class="btn btn-warning" onclick="raiseDispute(${jobId})">Raise Dispute</button>`;
            }
        }

        if (actions) {
            detailHTML += `<div class="detail-actions">${actions}</div>`;
        }

        document.getElementById("detail-content").innerHTML = detailHTML;
        document.getElementById("slide-over").classList.add("open");
    } catch (err) {
        systemLog("Failed to load job detail: " + err.message, "error");
    }
}

function closeSlideOver() {
    document.getElementById("slide-over").classList.remove("open");
}

// ─────────────────────────────────────────────────────────
//  Job Actions
// ─────────────────────────────────────────────────────────

async function postJob(event) {
    event.preventDefault();

    if (!jobMarketContract) {
        systemLog("Please connect your wallet first", "error");
        return;
    }

    let description = document.getElementById("job-description").value;
    let dataHash = document.getElementById("job-data-hash").value || "QmDefault";
    
    const isPythonTask = document.getElementById("is-python-task")?.checked;
    if (isPythonTask) {
        const sel = document.getElementById("job-template-select");
        if (sel && sel.value === 'ml') {
            description = JSON.stringify({
                jobType: "ML_PIPELINE",
                stage: "training",
                model: "logistic_regression",
                dataset: "spam_classification",
                text: description
            });
        } else {
            description = "[PYTHON-TASK] " + description;
        }
        dataHash = document.getElementById("job-python-code").value;
    }

    const budget = document.getElementById("job-budget").value;
    const deadlineHours = parseInt(document.getElementById("job-deadline").value) || 24;
    const tierSelect = document.getElementById("job-tier");
    const tier = tierSelect ? parseInt(tierSelect.value) : 0;

    if (!description || !budget) {
        systemLog("Please fill in all required fields", "error");
        return;
    }

    try {
        const deadline = Math.floor(Date.now() / 1000) + (deadlineHours * 3600);
        const value = ethers.parseEther(budget);

        systemLog(`Posting job: "${description.substring(0, 40)}..." — ${budget} ETH`, "info");

        const tx = await jobMarketContract.postJob(dataHash, description, deadline, tier, { value });
        systemLog("Transaction submitted, waiting for confirmation...", "info");
        await tx.wait();

        systemLog("Job posted successfully!", "success");
        document.getElementById("create-job-form").reset();
        navigateTo("dashboard");
    } catch (err) {
        systemLog("Job posting failed: " + err.message, "error");
    }
}

async function acceptBid(jobId, providerAddress) {
    if (!jobMarketContract) {
        systemLog("Please connect your wallet first", "error");
        return;
    }
    try {
        systemLog(`Accepting bid from ${providerAddress.slice(0, 10)}... on job #${jobId}`, "info");
        const tx = await jobMarketContract.acceptBid(jobId, providerAddress);
        await tx.wait();
        systemLog("Bid accepted! Provider has been assigned.", "success");
        closeSlideOver();
        await refreshData();
    } catch (err) {
        systemLog("Accept bid failed: " + err.message, "error");
    }
}

async function confirmCompletion(jobId) {
    if (!jobMarketContract) {
        systemLog("Please connect your wallet first", "error");
        return;
    }
    try {
        systemLog(`Confirming completion for job #${jobId}...`, "info");
        const tx = await jobMarketContract.confirmCompletion(jobId);
        await tx.wait();
        systemLog("Job confirmed! Payment released to provider.", "success");
        closeSlideOver();
        await refreshData();
    } catch (err) {
        systemLog("Confirmation failed: " + err.message, "error");
    }
}

async function cancelJob(jobId) {
    if (!jobMarketContract) {
        systemLog("Please connect your wallet first", "error");
        return;
    }
    try {
        systemLog(`Cancelling job #${jobId}...`, "info");
        const tx = await jobMarketContract.cancelJob(jobId);
        await tx.wait();
        systemLog("Job cancelled. Budget refunded.", "success");
        closeSlideOver();
        await refreshData();
    } catch (err) {
        systemLog("Cancellation failed: " + err.message, "error");
    }
}

async function raiseDispute(jobId) {
    if (!jobMarketContract) {
        systemLog("Please connect your wallet first", "error");
        return;
    }
    try {
        systemLog(`Raising dispute for job #${jobId}...`, "warning");
        const tx = await jobMarketContract.raiseDispute(jobId);
        await tx.wait();
        systemLog("Dispute raised! Forwarded to arbitration.", "warning");
        closeSlideOver();
        await refreshData();
    } catch (err) {
        systemLog("Dispute failed: " + err.message, "error");
    }
}

// ─────────────────────────────────────────────────────────
//  My Jobs View
// ─────────────────────────────────────────────────────────

async function loadMyJobs() {
    try {
        const totalJobs = Number(await jobMarketContract.jobCounter());
        const myJobs = [];

        for (let i = 1; i <= totalJobs; i++) {
            const job = await jobMarketContract.getJob(i);
            if (job.client.toLowerCase() === userAddress.toLowerCase() ||
                job.assignedProvider.toLowerCase() === userAddress.toLowerCase()) {
                myJobs.push(job);
            }
        }

        renderJobTable("my-jobs-table-body", myJobs);
    } catch (err) {
        systemLog("Failed to load your jobs: " + err.message, "error");
    }
}

// ─────────────────────────────────────────────────────────
//  Nodes / Leaderboard View
// ─────────────────────────────────────────────────────────

async function loadNodesView() {
    if (!reputationContract) return;

    try {
        const leaderboard = await reputationContract.getLeaderboard();
        const container = document.getElementById("leaderboard-container");
        if (!container) return;

        if (leaderboard.length === 0) {
            container.innerHTML = `<div class="empty-state">No providers ranked yet. Complete jobs to build reputation.</div>`;
            return;
        }

        // Fetch stats for all leaderboard providers
        const providerData = await Promise.all(
            leaderboard.map(async (addr) => {
                const stats = await reputationContract.getProviderStats(addr);
                const profile = await jobMarketContract.getProviderProfile(addr);
                const stake = await jobMarketContract.getStake(addr);
                return {
                    address: addr,
                    score: Number(stats[0]),
                    successful: Number(stats[1]),
                    failed: Number(stats[2]),
                    total: Number(stats[3]),
                    streak: Number(stats[4]),
                    tier: Number(stats[5]),
                    hwTier: Number(profile.tier),
                    stake: ethers.formatEther(stake)
                };
            })
        );

        // Sort by score descending
        providerData.sort((a, b) => b.score - a.score);

        container.innerHTML = `
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Rank</th>
                        <th>Provider</th>
                        <th>Rep Score</th>
                        <th>Tier</th>
                        <th>Hardware</th>
                        <th>Jobs</th>
                        <th>Success Rate</th>
                        <th>Streak</th>
                        <th>Stake</th>
                    </tr>
                </thead>
                <tbody>
                    ${providerData.map((p, i) => {
            const rate = p.total > 0 ? ((p.successful / p.total) * 100).toFixed(1) : "N/A";
            return `
                        <tr class="data-row">
                            <td><span class="rank-badge rank-${i < 3 ? i + 1 : 'default'}">${i + 1}</span></td>
                            <td class="mono">${p.address.slice(0, 8)}...${p.address.slice(-4)}</td>
                            <td><strong>${p.score}</strong></td>
                            <td><span class="rep-tier tier-rep-${p.tier}">${REP_TIERS[p.tier]}</span></td>
                            <td><span class="tier-badge tier-${p.hwTier}">${TIER_NAMES[p.hwTier]}</span></td>
                            <td>${p.successful}/${p.total}</td>
                            <td>${rate}%</td>
                            <td>${p.streak} 🔥</td>
                            <td>${parseFloat(p.stake).toFixed(3)} ETH</td>
                        </tr>`;
        }).join("")}
                </tbody>
            </table>
        `;

        // Render topology
        renderNetworkTopology(providerData);
    } catch (err) {
        systemLog("Leaderboard load failed: " + err.message, "error");
    }
}

// ─────────────────────────────────────────────────────────
//  Network Topology Visualization
// ─────────────────────────────────────────────────────────

function renderNetworkTopology(providers) {
    const canvas = document.getElementById("topology-canvas");
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = 300;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Center node (marketplace)
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

    // Draw provider nodes in a circle
    const radius = Math.min(canvas.width, canvas.height) * 0.35;
    const nodes = providers.slice(0, 12); // Max 12 nodes displayed

    // Draw connections first (behind nodes)
    ctx.strokeStyle = "rgba(37, 99, 235, 0.15)";
    ctx.lineWidth = 1;
    nodes.forEach((_, i) => {
        const angle = (2 * Math.PI * i) / nodes.length - Math.PI / 2;
        const x = cx + radius * Math.cos(angle);
        const y = cy + radius * Math.sin(angle);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(x, y);
        ctx.stroke();
    });

    // Draw center node
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, 22);
    gradient.addColorStop(0, "#3B82F6");
    gradient.addColorStop(1, "#1D4ED8");
    ctx.beginPath();
    ctx.arc(cx, cy, 22, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 10px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("HPC", cx, cy - 4);
    ctx.fillText("MKT", cx, cy + 6);

    // Draw provider nodes
    const tierColors = ["#6B7280", "#22C55E", "#3B82F6", "#F59E0B"];
    nodes.forEach((p, i) => {
        const angle = (2 * Math.PI * i) / nodes.length - Math.PI / 2;
        const x = cx + radius * Math.cos(angle);
        const y = cy + radius * Math.sin(angle);
        const r = 12 + Math.min(p.score / 30, 8);

        // Node glow
        const glow = ctx.createRadialGradient(x, y, 0, x, y, r + 8);
        glow.addColorStop(0, tierColors[p.hwTier] + "40");
        glow.addColorStop(1, "transparent");
        ctx.beginPath();
        ctx.arc(x, y, r + 8, 0, Math.PI * 2);
        ctx.fillStyle = glow;
        ctx.fill();

        // Node
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = tierColors[p.hwTier];
        ctx.fill();

        // Label
        ctx.fillStyle = "#A1A1AA";
        ctx.font = "9px Inter, sans-serif";
        ctx.fillText(p.address.slice(2, 6), x, y + r + 14);
    });
}

// ─────────────────────────────────────────────────────────
//  Disputes View
// ─────────────────────────────────────────────────────────

async function loadDisputesView() {
    if (!disputeContract) return;

    const container = document.getElementById("disputes-container");
    if (!container) return;

    try {
        const disputeCount = Number(await disputeContract.disputeCounter());

        if (disputeCount === 0) {
            container.innerHTML = `<div class="empty-state">No disputes filed yet.</div>`;
            return;
        }

        const disputes = [];
        for (let i = 1; i <= disputeCount; i++) {
            const d = await disputeContract.getDispute(i);
            disputes.push({ id: i, ...d });
        }

        const DISPUTE_STATUS = ["None", "Raised", "Evidence Period", "Under Arbitration", "Resolved (Client)", "Resolved (Provider)", "Expired"];

        container.innerHTML = `
            <div class="disputes-list">
                ${disputes.map(d => {
            const status = Number(d.status);
            const uAddr = userAddress ? userAddress.toLowerCase() : "";
            const isMyDispute = (d.client && d.client.toLowerCase() === uAddr) ||
                (d.provider && d.provider.toLowerCase() === uAddr);
            return `
                    <div class="dispute-card ${isMyDispute ? 'my-dispute' : ''}">
                        <div class="dispute-header">
                            <span class="dispute-id">Dispute #${d.id}</span>
                            <span class="dispute-status ds-${status}">${DISPUTE_STATUS[status]}</span>
                        </div>
                        <div class="dispute-body">
                            <div class="dispute-info">
                                <span>Job #${Number(d.jobId)}</span>
                                <span>Client: ${(d.client || "0x000000").slice(0, 8)}...</span>
                                <span>Provider: ${(d.provider || "0x000000").slice(0, 8)}...</span>
                                <span>Stake at risk: ${ethers.formatEther(d.stakeAtRisk || 0n)} ETH</span>
                            </div>
                            <div class="dispute-timeline">
                                <div class="timeline-item ${status >= 1 ? 'active' : ''}">Raised</div>
                                <div class="timeline-item ${status >= 2 ? 'active' : ''}">Evidence</div>
                                <div class="timeline-item ${status >= 3 ? 'active' : ''}">Arbitration</div>
                                <div class="timeline-item ${status >= 4 ? 'active' : ''}">Resolved</div>
                            </div>
                            ${status <= 2 && isMyDispute ? `
                            <div class="dispute-actions">
                                <input type="text" id="evidence-${d.id}" placeholder="Evidence IPFS hash..." class="input-field">
                                <button class="btn-sm btn-primary" onclick="submitEvidence(${d.id})">Submit Evidence</button>
                            </div>` : ''}
                            ${d.arbitratorReason ? `<div class="arbitrator-reason"><strong>Ruling:</strong> ${escapeHtml(d.arbitratorReason)}</div>` : ''}
                        </div>
                    </div>`;
        }).join("")}
            </div>
        `;
    } catch (err) {
        systemLog("Failed to load disputes: " + err.message, "error");
    }
}

async function submitEvidence(disputeId) {
    if (!disputeContract) {
        systemLog("Please connect your wallet first", "error");
        return;
    }

    const input = document.getElementById(`evidence-${disputeId}`);
    const hash = input ? input.value.trim() : "";
    if (!hash) {
        systemLog("Please enter an evidence hash", "error");
        return;
    }

    try {
        systemLog(`Submitting evidence for dispute #${disputeId}...`, "info");
        const tx = await disputeContract.submitEvidence(disputeId, hash);
        await tx.wait();
        systemLog("Evidence submitted!", "success");
        await loadDisputesView();
    } catch (err) {
        systemLog("Evidence submission failed: " + err.message, "error");
    }
}

// ─────────────────────────────────────────────────────────
//  Governance View
// ─────────────────────────────────────────────────────────

async function loadGovernanceView() {
    if (!governanceContract) return;

    const container = document.getElementById("governance-container");
    if (!container) return;

    try {
        const proposalCount = Number(await governanceContract.proposalCounter());
        const votingPower = await governanceContract.getVotingPower(userAddress);
        const tokenBalance = await governanceContract.balanceOf(userAddress);

        let govHTML = `
            <div class="gov-header">
                <div class="gov-stat">
                    <label>Your Voting Power</label>
                    <span>${parseFloat(ethers.formatEther(votingPower)).toFixed(0)} HPCGov</span>
                </div>
                <div class="gov-stat">
                    <label>Token Balance</label>
                    <span>${parseFloat(ethers.formatEther(tokenBalance)).toFixed(0)} HPCGov</span>
                </div>
                <div class="gov-stat">
                    <label>Total Proposals</label>
                    <span>${proposalCount}</span>
                </div>
            </div>
        `;

        if (proposalCount === 0) {
            govHTML += `<div class="empty-state">No governance proposals yet.</div>`;
        } else {
            const proposals = [];
            for (let i = 1; i <= proposalCount; i++) {
                const p = await governanceContract.getProposal(i);
                const voteInfo = await governanceContract.getVoteInfo(i, userAddress);
                proposals.push({ ...p, hasVoted: voteInfo[0], votedFor: voteInfo[1] });
            }

            govHTML += `<div class="proposals-list">`;
            for (const p of proposals) {
                const status = Number(p.status);
                const totalVotes = BigInt(p.forVotes) + BigInt(p.againstVotes);
                const forPct = totalVotes > 0n ? Number(BigInt(p.forVotes) * 100n / totalVotes) : 0;

                govHTML += `
                    <div class="proposal-card">
                        <div class="proposal-header">
                            <span class="proposal-id">Proposal #${Number(p.id)}</span>
                            <span class="proposal-status ps-${status}">${PROPOSAL_STATUS[status]}</span>
                        </div>
                        <h4>${escapeHtml(p.title)}</h4>
                        <p class="proposal-desc">${escapeHtml(p.description)}</p>
                        <div class="proposal-target">
                            <span>Parameter: <strong>${escapeHtml(p.parameterTarget)}</strong></span>
                            <span>Proposed Value: <strong>${Number(p.proposedValue)}</strong></span>
                        </div>
                        <div class="vote-bar">
                            <div class="vote-for" style="width:${forPct}%"></div>
                        </div>
                        <div class="vote-counts">
                            <span class="for-count">FOR: ${parseFloat(ethers.formatEther(p.forVotes)).toFixed(0)}</span>
                            <span class="against-count">AGAINST: ${parseFloat(ethers.formatEther(p.againstVotes)).toFixed(0)}</span>
                        </div>
                        ${status === 0 && !p.hasVoted ? `
                        <div class="vote-actions">
                            <button class="btn-sm btn-success" onclick="castVote(${Number(p.id)}, true)">Vote FOR</button>
                            <button class="btn-sm btn-danger" onclick="castVote(${Number(p.id)}, false)">Vote AGAINST</button>
                        </div>` : ''}
                        ${p.hasVoted ? `<div class="voted-indicator">You voted: ${p.votedFor ? '✅ FOR' : '❌ AGAINST'}</div>` : ''}
                    </div>
                `;
            }
            govHTML += `</div>`;
        }

        container.innerHTML = govHTML;
    } catch (err) {
        systemLog("Governance load failed: " + err.message, "error");
    }
}

async function castVote(proposalId, support) {
    if (!governanceContract) {
        systemLog("Please connect your wallet first", "error");
        return;
    }
    try {
        systemLog(`Casting ${support ? 'FOR' : 'AGAINST'} vote on proposal #${proposalId}...`, "info");
        const tx = await governanceContract.vote(proposalId, support);
        await tx.wait();
        systemLog("Vote cast successfully!", "success");
        await refreshData();
    } catch (err) {
        systemLog("Vote failed: " + err.message, "error");
    }
}

async function submitManualBid(jobId) {
    if (!jobMarketContract) {
        systemLog("Please connect your wallet first", "error");
        return;
    }
    const priceInput = document.getElementById("manual-bid-price").value;
    const durationInput = document.getElementById("manual-bid-duration").value;
    
    if (!priceInput || parseFloat(priceInput) <= 0) {
        systemLog("Bid price must be greater than 0", "error");
        return;
    }
    if (!durationInput || parseFloat(durationInput) <= 0) {
        systemLog("Duration must be greater than 0", "error");
        return;
    }

    try {
        const bidSection = document.getElementById("manual-bid-section");
        if (bidSection) {
            bidSection.innerHTML = `<div style="padding: 1rem; text-align: center; color: var(--info); font-weight: 500; background: rgba(59, 130, 246, 0.1); border-radius: var(--radius-sm);">⏳ Transaction Pending...</div>`;
        }

        // Auto-stake if not staked
        const isStaked = await jobMarketContract.isStaked(userAddress);
        if (!isStaked) {
            systemLog("Wallet not staked as provider. Auto-staking...", "info");
            const minStake = await jobMarketContract.minimumStake();
            // Stake as GPU_BASIC (Tier 1)
            const stakeTx = await jobMarketContract.stakeAsProvider(1, 16, 8192, 32768, { value: minStake * 2n });
            await stakeTx.wait();
            systemLog("Staked successfully!", "success");
        }

        const priceEth = ethers.parseEther(priceInput);
        const durationSecs = Math.floor(parseFloat(durationInput) * 3600);
        systemLog(`Submitting manual bid for job #${jobId} at ${priceInput} ETH...`, "info");
        const tx = await jobMarketContract.submitBid(jobId, priceEth, durationSecs);
        await tx.wait();
        systemLog("Bid submitted successfully!", "success");
        closeSlideOver();
        await refreshData();
    } catch (err) {
        systemLog("Bid submission failed: " + err.message, "error");
    }
}

async function startProviderExecution(jobId, descriptionStr) {
    const port = PROVIDER_REGISTRY[userAddress];
    if (!port) {
        systemLog(`No provider API mapping found for ${userAddress ? userAddress.slice(0,8) : 'unknown'}`, "error");
        return;
    }
    systemLog(`Triggering execution for Job #${jobId} on Provider node (port ${port})...`, "info");
    
    const logsContainer = document.getElementById(`live-logs-${jobId}`);
    if (logsContainer) {
        logsContainer.innerHTML += `
        <div class="timeline-step in-progress" id="timeline-loading-${jobId}">
            <div class="timeline-icon spinner"></div>
            <div class="timeline-content">
                <span class="timeline-text">Triggering local agent process...</span>
            </div>
        </div>`;
    }

    const execSection = document.getElementById("execution-action-section");
    if (execSection) {
        execSection.innerHTML = `<div style="padding: 1rem; text-align: center; color: var(--success); font-weight: 500; background: rgba(34, 197, 94, 0.1); border-radius: var(--radius-sm); border: 1px solid rgba(34, 197, 94, 0.3);">🚀 Execution Environment Triggered</div>`;
    }

    try {
        const response = await fetch(`http://127.0.0.1:${port}/execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jobId, jobMetadata: descriptionStr })
        });
        
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || "Unknown error");
        }
        
        systemLog(`Execution started! Provider Node is running the workflow.`, "success");
    } catch (err) {
        systemLog("Execution trigger failed: " + err.message, "error");
    }
}

// ─────────────────────────────────────────────────────────
//  Navigation
// ─────────────────────────────────────────────────────────

function navigateTo(view) {
    currentView = view;

    // Update sidebar active state
    document.querySelectorAll(".nav-item").forEach(item => {
        item.classList.toggle("active", item.dataset.view === view);
    });

    // Show/hide view panels
    document.querySelectorAll(".view-panel").forEach(panel => {
        panel.classList.toggle("active", panel.id === `view-${view}`);
    });

    // Update header title
    const titles = {
        dashboard: "Dashboard",
        create: "Create Job",
        jobs: "My Jobs",
        nodes: "Network & Leaderboard",
        disputes: "Dispute Resolution",
        governance: "Governance",
        contracts: "Smart Contracts"
    };
    const titleEl = document.getElementById("view-title");
    if (titleEl) titleEl.textContent = titles[view] || view;

    if (view === "contracts") {
        loadContractsView();
    } else {
        refreshData();
    }
}

// ─────────────────────────────────────────────────────────
//  Smart Contracts View
// ─────────────────────────────────────────────────────────

async function loadContractsView() {
    const container = document.getElementById("contracts-container");
    if (!container || !jobMarketContract) return;

    try {
        const totalJobs = Number(await jobMarketContract.jobCounter());
        const allJobs = [];
        for (let i = 1; i <= totalJobs; i++) {
            allJobs.push(await jobMarketContract.getJob(i));
        }
        
        const activeJobs = allJobs.filter(j => j.status === 1 || j.status === 2 || j.status === 5);
        const hasActiveJob = activeJobs.length > 0;
        
        let activeDisputes = [];
        if (disputeContract) {
            const totalDisputes = Number(await disputeContract.disputeCounter());
            for (let i = 1; i <= totalDisputes; i++) {
                const d = await disputeContract.getDispute(i);
                if (Number(d.status) >= 1 && Number(d.status) <= 3) {
                    activeDisputes.push(d);
                }
            }
        }
        const hasDispute = activeDisputes.length > 0;

        container.innerHTML = `
            <div class="glass-panel contract-card" onclick="openCodeModal('JobMarket.sol')" style="padding: 1.5rem; display: flex; flex-direction: column; gap: 1rem; border-left: 4px solid ${hasActiveJob ? 'var(--success)' : 'var(--border-light)'}; cursor: pointer; transition: transform 0.2s, box-shadow 0.2s;" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 8px 24px rgba(0,0,0,0.4)'" onmouseout="this.style.transform='none'; this.style.boxShadow='none'">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <div style="width: 40px; height: 40px; border-radius: 8px; background: rgba(59, 130, 246, 0.1); display: flex; align-items: center; justify-content: center; color: var(--primary);">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>
                        </div>
                        <div>
                            <h3 style="margin: 0; display: flex; align-items: center; gap: 8px;">
                                <span class="mono" style="color: var(--primary); font-size: 1.1rem;">JobMarket.sol</span>
                            </h3>
                            <span style="font-size: 11px; color: var(--text-muted);">Decentralized Compute Engine</span>
                        </div>
                    </div>
                    <span class="status-badge ${hasActiveJob ? 'status-confirmed' : 'status-open'}">${hasActiveJob ? '🟢 ACTIVE EXECUTION' : '⚪ STANDBY'}</span>
                </div>
                <p style="color: var(--text-secondary); margin: 0; font-size: 14px; line-height: 1.6;">
                    The core execution engine. Handles the escrow of ETH, manages provider staking, assigns compute jobs, and registers the final Proof of Computation hashes directly onto the blockchain.
                </p>
                <div style="display: flex; gap: 1rem; font-size: 12px; color: var(--text-muted); background: var(--bg-elevated); padding: 8px; border-radius: var(--radius-sm);">
                    <span><strong>Total Jobs:</strong> ${totalJobs}</span>
                    <span><strong>Active Jobs:</strong> ${activeJobs.length}</span>
                </div>
                ${hasActiveJob ? `<div style="background: rgba(34, 197, 94, 0.1); border: 1px solid rgba(34, 197, 94, 0.2); padding: 1rem; border-radius: var(--radius-sm); font-size: 13px; color: var(--success); line-height: 1.5;">
                    <strong style="display:flex; align-items:center; gap:6px;"><span class="status-dot online"></span> Active Escrow & Enforced Rules</strong>
                    Currently actively managing <strong>Job #${Number(activeJobs[0].id)}</strong> execution and escrow.<br>
                    <span style="color: var(--warning); margin-top: 6px; display: block;">⚠️ <strong>Dynamic Rule:</strong> SLA Deadline enforcement is strict for this job. Hardware Tier ${Number(activeJobs[0].requiredTier)} requirements are actively verified.</span>
                </div>` : ''}
            </div>

            <div class="glass-panel contract-card" onclick="openCodeModal('Reputation.sol')" style="padding: 1.5rem; display: flex; flex-direction: column; gap: 1rem; border-left: 4px solid var(--border-light); cursor: pointer; transition: transform 0.2s, box-shadow 0.2s;" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 8px 24px rgba(0,0,0,0.4)'" onmouseout="this.style.transform='none'; this.style.boxShadow='none'">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <div style="width: 40px; height: 40px; border-radius: 8px; background: rgba(168, 85, 247, 0.1); display: flex; align-items: center; justify-content: center; color: var(--purple);">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                        </div>
                        <div>
                            <h3 style="margin: 0; display: flex; align-items: center; gap: 8px;">
                                <span class="mono" style="color: var(--purple); font-size: 1.1rem;">Reputation.sol</span>
                            </h3>
                            <span style="font-size: 11px; color: var(--text-muted);">Trust & Scoring Protocol</span>
                        </div>
                    </div>
                    <span class="status-badge status-open">🔵 LISTENING</span>
                </div>
                <p style="color: var(--text-secondary); margin: 0; font-size: 14px; line-height: 1.6;">
                    Maintains the immutable trust score of providers and clients. Automatically adjusts scores based on successful job completions, SLA breaches, or arbitration outcomes.
                </p>
                <div style="display: flex; gap: 1rem; font-size: 12px; color: var(--text-muted); background: var(--bg-elevated); padding: 8px; border-radius: var(--radius-sm);">
                    <span><strong>Scoring Algorithm:</strong> Standard ELO</span>
                    <span><strong>Update Triggers:</strong> JobCompletion, DisputeResolved</span>
                </div>
            </div>

            <div class="glass-panel contract-card" onclick="openCodeModal('DisputeResolution.sol')" style="padding: 1.5rem; display: flex; flex-direction: column; gap: 1rem; border-left: 4px solid ${hasDispute ? 'var(--danger)' : 'var(--border-light)'}; cursor: pointer; transition: transform 0.2s, box-shadow 0.2s;" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 8px 24px rgba(0,0,0,0.4)'" onmouseout="this.style.transform='none'; this.style.boxShadow='none'">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <div style="width: 40px; height: 40px; border-radius: 8px; background: rgba(239, 68, 68, 0.1); display: flex; align-items: center; justify-content: center; color: var(--danger);">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                        </div>
                        <div>
                            <h3 style="margin: 0; display: flex; align-items: center; gap: 8px;">
                                <span class="mono" style="color: var(--danger); font-size: 1.1rem;">DisputeResolution.sol</span>
                            </h3>
                            <span style="font-size: 11px; color: var(--text-muted);">Arbitration & Slashing Module</span>
                        </div>
                    </div>
                    <span class="status-badge ${hasDispute ? 'status-disputed' : 'status-open'}">${hasDispute ? '🔴 ACTIVE ARBITRATION' : '⚪ STANDBY'}</span>
                </div>
                <p style="color: var(--text-secondary); margin: 0; font-size: 14px; line-height: 1.6;">
                    The decentralized arbitration layer. Freezes funds and slashes stakes if malicious activity is detected. Arbitrators vote on outcomes using the on-chain execution trace evidence.
                </p>
                <div style="display: flex; gap: 1rem; font-size: 12px; color: var(--text-muted); background: var(--bg-elevated); padding: 8px; border-radius: var(--radius-sm);">
                    <span><strong>Active Disputes:</strong> ${activeDisputes.length}</span>
                    <span><strong>Slashing Rate:</strong> Variable based on severity</span>
                </div>
                ${hasDispute ? `<div style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2); padding: 1rem; border-radius: var(--radius-sm); font-size: 13px; color: var(--danger); line-height: 1.5;">
                    <strong style="display:flex; align-items:center; gap:6px;"><span class="status-dot red"></span> Protocol Freeze Triggered & Rules Updated</strong>
                    Currently reviewing cryptographic execution traces for <strong>Job #${Number(activeDisputes[0].jobId)}</strong>.<br>
                    <span style="color: #ffb86c; margin-top: 6px; display: block;">⚠️ <strong>Dynamic Rule:</strong> Escrow payout is strictly locked until a supermajority consensus is reached by the decentralized arbiters.</span>
                </div>` : ''}
            </div>

            <div class="glass-panel contract-card" onclick="openCodeModal('GovernanceToken.sol')" style="padding: 1.5rem; display: flex; flex-direction: column; gap: 1rem; border-left: 4px solid var(--border-light); cursor: pointer; transition: transform 0.2s, box-shadow 0.2s;" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 8px 24px rgba(0,0,0,0.4)'" onmouseout="this.style.transform='none'; this.style.boxShadow='none'">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <div style="width: 40px; height: 40px; border-radius: 8px; background: rgba(16, 185, 129, 0.1); display: flex; align-items: center; justify-content: center; color: var(--green);">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 17 22 12"></polyline></svg>
                        </div>
                        <div>
                            <h3 style="margin: 0; display: flex; align-items: center; gap: 8px;">
                                <span class="mono" style="color: var(--green); font-size: 1.1rem;">GovernanceToken.sol</span>
                            </h3>
                            <span style="font-size: 11px; color: var(--text-muted);">Platform DAO Standard (ERC-20)</span>
                        </div>
                    </div>
                    <span class="status-badge status-open">⚪ STANDBY</span>
                </div>
                <p style="color: var(--text-secondary); margin: 0; font-size: 14px; line-height: 1.6;">
                    The DAO token standard (ERC-20). Grants voting rights to stakeholders to modify platform parameters such as fee percentages and minimum provider staking tiers.
                </p>
                <div style="display: flex; gap: 1rem; font-size: 12px; color: var(--text-muted); background: var(--bg-elevated); padding: 8px; border-radius: var(--radius-sm);">
                    <span><strong>Token Type:</strong> ERC-20</span>
                    <span><strong>Voting Quorum:</strong> 51%</span>
                </div>
            </div>
        `;

    } catch (err) {
        container.innerHTML = `<div class="empty-state" style="color:var(--danger)">Failed to load smart contracts state: ${err.message}</div>`;
    }
}

// ─────────────────────────────────────────────────────────
//  Smart Contract Code Modal
// ─────────────────────────────────────────────────────────

function openCodeModal(contractName) {
    const modal = document.getElementById("code-modal");
    const title = document.getElementById("code-modal-title");
    const content = document.getElementById("code-modal-content");

    if (!modal || !title || !content) return;

    title.textContent = contractName;

    if (window.CONTRACT_SOURCES && window.CONTRACT_SOURCES[contractName]) {
        content.textContent = window.CONTRACT_SOURCES[contractName];
    } else {
        content.textContent = "// Source code not found for " + contractName;
    }

    modal.style.display = "flex";
}

function closeCodeModal() {
    const modal = document.getElementById("code-modal");
    if (modal) modal.style.display = "none";
}

// ─────────────────────────────────────────────────────────
//  Smart Contract Builder
// ─────────────────────────────────────────────────────────

let _builderGeneratedContract = null; // stores last generated contract

const BUILDER_TEMPLATES = {
    timelock: "I need a time-locked escrow contract that holds ETH and only releases payment to the provider after a 48-hour delay following job completion. The client should be able to cancel within the lock period if the result is disputed.",
    multisig: "Create a multi-signature approval contract where 3 out of 5 designated arbitrators must sign off before any escrow funds are released. Each arbitrator should have a unique address and equal voting weight.",
    bounty: "I need a bounty pool contract where multiple clients can contribute ETH to a shared reward pot. The first provider to submit a valid proof-of-work result claims the entire pool. Unclaimed bounties expire after 7 days.",
    sla: "Build an SLA enforcement contract that automatically slashes 25% of a provider's staked ETH if they miss a deadline. A grace period of 2 hours should apply, and repeated violations should trigger full stake forfeiture.",
    revenue: "I want a revenue-splitting contract that automatically distributes payment: 80% to the compute provider, 15% to the platform treasury, and 5% to a community rewards pool on every confirmed job completion."
};

const CONTRACT_BLUEPRINTS = {
    timelock: {
        name: "TimeLockEscrow.sol",
        tag: "Escrow · Time-Locked",
        desc: "A trustless escrow contract that enforces a mandatory waiting period before releasing funds. Prevents instant withdrawal abuse by locking payment until the defined release window has elapsed, while preserving the client's right to dispute within that window.",
        features: ["48hr Time Lock", "Dispute Window", "Auto Release", "ETH Escrow", "Refund Guard"],
        code: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title TimeLockEscrow
/// @notice Holds ETH in escrow with a mandatory release delay.
///         Client can dispute within the lock window; after that,
///         provider can claim unconditionally.
contract TimeLockEscrow {
    uint256 public constant LOCK_DURATION = 48 hours;

    enum State { OPEN, LOCKED, RELEASED, DISPUTED, REFUNDED }

    struct Escrow {
        address payable client;
        address payable provider;
        uint256 amount;
        uint256 releaseAt;
        State   state;
    }

    uint256 public escrowCounter;
    mapping(uint256 => Escrow) public escrows;

    event EscrowCreated(uint256 id, address client, address provider, uint256 amount);
    event EscrowLocked(uint256 id, uint256 releaseAt);
    event FundsReleased(uint256 id, address provider, uint256 amount);
    event DisputeRaised(uint256 id, address client);
    event FundsRefunded(uint256 id, address client, uint256 amount);

    modifier onlyClient(uint256 id) {
        require(msg.sender == escrows[id].client, "Not client");
        _;
    }
    modifier onlyProvider(uint256 id) {
        require(msg.sender == escrows[id].provider, "Not provider");
        _;
    }
    modifier inState(uint256 id, State s) {
        require(escrows[id].state == s, "Invalid state");
        _;
    }

    /// @notice Client deposits ETH and nominates a provider.
    function createEscrow(address payable _provider)
        external payable returns (uint256 id)
    {
        require(msg.value > 0, "No ETH sent");
        id = ++escrowCounter;
        escrows[id] = Escrow({
            client:    payable(msg.sender),
            provider:  _provider,
            amount:    msg.value,
            releaseAt: 0,
            state:     State.OPEN
        });
        emit EscrowCreated(id, msg.sender, _provider, msg.value);
    }

    /// @notice Provider signals completion; starts the lock clock.
    function signalCompletion(uint256 id)
        external onlyProvider(id) inState(id, State.OPEN)
    {
        escrows[id].releaseAt = block.timestamp + LOCK_DURATION;
        escrows[id].state     = State.LOCKED;
        emit EscrowLocked(id, escrows[id].releaseAt);
    }

    /// @notice Provider claims funds after lock window expires.
    function claimFunds(uint256 id)
        external onlyProvider(id) inState(id, State.LOCKED)
    {
        Escrow storage e = escrows[id];
        require(block.timestamp >= e.releaseAt, "Lock window active");
        e.state = State.RELEASED;
        uint256 amt = e.amount;
        e.amount = 0;
        e.provider.transfer(amt);
        emit FundsReleased(id, e.provider, amt);
    }

    /// @notice Client raises a dispute within the lock window.
    function raiseDispute(uint256 id)
        external onlyClient(id) inState(id, State.LOCKED)
    {
        require(block.timestamp < escrows[id].releaseAt, "Lock expired");
        escrows[id].state = State.DISPUTED;
        emit DisputeRaised(id, msg.sender);
    }

    /// @notice Owner (or arbitrator) resolves dispute and refunds client.
    function refundClient(uint256 id) external inState(id, State.DISPUTED) {
        Escrow storage e = escrows[id];
        e.state = State.REFUNDED;
        uint256 amt = e.amount;
        e.amount = 0;
        e.client.transfer(amt);
        emit FundsRefunded(id, e.client, amt);
    }
}`
    },

    multisig: {
        name: "MultiSigApproval.sol",
        tag: "Governance · Multi-Signature",
        desc: "A decentralized arbitration contract requiring M-of-N arbiter signatures before any escrow payment is released. Each registered arbitrator has equal voting weight; once quorum is reached, funds auto-transfer to the designated recipient.",
        features: ["3-of-5 Quorum", "On-Chain Voting", "Auto-Execute", "Duplicate-Vote Guard", "ETH Payout"],
        code: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title MultiSigApproval
/// @notice Releases escrow only after M of N arbiters approve.
contract MultiSigApproval {
    uint256 public constant QUORUM = 3;

    address public owner;
    address[] public arbiters;
    mapping(address => bool) public isArbiter;

    struct Proposal {
        address payable recipient;
        uint256 amount;
        bool    executed;
        uint256 approvals;
        mapping(address => bool) hasApproved;
    }

    uint256 public proposalCount;
    mapping(uint256 => Proposal) public proposals;

    event ArbiterAdded(address arbiter);
    event ProposalCreated(uint256 id, address recipient, uint256 amount);
    event Approved(uint256 id, address arbiter);
    event Executed(uint256 id, address recipient, uint256 amount);

    modifier onlyOwner() { require(msg.sender == owner, "Not owner"); _; }
    modifier onlyArbiter() { require(isArbiter[msg.sender], "Not arbiter"); _; }

    constructor(address[] memory _arbiters) payable {
        require(_arbiters.length >= QUORUM, "Need >= QUORUM arbiters");
        owner = msg.sender;
        for (uint i = 0; i < _arbiters.length; i++) {
            address a = _arbiters[i];
            require(!isArbiter[a], "Duplicate arbiter");
            isArbiter[a] = true;
            arbiters.push(a);
            emit ArbiterAdded(a);
        }
    }

    receive() external payable {}

    function createProposal(address payable _recipient)
        external onlyOwner returns (uint256 id)
    {
        require(address(this).balance > 0, "No funds");
        id = ++proposalCount;
        Proposal storage p = proposals[id];
        p.recipient = _recipient;
        p.amount    = address(this).balance;
        emit ProposalCreated(id, _recipient, p.amount);
    }

    function approve(uint256 id) external onlyArbiter {
        Proposal storage p = proposals[id];
        require(!p.executed, "Already executed");
        require(!p.hasApproved[msg.sender], "Already approved");
        p.hasApproved[msg.sender] = true;
        p.approvals++;
        emit Approved(id, msg.sender);
        if (p.approvals >= QUORUM) _execute(id);
    }

    function _execute(uint256 id) internal {
        Proposal storage p = proposals[id];
        p.executed = true;
        uint256 amt = p.amount;
        p.amount = 0;
        p.recipient.transfer(amt);
        emit Executed(id, p.recipient, amt);
    }
}`
    },

    bounty: {
        name: "BountyPool.sol",
        tag: "Incentive · Bounty",
        desc: "A permissionless bounty pool where any number of contributors can fund a shared reward pot. The first provider to submit a cryptographically verifiable result hash claims the entire balance. Unclaimed bounties are fully refundable after the expiry window.",
        features: ["Multi-Contributor", "First-Claim Wins", "7-Day Expiry", "Proof-of-Work Hash", "Refundable"],
        code: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title BountyPool
/// @notice Shared reward pool — first valid solver claims all funds.
contract BountyPool {
    uint256 public constant EXPIRY_DURATION = 7 days;

    address public owner;
    bytes32 public taskHash;       // keccak256 of the task specification
    uint256 public expiresAt;
    bool    public claimed;
    address public winner;

    mapping(address => uint256) public contributions;
    address[] public contributors;

    event Contributed(address indexed contributor, uint256 amount);
    event BountyClaimed(address indexed solver, uint256 reward, bytes32 resultHash);
    event BountyExpired(uint256 totalRefunded);

    modifier onlyOwner() { require(msg.sender == owner, "Not owner"); _; }
    modifier active()    { require(block.timestamp < expiresAt && !claimed, "Inactive"); _; }

    constructor(bytes32 _taskHash) payable {
        owner      = msg.sender;
        taskHash   = _taskHash;
        expiresAt  = block.timestamp + EXPIRY_DURATION;
        if (msg.value > 0) _record(msg.sender, msg.value);
    }

    function contribute() external payable active {
        require(msg.value > 0, "No ETH");
        _record(msg.sender, msg.value);
    }

    function _record(address c, uint256 amt) internal {
        if (contributions[c] == 0) contributors.push(c);
        contributions[c] += amt;
        emit Contributed(c, amt);
    }

    /// @notice Submit result hash; if valid, claim entire pool.
    function claim(bytes32 resultHash) external active {
        require(resultHash != bytes32(0), "Empty result");
        claimed = true;
        winner  = msg.sender;
        uint256 reward = address(this).balance;
        payable(msg.sender).transfer(reward);
        emit BountyClaimed(msg.sender, reward, resultHash);
    }

    /// @notice Contributors reclaim funds after expiry.
    function refund() external {
        require(block.timestamp >= expiresAt || claimed == false, "Too early");
        require(!claimed, "Already claimed");
        uint256 amt = contributions[msg.sender];
        require(amt > 0, "Nothing to refund");
        contributions[msg.sender] = 0;
        payable(msg.sender).transfer(amt);
    }

    function poolBalance() external view returns (uint256) {
        return address(this).balance;
    }
}`
    },

    sla: {
        name: "SLAEnforcer.sol",
        tag: "Compliance · SLA",
        desc: "An on-chain Service Level Agreement enforcer that monitors provider deadlines and automatically triggers stake slashing upon breach. Includes a 2-hour grace period, escalating penalties for repeat offences, and a full-forfeiture trigger after three strikes.",
        features: ["Auto-Slash 25%", "2hr Grace Period", "3-Strike Rule", "Stake Forfeiture", "On-Chain Audit"],
        code: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title SLAEnforcer
/// @notice Tracks provider SLA deadlines and slashes stakes on breach.
contract SLAEnforcer {
    uint256 public constant GRACE_PERIOD   = 2 hours;
    uint256 public constant SLASH_RATE_BPS = 2500; // 25%
    uint256 public constant MAX_STRIKES    = 3;
    uint256 public constant BPS_BASE       = 10000;

    address public owner;

    struct Provider {
        uint256 stake;
        uint256 strikes;
        bool    forfeited;
    }

    struct SLARecord {
        address provider;
        uint256 deadline;
        bool    completed;
        bool    slashed;
    }

    mapping(address => Provider) public providers;
    mapping(uint256 => SLARecord) public records;
    uint256 public recordCount;

    event Staked(address indexed provider, uint256 amount);
    event SLACreated(uint256 id, address provider, uint256 deadline);
    event SLACompleted(uint256 id, address provider);
    event StakeSlashed(address indexed provider, uint256 amount, uint256 strike);
    event StakeForfeited(address indexed provider, uint256 amount);

    modifier onlyOwner() { require(msg.sender == owner, "Not owner"); _; }

    constructor() { owner = msg.sender; }

    function stake() external payable {
        require(msg.value > 0, "No ETH");
        require(!providers[msg.sender].forfeited, "Forfeited");
        providers[msg.sender].stake += msg.value;
        emit Staked(msg.sender, msg.value);
    }

    function createSLA(address _provider, uint256 _deadline)
        external onlyOwner returns (uint256 id)
    {
        require(providers[_provider].stake > 0, "Not staked");
        id = ++recordCount;
        records[id] = SLARecord(_provider, _deadline, false, false);
        emit SLACreated(id, _provider, _deadline);
    }

    function markCompleted(uint256 id) external {
        SLARecord storage r = records[id];
        require(msg.sender == r.provider, "Not provider");
        require(!r.completed, "Already done");
        r.completed = true;
        emit SLACompleted(id, r.provider);
    }

    /// @notice Anyone can trigger slashing after deadline + grace period.
    function enforceSlash(uint256 id) external {
        SLARecord storage r = records[id];
        require(!r.completed, "SLA met");
        require(!r.slashed,   "Already slashed");
        require(block.timestamp > r.deadline + GRACE_PERIOD, "Grace active");
        r.slashed = true;

        Provider storage p = providers[r.provider];
        p.strikes++;

        if (p.strikes >= MAX_STRIKES) {
            uint256 forfeited = p.stake;
            p.stake = 0;
            p.forfeited = true;
            payable(owner).transfer(forfeited);
            emit StakeForfeited(r.provider, forfeited);
        } else {
            uint256 slash = (p.stake * SLASH_RATE_BPS) / BPS_BASE;
            p.stake -= slash;
            payable(owner).transfer(slash);
            emit StakeSlashed(r.provider, slash, p.strikes);
        }
    }

    function unstake() external {
        Provider storage p = providers[msg.sender];
        require(!p.forfeited, "Forfeited");
        uint256 amt = p.stake;
        require(amt > 0, "No stake");
        p.stake = 0;
        payable(msg.sender).transfer(amt);
    }
}`
    },

    revenue: {
        name: "RevenueSplitter.sol",
        tag: "Finance · Revenue Split",
        desc: "An automatic payment distribution contract that splits every incoming ETH payment across three configurable beneficiary pools — provider, platform treasury, and community rewards — at the moment of receipt with zero manual intervention.",
        features: ["Auto-Split", "80/15/5 Split", "Zero Custody", "Configurable", "Audit Trail"],
        code: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title RevenueSplitter
/// @notice Auto-distributes ETH payments: 80% provider, 15% treasury, 5% rewards.
contract RevenueSplitter {
    uint256 public constant PROVIDER_BPS = 8000;
    uint256 public constant TREASURY_BPS = 1500;
    uint256 public constant REWARDS_BPS  =  500;
    uint256 public constant BPS_BASE     = 10000;

    address public owner;
    address payable public treasury;
    address payable public rewardsPool;

    uint256 public totalDistributed;
    uint256 public totalPayments;

    event PaymentSplit(
        address indexed payer,
        address indexed provider,
        uint256 providerAmt,
        uint256 treasuryAmt,
        uint256 rewardsAmt
    );
    event TreasuryUpdated(address newTreasury);
    event RewardsPoolUpdated(address newRewards);

    modifier onlyOwner() { require(msg.sender == owner, "Not owner"); _; }

    constructor(address payable _treasury, address payable _rewards) {
        owner       = msg.sender;
        treasury    = _treasury;
        rewardsPool = _rewards;
    }

    /// @notice Pay a provider; contract auto-splits on arrival.
    function pay(address payable _provider) external payable {
        require(msg.value > 0,      "No ETH sent");
        require(_provider != address(0), "Zero provider");

        uint256 providerAmt = (msg.value * PROVIDER_BPS) / BPS_BASE;
        uint256 treasuryAmt = (msg.value * TREASURY_BPS) / BPS_BASE;
        uint256 rewardsAmt  = msg.value - providerAmt - treasuryAmt;

        _provider.transfer(providerAmt);
        treasury.transfer(treasuryAmt);
        rewardsPool.transfer(rewardsAmt);

        totalDistributed += msg.value;
        totalPayments++;

        emit PaymentSplit(msg.sender, _provider, providerAmt, treasuryAmt, rewardsAmt);
    }

    function setTreasury(address payable _t) external onlyOwner {
        treasury = _t;
        emit TreasuryUpdated(_t);
    }

    function setRewardsPool(address payable _r) external onlyOwner {
        rewardsPool = _r;
        emit RewardsPoolUpdated(_r);
    }
}`
    }
};

/** Detect which blueprint best matches the user's free-text requirements */
function detectContractType(text) {
    const t = text.toLowerCase();
    if (t.includes("time lock") || t.includes("timelock") || t.includes("delay") || t.includes("wait") || t.includes("48")) return "timelock";
    if (t.includes("multi") || t.includes("multisig") || t.includes("arbiter") || t.includes("quorum") || t.includes("signature")) return "multisig";
    if (t.includes("bounty") || t.includes("pool") || t.includes("reward") || t.includes("first") || t.includes("claim")) return "bounty";
    if (t.includes("sla") || t.includes("slash") || t.includes("penalty") || t.includes("deadline") || t.includes("violation") || t.includes("enforce")) return "sla";
    if (t.includes("split") || t.includes("revenue") || t.includes("distribut") || t.includes("percent") || t.includes("%") || t.includes("treasury")) return "revenue";
    // Default to timelock if nothing matches clearly
    return "timelock";
}

function fillBuilderTemplate(type) {
    const ta = document.getElementById("builder-requirements");
    if (ta && BUILDER_TEMPLATES[type]) {
        ta.value = BUILDER_TEMPLATES[type];
        ta.focus();
    }
}

async function generateSmartContract() {
    const requirements = (document.getElementById("builder-requirements")?.value || "").trim();
    if (!requirements) {
        systemLog("Please describe your contract requirements first.", "error");
        return;
    }

    const btn = document.getElementById("builder-generate-btn");
    const emptyDiv = document.getElementById("builder-output-empty");
    const resultDiv = document.getElementById("builder-result");

    // Show loading state
    if (btn) { btn.disabled = true; btn.textContent = "⚙️  Generating..."; }
    if (emptyDiv) emptyDiv.style.display = "none";
    if (resultDiv) resultDiv.style.display = "none";

    const outputArea = document.getElementById("builder-output-area");
    const loadingEl = document.createElement("div");
    loadingEl.className = "builder-loading";
    loadingEl.id = "builder-loading-spinner";
    loadingEl.innerHTML = `
        <p style="margin-bottom: 16px; color: var(--primary);">⚡ Analysing requirements & generating contract...</p>
        <div class="shimmer-bar" style="width: 80%; margin: 0 auto 10px;"></div>
        <div class="shimmer-bar" style="width: 60%; margin: 0 auto 10px;"></div>
        <div class="shimmer-bar" style="width: 70%; margin: 0 auto;"></div>`;
    if (outputArea) outputArea.appendChild(loadingEl);

    // Simulate generation delay for realism
    await new Promise(r => setTimeout(r, 1100 + Math.random() * 600));

    // Detect and pick blueprint
    const type = detectContractType(requirements);
    const blueprint = CONTRACT_BLUEPRINTS[type];
    _builderGeneratedContract = blueprint;

    // Remove loading
    const spinner = document.getElementById("builder-loading-spinner");
    if (spinner) spinner.remove();
    if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> Generate Smart Contract`;
    }

    // Fill result UI
    const lines = blueprint.code.split("\n").length;
    document.getElementById("builder-contract-name").textContent = blueprint.name;
    document.getElementById("builder-contract-tag").textContent = blueprint.tag;
    document.getElementById("builder-contract-desc").textContent = blueprint.desc;
    document.getElementById("builder-preview-lines").textContent = `~${lines} lines`;
    document.getElementById("builder-code-content").textContent = blueprint.code;

    const featuresEl = document.getElementById("builder-contract-features");
    if (featuresEl) {
        featuresEl.innerHTML = blueprint.features
            .map(f => `<span class="builder-feature-tag">${escapeHtml(f)}</span>`)
            .join("");
    }

    if (emptyDiv) emptyDiv.style.display = "none";
    if (resultDiv) resultDiv.style.display = "flex";

    systemLog(`Generated ${blueprint.name} — ${lines} lines of Solidity`, "success");
}

function viewBuilderCode() {
    if (!_builderGeneratedContract) return;
    const modal = document.getElementById("code-modal");
    const title = document.getElementById("code-modal-title");
    const content = document.getElementById("code-modal-content");
    if (!modal || !title || !content) return;
    title.textContent = _builderGeneratedContract.name;
    content.textContent = _builderGeneratedContract.code;
    modal.style.display = "flex";
}

async function openAttachModal() {
    if (!_builderGeneratedContract) return;

    document.getElementById("attach-contract-badge-name").textContent = _builderGeneratedContract.name;

    const modal = document.getElementById("attach-job-modal");
    if (modal) modal.style.display = "flex";

    const listEl = document.getElementById("attach-jobs-list");
    if (!listEl) return;

    if (!jobMarketContract) {
        listEl.innerHTML = `<div class="empty-state" style="padding:24px; color: var(--warning);">⚠️ Connect your wallet to see available jobs.</div>`;
        return;
    }

    listEl.innerHTML = `<div class="empty-state" style="padding:16px;">Loading jobs...</div>`;

    try {
        const openJobs = await jobMarketContract.getOpenJobs();
        if (!openJobs || openJobs.length === 0) {
            listEl.innerHTML = `<div class="empty-state" style="padding:24px;">No open jobs found in the marketplace.</div>`;
            return;
        }

        listEl.innerHTML = openJobs.map(job => {
            const id = Number(job.id);
            const budget = parseFloat(ethers.formatEther(job.budget)).toFixed(4);
            const tier = TIER_NAMES[Number(job.requiredTier)] || "Unknown";
            const descRaw = job.description || "";
            let displayDesc = descRaw;
            try { const m = JSON.parse(descRaw); displayDesc = m.text || descRaw; } catch(e) {}
            const shortDesc = displayDesc.substring(0, 55) + (displayDesc.length > 55 ? "..." : "");

            return `
            <div class="attach-job-item" id="attach-job-item-${id}">
                <div class="attach-job-item-info">
                    <span class="attach-job-id">Job #${id}</span>
                    <span class="attach-job-desc">${escapeHtml(shortDesc)}</span>
                    <span class="attach-job-meta">${tier} · ${budget} ETH</span>
                </div>
                <button class="btn-sm btn-primary" onclick="attachContractToJob(${id})">Attach</button>
            </div>`;
        }).join("");
    } catch(err) {
        listEl.innerHTML = `<div class="empty-state" style="color:var(--danger);">Failed to load jobs: ${escapeHtml(err.message)}</div>`;
    }
}

function closeAttachModal() {
    const modal = document.getElementById("attach-job-modal");
    if (modal) modal.style.display = "none";
}

function attachContractToJob(jobId) {
    if (!_builderGeneratedContract) return;

    // Store the association in memory (UI-layer annotation — non-destructive)
    if (!window._jobContractAnnotations) window._jobContractAnnotations = {};
    window._jobContractAnnotations[jobId] = {
        contractName: _builderGeneratedContract.name,
        attachedAt: new Date().toLocaleTimeString()
    };

    // Update the item in modal to show success
    const item = document.getElementById(`attach-job-item-${jobId}`);
    if (item) {
        item.innerHTML = `<div class="attach-success-msg" style="width:100%;">
            ✅ <strong>${escapeHtml(_builderGeneratedContract.name)}</strong> successfully attached to <strong>Job #${jobId}</strong>
        </div>`;
    }

    systemLog(`${_builderGeneratedContract.name} attached to Job #${jobId} as supplementary logic layer.`, "success");

    setTimeout(() => closeAttachModal(), 1800);
}

// ─────────────────────────────────────────────────────────
//  System Log
// ─────────────────────────────────────────────────────────

function systemLog(message, level = "info") {
    const terminal = document.getElementById("terminal-output");
    if (!terminal) return;

    const timestamp = new Date().toLocaleTimeString();
    const icons = { info: "ℹ️", success: "✅", error: "❌", warning: "⚠️" };
    const icon = icons[level] || "ℹ️";

    const entry = document.createElement("div");
    entry.className = `log-entry log-${level}`;
    entry.innerHTML = `<span class="log-time">[${timestamp}]</span> ${icon} ${escapeHtml(message)}`;

    terminal.appendChild(entry);
    terminal.scrollTop = terminal.scrollHeight;

    // Keep last 100 entries
    while (terminal.children.length > 100) {
        terminal.removeChild(terminal.firstChild);
    }
}

// ─────────────────────────────────────────────────────────
//  Utilities
// ─────────────────────────────────────────────────────────

function escapeHtml(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

// ─────────────────────────────────────────────────────────
//  Init On Load
// ─────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
    // Nav click handlers
    document.querySelectorAll(".nav-item").forEach(item => {
        item.addEventListener("click", () => navigateTo(item.dataset.view));
    });

    // Form handler
    const form = document.getElementById("create-job-form");
    if (form) form.addEventListener("submit", postJob);

    // Connect button
    const connectBtn = document.getElementById("btn-connect");

    // Slide-over close
    const closeBtn = document.getElementById("close-slide-over");
    if (closeBtn) closeBtn.addEventListener("click", closeSlideOver);

    systemLog("HPC Marketplace client initialized", "info");
    systemLog("Connect your wallet to start", "info");
});
