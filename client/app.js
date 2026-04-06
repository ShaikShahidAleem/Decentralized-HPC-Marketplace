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

const STATUS_MAP = ["Open", "Assigned", "Completed", "Confirmed", "Cancelled", "Disputed"];
const STATUS_CLASS = ["status-open", "status-assigned", "status-completed", "status-confirmed", "status-cancelled", "status-disputed"];
const TIER_NAMES = ["CPU Standard", "GPU Basic", "GPU Pro", "HPC Cluster"];
const REP_TIERS = ["Unranked", "Bronze", "Silver", "Gold", "Platinum"];
const PROPOSAL_STATUS = ["Active", "Passed", "Rejected", "Executed", "Expired"];

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
            systemLog("Connecting to local node with test account...", "info");
            // Standard Hardhat Account #0
            const PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
            provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
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

        systemLog(`Connected: ${addrShort}`, "success");
        await refreshData();

        // Subscribe to real-time events
        subscribeToEvents();
    } catch (err) {
        systemLog("Connection failed: " + err.message, "error");
    }
}

function subscribeToEvents() {
    if (!jobMarketContract) return;

    jobMarketContract.on("JobPosted", (jobId, client, budget, dataHash, description) => {
        systemLog(`New job #${jobId} posted: "${description.substring(0, 50)}..." — ${ethers.formatEther(budget)} ETH`, "info");
        refreshData();
    });

    jobMarketContract.on("JobAssigned", (jobId, provider, amount) => {
        systemLog(`Job #${jobId} assigned to ${provider.slice(0, 8)}...`, "info");
        refreshData();
    });

    jobMarketContract.on("JobCompleted", (jobId, client, provider, payment) => {
        systemLog(`Job #${jobId} completed — ${ethers.formatEther(payment)} ETH paid`, "success");
        refreshData();
    });

    jobMarketContract.on("DisputeRaisedForJob", (jobId, client, disputeId) => {
        systemLog(`⚠️ Dispute #${disputeId} raised for job #${jobId}`, "warning");
        refreshData();
    });
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
                <p>${escapeHtml(job.description)}</p>
            </div>
        `;

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
                                ${isClient && status === 0 && !bid.accepted ? `
                                <button class="btn-sm btn-primary" onclick="acceptBid(${jobId}, '${bid.provider}')">Accept Bid</button>
                                ` : ''}
                            </div>
                        `).join("")}
                    </div>
                </div>
            `;
        }

        // Action buttons
        let actions = '';
        if (isClient) {
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

    const description = document.getElementById("job-description").value;
    const dataHash = document.getElementById("job-data-hash").value || "QmDefault";
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
            const isMyDispute = d.client.toLowerCase() === userAddress.toLowerCase() ||
                d.provider.toLowerCase() === userAddress.toLowerCase();
            return `
                    <div class="dispute-card ${isMyDispute ? 'my-dispute' : ''}">
                        <div class="dispute-header">
                            <span class="dispute-id">Dispute #${d.id}</span>
                            <span class="dispute-status ds-${status}">${DISPUTE_STATUS[status]}</span>
                        </div>
                        <div class="dispute-body">
                            <div class="dispute-info">
                                <span>Job #${Number(d.jobId)}</span>
                                <span>Client: ${d.client.slice(0, 8)}...</span>
                                <span>Provider: ${d.provider.slice(0, 8)}...</span>
                                <span>Stake at risk: ${ethers.formatEther(d.stakeAtRisk)} ETH</span>
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
        await loadGovernanceView();
    } catch (err) {
        systemLog("Vote failed: " + err.message, "error");
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
