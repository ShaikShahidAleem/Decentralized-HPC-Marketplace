// Auto-generated deployment configuration
// Deployed: 2026-04-06T17:15:01.091Z
// Network: localhost

const CONFIG = {
  NETWORK_URL: "http://127.0.0.1:8545",
  CHAIN_ID: 31337,
  CONTRACTS: {
    JobMarket: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
    Reputation: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    DisputeResolution: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
    GovernanceToken: "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9"
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
