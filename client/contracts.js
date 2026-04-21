// ─────────────────────────────────────────────────────────
//  HPC Marketplace — Client-Side Contract ABIs
//  Auto-updated for enhanced contract suite
// ─────────────────────────────────────────────────────────

const JOB_MARKET_ABI = [
    // Events
    "event JobPosted(uint256 indexed jobId, address indexed client, uint256 budget, string dataHash, string description, uint256 deadline, uint8 requiredTier)",
    "event BidSubmitted(uint256 indexed jobId, address indexed provider, uint256 amount, uint256 estimatedDuration)",
    "event JobAssigned(uint256 indexed jobId, address indexed provider, uint256 amount, uint256 slaDeadline)",
    "event ResultSubmitted(uint256 indexed jobId, address indexed provider, string resultHash)",
    "event JobCompleted(uint256 indexed jobId, address indexed client, address indexed provider, uint256 payment, uint256 platformFee)",
    "event JobCancelled(uint256 indexed jobId, address indexed client, uint256 refundAmount)",
    "event JobProgress(uint256 indexed jobId, string stage)",
    "event ProviderStaked(address indexed provider, uint256 amount, uint8 tier)",
    "event DisputeRaisedForJob(uint256 indexed jobId, address indexed client, uint256 disputeId)",
    "event SLAViolation(uint256 indexed jobId, address indexed provider, uint256 deadline)",
    "event PlatformFeeUpdated(uint256 oldFee, uint256 newFee, address updatedBy)",

    // Job Lifecycle
    "function postJob(string _dataHash, string _description, uint256 _deadline, uint8 _requiredTier) payable returns (uint256)",
    "function submitBid(uint256 _jobId, uint256 _amount, uint256 _estimatedDuration) external",
    "function acceptBid(uint256 _jobId, address _provider) external",
    "function submitResult(uint256 _jobId, string _resultHash) external",
    "function confirmCompletion(uint256 _jobId) external",
    "function cancelJob(uint256 _jobId) external",
    "function raiseDispute(uint256 _jobId) external",
    "function reportSLAViolation(uint256 _jobId) external",
    "function reportProgress(uint256 _jobId, string calldata _message) external",

    // Provider Management
    "function stakeAsProvider(uint8 _tier, uint256 _cpuCores, uint256 _gpuVRAM, uint256 _ramMB) payable",
    "function unstake(uint256 _amount) external",

    // View Functions
    "function getJob(uint256 _jobId) view returns (tuple(uint256 id, address client, uint256 budget, uint256 deposit, uint8 status, address assignedProvider, string dataHash, string resultHash, uint256 createdAt, uint256 deadline, string description, uint8 requiredTier, uint256 slaDeadline))",
    "function getJobBids(uint256 _jobId) view returns (tuple(address provider, uint256 amount, uint256 timestamp, bool accepted, uint256 estimatedDuration)[])",
    "function getOpenJobs() view returns (tuple(uint256 id, address client, uint256 budget, uint256 deposit, uint8 status, address assignedProvider, string dataHash, string resultHash, uint256 createdAt, uint256 deadline, string description, uint8 requiredTier, uint256 slaDeadline)[])",
    "function isStaked(address _provider) view returns (bool)",
    "function getStake(address _provider) view returns (uint256)",
    "function getProviderProfile(address _provider) view returns (tuple(uint8 tier, uint256 cpuCores, uint256 gpuVRAM, uint256 ramMB, bool isRegistered, uint256 registeredAt))",
    "function getMarketStats() view returns (uint256, uint256, uint256, uint256)",
    "function jobCounter() view returns (uint256)",
    "function platformFeePercent() view returns (uint256)",
    "function minimumStake() view returns (uint256)"
];

const REPUTATION_ABI = [
    // Events
    "event ReputationIncreased(address indexed provider, uint256 newScore, uint256 pointsAdded, uint8 newTier)",
    "event ReputationDecreased(address indexed provider, uint256 newScore, uint256 pointsDeducted, uint8 newTier)",
    "event TierChanged(address indexed provider, uint8 oldTier, uint8 newTier)",
    "event LeaderboardUpdated(address indexed provider, uint256 newScore)",

    // View Functions
    "function getScore(address _provider) view returns (uint256)",
    "function getProviderStats(address _provider) view returns (uint256 score, uint256 successful, uint256 failed, uint256 total, uint256 streak, uint8 tier)",
    "function getSuccessRate(address _provider) view returns (uint256)",
    "function getProviderTier(address _provider) view returns (uint8)",
    "function getLeaderboard() view returns (address[])",
    "function getLeaderboardSize() view returns (uint256)"
];

const DISPUTE_ABI = [
    // Events
    "event DisputeRaised(uint256 indexed disputeId, uint256 indexed jobId, address indexed client, address provider, uint256 evidenceDeadline)",
    "event EvidenceSubmitted(uint256 indexed disputeId, address indexed submitter, string evidenceHash, bool isClient)",
    "event DisputeResolved(uint256 indexed disputeId, uint256 indexed jobId, uint8 resolution, string reason)",
    "event StakeSlashed(address indexed party, uint256 amount, uint256 indexed disputeId)",
    "event DisputeEscalated(uint256 indexed disputeId, uint8 newStatus)",

    // Functions
    "function submitEvidence(uint256 _disputeId, string _evidenceHash) external",
    "function escalateToArbitration(uint256 _disputeId) external",

    // View Functions
    "function getDispute(uint256 _disputeId) view returns (tuple(uint256 jobId, address client, address provider, uint8 status, uint256 raisedAt, uint256 evidenceDeadline, uint256 resolutionDeadline, string clientEvidenceHash, string providerEvidenceHash, uint256 stakeAtRisk, string arbitratorReason))",
    "function getDisputeByJob(uint256 _jobId) view returns (uint256)",
    "function isInEvidencePeriod(uint256 _disputeId) view returns (bool)",
    "function isResolved(uint256 _disputeId) view returns (bool)",
    "function disputeCounter() view returns (uint256)"
];

const GOVERNANCE_ABI = [
    // Events
    "event ProposalCreated(uint256 indexed proposalId, address indexed proposer, string title, string parameterTarget, uint256 proposedValue, uint256 votingDeadline)",
    "event VoteCast(uint256 indexed proposalId, address indexed voter, bool support, uint256 weight)",
    "event ProposalExecuted(uint256 indexed proposalId, string parameterTarget, uint256 proposedValue)",
    "event ProposalStatusChanged(uint256 indexed proposalId, uint8 newStatus)",

    // Functions
    "function propose(string _title, string _description, string _parameterTarget, uint256 _proposedValue) returns (uint256)",
    "function vote(uint256 _proposalId, bool _support) external",
    "function finalizeProposal(uint256 _proposalId) external",

    // View Functions
    "function getProposal(uint256 _proposalId) view returns (tuple(uint256 id, address proposer, string title, string description, string parameterTarget, uint256 proposedValue, uint256 forVotes, uint256 againstVotes, uint256 createdAt, uint256 votingDeadline, uint256 executionDeadline, uint8 status))",
    "function getVoteInfo(uint256 _proposalId, address _voter) view returns (bool voted, bool support)",
    "function getVotingPower(address _account) view returns (uint256)",
    "function proposalCounter() view returns (uint256)",
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function balanceOf(address) view returns (uint256)"
];
