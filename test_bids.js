const { ethers } = require('ethers');
const CONFIG = require('./client/config.js');

async function main() {
    const provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');
    const JOB_MARKET_ABI = [
        "function jobCounter() view returns (uint256)",
        "function getJob(uint256) view returns (tuple(uint256 id, address client, uint256 budget, uint256 deposit, uint8 status, address assignedProvider, string dataHash, string resultHash, uint256 createdAt, uint256 deadline, string description, uint8 requiredTier, uint256 slaDeadline))",
        "function getJobBids(uint256) view returns (tuple(address provider, uint256 amount, uint256 timestamp, bool accepted, uint256 estimatedDuration)[])"
    ];
    const contract = new ethers.Contract(CONFIG.CONTRACTS.JobMarket, JOB_MARKET_ABI, provider);
    
    const count = await contract.jobCounter();
    console.log("Total Jobs:", count.toString());
    
    for(let i=1; i<=count; i++) {
        const job = await contract.getJob(i);
        const bids = await contract.getJobBids(i);
        console.log(`Job ${i} Status: ${job.status}, Client: ${job.client}`);
        console.log(`   Bids count: ${bids.length}`);
        if(bids.length > 0) {
            console.log(`   Provider of first bid: ${bids[0].provider}`);
        }
    }
}
main().catch(console.error);
