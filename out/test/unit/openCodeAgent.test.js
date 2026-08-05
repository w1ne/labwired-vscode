"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const os = require("os");
const path = require("path");
const fs = require("fs");
const openCodeAgentResolve_1 = require("../../openCodeAgentResolve");
describe('openCodeAgent — same tools runtime', () => {
    it('install command is platform-appropriate', () => {
        const cmd = (0, openCodeAgentResolve_1.agentInstallCommand)();
        if (process.platform === 'win32') {
            assert.ok(cmd.includes('install.ps1'));
        }
        else {
            assert.strictEqual(cmd, openCodeAgentResolve_1.DEFAULT_AGENT_INSTALL);
        }
    });
    it('resolves an explicit configured path', () => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lw-agent-'));
        const fake = path.join(tmp, 'labwired');
        fs.writeFileSync(fake, '#!/bin/sh\n', { mode: 0o755 });
        try {
            assert.strictEqual((0, openCodeAgentResolve_1.resolveLabwiredAgentLauncher)(fake), fake);
        }
        finally {
            fs.rmSync(tmp, { recursive: true, force: true });
        }
    });
    it('returns undefined for a missing configured path when not on PATH', () => {
        // Non-existent path; may still find real labwired on PATH — only assert
        // that a nonsense absolute path is not returned as-is when missing.
        const missing = path.join(os.tmpdir(), 'no-such-labwired-agent-bin-xyz');
        const got = (0, openCodeAgentResolve_1.resolveLabwiredAgentLauncher)(missing);
        assert.notStrictEqual(got, missing);
    });
});
//# sourceMappingURL=openCodeAgent.test.js.map