// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title DisputeResolution
 * @author HPC Marketplace Team
 * @notice Implements a multi-phase arbitration protocol for resolving compute job disputes.
 * @dev Dispute lifecycle: Raised → Evidence Collection → Arbitration → Resolved.
 *      Time-locked escalation ensures disputes don't stall indefinitely.
 *      Slashing mechanics penalize the losing party to discourage frivolous disputes.
 *
 * Design Rationale:
 *   - Evidence submission is on-chain (hash references) to maintain an immutable audit trail.
 *   - The grace period model follows optimistic rollup patterns: results are accepted unless
 *     challenged within a configurable window, minimizing on-chain overhead for honest actors.
 *   - Arbitration is currently owner-controlled (suitable for prototype/testnet deployment);
 *     production would extend to a decentralized arbitration panel (e.g., Kleros-style).
 */
contract DisputeResolution is ReentrancyGuard {

    // ============ Enums ============

    /// @notice Lifecycle stages of a dispute
    enum DisputeStatus {
        None,               // No dispute exists
        Raised,             // Dispute has been initiated by the client
        EvidencePeriod,     // Both parties may submit evidence hashes
        UnderArbitration,   // Arbitration panel is reviewing
        ResolvedClient,     // Resolved in favor of the client (refund)
        ResolvedProvider,   // Resolved in favor of the provider (payment released)
        Expired             // Dispute window expired without action — defaults to provider
    }

    // ============ Structs ============

    /// @notice Encapsulates the full state of a single dispute
    struct Dispute {
        uint256 jobId;                  // References the JobMarket job ID
        address client;                 // The party that raised the dispute
        address provider;               // The provider being disputed
        DisputeStatus status;           // Current lifecycle stage
        uint256 raisedAt;               // Block timestamp when dispute was created
        uint256 evidenceDeadline;       // Timestamp after which no more evidence is accepted
        uint256 resolutionDeadline;     // Timestamp after which dispute auto-resolves
        string clientEvidenceHash;      // IPFS hash of client-submitted evidence
        string providerEvidenceHash;    // IPFS hash of provider-submitted evidence
        uint256 stakeAtRisk;            // Amount of stake that can be slashed
        string arbitratorReason;        // On-chain reason string from the arbitrator
    }

    // ============ State Variables ============

    address public owner;
    address public jobMarketContract;

    /// @notice Duration (in seconds) during which evidence can be submitted
    uint256 public evidencePeriodDuration = 3 days;

    /// @notice Duration (in seconds) for the arbitration panel to render a decision
    uint256 public arbitrationDuration = 5 days;

    /// @notice Percentage of stake slashed from the losing party (basis points, e.g., 1000 = 10%)
    uint256 public slashPercentBps = 1000;

    /// @notice Auto-incrementing dispute identifier
    uint256 public disputeCounter;

    /// @notice Mapping from dispute ID to Dispute struct
    mapping(uint256 => Dispute) public disputes;

    /// @notice Mapping from job ID to dispute ID for quick lookup
    mapping(uint256 => uint256) public jobToDispute;

    /// @notice Tracks accumulated slashed funds available for redistribution
    uint256 public slashedFundsPool;

    // ============ Events ============

    event DisputeRaised(
        uint256 indexed disputeId,
        uint256 indexed jobId,
        address indexed client,
        address provider,
        uint256 evidenceDeadline
    );

    event EvidenceSubmitted(
        uint256 indexed disputeId,
        address indexed submitter,
        string evidenceHash,
        bool isClient
    );

    event DisputeResolved(
        uint256 indexed disputeId,
        uint256 indexed jobId,
        DisputeStatus resolution,
        string reason
    );

    event StakeSlashed(
        address indexed party,
        uint256 amount,
        uint256 indexed disputeId
    );

    event DisputeEscalated(
        uint256 indexed disputeId,
        DisputeStatus newStatus
    );

    // ============ Modifiers ============

    modifier onlyOwner() {
        require(msg.sender == owner, "DisputeResolution: caller is not the owner");
        _;
    }

    modifier onlyJobMarket() {
        require(msg.sender == jobMarketContract, "DisputeResolution: caller is not JobMarket");
        _;
    }

    modifier disputeExists(uint256 _disputeId) {
        require(_disputeId > 0 && _disputeId <= disputeCounter, "DisputeResolution: dispute does not exist");
        _;
    }

    // ============ Constructor ============

    /// @param _owner Address of the contract administrator / arbitration authority
    constructor(address _owner) {
        owner = _owner;
    }

    // ============ Configuration ============

    /// @notice Links this contract to the JobMarket contract (one-time setup)
    /// @param _jobMarket Address of the deployed JobMarket contract
    function setJobMarketContract(address _jobMarket) external onlyOwner {
        jobMarketContract = _jobMarket;
    }

    /// @notice Updates the evidence submission window duration
    /// @param _duration New duration in seconds
    function setEvidencePeriodDuration(uint256 _duration) external onlyOwner {
        require(_duration >= 1 hours, "DisputeResolution: duration too short");
        evidencePeriodDuration = _duration;
    }

    /// @notice Updates the slash percentage applied to losing parties
    /// @param _bps New slash rate in basis points (100 bps = 1%)
    function setSlashPercent(uint256 _bps) external onlyOwner {
        require(_bps <= 5000, "DisputeResolution: slash rate exceeds 50%");
        slashPercentBps = _bps;
    }

    // ============ Dispute Lifecycle ============

    /**
     * @notice Initiates a new dispute for a given job.
     * @dev Called by the JobMarket contract when a client raises a dispute.
     *      The function does NOT transfer funds — the JobMarket contract holds escrow.
     * @param _jobId       The job ID from the JobMarket contract
     * @param _client      Address of the disputing client
     * @param _provider    Address of the provider being disputed
     * @param _stakeAtRisk Amount of provider stake that could be slashed
     * @return disputeId   The newly created dispute's identifier
     */
    function raiseDispute(
        uint256 _jobId,
        address _client,
        address _provider,
        uint256 _stakeAtRisk
    ) external onlyJobMarket returns (uint256) {
        require(jobToDispute[_jobId] == 0, "DisputeResolution: dispute already exists for this job");

        disputeCounter++;
        uint256 evidenceDeadline = block.timestamp + evidencePeriodDuration;
        uint256 resolutionDeadline = evidenceDeadline + arbitrationDuration;

        disputes[disputeCounter] = Dispute({
            jobId: _jobId,
            client: _client,
            provider: _provider,
            status: DisputeStatus.Raised,
            raisedAt: block.timestamp,
            evidenceDeadline: evidenceDeadline,
            resolutionDeadline: resolutionDeadline,
            clientEvidenceHash: "",
            providerEvidenceHash: "",
            stakeAtRisk: _stakeAtRisk,
            arbitratorReason: ""
        });

        jobToDispute[_jobId] = disputeCounter;

        emit DisputeRaised(disputeCounter, _jobId, _client, _provider, evidenceDeadline);

        return disputeCounter;
    }

    /**
     * @notice Submits evidence for an active dispute.
     * @dev Evidence is stored as an IPFS content hash. Only the client or provider
     *      involved in the dispute may submit, and only before the evidence deadline.
     * @param _disputeId   The dispute to submit evidence for
     * @param _evidenceHash IPFS hash pointing to the evidence document/data
     */
    function submitEvidence(
        uint256 _disputeId,
        string calldata _evidenceHash
    ) external disputeExists(_disputeId) {
        Dispute storage dispute = disputes[_disputeId];

        require(
            dispute.status == DisputeStatus.Raised || dispute.status == DisputeStatus.EvidencePeriod,
            "DisputeResolution: dispute not accepting evidence"
        );
        require(block.timestamp <= dispute.evidenceDeadline, "DisputeResolution: evidence period has ended");
        require(
            msg.sender == dispute.client || msg.sender == dispute.provider,
            "DisputeResolution: caller is not a party to this dispute"
        );

        bool isClient = (msg.sender == dispute.client);

        if (isClient) {
            dispute.clientEvidenceHash = _evidenceHash;
        } else {
            dispute.providerEvidenceHash = _evidenceHash;
        }

        // Transition to EvidencePeriod on first evidence submission
        if (dispute.status == DisputeStatus.Raised) {
            dispute.status = DisputeStatus.EvidencePeriod;
        }

        emit EvidenceSubmitted(_disputeId, msg.sender, _evidenceHash, isClient);
    }

    /**
     * @notice Escalates a dispute to arbitration after the evidence period ends.
     * @dev Can be called by anyone — this is a permissionless state transition
     *      that merely moves the dispute from EvidencePeriod to UnderArbitration.
     * @param _disputeId The dispute to escalate
     */
    function escalateToArbitration(uint256 _disputeId) external disputeExists(_disputeId) {
        Dispute storage dispute = disputes[_disputeId];

        require(
            dispute.status == DisputeStatus.Raised || dispute.status == DisputeStatus.EvidencePeriod,
            "DisputeResolution: cannot escalate from current status"
        );
        require(
            block.timestamp > dispute.evidenceDeadline,
            "DisputeResolution: evidence period has not ended yet"
        );

        dispute.status = DisputeStatus.UnderArbitration;

        emit DisputeEscalated(_disputeId, DisputeStatus.UnderArbitration);
    }

    /**
     * @notice Arbitrator resolves the dispute in favor of one party.
     * @dev Only the contract owner (acting as arbitrator) can call this.
     *      In production, this would be replaced by a multi-sig or DAO vote.
     * @param _disputeId   The dispute to resolve
     * @param _favorClient True to resolve in favor of client, false for provider
     * @param _reason      On-chain justification string for the decision
     */
    function resolveDispute(
        uint256 _disputeId,
        bool _favorClient,
        string calldata _reason
    ) external onlyOwner disputeExists(_disputeId) nonReentrant {
        Dispute storage dispute = disputes[_disputeId];

        require(
            dispute.status == DisputeStatus.UnderArbitration ||
            dispute.status == DisputeStatus.EvidencePeriod ||
            dispute.status == DisputeStatus.Raised,
            "DisputeResolution: dispute not resolvable"
        );

        if (_favorClient) {
            dispute.status = DisputeStatus.ResolvedClient;
        } else {
            dispute.status = DisputeStatus.ResolvedProvider;
        }

        dispute.arbitratorReason = _reason;

        // Calculate and track slashed amount
        uint256 slashAmount = (dispute.stakeAtRisk * slashPercentBps) / 10000;
        if (slashAmount > 0) {
            slashedFundsPool += slashAmount;
            address losingParty = _favorClient ? dispute.provider : dispute.client;
            emit StakeSlashed(losingParty, slashAmount, _disputeId);
        }

        emit DisputeResolved(_disputeId, dispute.jobId, dispute.status, _reason);
    }

    /**
     * @notice Auto-resolves an expired dispute in favor of the provider.
     * @dev If the resolution deadline passes without arbitrator action,
     *      anyone can trigger this to resolve in the provider's favor.
     *      This follows the "optimistic" pattern used in rollup dispute systems.
     * @param _disputeId The dispute to auto-resolve
     */
    function autoResolveExpired(uint256 _disputeId) external disputeExists(_disputeId) {
        Dispute storage dispute = disputes[_disputeId];

        require(
            dispute.status != DisputeStatus.ResolvedClient &&
            dispute.status != DisputeStatus.ResolvedProvider &&
            dispute.status != DisputeStatus.Expired,
            "DisputeResolution: dispute already resolved"
        );
        require(
            block.timestamp > dispute.resolutionDeadline,
            "DisputeResolution: resolution deadline has not passed"
        );

        dispute.status = DisputeStatus.Expired;

        emit DisputeResolved(
            _disputeId,
            dispute.jobId,
            DisputeStatus.Expired,
            "Auto-resolved: arbitration deadline exceeded"
        );
    }

    // ============ View Functions ============

    /**
     * @notice Retrieves the full dispute struct for a given dispute ID.
     * @param _disputeId The dispute identifier
     * @return The Dispute struct
     */
    function getDispute(uint256 _disputeId) external view returns (Dispute memory) {
        return disputes[_disputeId];
    }

    /**
     * @notice Looks up the dispute ID associated with a job.
     * @param _jobId The job identifier from JobMarket
     * @return The dispute ID (0 if no dispute exists)
     */
    function getDisputeByJob(uint256 _jobId) external view returns (uint256) {
        return jobToDispute[_jobId];
    }

    /**
     * @notice Checks whether a dispute is still within its evidence submission window.
     * @param _disputeId The dispute identifier
     * @return True if evidence can still be submitted
     */
    function isInEvidencePeriod(uint256 _disputeId) external view returns (bool) {
        Dispute storage dispute = disputes[_disputeId];
        return (
            (dispute.status == DisputeStatus.Raised || dispute.status == DisputeStatus.EvidencePeriod) &&
            block.timestamp <= dispute.evidenceDeadline
        );
    }

    /**
     * @notice Returns whether a dispute has been finalized (resolved or expired).
     * @param _disputeId The dispute identifier
     * @return True if the dispute reached a terminal state
     */
    function isResolved(uint256 _disputeId) external view returns (bool) {
        DisputeStatus s = disputes[_disputeId].status;
        return (
            s == DisputeStatus.ResolvedClient ||
            s == DisputeStatus.ResolvedProvider ||
            s == DisputeStatus.Expired
        );
    }
}
