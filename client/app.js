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
        governance: "Governance"
    };
    const titleEl = document.getElementById("view-title");
    if (titleEl) titleEl.textContent = titles[view] || view;

    refreshData();
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
