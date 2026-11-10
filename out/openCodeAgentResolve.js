"use strict";
// Agent discovery without a VS Code host. The Core CLI has the same `labwired`
// filename as the product dispatcher; the filename alone is not identification.
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.agentInstallCommand = exports.resolveLabwiredAgentLauncher = exports.DEFAULT_AGENT_INSTALL = void 0;
const fs = require("fs");
const os = require("os");
const path = require("path");
const child_process_1 = require("child_process");
const util_1 = require("util");
const execFileAsync = (0, util_1.promisify)(child_process_1.execFile);
exports.DEFAULT_AGENT_INSTALL = 'curl -fsSL https://labwired.com/install | bash';
function isFile(file) {
    try {
        return fs.statSync(file).isFile();
    }
    catch (_a) {
        return false;
    }
}
/** Use an argument array for PowerShell scripts; never execute a shell string. */
function invocation(file) {
    if (process.platform === 'win32') {
        if (/\.(cmd|bat)$/i.test(file)) {
            // The official .cmd shim has a sibling .ps1 dispatcher. Calling
            // that script directly avoids cmd.exe quoting and spawn limitations.
            const ps1 = file.replace(/\.(cmd|bat)$/i, '.ps1');
            if (!isFile(ps1))
                return undefined;
            file = ps1;
        }
        if (/\.ps1$/i.test(file)) {
            return { executable: 'powershell.exe', args: ['-NoLogo', '-NoProfile', '-File', file], path: file };
        }
    }
    return { executable: file, args: [], path: file };
}
function inspectLauncher(file, env) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!isFile(file))
            return undefined;
        const command = invocation(file);
        if (!command)
            return undefined;
        try {
            const { stdout } = yield execFileAsync(command.executable, [...command.args, '--help'], {
                encoding: 'utf8', env, timeout: 2000, maxBuffer: 128 * 1024, windowsHide: true,
            });
            if (stdout.includes('labwired agent [command]') && stdout.includes('labwired core <command>')) {
                return Object.assign(Object.assign({}, command), { args: [...command.args, 'agent'], kind: 'dispatcher' });
            }
            if (/^LabWired Agent(?:\s|$)/m.test(stdout)) {
                return Object.assign(Object.assign({}, command), { kind: 'agent' });
            }
        }
        catch (_a) {
            // Missing dependencies, a non-executable path or a timed-out probe do
            // not justify starting an unknown program in the user's terminal.
        }
        return undefined;
    });
}
/** Resolve and identify a direct Agent launcher or the unified dispatcher. */
function resolveLabwiredAgentLauncher(configuredPath, options = {}) {
    var _a, _b;
    return __awaiter(this, void 0, void 0, function* () {
        const env = (_a = options.env) !== null && _a !== void 0 ? _a : process.env;
        const home = (_b = options.home) !== null && _b !== void 0 ? _b : os.homedir();
        const configured = (configuredPath || '').trim();
        if (configured) {
            if (!isFile(configured)) {
                throw new Error(`LabWired agent launcher does not exist at '${configured}'. Check labwired.agentPath.`);
            }
            const launcher = yield inspectLauncher(configured, env);
            if (!launcher) {
                throw new Error(`'${configured}' did not identify as LabWired Agent. ` +
                    'Set labwired.agentPath to labwired-agent or the unified labwired dispatcher, not the Core simulator.');
            }
            return launcher;
        }
        const prefix = env.LABWIRED_HOME || path.join(home, '.labwired');
        const names = process.platform === 'win32'
            ? ['labwired-agent.ps1', 'labwired.ps1', 'labwired.cmd', 'labwired-agent.exe', 'labwired.exe']
            : ['labwired-agent', 'labwired'];
        const directories = [path.join(prefix, 'bin'), path.join(prefix, 'agent', 'bin'), path.join(home, '.local', 'bin')];
        const candidates = directories.flatMap((dir) => names.map((name) => path.join(dir, name)));
        const locator = process.platform === 'win32' ? 'where.exe' : 'which';
        for (const name of names) {
            try {
                const args = process.platform === 'win32' ? [name] : ['-a', name];
                const { stdout } = yield execFileAsync(locator, args, { encoding: 'utf8', env, timeout: 2000, windowsHide: true });
                candidates.push(...stdout.split(/\r?\n/).map((p) => p.trim()).filter(Boolean));
            }
            catch ( /* No PATH match for this spelling. */_c) { /* No PATH match for this spelling. */ }
        }
        for (const candidate of new Set(candidates)) {
            const launcher = yield inspectLauncher(candidate, env);
            if (launcher)
                return launcher;
        }
        return undefined;
    });
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