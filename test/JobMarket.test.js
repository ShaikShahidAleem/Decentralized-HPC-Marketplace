const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("HPC Marketplace — Core Contract Suite", function () {
    let jobMarket;
    let reputation;
    let disputeResolution;
    let governance;
    let owner;
    let client;
    let provider1;
    let provider2;
    let arbitrator;

    const ONE_ETH = ethers.parseEther("1");
    const HALF_ETH = ethers.parseEther("0.5");
    const STAKE_AMOUNT = ethers.parseEther("0.1");

    // ComputeTier enum values
    const TIER = { CPU_STANDARD: 0, GPU_BASIC: 1, GPU_PRO: 2, HPC_CLUSTER: 3 };

    // Helper: get current blockchain timestamp (works even after evm_increaseTime)
    async function futureDeadline(offsetSeconds = 86400) {
        const block = await ethers.provider.getBlock("latest");
        return block.timestamp + offsetSeconds;
    }

    beforeEach(async function () {
        [owner, client, provider1, provider2, arbitrator] = await ethers.getSigners();

        // Deploy Reputation
        const Reputation = await ethers.getContractFactory("Reputation");
        reputation = await Reputation.deploy();
        await reputation.waitForDeployment();

        // Deploy DisputeResolution
        const DisputeResolution = await ethers.getContractFactory("DisputeResolution");
        disputeResolution = await DisputeResolution.deploy(owner.address);
        await disputeResolution.waitForDeployment();

        // Deploy JobMarket (depends on Reputation + DisputeResolution)
        const JobMarket = await ethers.getContractFactory("JobMarket");
        jobMarket = await JobMarket.deploy(
            await reputation.getAddress(),
            await disputeResolution.getAddress()
        );
        await jobMarket.waitForDeployment();

        // Link contracts
        await reputation.setJobMarketContract(await jobMarket.getAddress());
        await disputeResolution.setJobMarketContract(await jobMarket.getAddress());
    });

    // ═══════════════════════════════════════════════════════════
    //  DEPLOYMENT TESTS
    // ═══════════════════════════════════════════════════════════

    describe("Contract Deployment", function () {
        it("Should set the correct owner for all contracts", async function () {
            expect(await jobMarket.owner()).to.equal(owner.address);
            expect(await reputation.owner()).to.equal(owner.address);
            expect(await disputeResolution.owner()).to.equal(owner.address);
        });

        it("Should link Reputation ↔ JobMarket correctly", async function () {
            expect(await reputation.jobMarketContract()).to.equal(await jobMarket.getAddress());
        });

        it("Should link DisputeResolution ↔ JobMarket correctly", async function () {
            expect(await disputeResolution.jobMarketContract()).to.equal(await jobMarket.getAddress());
        });

        it("Should initialize with zero jobs", async function () {
            expect(await jobMarket.jobCounter()).to.equal(0);
        });

        it("Should initialize with default platform fee of 2%", async function () {
            expect(await jobMarket.platformFeePercent()).to.equal(2);
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  PROVIDER STAKING
    // ═══════════════════════════════════════════════════════════

    describe("Provider Registration & Staking", function () {
        it("Should allow provider to stake with hardware profile", async function () {
            await expect(
                jobMarket.connect(provider1).stakeAsProvider(
                    TIER.GPU_BASIC, 16, 8192, 32768,
                    { value: STAKE_AMOUNT }
                )
            ).to.emit(jobMarket, "ProviderStaked")
                .withArgs(provider1.address, STAKE_AMOUNT, TIER.GPU_BASIC);

            expect(await jobMarket.getStake(provider1.address)).to.equal(STAKE_AMOUNT);
        });

        it("Should store provider hardware profile correctly", async function () {
            await jobMarket.connect(provider1).stakeAsProvider(
                TIER.GPU_PRO, 32, 24576, 65536,
                { value: STAKE_AMOUNT }
            );

            const profile = await jobMarket.getProviderProfile(provider1.address);
            expect(profile.tier).to.equal(TIER.GPU_PRO);
            expect(profile.cpuCores).to.equal(32);
            expect(profile.gpuVRAM).to.equal(24576);
            expect(profile.ramMB).to.equal(65536);
            expect(profile.isRegistered).to.be.true;
        });

        it("Should verify staked status", async function () {
            await jobMarket.connect(provider1).stakeAsProvider(
                TIER.CPU_STANDARD, 8, 0, 16384,
                { value: STAKE_AMOUNT }
            );
            expect(await jobMarket.isStaked(provider1.address)).to.be.true;
        });

        it("Should allow unstaking with re-registration logic", async function () {
            await jobMarket.connect(provider1).stakeAsProvider(
                TIER.CPU_STANDARD, 8, 0, 16384,
                { value: STAKE_AMOUNT }
            );

            await expect(jobMarket.connect(provider1).unstake(STAKE_AMOUNT))
                .to.emit(jobMarket, "ProviderUnstaked")
                .withArgs(provider1.address, STAKE_AMOUNT);

            expect(await jobMarket.isStaked(provider1.address)).to.be.false;
        });

        it("Should increment active provider count on new registrations", async function () {
            await jobMarket.connect(provider1).stakeAsProvider(
                TIER.CPU_STANDARD, 8, 0, 16384, { value: STAKE_AMOUNT }
            );
            await jobMarket.connect(provider2).stakeAsProvider(
                TIER.GPU_BASIC, 16, 8192, 32768, { value: STAKE_AMOUNT }
            );

            expect(await jobMarket.totalActiveProviders()).to.equal(2);
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  JOB POSTING
    // ═══════════════════════════════════════════════════════════

    describe("Job Posting with Compute Tiers", function () {
        it("Should allow client to post a job with compute tier", async function () {
            const deadline = await futureDeadline();

            await expect(jobMarket.connect(client).postJob(
                "QmTestDataHash",
                "Train Transformer Model v4 — 100M parameters",
                deadline,
                TIER.GPU_PRO,
                { value: ONE_ETH }
            )).to.emit(jobMarket, "JobPosted");

            expect(await jobMarket.jobCounter()).to.equal(1);
        });

        it("Should store job details including compute tier", async function () {
            const deadline = await futureDeadline();

            await jobMarket.connect(client).postJob(
                "QmTestDataHash",
                "Train ML model on ImageNet",
                deadline,
                TIER.GPU_BASIC,
                { value: ONE_ETH }
            );

            const job = await jobMarket.getJob(1);
            expect(job.id).to.equal(1);
            expect(job.client).to.equal(client.address);
            expect(job.budget).to.equal(ONE_ETH);
            expect(job.status).to.equal(0); // Open
            expect(job.requiredTier).to.equal(TIER.GPU_BASIC);
        });

        it("Should reject job with past deadline", async function () {
            const block = await ethers.provider.getBlock("latest");
            const pastDeadline = block.timestamp - 86400;
            await expect(jobMarket.connect(client).postJob(
                "QmTestDataHash",
                "Test job",
                pastDeadline,
                TIER.CPU_STANDARD,
                { value: ONE_ETH }
            )).to.be.revertedWith("JobMarket: deadline must be in the future");
        });

        it("Should reject job with no budget", async function () {
            const deadline = await futureDeadline();
            await expect(jobMarket.connect(client).postJob(
                "QmTestDataHash",
                "Test job",
                deadline,
                TIER.CPU_STANDARD,
                { value: 0 }
            )).to.be.revertedWith("JobMarket: must deposit budget as escrow");
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  BIDDING
    // ═══════════════════════════════════════════════════════════

    describe("Bidding with Tier Verification", function () {
        beforeEach(async function () {
            await jobMarket.connect(provider1).stakeAsProvider(
                TIER.GPU_PRO, 32, 24576, 65536, { value: STAKE_AMOUNT }
            );
            await jobMarket.connect(provider2).stakeAsProvider(
                TIER.CPU_STANDARD, 8, 0, 16384, { value: STAKE_AMOUNT }
            );

            const deadline = await futureDeadline();
            await jobMarket.connect(client).postJob(
                "QmTestDataHash", "GPU compute job",
                deadline, TIER.GPU_BASIC,
                { value: ONE_ETH }
            );
        });

        it("Should allow qualified provider to bid", async function () {
            await expect(jobMarket.connect(provider1).submitBid(1, HALF_ETH, 3600))
                .to.emit(jobMarket, "BidSubmitted")
                .withArgs(1, provider1.address, HALF_ETH, 3600);
        });

        it("Should reject bid from provider with insufficient tier", async function () {
            // provider2 is CPU_STANDARD, job requires GPU_BASIC
            await expect(jobMarket.connect(provider2).submitBid(1, HALF_ETH, 3600))
                .to.be.revertedWith("JobMarket: provider tier insufficient for this job");
        });

        it("Should reject bid from unstaked address", async function () {
            const unstaked = (await ethers.getSigners())[5];
            await expect(jobMarket.connect(unstaked).submitBid(1, HALF_ETH, 3600))
                .to.be.revertedWith("JobMarket: provider must stake minimum amount");
        });

        it("Should reject bid exceeding budget", async function () {
            await expect(jobMarket.connect(provider1).submitBid(1, ethers.parseEther("2"), 3600))
                .to.be.revertedWith("JobMarket: bid exceeds job budget");
        });

        it("Should reject duplicate bids from same provider", async function () {
            await jobMarket.connect(provider1).submitBid(1, HALF_ETH, 3600);
            await expect(jobMarket.connect(provider1).submitBid(1, HALF_ETH, 3600))
                .to.be.revertedWith("JobMarket: provider already bid on this job");
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  JOB ASSIGNMENT & SLA
    // ═══════════════════════════════════════════════════════════

    describe("Job Assignment with SLA", function () {
        beforeEach(async function () {
            await jobMarket.connect(provider1).stakeAsProvider(
                TIER.GPU_PRO, 32, 24576, 65536, { value: STAKE_AMOUNT }
            );

            const deadline = await futureDeadline();
            await jobMarket.connect(client).postJob(
                "QmTestDataHash", "Test job", deadline, TIER.CPU_STANDARD,
                { value: ONE_ETH }
            );

            await jobMarket.connect(provider1).submitBid(1, HALF_ETH, 7200); // 2 hours
        });

        it("Should allow client to accept bid and set SLA deadline", async function () {
            await expect(jobMarket.connect(client).acceptBid(1, provider1.address))
                .to.emit(jobMarket, "JobAssigned");

            const job = await jobMarket.getJob(1);
            expect(job.status).to.equal(1); // Assigned
            expect(job.assignedProvider).to.equal(provider1.address);
            expect(job.slaDeadline).to.be.gt(0); // SLA deadline should be set
        });

        it("Should reject non-client from accepting bids", async function () {
            await expect(jobMarket.connect(provider1).acceptBid(1, provider1.address))
                .to.be.revertedWith("JobMarket: caller is not the job client");
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  RESULT SUBMISSION & PAYMENT
    // ═══════════════════════════════════════════════════════════

    describe("Result Submission & Payment Release", function () {
        beforeEach(async function () {
            await jobMarket.connect(provider1).stakeAsProvider(
                TIER.GPU_PRO, 32, 24576, 65536, { value: STAKE_AMOUNT }
            );

            const deadline = await futureDeadline();
            await jobMarket.connect(client).postJob(
                "QmTestDataHash", "Test job", deadline, TIER.CPU_STANDARD,
                { value: ONE_ETH }
            );

            await jobMarket.connect(provider1).submitBid(1, HALF_ETH, 3600);
            await jobMarket.connect(client).acceptBid(1, provider1.address);
        });

        it("Should allow assigned provider to submit result", async function () {
            await expect(jobMarket.connect(provider1).submitResult(1, "QmResultHash"))
                .to.emit(jobMarket, "ResultSubmitted")
                .withArgs(1, provider1.address, "QmResultHash");
        });

        it("Should update job status to Completed on result submission", async function () {
            await jobMarket.connect(provider1).submitResult(1, "QmResultHash");

            const job = await jobMarket.getJob(1);
            expect(job.status).to.equal(2); // Completed
            expect(job.resultHash).to.equal("QmResultHash");
        });

        it("Should reject result from non-assigned provider", async function () {
            await expect(jobMarket.connect(provider2).submitResult(1, "QmResultHash"))
                .to.be.revertedWith("JobMarket: caller is not the assigned provider");
        });

        it("Should release payment on confirmation", async function () {
            await jobMarket.connect(provider1).submitResult(1, "QmResultHash");
            const balanceBefore = await ethers.provider.getBalance(provider1.address);

            await jobMarket.connect(client).confirmCompletion(1);

            const balanceAfter = await ethers.provider.getBalance(provider1.address);
            expect(balanceAfter).to.be.gt(balanceBefore);
        });

        it("Should emit JobCompleted event with fee breakdown", async function () {
            await jobMarket.connect(provider1).submitResult(1, "QmResultHash");

            await expect(jobMarket.connect(client).confirmCompletion(1))
                .to.emit(jobMarket, "JobCompleted");
        });

        it("Should update provider reputation on completion", async function () {
            await jobMarket.connect(provider1).submitResult(1, "QmResultHash");
            await jobMarket.connect(client).confirmCompletion(1);

            const stats = await reputation.getProviderStats(provider1.address);
            expect(stats[0]).to.be.gte(10); // Score (10 base + potential bonuses)
            expect(stats[1]).to.equal(1);   // Successful jobs
        });

        it("Should update platform statistics", async function () {
            await jobMarket.connect(provider1).submitResult(1, "QmResultHash");
            await jobMarket.connect(client).confirmCompletion(1);

            const stats = await jobMarket.getMarketStats();
            expect(stats[0]).to.equal(1); // Total jobs
            expect(stats[1]).to.equal(1); // Completed jobs
            expect(stats[3]).to.be.gt(0); // Total volume
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  JOB CANCELLATION
    // ═══════════════════════════════════════════════════════════

    describe("Job Cancellation", function () {
        beforeEach(async function () {
            const deadline = await futureDeadline();
            await jobMarket.connect(client).postJob(
                "QmTestDataHash", "Test job", deadline, TIER.CPU_STANDARD,
                { value: ONE_ETH }
            );
        });

        it("Should allow client to cancel open job with full refund", async function () {
            const balanceBefore = await ethers.provider.getBalance(client.address);

            await expect(jobMarket.connect(client).cancelJob(1))
                .to.emit(jobMarket, "JobCancelled")
                .withArgs(1, client.address, ONE_ETH);

            const balanceAfter = await ethers.provider.getBalance(client.address);
            expect(balanceAfter).to.be.gt(balanceBefore);
        });

        it("Should reject cancellation of assigned job", async function () {
            await jobMarket.connect(provider1).stakeAsProvider(
                TIER.CPU_STANDARD, 8, 0, 16384, { value: STAKE_AMOUNT }
            );
            await jobMarket.connect(provider1).submitBid(1, HALF_ETH, 3600);
            await jobMarket.connect(client).acceptBid(1, provider1.address);

            await expect(jobMarket.connect(client).cancelJob(1))
                .to.be.revertedWith("JobMarket: can only cancel open jobs");
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  DISPUTE RESOLUTION
    // ═══════════════════════════════════════════════════════════

    describe("Dispute Resolution", function () {
        beforeEach(async function () {
            await jobMarket.connect(provider1).stakeAsProvider(
                TIER.GPU_PRO, 32, 24576, 65536, { value: STAKE_AMOUNT }
            );

            const deadline = await futureDeadline();
            await jobMarket.connect(client).postJob(
                "QmTestDataHash", "Disputed compute job", deadline, TIER.CPU_STANDARD,
                { value: ONE_ETH }
            );

            await jobMarket.connect(provider1).submitBid(1, HALF_ETH, 3600);
            await jobMarket.connect(client).acceptBid(1, provider1.address);
        });

        it("Should allow client to raise dispute on assigned job", async function () {
            await expect(jobMarket.connect(client).raiseDispute(1))
                .to.emit(jobMarket, "DisputeRaisedForJob");

            const job = await jobMarket.getJob(1);
            expect(job.status).to.equal(5); // Disputed
        });

        it("Should create dispute entry in DisputeResolution contract", async function () {
            await jobMarket.connect(client).raiseDispute(1);

            const disputeId = await disputeResolution.getDisputeByJob(1);
            expect(disputeId).to.equal(1);

            const dispute = await disputeResolution.getDispute(disputeId);
            expect(dispute.client).to.equal(client.address);
            expect(dispute.provider).to.equal(provider1.address);
        });

        it("Should allow evidence submission during evidence period", async function () {
            await jobMarket.connect(client).raiseDispute(1);
            const disputeId = await disputeResolution.getDisputeByJob(1);

            await expect(
                disputeResolution.connect(client).submitEvidence(disputeId, "QmClientEvidenceHash")
            ).to.emit(disputeResolution, "EvidenceSubmitted");

            await expect(
                disputeResolution.connect(provider1).submitEvidence(disputeId, "QmProviderEvidenceHash")
            ).to.emit(disputeResolution, "EvidenceSubmitted");
        });

        it("Should allow arbitrator to resolve dispute", async function () {
            await jobMarket.connect(client).raiseDispute(1);
            const disputeId = await disputeResolution.getDisputeByJob(1);

            await expect(
                disputeResolution.connect(owner).resolveDispute(
                    disputeId, true, "Client provided valid evidence of incorrect computation"
                )
            ).to.emit(disputeResolution, "DisputeResolved");

            expect(await disputeResolution.isResolved(disputeId)).to.be.true;
        });

        it("Should reject dispute on open job", async function () {
            const deadline = await futureDeadline();
            await jobMarket.connect(client).postJob(
                "QmHash", "Open job", deadline, TIER.CPU_STANDARD, { value: ONE_ETH }
            );

            await expect(jobMarket.connect(client).raiseDispute(2))
                .to.be.revertedWith("JobMarket: can only dispute assigned or completed jobs");
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  REPUTATION SYSTEM
    // ═══════════════════════════════════════════════════════════

    describe("Reputation System — Tiers & Streaks", function () {
        beforeEach(async function () {
            await jobMarket.connect(provider1).stakeAsProvider(
                TIER.GPU_PRO, 32, 24576, 65536, { value: STAKE_AMOUNT }
            );
        });

        it("Should start providers as Unranked (tier 0)", async function () {
            const tier = await reputation.getProviderTier(provider1.address);
            expect(tier).to.equal(0); // Unranked
        });

        it("Should achieve Bronze tier after first successful job", async function () {
            const deadline = await futureDeadline();
            await jobMarket.connect(client).postJob(
                "QmHash", "Job", deadline, TIER.CPU_STANDARD, { value: ONE_ETH }
            );
            await jobMarket.connect(provider1).submitBid(1, HALF_ETH, 3600);
            await jobMarket.connect(client).acceptBid(1, provider1.address);
            await jobMarket.connect(provider1).submitResult(1, "QmResult");
            await jobMarket.connect(client).confirmCompletion(1);

            const tier = await reputation.getProviderTier(provider1.address);
            expect(tier).to.equal(1); // Bronze
        });

        it("Should track success rate correctly", async function () {
            const deadline = await futureDeadline();
            await jobMarket.connect(client).postJob(
                "QmHash", "Job", deadline, TIER.CPU_STANDARD, { value: ONE_ETH }
            );
            await jobMarket.connect(provider1).submitBid(1, HALF_ETH, 3600);
            await jobMarket.connect(client).acceptBid(1, provider1.address);
            await jobMarket.connect(provider1).submitResult(1, "QmResult");
            await jobMarket.connect(client).confirmCompletion(1);

            const rate = await reputation.getSuccessRate(provider1.address);
            expect(rate).to.equal(10000); // 100.00%
        });

        it("Should add provider to leaderboard after successful job", async function () {
            const deadline = await futureDeadline();
            await jobMarket.connect(client).postJob(
                "QmHash", "Job", deadline, TIER.CPU_STANDARD, { value: ONE_ETH }
            );
            await jobMarket.connect(provider1).submitBid(1, HALF_ETH, 3600);
            await jobMarket.connect(client).acceptBid(1, provider1.address);
            await jobMarket.connect(provider1).submitResult(1, "QmResult");
            await jobMarket.connect(client).confirmCompletion(1);

            const leaderboardSize = await reputation.getLeaderboardSize();
            expect(leaderboardSize).to.equal(1);
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  OPEN JOBS QUERY
    // ═══════════════════════════════════════════════════════════

    describe("Open Jobs Query", function () {
        it("Should return all open jobs", async function () {
            const deadline = await futureDeadline();

            await jobMarket.connect(client).postJob("H1", "J1", deadline, TIER.CPU_STANDARD, { value: ONE_ETH });
            await jobMarket.connect(client).postJob("H2", "J2", deadline, TIER.GPU_BASIC, { value: ONE_ETH });
            await jobMarket.connect(client).postJob("H3", "J3", deadline, TIER.GPU_PRO, { value: ONE_ETH });

            const openJobs = await jobMarket.getOpenJobs();
            expect(openJobs.length).to.equal(3);
        });

        it("Should exclude assigned jobs from open list", async function () {
            const deadline = await futureDeadline();

            await jobMarket.connect(client).postJob("H1", "J1", deadline, TIER.CPU_STANDARD, { value: ONE_ETH });
            await jobMarket.connect(client).postJob("H2", "J2", deadline, TIER.CPU_STANDARD, { value: ONE_ETH });

            await jobMarket.connect(provider1).stakeAsProvider(
                TIER.CPU_STANDARD, 8, 0, 16384, { value: STAKE_AMOUNT }
            );
            await jobMarket.connect(provider1).submitBid(1, HALF_ETH, 3600);
            await jobMarket.connect(client).acceptBid(1, provider1.address);

            const openJobs = await jobMarket.getOpenJobs();
            expect(openJobs.length).to.equal(1);
            expect(openJobs[0].id).to.equal(2);
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  ADMIN FUNCTIONS
    // ═══════════════════════════════════════════════════════════

    describe("Admin Functions", function () {
        it("Should allow owner to update platform fee", async function () {
            await expect(jobMarket.connect(owner).setPlatformFee(5))
                .to.emit(jobMarket, "PlatformFeeUpdated")
                .withArgs(2, 5, owner.address);

            expect(await jobMarket.platformFeePercent()).to.equal(5);
        });

        it("Should reject excessive platform fee", async function () {
            await expect(jobMarket.connect(owner).setPlatformFee(15))
                .to.be.revertedWith("JobMarket: fee exceeds maximum");
        });

        it("Should reject non-owner from changing fee", async function () {
            await expect(jobMarket.connect(client).setPlatformFee(5))
                .to.be.revertedWith("JobMarket: caller is not the owner");
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  FULL END-TO-END WORKFLOW
    // ═══════════════════════════════════════════════════════════

    describe("Full Workflow — End-to-End Integration", function () {
        it("Should complete full job lifecycle with all subsystems", async function () {
            // 1. Provider registers with hardware profile
            await jobMarket.connect(provider1).stakeAsProvider(
                TIER.GPU_PRO, 32, 24576, 65536, { value: STAKE_AMOUNT }
            );

            // 2. Client posts GPU compute job
            const deadline = await futureDeadline();
            await jobMarket.connect(client).postJob(
                "QmTrainingDataHash",
                "Train LLaMA-3 8B on custom dataset — LoRA fine-tuning",
                deadline,
                TIER.GPU_BASIC,
                { value: ONE_ETH }
            );

            // 3. Provider submits competitive bid
            await jobMarket.connect(provider1).submitBid(1, ethers.parseEther("0.95"), 7200);

            // 4. Client accepts bid
            await jobMarket.connect(client).acceptBid(1, provider1.address);

            // 5. Provider executes and submits result
            await jobMarket.connect(provider1).submitResult(1, "QmTrainedModelWeightsHash");

            // 6. Client confirms completion
            const balanceBefore = await ethers.provider.getBalance(provider1.address);
            await jobMarket.connect(client).confirmCompletion(1);
            const balanceAfter = await ethers.provider.getBalance(provider1.address);

            // 7. Verify final state
            const job = await jobMarket.getJob(1);
            expect(job.status).to.equal(3); // Confirmed

            const stats = await reputation.getProviderStats(provider1.address);
            expect(stats[1]).to.equal(1); // 1 successful job

            const tier = await reputation.getProviderTier(provider1.address);
            expect(tier).to.be.gte(1); // At least Bronze

            expect(balanceAfter).to.be.gt(balanceBefore);

            const marketStats = await jobMarket.getMarketStats();
            expect(marketStats[1]).to.equal(1); // 1 completed job

            console.log("\n  ✅ Full workflow completed successfully!");
            console.log(`     Provider earned: ${ethers.formatEther(balanceAfter - balanceBefore)} ETH`);
            console.log(`     Reputation score: ${stats[0]}`);
            console.log(`     Provider tier: ${tier}`);
        });
    });
});
