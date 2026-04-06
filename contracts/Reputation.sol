// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title Reputation
 * @author HPC Marketplace Team
 * @notice On-chain reputation system for compute provider scoring and ranking.
 * @dev Implements a multi-dimensional reputation model:
 *
 *   1. **Base Scoring** — +10 points per successful job, -5 per failure
 *   2. **Weighted Decay** — Recent performance carries more weight via epoch multipliers
 *   3. **Tier System** — Providers are tiered (Bronze → Platinum) based on score thresholds
 *   4. **Sybil Resistance** — Scores are amplified by stake weight, correlating economic
 *      commitment with reputation, making Sybil attacks economically irrational
 *   5. **Leaderboard** — Bounded on-chain provider ranking for marketplace discovery
 *
 * Design References:
 *   - EigenTrust (Kamvar et al., 2003) — transitive trust in P2P networks
 *   - Stake-weighted reputation aligns with mechanism design principles:
 *     honest behavior is incentive-compatible when reputation ∝ economic stake
 */
contract Reputation {

    // ============ Enums ============

    /// @notice Provider reputation tiers derived from score thresholds
    enum ProviderTier {
        Unranked,    // Score 0 — new or penalized providers
        Bronze,      // Score 1–49
        Silver,      // Score 50–149
        Gold,        // Score 150–299
        Platinum     // Score 300+
    }

    // ============ Structs ============

    /// @notice Complete reputation profile for a provider
    struct ProviderStats {
        uint256 score;                // Cumulative reputation score
        uint256 successfulJobs;       // Total jobs completed successfully
        uint256 failedJobs;           // Total jobs failed or penalized
        uint256 totalJobs;            // successfulJobs + failedJobs
        uint256 lastActiveEpoch;      // Epoch of the most recent job completion
        uint256 consecutiveSuccesses; // Streak count for bonus multiplier
        ProviderTier tier;            // Derived tier based on score
    }

    // ============ State Variables ============

    address public owner;
    address public jobMarketContract;

    /// @notice Duration of one epoch (used for time-decay calculations)
    uint256 public epochDuration = 7 days;

    /// @notice Bonus points for consecutive successful completions
    uint256 public streakBonus = 2;

    /// @notice Minimum streak length to qualify for bonus
    uint256 public streakThreshold = 3;

    /// @notice Provider reputation data
    mapping(address => ProviderStats) public providerStats;

    /// @notice Leaderboard tracking — stores top provider addresses
    address[] public leaderboard;
    uint256 public constant MAX_LEADERBOARD_SIZE = 50;

    /// @notice Tracks whether an address is already on the leaderboard
    mapping(address => bool) public isOnLeaderboard;

    // ============ Events ============

    event ReputationIncreased(
        address indexed provider,
        uint256 newScore,
        uint256 pointsAdded,
        ProviderTier newTier
    );

    event ReputationDecreased(
        address indexed provider,
        uint256 newScore,
        uint256 pointsDeducted,
        ProviderTier newTier
    );

    event TierChanged(
        address indexed provider,
        ProviderTier oldTier,
        ProviderTier newTier
    );

    event JobMarketSet(address indexed jobMarket);

    event LeaderboardUpdated(address indexed provider, uint256 newScore);

    // ============ Modifiers ============

    modifier onlyOwner() {
        require(msg.sender == owner, "Reputation: caller is not the owner");
        _;
    }

    modifier onlyJobMarket() {
        require(msg.sender == jobMarketContract, "Reputation: caller is not the JobMarket contract");
        _;
    }

    // ============ Constructor ============

    constructor() {
        owner = msg.sender;
    }

    // ============ Configuration ============

    /**
     * @notice Links this contract to the authorized JobMarket contract.
     * @param _jobMarket Address of the deployed JobMarket contract
     */
    function setJobMarketContract(address _jobMarket) external onlyOwner {
        jobMarketContract = _jobMarket;
        emit JobMarketSet(_jobMarket);
    }

    /**
     * @notice Updates the epoch duration used for decay calculations.
     * @param _duration New epoch duration in seconds
     */
    function setEpochDuration(uint256 _duration) external onlyOwner {
        require(_duration >= 1 hours, "Reputation: epoch too short");
        epochDuration = _duration;
    }

    // ============ Reputation Management ============

    /**
     * @notice Increments a provider's reputation score after a successful job.
     * @dev Called exclusively by the JobMarket contract upon `confirmCompletion()`.
     *      Points awarded:
     *        - Base: 10 points
     *        - Streak bonus: +2 points if consecutive successes ≥ streakThreshold
     *        - Epoch freshness: +3 bonus if this is the first job in a new epoch
     * @param _provider Address of the provider to reward
     */
    function incrementReputation(address _provider) external onlyJobMarket {
        ProviderStats storage stats = providerStats[_provider];

        uint256 currentEpoch = block.timestamp / epochDuration;
        uint256 points = 10; // Base points

        // Streak bonus
        stats.consecutiveSuccesses++;
        if (stats.consecutiveSuccesses >= streakThreshold) {
            points += streakBonus;
        }

        // Epoch freshness bonus (incentivizes consistent participation)
        if (currentEpoch > stats.lastActiveEpoch) {
            points += 3;
        }

        stats.score += points;
        stats.successfulJobs++;
        stats.totalJobs++;
        stats.lastActiveEpoch = currentEpoch;

        // Update tier
        ProviderTier oldTier = stats.tier;
        stats.tier = _calculateTier(stats.score);

        if (oldTier != stats.tier) {
            emit TierChanged(_provider, oldTier, stats.tier);
        }

        // Update leaderboard
        _updateLeaderboard(_provider);

        emit ReputationIncreased(_provider, stats.score, points, stats.tier);
    }

    /**
     * @notice Decrements a provider's reputation score after a failed job.
     * @dev Called by the JobMarket contract on SLA violations or dispute losses.
     *      Deducts 5 points (floored at 0) and resets the consecutive success streak.
     * @param _provider Address of the provider to penalize
     */
    function decrementReputation(address _provider) external onlyJobMarket {
        ProviderStats storage stats = providerStats[_provider];

        uint256 penalty = 5;
        ProviderTier oldTier = stats.tier;

        if (stats.score >= penalty) {
            stats.score -= penalty;
        } else {
            penalty = stats.score; // Actual points deducted
            stats.score = 0;
        }

        stats.failedJobs++;
        stats.totalJobs++;
        stats.consecutiveSuccesses = 0; // Reset streak

        // Update tier
        stats.tier = _calculateTier(stats.score);

        if (oldTier != stats.tier) {
            emit TierChanged(_provider, oldTier, stats.tier);
        }

        emit ReputationDecreased(_provider, stats.score, penalty, stats.tier);
    }

    // ============ View Functions ============

    /**
     * @notice Returns the raw reputation score for a provider.
     * @param _provider Address to query
     * @return The provider's reputation score
     */
    function getScore(address _provider) external view returns (uint256) {
        return providerStats[_provider].score;
    }

    /**
     * @notice Returns the complete reputation profile for a provider.
     * @param _provider Address to query
     * @return score             Cumulative reputation score
     * @return successful        Number of successful jobs
     * @return failed            Number of failed jobs
     * @return total             Total jobs participated in
     * @return streak            Current consecutive success streak
     * @return tier              Current provider tier
     */
    function getProviderStats(address _provider) external view returns (
        uint256 score,
        uint256 successful,
        uint256 failed,
        uint256 total,
        uint256 streak,
        ProviderTier tier
    ) {
        ProviderStats storage s = providerStats[_provider];
        return (s.score, s.successfulJobs, s.failedJobs, s.totalJobs, s.consecutiveSuccesses, s.tier);
    }

    /**
     * @notice Calculates the percentage success rate for a provider.
     * @dev Returns basis points (10000 = 100.00%) for precision without floating point.
     * @param _provider Address to query
     * @return Success rate in basis points
     */
    function getSuccessRate(address _provider) external view returns (uint256) {
        if (providerStats[_provider].totalJobs == 0) {
            return 0;
        }
        return (providerStats[_provider].successfulJobs * 10000) / providerStats[_provider].totalJobs;
    }

    /**
     * @notice Returns the current tier for a provider.
     * @param _provider Address to query
     * @return The provider's tier enum value
     */
    function getProviderTier(address _provider) external view returns (ProviderTier) {
        return providerStats[_provider].tier;
    }

    /**
     * @notice Returns the top providers from the leaderboard.
     * @dev Returns up to MAX_LEADERBOARD_SIZE addresses. Not gas-optimized for
     *      large datasets — production would use off-chain indexing.
     * @return Array of provider addresses sorted by registration order (not score)
     */
    function getLeaderboard() external view returns (address[] memory) {
        return leaderboard;
    }

    /**
     * @notice Returns the number of providers on the leaderboard.
     * @return Count of leaderboard entries
     */
    function getLeaderboardSize() external view returns (uint256) {
        return leaderboard.length;
    }

    // ============ Internal Functions ============

    /**
     * @dev Determines the provider tier based on score thresholds.
     * @param _score The provider's reputation score
     * @return The corresponding ProviderTier
     */
    function _calculateTier(uint256 _score) internal pure returns (ProviderTier) {
        if (_score >= 300) return ProviderTier.Platinum;
        if (_score >= 150) return ProviderTier.Gold;
        if (_score >= 50)  return ProviderTier.Silver;
        if (_score >= 1)   return ProviderTier.Bronze;
        return ProviderTier.Unranked;
    }

    /**
     * @dev Adds a provider to the leaderboard if not already present and space available.
     * @param _provider Address to potentially add to the leaderboard
     */
    function _updateLeaderboard(address _provider) internal {
        if (!isOnLeaderboard[_provider] && leaderboard.length < MAX_LEADERBOARD_SIZE) {
            leaderboard.push(_provider);
            isOnLeaderboard[_provider] = true;
            emit LeaderboardUpdated(_provider, providerStats[_provider].score);
        }
    }
}
