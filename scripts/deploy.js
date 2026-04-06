const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("\n" + "═".repeat(60));
  console.log("  HPC Marketplace — Contract Deployment Suite");
  console.log("═".repeat(60));

  const [deployer] = await hre.ethers.getSigners();
  console.log("\n📋 Deployer:", deployer.address);
  console.log("   Balance:", hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address)), "ETH\n");

  // ─────────────────────────────────────────────────────────
  // 1. Deploy Reputation Contract
  // ─────────────────────────────────────────────────────────
  console.log("┌─ Deploying Reputation...");
  const Reputation = await hre.ethers.getContractFactory("Reputation");
  const reputation = await Reputation.deploy();
  await reputation.waitForDeployment();
  const reputationAddress = await reputation.getAddress();
  console.log("└─ ✅ Reputation:", reputationAddress);

  // ─────────────────────────────────────────────────────────
  // 2. Deploy DisputeResolution Contract
  // ─────────────────────────────────────────────────────────
  console.log("\n┌─ Deploying DisputeResolution...");
  const DisputeResolution = await hre.ethers.getContractFactory("DisputeResolution");
  const disputeResolution = await DisputeResolution.deploy(deployer.address);
  await disputeResolution.waitForDeployment();
  const disputeAddress = await disputeResolution.getAddress();
  console.log("└─ ✅ DisputeResolution:", disputeAddress);

  // ─────────────────────────────────────────────────────────
  // 3. Deploy JobMarket Contract (depends on Reputation + Dispute)
  // ─────────────────────────────────────────────────────────
  console.log("\n┌─ Deploying JobMarket...");
  const JobMarket = await hre.ethers.getContractFactory("JobMarket");
  const jobMarket = await JobMarket.deploy(reputationAddress, disputeAddress);
  await jobMarket.waitForDeployment();
  const jobMarketAddress = await jobMarket.getAddress();
  console.log("└─ ✅ JobMarket:", jobMarketAddress);

  // ─────────────────────────────────────────────────────────
  // 4. Deploy GovernanceToken Contract
  // ─────────────────────────────────────────────────────────
  console.log("\n┌─ Deploying GovernanceToken (HPCGov)...");
  const GovernanceToken = await hre.ethers.getContractFactory("GovernanceToken");
  const initialSupply = 1000000;  // 1 million tokens
  const proposalThreshold = hre.ethers.parseEther("100");  // 100 HPCGov to propose
  const quorumThreshold = hre.ethers.parseEther("1000");   // 1000 HPCGov quorum
  const governance = await GovernanceToken.deploy(initialSupply, proposalThreshold, quorumThreshold);
  await governance.waitForDeployment();
  const governanceAddress = await governance.getAddress();
  console.log("└─ ✅ GovernanceToken:", governanceAddress);

  // ─────────────────────────────────────────────────────────
  // 5. Link Contracts
  // ─────────────────────────────────────────────────────────
  console.log("\n┌─ Linking contracts...");
  await reputation.setJobMarketContract(jobMarketAddress);
  console.log("│  Reputation → JobMarket ✓");
  await disputeResolution.setJobMarketContract(jobMarketAddress);
  console.log("│  DisputeResolution → JobMarket ✓");

  // Verify linkage
  const linkedJM = await reputation.jobMarketContract();
  console.log("└─ ✅ All contracts linked");

  // ─────────────────────────────────────────────────────────
  // 6. Save Configuration
  // ─────────────────────────────────────────────────────────
  const deploymentInfo = {
    network: hre.network.name,
    deployer: deployer.address,
    contracts: {
      Reputation: reputationAddress,
      DisputeResolution: disputeAddress,
      JobMarket: jobMarketAddress,
      GovernanceToken: governanceAddress
    },
    deployedAt: new Date().toISOString()
  };

  // Generate config for client & provider
  const configContent = `// Auto-generated deployment configuration
// Deployed: ${deploymentInfo.deployedAt}
// Network: ${deploymentInfo.network}

const CONFIG = {
  NETWORK_URL: "http://127.0.0.1:8545",
  CHAIN_ID: 31337,
  CONTRACTS: {
    JobMarket: "${jobMarketAddress}",
    Reputation: "${reputationAddress}",
    DisputeResolution: "${disputeAddress}",
    GovernanceToken: "${governanceAddress}"
  }
};

// Export for use in browser
if (typeof window !== 'undefined') {
  window.CONFIG = CONFIG;
}

// Export for Node.js
if (typeof module !== 'undefined') {
  module.exports = CONFIG;
}
`;

  const clientConfigPath = path.join(__dirname, "..", "client", "config.js");
  fs.writeFileSync(clientConfigPath, configContent);
  console.log("\n📁 Config → client/config.js");

  const providerConfigPath = path.join(__dirname, "..", "provider", "config.js");
  fs.writeFileSync(providerConfigPath, configContent);
  console.log("📁 Config → provider/config.js");

  const jsonConfigPath = path.join(__dirname, "..", "deployment.json");
  fs.writeFileSync(jsonConfigPath, JSON.stringify(deploymentInfo, null, 2));
  console.log("📁 Config → deployment.json");

  // ─────────────────────────────────────────────────────────
  // Summary
  // ─────────────────────────────────────────────────────────
  console.log("\n" + "═".repeat(60));
  console.log("  🎉 Deployment Complete — 4 Contracts Deployed");
  console.log("═".repeat(60));
  console.log("\n  Contract Addresses:");
  console.log(`    Reputation:        ${reputationAddress}`);
  console.log(`    DisputeResolution: ${disputeAddress}`);
  console.log(`    JobMarket:         ${jobMarketAddress}`);
  console.log(`    GovernanceToken:   ${governanceAddress}`);
  console.log("\n  Next Steps:");
  console.log("    1. Start provider: npm run provider");
  console.log("    2. Open client:    npm run client");
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
