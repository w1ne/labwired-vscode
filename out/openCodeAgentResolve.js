"use strict";
// Pure resolvers (no vscode import — unit-testable).
Object.defineProperty(exports, "__esModule", { value: true });
exports.agentInstallCommand = exports.resolveLabwiredAgentLauncher = exports.DEFAULT_AGENT_INSTALL = void 0;
const fs = require("fs");
const os = require("os");
const path = require("path");
const child_process_1 = require("child_process");
exports.DEFAULT_AGENT_INSTALL = 'curl -fsSL https://labwired.com/install | bash';
/** Locate the `labwired` agent launcher (OpenCode entry). */
function resolveLabwiredAgentLauncher(configuredPath) {
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
        const found = (0, child_process_1.spawnSync)(locator, ['labwired'], { encoding: 'utf8' });
        if (found.status === 0) {
            const first = found.stdout
                .split(/\r?\n/)
                .map((s) => s.trim())
                .filter(Boolean)[0];
            if (first && fs.existsSync(first)) {
                return first;
            }
        }
    }
    catch (_a) {
        /* ignore */
    }
    return undefined;
}
exports.resolveLabwiredAgentLauncher = resolveLabwiredAgentLauncher;
function agentInstallCommand() {
    if (process.platform === 'win32') {
        return 'irm https://labwired.com/install.ps1 | iex';
    }
    return exports.DEFAULT_AGENT_INSTALL;
}
exports.agentInstallCommand = agentInstallCommand;
//# sourceMappingURL=openCodeAgentResolve.js.map