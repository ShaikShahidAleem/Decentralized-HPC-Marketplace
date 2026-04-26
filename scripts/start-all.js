const { spawn } = require('child_process');

console.log('\x1b[36m\n 🚀 Starting Decentralized HPC Marketplace...\n\x1b[0m');

const processes = [];

function cleanup() {
    console.log('\n\x1b[33m🛑 Shutting down all services...\x1b[0m');
    processes.forEach(p => {
        try { if (!p.killed) p.kill('SIGINT'); } catch (e) { /* already dead */ }
    });
    process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

/**
 * Spawn a child process and return a Promise.
 *
 * @param {string}      name     - Label used in log output
 * @param {string}      cmd      - Executable
 * @param {string[]}    args     - Argument list
 * @param {string|null} waitFor  - Resolve when this string appears in stdout.
 *                                 Pass null for one-shot commands (resolve on clean exit).
 * @param {string}      color    - ANSI escape colour prefix
 * @param {Object}      envVars  - Extra environment variables
 */
function runProcess(name, cmd, args, waitFor = null, color = '\x1b[0m', envVars = {}) {
    return new Promise((resolve, reject) => {
        const label = `${color}[${name}]\x1b[0m`;
        console.log(`${label} ▶  ${cmd} ${args.join(' ')}`);

        const proc = spawn(cmd, args, {
            shell: true,
            env: { ...process.env, ...envVars }
        });
        processes.push(proc);

        let resolved = false;
        const done = (val) => { if (!resolved) { resolved = true; resolve(val); } };
        const fail = (err) => { if (!resolved) { resolved = true; reject(err); } };

        proc.stdout.on('data', (chunk) => {
            const text = chunk.toString();
            text.split('\n').filter(l => l.trim()).forEach(l => console.log(`${label} ${l}`));
            if (waitFor && text.includes(waitFor)) done(proc);
        });

        proc.stderr.on('data', (chunk) => {
            chunk.toString().split('\n').filter(l => l.trim())
                .forEach(l => console.error(`${label} \x1b[2m${l}\x1b[0m`));
        });

        proc.on('close', (code) => {
            if (waitFor === null) {
                // One-shot command (e.g. deploy): resolve on success, reject on failure
                code === 0
                    ? done(proc)
                    : fail(new Error(`${name} exited with code ${code}`));
            } else {
                // Long-running service exited before emitting ready signal
                if (!resolved)
                    fail(new Error(`${name} exited (code ${code}) before emitting ready signal`));
            }
        });

        proc.on('error', fail);
    });
}

async function startAll() {
    try {
        // ─── 1. Hardhat Node ───────────────────────────────────────────────
        console.log('\x1b[36m\n[1/4] Starting local Hardhat blockchain...\x1b[0m');
        await runProcess(
            'NODE', 'npx',
            ['hardhat', 'node', '--hostname', '0.0.0.0'],
            'Started HTTP and WebSocket JSON-RPC server',
            '\x1b[36m'
        );
        console.log('\x1b[32m✅ Blockchain node is live.\x1b[0m');

        // Let the node stabilise before we deploy
        await new Promise(r => setTimeout(r, 2000));

        // ─── 2. Deploy Contracts ───────────────────────────────────────────
        console.log('\x1b[33m\n[2/4] Deploying smart contracts...\x1b[0m');
        await runProcess(
            'DEPLOY', 'npx',
            ['hardhat', 'run', 'scripts/deploy.js', '--network', 'localhost'],
            null,          // one-shot — resolves when process exits cleanly
            '\x1b[33m'
        );
        console.log('\x1b[32m✅ Contracts deployed and config.js written.\x1b[0m');

        // Give config.js time to be written to disk before providers read it
        await new Promise(r => setTimeout(r, 1000));

        // ─── 3. Provider Nodes ─────────────────────────────────────────────
        console.log('\x1b[35m\n[3/4] Starting provider nodes...\x1b[0m');

        runProcess(
            'PROVIDER-A', 'node',
            ['provider/index.js'],
            'Provider node fully operational',
            '\x1b[35m',
            { ACCOUNT_INDEX: '1' }
        ).catch(err => console.error('\x1b[31m[PROVIDER-A]\x1b[0m', err.message));

        runProcess(
            'PROVIDER-B', 'node',
            ['provider/index.js'],
            'Provider node fully operational',
            '\x1b[35m',
            { ACCOUNT_INDEX: '3' }
        ).catch(err => console.error('\x1b[31m[PROVIDER-B]\x1b[0m', err.message));

        // ─── 4. Frontend Client ────────────────────────────────────────────
        console.log('\x1b[32m\n[4/4] Starting frontend client...\x1b[0m');
        runProcess(
            'CLIENT', 'npx',
            ['http-server', 'client', '-p', '3000', '-c-1'],
            'Available on:',
            '\x1b[32m'
        ).catch(err => console.error('\x1b[31m[CLIENT]\x1b[0m', err.message));

        // Small wait so the ready banner prints after the service logs settle
        await new Promise(r => setTimeout(r, 2500));

        console.log(`
\x1b[32m╔══════════════════════════════════════════════════════╗
║       ✨  HPC MARKETPLACE IS RUNNING  ✨             ║
╠══════════════════════════════════════════════════════╣
║  Frontend   →  http://localhost:3000                 ║
║  Blockchain →  http://localhost:8545                 ║
║                                                      ║
║  Press  Ctrl+C  to stop all services                 ║
╚══════════════════════════════════════════════════════╝\x1b[0m
`);

    } catch (err) {
        console.error('\n\x1b[31m❌ Startup failed:\x1b[0m', err.message);
        console.error('   Ensure ports 8545 and 3000 are free, then try again.\n');
        cleanup();
    }
}

startAll();
