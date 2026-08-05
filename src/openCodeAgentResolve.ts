// Pure resolvers (no vscode import — unit-testable).

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';

export const DEFAULT_AGENT_INSTALL =
    'curl -fsSL https://labwired.com/install | bash';

/** Locate the `labwired` agent launcher (OpenCode entry). */
export function resolveLabwiredAgentLauncher(configuredPath?: string): string | undefined {
    const configured = (configuredPath || '').trim();
    if (configured && fs.existsSync(configured)) {
        return configured;
    }

    const home = os.homedir();
    const candidates = [
        path.join(home, '.labwired', 'bin', 'labwired'),
        path.join(home, '.labwired', 'agent', 'bin', 'labwired'),
        path.join(home, '.local', 'bin', 'labwired'),
    ];

    for (const c of candidates) {
        if (fs.existsSync(c)) {
            return c;
        }
    }

    try {
        const locator = process.platform === 'win32' ? 'where' : 'which';
        const found = spawnSync(locator, ['labwired'], { encoding: 'utf8' });
        if (found.status === 0) {
            const first = found.stdout
                .split(/\r?\n/)
                .map((s) => s.trim())
                .filter(Boolean)[0];
            if (first && fs.existsSync(first)) {
                return first;
            }
        }
    } catch {
        /* ignore */
    }
    return undefined;
}

export function agentInstallCommand(): string {
    if (process.platform === 'win32') {
        return 'irm https://labwired.com/install.ps1 | iex';
    }
    return DEFAULT_AGENT_INSTALL;
}
