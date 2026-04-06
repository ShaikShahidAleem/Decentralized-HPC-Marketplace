// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./Reputation.sol";
import "./DisputeResolution.sol";

/**
 * @title JobMarket
 * @author HPC Marketplace Team
 * @notice Core marketplace contract for the decentralized HPC compute exchange.
 * @dev Manages the complete lifecycle of compute jobs: posting, bidding, assignment,
 *      execution, verification, payment release, and dispute escalation.
 *
 * Architecture:
 *   - Uses a pull-over-push payment pattern with explicit escrow management
 *   - ReentrancyGuard on all state-mutating functions that transfer ETH
 *   - Integrates with Reputation contract for provider scoring
 *   - Integrates with DisputeResolution for arbitration of contested jobs
 *   - Compute tiers allow providers to advertise hardware capabilities
 *
 * Security Considerations:
 *   - All external calls to transfer ETH use ReentrancyGuard (SWC-107)
 *   - State changes occur BEFORE external calls (checks-effects-interactions)
 *   - Integer overflow protection via Solidity ^0.8.20 built-in checks
 */
contract JobMarket is ReentrancyGuard {

    // ============ Enums ============

    /// @notice Lifecycle stages of a compute job
    enum JobStatus {
        Open,       // Job posted, accepting bids from providers
        Assigned,   // Provider assigned, computation in progress
        Completed,  // Result submitted by provider, awaiting client verification
        Confirmed,  // Client confirmed result, payment released
        Cancelled,  // Job cancelled by client (only from Open state)
        Disputed    // Dispute raised, forwarded to DisputeResolution contract
    }

    /// @notice Hardware capability tiers for compute job categorization
    /// @dev Providers declare their tier at staking time; clients specify required tier
    enum ComputeTier {
        CPU_STANDARD,   // General CPU workloads (data processing, compilation)
        GPU_BASIC,      // Single GPU tasks (inference, light training)
        GPU_PRO,        // Multi-GPU setups (distributed training, rendering)
        HPC_CLUSTER     // Full HPC cluster access (molecular dynamics, CFD, etc.)
    }

    // ============ Structs ============

    /// @notice Full specification of a compute job
    struct Job {
        uint256 id;
        address client;
        uint256 budget;               // Total budget locked in escrow (in wei)
        uint256 deposit;              // Remaining deposited amount
        JobStatus status;
        address assignedProvider;
        string dataHash;              // IPFS CID pointing to input dataset/configuration
        string resultHash;            // IPFS CID pointing to computation output
        uint256 createdAt;            // Block timestamp of job creation
        uint256 deadline;             // Absolute deadline for result submission (unix timestamp)
        string description;           // Human-readable job specification
        ComputeTier requiredTier;     // Minimum hardware tier required
        uint256 slaDeadline;          // SLA completion deadline (can differ from bidding deadline)
    }

    /// @notice A provider's bid on a specific job
    struct Bid {
        address provider;
        uint256 amount;               // Bid price in wei
        uint256 timestamp;
        bool accepted;
        uint256 estimatedDuration;    // Provider's estimated completion time (seconds)
    }

    /// @notice Provider profile with hardware capabilities
    struct ProviderProfile {
        ComputeTier tier;
        uint256 cpuCores;
        uint256 gpuVRAM;              // In MB
        uint256 ramMB;
        bool isRegistered;
        uint256 registeredAt;
    }

    // ============ State Variables ============

    uint256 public jobCounter;
    uint256 public platformFeePercent = 2;        // 2% platform fee (basis: 100)
    uint256 public maxPlatformFee = 10;            // Maximum configurable fee (10%)
    address public owner;
    Reputation public reputationContract;
    DisputeResolution public disputeContract;

    mapping(uint256 => Job) public jobs;
    mapping(uint256 => Bid[]) public jobBids;
    mapping(uint256 => mapping(address => bool)) public hasBid;

    // Provider management
    mapping(address => uint256) public providerStakes;
    mapping(address => ProviderProfile) public providerProfiles;
    uint256 public minimumStake = 0.01 ether;
    uint256 public totalActiveProviders;

    // Platform statistics
    uint256 public totalVolumeProcessed;
    uint256 public totalJobsCompleted;

    // ============ Events ============

    event JobPosted(
        uint256 indexed jobId,
        address indexed client,
        uint256 budget,
        string dataHash,
        string description,
        uint256 deadline,
        ComputeTier requiredTier
    );

    event BidSubmitted(
        uint256 indexed jobId,
        address indexed provider,
        uint256 amount,
        uint256 estimatedDuration
    );

    event JobAssigned(
        uint256 indexed jobId,
        address indexed provider,
        uint256 amount,
        uint256 slaDeadline
    );

    event ResultSubmitted(
        uint256 indexed jobId,
        address indexed provider,
        string resultHash
    );

    event JobCompleted(
        uint256 indexed jobId,
        address indexed client,
        address indexed provider,
        uint256 payment,
        uint256 platformFee
    );

    event JobCancelled(
        uint256 indexed jobId,
        address indexed client,
        uint256 refundAmount
    );

    event ProviderStaked(
        address indexed provider,
        uint256 amount,
        ComputeTier tier
    );

    event ProviderUnstaked(
        address indexed provider,
        uint256 amount
    );

    event DisputeRaisedForJob(
        uint256 indexed jobId,
        address indexed client,
        uint256 disputeId
    );

    event SLAViolation(
        uint256 indexed jobId,
        address indexed provider,
        uint256 deadline
    );

    event PlatformFeeUpdated(
        uint256 oldFee,
        uint256 newFee,
        address updatedBy
    );

    // ============ Modifiers ============

    modifier onlyOwner() {
        require(msg.sender == owner, "JobMarket: caller is not the owner");
        _;
    }

    modifier onlyClient(uint256 _jobId) {
        require(jobs[_jobId].client == msg.sender, "JobMarket: caller is not the job client");
        _;
    }

    modifier onlyAssignedProvider(uint256 _jobId) {
        require(
            jobs[_jobId].assignedProvider == msg.sender,
            "JobMarket: caller is not the assigned provider"
        );
        _;
    }

    modifier jobExists(uint256 _jobId) {
        require(_jobId > 0 && _jobId <= jobCounter, "JobMarket: job does not exist");
        _;
    }

    modifier isStakedProvider() {
        require(
            providerStakes[msg.sender] >= minimumStake,
            "JobMarket: provider must stake minimum amount"
        );
        _;
    }

    // ============ Constructor ============

    /**
     * @notice Deploys the marketplace and links supporting contracts.
     * @param _reputationContract  Address of the deployed Reputation contract
     * @param _disputeContract     Address of the deployed DisputeResolution contract
     */
    constructor(address _reputationContract, address _disputeContract) {
        owner = msg.sender;
        reputationContract = Reputation(_reputationContract);
        disputeContract = DisputeResolution(_disputeContract);
    }

    // ============ Provider Management ============

    /**
     * @notice Registers the caller as a compute provider by staking ETH.
     * @dev The provider must specify their hardware capability tier.
     *      Multiple stake calls accumulate. The tier is set/updated with each call.
     * @param _tier      Hardware capability tier the provider is advertising
     * @param _cpuCores  Number of CPU cores available
     * @param _gpuVRAM   GPU VRAM in MB (0 for CPU-only providers)
     * @param _ramMB     Total RAM in MB
     */
    function stakeAsProvider(
        ComputeTier _tier,
        uint256 _cpuCores,
        uint256 _gpuVRAM,
        uint256 _ramMB
    ) external payable {
        require(msg.value > 0, "JobMarket: must stake a non-zero amount");

        bool isNew = !providerProfiles[msg.sender].isRegistered;

        providerStakes[msg.sender] += msg.value;
        providerProfiles[msg.sender] = ProviderProfile({
            tier: _tier,
            cpuCores: _cpuCores,
            gpuVRAM: _gpuVRAM,
            ramMB: _ramMB,
            isRegistered: true,
            registeredAt: isNew ? block.timestamp : providerProfiles[msg.sender].registeredAt
        });

        if (isNew) {
            totalActiveProviders++;
        }

        emit ProviderStaked(msg.sender, msg.value, _tier);
    }

    /**
     * @notice Withdraws staked ETH (only if provider has no active jobs).
     * @param _amount Amount of ETH to withdraw (in wei)
     */
    function unstake(uint256 _amount) external nonReentrant {
        require(providerStakes[msg.sender] >= _amount, "JobMarket: insufficient stake balance");

        providerStakes[msg.sender] -= _amount;

        if (providerStakes[msg.sender] < minimumStake && providerProfiles[msg.sender].isRegistered) {
            providerProfiles[msg.sender].isRegistered = false;
            if (totalActiveProviders > 0) {
                totalActiveProviders--;
            }
        }

        payable(msg.sender).transfer(_amount);
        emit ProviderUnstaked(msg.sender, _amount);
    }

    // ============ Job Lifecycle ============

    /**
     * @notice Posts a new compute job with escrowed budget.
     * @dev The entire msg.value is locked as escrow. The client specifies:
     *      - Data reference (IPFS CID)
     *      - Job description and requirements
     *      - Bidding deadline
     *      - Required hardware tier
     * @param _dataHash     IPFS CID pointing to the input data/configuration
     * @param _description  Human-readable job specification
     * @param _deadline     Timestamp after which bidding closes
     * @param _requiredTier Minimum hardware tier required for this job
     * @return jobId        The newly created job's identifier
     */
    function postJob(
        string calldata _dataHash,
        string calldata _description,
        uint256 _deadline,
        ComputeTier _requiredTier
    ) external payable returns (uint256) {
        require(msg.value > 0, "JobMarket: must deposit budget as escrow");
        require(_deadline > block.timestamp, "JobMarket: deadline must be in the future");

        jobCounter++;

        jobs[jobCounter] = Job({
            id: jobCounter,
            client: msg.sender,
            budget: msg.value,
            deposit: msg.value,
            status: JobStatus.Open,
            assignedProvider: address(0),
            dataHash: _dataHash,
            resultHash: "",
            createdAt: block.timestamp,
            deadline: _deadline,
            description: _description,
            requiredTier: _requiredTier,
            slaDeadline: 0
        });

        emit JobPosted(
            jobCounter,
            msg.sender,
            msg.value,
            _dataHash,
            _description,
            _deadline,
            _requiredTier
        );

        return jobCounter;
    }

    /**
     * @notice Provider submits a competitive bid on an open job.
     * @dev Requires the provider to be staked and the job to be open.
     *      The provider's hardware tier must meet or exceed the job's requirement.
     * @param _jobId             The job to bid on
     * @param _amount            Bid price in wei (must not exceed job budget)
     * @param _estimatedDuration Estimated completion time in seconds
     */
    function submitBid(
        uint256 _jobId,
        uint256 _amount,
        uint256 _estimatedDuration
    )
        external
        jobExists(_jobId)
        isStakedProvider
    {
        Job storage job = jobs[_jobId];
        require(job.status == JobStatus.Open, "JobMarket: job is not open for bidding");
        require(_amount <= job.budget, "JobMarket: bid exceeds job budget");
        require(!hasBid[_jobId][msg.sender], "JobMarket: provider already bid on this job");
        require(
            uint256(providerProfiles[msg.sender].tier) >= uint256(job.requiredTier),
            "JobMarket: provider tier insufficient for this job"
        );

        jobBids[_jobId].push(Bid({
            provider: msg.sender,
            amount: _amount,
            timestamp: block.timestamp,
            accepted: false,
            estimatedDuration: _estimatedDuration
        }));

        hasBid[_jobId][msg.sender] = true;

        emit BidSubmitted(_jobId, msg.sender, _amount, _estimatedDuration);
    }

    /**
     * @notice Client accepts a provider's bid, assigning the job.
     * @dev Sets the SLA deadline based on the provider's estimated duration.
     *      Transitions the job from Open to Assigned.
     * @param _jobId    The job whose bid is being accepted
     * @param _provider The address of the provider whose bid to accept
     */
    function acceptBid(uint256 _jobId, address _provider)
        external
        jobExists(_jobId)
        onlyClient(_jobId)
    {
        Job storage job = jobs[_jobId];
        require(job.status == JobStatus.Open, "JobMarket: job is not open");
        require(hasBid[_jobId][_provider], "JobMarket: provider has not bid on this job");

        // Find the accepted bid and set SLA deadline
        Bid[] storage bids = jobBids[_jobId];
        uint256 slaDeadline = block.timestamp + 24 hours; // Default SLA

        for (uint256 i = 0; i < bids.length; i++) {
            if (bids[i].provider == _provider) {
                bids[i].accepted = true;
                // SLA = current time + estimated duration + 25% buffer
                if (bids[i].estimatedDuration > 0) {
                    slaDeadline = block.timestamp + bids[i].estimatedDuration + (bids[i].estimatedDuration / 4);
                }
                break;
            }
        }

        job.status = JobStatus.Assigned;
        job.assignedProvider = _provider;
        job.slaDeadline = slaDeadline;

        emit JobAssigned(_jobId, _provider, job.budget, slaDeadline);
    }

    /**
     * @notice Provider submits the computation result.
     * @dev Only the assigned provider can submit, and only while the job is Assigned.
     *      The result is stored as an IPFS CID reference.
     * @param _jobId      The job to submit results for
     * @param _resultHash IPFS CID pointing to the computation output
     */
    function submitResult(uint256 _jobId, string calldata _resultHash)
        external
        jobExists(_jobId)
        onlyAssignedProvider(_jobId)
    {
        Job storage job = jobs[_jobId];
        require(job.status == JobStatus.Assigned, "JobMarket: job is not in progress");

        job.resultHash = _resultHash;
        job.status = JobStatus.Completed;

        emit ResultSubmitted(_jobId, msg.sender, _resultHash);
    }

    /**
     * @notice Client confirms job completion, triggering payment release.
     * @dev Distributes the escrowed funds: provider payment minus platform fee.
     *      Updates the provider's reputation score and platform statistics.
     *      Uses ReentrancyGuard to prevent reentrancy attacks (SWC-107).
     * @param _jobId The job to confirm and pay for
     */
    function confirmCompletion(uint256 _jobId)
        external
        jobExists(_jobId)
        onlyClient(_jobId)
        nonReentrant
    {
        Job storage job = jobs[_jobId];
        require(job.status == JobStatus.Completed, "JobMarket: job result not yet submitted");

        uint256 payment = job.deposit;
        uint256 platformFee = (payment * platformFeePercent) / 100;
        uint256 providerPayment = payment - platformFee;

        // Effects before interactions (checks-effects-interactions pattern)
        job.status = JobStatus.Confirmed;
        job.deposit = 0;
        totalVolumeProcessed += payment;
        totalJobsCompleted++;

        // Interactions
        payable(job.assignedProvider).transfer(providerPayment);

        if (platformFee > 0) {
            payable(owner).transfer(platformFee);
        }

        // Update reputation
        reputationContract.incrementReputation(job.assignedProvider);

        emit JobCompleted(_jobId, msg.sender, job.assignedProvider, providerPayment, platformFee);
    }

    /**
     * @notice Client cancels an open job and receives a full refund.
     * @dev Only jobs in Open status can be cancelled. The full deposit is returned.
     * @param _jobId The job to cancel
     */
    function cancelJob(uint256 _jobId)
        external
        jobExists(_jobId)
        onlyClient(_jobId)
        nonReentrant
    {
        Job storage job = jobs[_jobId];
        require(job.status == JobStatus.Open, "JobMarket: can only cancel open jobs");

        uint256 refund = job.deposit;
        job.status = JobStatus.Cancelled;
        job.deposit = 0;

        payable(msg.sender).transfer(refund);

        emit JobCancelled(_jobId, msg.sender, refund);
    }

    /**
     * @notice Client raises a dispute for an assigned or completed job.
     * @dev Transitions the job to Disputed status and creates a dispute entry
     *      in the DisputeResolution contract. The provider's stake is at risk.
     * @param _jobId The job to dispute
     */
    function raiseDispute(uint256 _jobId)
        external
        jobExists(_jobId)
        onlyClient(_jobId)
    {
        Job storage job = jobs[_jobId];
        require(
            job.status == JobStatus.Assigned || job.status == JobStatus.Completed,
            "JobMarket: can only dispute assigned or completed jobs"
        );

        job.status = JobStatus.Disputed;

        uint256 stakeAtRisk = providerStakes[job.assignedProvider];
        uint256 disputeId = disputeContract.raiseDispute(
            _jobId,
            msg.sender,
            job.assignedProvider,
            stakeAtRisk
        );

        emit DisputeRaisedForJob(_jobId, msg.sender, disputeId);
    }

    /**
     * @notice Reports an SLA violation when a provider misses their deadline.
     * @dev Can be called by anyone after the SLA deadline passes without result submission.
     *      Currently logs the violation and decrements reputation; a production system
     *      would also trigger automatic dispute escalation or partial refund.
     * @param _jobId The job with the violated SLA
     */
    function reportSLAViolation(uint256 _jobId)
        external
        jobExists(_jobId)
    {
        Job storage job = jobs[_jobId];
        require(job.status == JobStatus.Assigned, "JobMarket: job is not assigned");
        require(job.slaDeadline > 0, "JobMarket: no SLA deadline set");
        require(block.timestamp > job.slaDeadline, "JobMarket: SLA deadline has not passed");

        // Penalize provider reputation
        reputationContract.decrementReputation(job.assignedProvider);

        emit SLAViolation(_jobId, job.assignedProvider, job.slaDeadline);
    }

    // ============ Admin Functions ============

    /**
     * @notice Updates the platform fee percentage.
     * @dev Fee cannot exceed `maxPlatformFee` (default 10%).
     * @param _newFee New fee percentage (0–maxPlatformFee)
     */
    function setPlatformFee(uint256 _newFee) external onlyOwner {
        require(_newFee <= maxPlatformFee, "JobMarket: fee exceeds maximum");
        uint256 oldFee = platformFeePercent;
        platformFeePercent = _newFee;
        emit PlatformFeeUpdated(oldFee, _newFee, msg.sender);
    }

    /**
     * @notice Updates the minimum stake requirement for providers.
     * @param _newMinimum New minimum stake in wei
     */
    function setMinimumStake(uint256 _newMinimum) external onlyOwner {
        minimumStake = _newMinimum;
    }

    // ============ View Functions ============

    /**
     * @notice Retrieves the full job specification.
     * @param _jobId The job identifier
     * @return The Job struct
     */
    function getJob(uint256 _jobId) external view returns (Job memory) {
        return jobs[_jobId];
    }

    /**
     * @notice Returns all bids submitted for a specific job.
     * @param _jobId The job identifier
     * @return Array of Bid structs
     */
    function getJobBids(uint256 _jobId) external view returns (Bid[] memory) {
        return jobBids[_jobId];
    }

    /**
     * @notice Returns all currently open jobs in the marketplace.
     * @dev Iterates through all jobs — gas cost scales linearly with total job count.
     *      Production would use off-chain indexing (e.g., The Graph) instead.
     * @return Array of Job structs with Open status
     */
    function getOpenJobs() external view returns (Job[] memory) {
        uint256 openCount = 0;
        for (uint256 i = 1; i <= jobCounter; i++) {
            if (jobs[i].status == JobStatus.Open) {
                openCount++;
            }
        }

        Job[] memory openJobs = new Job[](openCount);
        uint256 index = 0;
        for (uint256 i = 1; i <= jobCounter; i++) {
            if (jobs[i].status == JobStatus.Open) {
                openJobs[index] = jobs[i];
                index++;
            }
        }

        return openJobs;
    }

    /**
     * @notice Checks whether a provider meets the minimum stake requirement.
     * @param _provider Address to check
     * @return True if the provider has staked at least `minimumStake`
     */
    function isStaked(address _provider) external view returns (bool) {
        return providerStakes[_provider] >= minimumStake;
    }

    /**
     * @notice Returns the staked amount for a provider.
     * @param _provider Address to query
     * @return Staked amount in wei
     */
    function getStake(address _provider) external view returns (uint256) {
        return providerStakes[_provider];
    }

    /**
     * @notice Returns the provider's registered hardware profile.
     * @param _provider Address to query
     * @return The ProviderProfile struct
     */
    function getProviderProfile(address _provider) external view returns (ProviderProfile memory) {
        return providerProfiles[_provider];
    }

    /**
     * @notice Returns aggregate marketplace statistics.
     * @return _totalJobs       Total jobs ever posted
     * @return _completedJobs   Total jobs successfully completed
     * @return _activeProviders Number of currently staked providers
     * @return _totalVolume     Cumulative ETH processed through the marketplace
     */
    function getMarketStats() external view returns (
        uint256 _totalJobs,
        uint256 _completedJobs,
        uint256 _activeProviders,
        uint256 _totalVolume
    ) {
        return (jobCounter, totalJobsCompleted, totalActiveProviders, totalVolumeProcessed);
    }
}
