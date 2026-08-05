import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import {
    resolveLabwiredAgentLauncher,
    agentInstallCommand,
    DEFAULT_AGENT_INSTALL,
} from '../../openCodeAgent';

describe('openCodeAgent — same tools runtime', () => {
    it('install command is platform-appropriate', () => {
        const cmd = agentInstallCommand();
        if (process.platform === 'win32') {
            assert.ok(cmd.includes('install.ps1'));
        } else {
            assert.strictEqual(cmd, DEFAULT_AGENT_INSTALL);
        }
    });

    it('resolves an explicit configured path', () => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lw-agent-'));
        const fake = path.join(tmp, 'labwired');
        fs.writeFileSync(fake, '#!/bin/sh\n', { mode: 0o755 });
        try {
            assert.strictEqual(resolveLabwiredAgentLauncher(fake), fake);
        } finally {
            fs.rmSync(tmp, { recursive: true, force: true });
        }
    });

    it('returns undefined for a missing configured path when not on PATH', () => {
        // Non-existent path; may still find real labwired on PATH — only assert
        // that a nonsense absolute path is not returned as-is when missing.
        const missing = path.join(os.tmpdir(), 'no-such-labwired-agent-bin-xyz');
        const got = resolveLabwiredAgentLauncher(missing);
        assert.notStrictEqual(got, missing);
    });
});
