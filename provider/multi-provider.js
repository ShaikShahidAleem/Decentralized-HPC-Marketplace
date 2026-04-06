/**
 * Multi-Provider Simulator
 * 
 * Launches multiple provider instances to simulate a decentralized network
 */

const { spawn } = require("child_process");
const path = require("path");

const NUM_PROVIDERS = parseInt(process.env.NUM_PROVIDERS || "3");

console.log(`\n🚀 Starting ${NUM_PROVIDERS} provider nodes...\n`);

const providers = [];

for (let i = 1; i <= NUM_PROVIDERS; i++) {
    const env = {
        ...process.env,
        ACCOUNT_INDEX: i.toString(),
        PROVIDER_NAME: `Provider-${i}`
    };

    const child = spawn("node", ["provider/index.js"], {
        cwd: path.join(__dirname, ".."),
        env: env,
        stdio: ["ignore", "pipe", "pipe"]
    });

    child.stdout.on("data", (data) => {
        const lines = data.toString().split("\n").filter(l => l.trim());
        lines.forEach(line => {
            console.log(`[P${i}] ${line}`);
        });
    });

    child.stderr.on("data", (data) => {
        console.error(`[P${i}] ERROR: ${data}`);
    });

    child.on("close", (code) => {
        console.log(`[P${i}] Provider exited with code ${code}`);
    });

    providers.push(child);
}

// Handle graceful shutdown
process.on("SIGINT", () => {
    console.log("\n\n🛑 Shutting down providers...");
    providers.forEach(p => p.kill());
    process.exit(0);
});

console.log("✅ All providers started. Press Ctrl+C to stop.\n");
