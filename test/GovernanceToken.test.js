const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("GovernanceToken — DAO Governance Tests", function () {
    let governance;
    let owner;
    let voter1;
    let voter2;
    let voter3;

    const INITIAL_SUPPLY = 1000000; // 1M tokens
    const PROPOSAL_THRESHOLD = ethers.parseEther("100");
    const QUORUM_THRESHOLD = ethers.parseEther("1000");

    beforeEach(async function () {
        [owner, voter1, voter2, voter3] = await ethers.getSigners();

        const GovernanceToken = await ethers.getContractFactory("GovernanceToken");
        governance = await GovernanceToken.deploy(INITIAL_SUPPLY, PROPOSAL_THRESHOLD, QUORUM_THRESHOLD);
        await governance.waitForDeployment();

        // Distribute tokens for voting
        await governance.transfer(voter1.address, ethers.parseEther("200000"));
        await governance.transfer(voter2.address, ethers.parseEther("150000"));
        await governance.transfer(voter3.address, ethers.parseEther("50000"));
    });

    describe("Token Basics", function () {
        it("Should have correct name and symbol", async function () {
            expect(await governance.name()).to.equal("HPC Governance Token");
            expect(await governance.symbol()).to.equal("HPCGov");
        });

        it("Should mint initial supply to deployer", async function () {
            const totalSupply = await governance.totalSupply();
            expect(totalSupply).to.equal(ethers.parseEther(INITIAL_SUPPLY.toString()));
        });

        it("Should track voting power", async function () {
            const power = await governance.getVotingPower(voter1.address);
            expect(power).to.equal(ethers.parseEther("200000"));
        });
    });

    describe("Proposal Lifecycle", function () {
        it("Should allow token holders to create proposals", async function () {
            await expect(
                governance.connect(voter1).propose(
                    "Reduce Platform Fee",
                    "Reduce the platform fee from 2% to 1% to attract more clients",
                    "platformFeePercent",
                    1
                )
            ).to.emit(governance, "ProposalCreated");

            expect(await governance.proposalCounter()).to.equal(1);
        });

        it("Should reject proposals from holders below threshold", async function () {
            const [, , , , , noTokenAddr] = await ethers.getSigners();
            await expect(
                governance.connect(noTokenAddr).propose(
                    "Test Proposal", "Description", "param", 0
                )
            ).to.be.revertedWith("GovernanceToken: insufficient tokens to propose");
        });

        it("Should allow voting on active proposals", async function () {
            await governance.connect(voter1).propose(
                "Test", "Desc", "param", 1
            );

            await expect(governance.connect(voter1).vote(1, true))
                .to.emit(governance, "VoteCast")
                .withArgs(1, voter1.address, true, ethers.parseEther("200000"));
        });

        it("Should prevent double voting", async function () {
            await governance.connect(voter1).propose("Test", "Desc", "param", 1);
            await governance.connect(voter1).vote(1, true);

            await expect(governance.connect(voter1).vote(1, false))
                .to.be.revertedWith("GovernanceToken: already voted");
        });

        it("Should execute passed proposals", async function () {
            // Create and vote
            await governance.connect(voter1).propose("Test", "Desc", "platformFee", 1);
            await governance.connect(voter1).vote(1, true);
            await governance.connect(voter2).vote(1, true);

            // Advance time past voting period
            await ethers.provider.send("evm_increaseTime", [4 * 86400]);
            await ethers.provider.send("evm_mine");

            // Finalize
            await governance.finalizeProposal(1);
            const proposal = await governance.getProposal(1);
            expect(proposal.status).to.equal(1); // Passed

            // Execute
            await expect(governance.connect(owner).executeProposal(1))
                .to.emit(governance, "ProposalExecuted");
        });

        it("Should reject proposals that don't meet quorum", async function () {
            await governance.connect(voter1).propose("Test", "Desc", "param", 1);
            // Only voter3 votes (50k < 1000 quorum in tokens)
            // Actually we need to consider voter3 has only 50k which is above quorum of 1000
            // Let's just advance time and finalize without votes

            await ethers.provider.send("evm_increaseTime", [4 * 86400]);
            await ethers.provider.send("evm_mine");

            await governance.finalizeProposal(1);
            const proposal = await governance.getProposal(1);
            expect(proposal.status).to.equal(4); // Expired (no votes = below quorum)
        });
    });

    describe("Vote Info", function () {
        it("Should track vote direction", async function () {
            await governance.connect(voter1).propose("Test", "Desc", "param", 1);

            await governance.connect(voter1).vote(1, true);
            await governance.connect(voter2).vote(1, false);

            const [voted1, dir1] = await governance.getVoteInfo(1, voter1.address);
            expect(voted1).to.be.true;
            expect(dir1).to.be.true; // FOR

            const [voted2, dir2] = await governance.getVoteInfo(1, voter2.address);
            expect(voted2).to.be.true;
            expect(dir2).to.be.false; // AGAINST
        });
    });
});
