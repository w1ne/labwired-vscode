#!/usr/bin/env node
// Exercise the extension resolver against the released Core binary and the
// real product dispatcher. Only the dispatcher's child Agent is a test stub.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { resolveLabwiredAgentLauncher } = require('../out/openCodeAgentResolve');

async function main() {
    const [core, dispatcher] = process.argv.slice(2);
    assert.ok(core && dispatcher, 'usage: node scripts/verify-agent-launch.js CORE DISPATCHER');
    assert.ok(fs.statSync(core).isFile(), 'Core binary must exist');
    assert.ok(fs.statSync(dispatcher).isFile(), 'Dispatcher must exist');
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lw-agent-contract-'));
    try {
        const child = path.join(temp, 'agent child');
        fs.writeFileSync(child, '#!/bin/sh\nprintf "agent-dispatch-confirmed\\n"\n', { mode: 0o755 });
        const env = { ...process.env, LABWIRED_HOME: temp, LABWIRED_AGENT_BIN: child };
        const options = { home: temp, env };
        await assert.rejects(resolveLabwiredAgentLauncher(core, options), /not the Core simulator/);
        const launcher = await resolveLabwiredAgentLauncher(dispatcher, options);
        assert.strictEqual(launcher.kind, 'dispatcher');
        const { stdout } = await promisify(execFile)(launcher.executable, launcher.args, { env, timeout: 5000 });
        assert.strictEqual(stdout.trim(), 'agent-dispatch-confirmed');
        console.log('PASS: released Core rejected; real dispatcher invokes its Agent child.');
    } finally {
        fs.rmSync(temp, { recursive: true, force: true });
    }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
