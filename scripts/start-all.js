const { spawn } = require('child_process');

console.log("🚀 Starting Decentralized HPC Marketplace...");

const processes = [];

function cleanup() {
    console.log("\n🛑 Shutting down all services...");
    processes.forEach(p => {
        if (!p.killed) p.kill('SIGINT');
    });
    process.exit();
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('exit', cleanup);

// Utility to run a command and log its output
function runProcess(name, command, args, waitForOutput, color = '\x1b[0m', envVars = {}) {
    return new Promise((resolve, reject) => {
        console.log(`${color}[${name}] Starting: ${command} ${args.join(' ')}\x1b[0m`);
        const env = { ...process.env, ...envVars };
        const proc = spawn(command, args, { shell: true, env });
        processes.push(proc);

        let resolved = false;

        proc.stdout.on('data', (data) => {
            const str = data.toString();
            // Print output but prefixed with the service name
            const lines = str.split('\n').filter(line => line.trim());
            lines.forEach(line => console.log(`${color}[${name}]\x1b[0m ${line}`));

            if (waitForOutput && str.includes(waitForOutput) && !resolved) {
                resolved = true;
                resolve(proc);
            }
        });

        proc.stderr.on('data', (data) => {
            const str = data.toString();
            const lines = str.split('\n').filter(line => line.trim());
            lines.forEach(line => console.error(`${color}[${name}] ERROR:\x1b[0m ${line}`));
        });

        proc.on('close', (code) => {
            console.log(`${color}[${name}] Exited with code ${code}\x1b[0m`);
            if (!waitForOutput && !resolved) {
                if (code === 0) resolve(proc);
                else reject(new Error(`${name} failed with code ${code}`));
            }
        });

        if (!waitForOutput) {
            // If we don't need to wait for a specific output, we resolve when it finishes
            // OR if it's a long running process and doesn't have a wait condition, we just resolve immediately
            // Wait, deploy finishes, others are long running.
        }
    });
}

async function startAll() {
    try {
        // 1. Start Hardhat Node
        // Wait for "Started HTTP and WebSocket JSON-RPC server at"
        const nodeProc = await runProcess('NODE', 'npx', ['hardhat', 'node', '--hostname', '0.0.0.0'], 'Started HTTP and WebSocket JSON-RPC server', '\x1b[36m'); // Cyan
        console.log("✅ Local blockchain is running.");

        // Wait a brief moment just to ensure the node is fully ready to accept connections
        await new Promise(r => setTimeout(r, 2000));

        // 2. Deploy Contracts
        // This process finishes and exits
        await runProcess('DEPLOY', 'npx', ['hardhat', 'run', 'scripts/deploy.js', '--network', 'localhost'], null, '\x1b[33m'); // Yellow
        console.log("✅ Contracts deployed successfully.");

        // 3. Start Provider Nodes
        runProcess('PROVIDER_A', 'node', ['provider/index.js'], 'Provider node fully operational', '\x1b[35m', { ACCOUNT_INDEX: 2 }).catch(console.error); // Magenta
        runProcess('PROVIDER_B', 'node', ['provider/index.js'], 'Provider node fully operational', '\x1b[35m', { ACCOUNT_INDEX: 4 }).catch(console.error); // Magenta
        console.log("✅ Provider nodes starting...");

        // 4. Start Client
        runProcess('CLIENT', 'npx', ['http-server', 'client', '-p', '3000', '-c-1'], 'Available on:', '\x1b[32m').catch(console.error); // Green
        console.log("✅ Client started.");

        console.log("\n=======================================================");
        console.log("✨ ALL SERVICES RUNNING! ✨");
        console.log("Access the frontend at: http://localhost:3000");
        console.log("Press Ctrl+C to shut everything down.");
        console.log("=======================================================\n");

    } catch (err) {
        console.error("❌ Failed to start the application:", err);
        cleanup();
    }
}

startAll();
