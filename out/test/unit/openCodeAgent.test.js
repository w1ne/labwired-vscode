"use strict";
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
const assert = require("assert");
const os = require("os");
const path = require("path");
const fs = require("fs");
const child_process_1 = require("child_process");
const util_1 = require("util");
const openCodeAgentResolve_1 = require("../../openCodeAgentResolve");
const execFileAsync = (0, util_1.promisify)(child_process_1.execFile);
const dispatcherHelp = 'LabWired — firmware development tools\n  labwired agent [command]\n  labwired core <command>\n';
function makeLauncher(dir, name, help, verb = '') {
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, process.platform === 'win32' ? `${name}.ps1` : name);
    const script = process.platform === 'win32'
        ? `param([Parameter(ValueFromRemainingArguments=$true)][string[]]$Rest)\nif ($Rest.Count -and $Rest[0] -eq '--help') {\n@'\n${help}\n'@\nexit 0\n}\nif (($Rest -join ' ') -ne '${verb}') { exit 9 }\nWrite-Output 'agent-started'\n`
        : `#!/bin/sh\nif [ "\${1-}" = '--help' ]; then\ncat <<'HELP'\n${help}\nHELP\nexit 0\nfi\n[ "$*" = '${verb}' ] || exit 9\nprintf 'agent-started\\n'\n`;
    fs.writeFileSync(file, script, { mode: 0o755 });
    return file;
}
describe('openCodeAgent — same tools runtime', function () {
    this.timeout(10000);
    let tmp;
    beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lw-agent path-')); });
    afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });
    function options() {
        return { home: tmp, env: Object.assign(Object.assign({}, process.env), { LABWIRED_HOME: path.join(tmp, 'prefix') }) };
    }
    it('install command is platform-appropriate', () => {
        const cmd = (0, openCodeAgentResolve_1.agentInstallCommand)();
        if (process.platform === 'win32') {
            assert.ok(cmd.includes('install.ps1'));
        }
        else {
            assert.strictEqual(cmd, openCodeAgentResolve_1.DEFAULT_AGENT_INSTALL);
        }
    });
    it('starts a direct agent launcher without adding a dispatcher verb', () => __awaiter(this, void 0, void 0, function* () {
        const file = makeLauncher(tmp, 'labwired-agent', 'LabWired Agent\n');
        const launcher = yield (0, openCodeAgentResolve_1.resolveLabwiredAgentLauncher)(file, options());
        assert.ok(launcher);
        assert.strictEqual(launcher.kind, 'agent');
        const result = yield execFileAsync(launcher.executable, launcher.args);
        assert.strictEqual(result.stdout.trim(), 'agent-started');
    }));
    it('starts the unified dispatcher with agent, including paths with spaces', () => __awaiter(this, void 0, void 0, function* () {
        const file = makeLauncher(tmp, 'labwired', dispatcherHelp, 'agent');
        const launcher = yield (0, openCodeAgentResolve_1.resolveLabwiredAgentLauncher)(file, options());
        assert.ok(launcher);
        assert.strictEqual(launcher.kind, 'dispatcher');
        assert.strictEqual(launcher.args[launcher.args.length - 1], 'agent');
        const result = yield execFileAsync(launcher.executable, launcher.args);
        assert.strictEqual(result.stdout.trim(), 'agent-started');
    }));
    it('rejects a configured Core simulator instead of opening it without firmware', () => __awaiter(this, void 0, void 0, function* () {
        const core = makeLauncher(tmp, 'labwired', 'LabWired Simulator\nUsage: labwired [OPTIONS]\n');
        yield assert.rejects((0, openCodeAgentResolve_1.resolveLabwiredAgentLauncher)(core, options()), /not the Core simulator/);
    }));
    it('reports a missing explicit path instead of silently choosing another installation', () => __awaiter(this, void 0, void 0, function* () {
        yield assert.rejects((0, openCodeAgentResolve_1.resolveLabwiredAgentLauncher)(path.join(tmp, 'missing'), options()), /does not exist/);
    }));
    it('resolves an agent in LABWIRED_HOME without relying on PATH', () => __awaiter(this, void 0, void 0, function* () {
        const opts = options();
        const file = makeLauncher(path.join(opts.env.LABWIRED_HOME, 'agent', 'bin'), 'labwired-agent', 'LabWired Agent\n');
        const launcher = yield (0, openCodeAgentResolve_1.resolveLabwiredAgentLauncher)(undefined, opts);
        assert.strictEqual(launcher === null || launcher === void 0 ? void 0 : launcher.path, file);
    }));
    it('skips Core on PATH and finds a later dispatcher', () => __awaiter(this, void 0, void 0, function* () {
        var _a;
        const opts = options();
        const first = path.join(tmp, 'core');
        const second = path.join(tmp, 'product');
        makeLauncher(first, 'labwired', 'LabWired Simulator\n');
        const dispatcher = makeLauncher(second, 'labwired', dispatcherHelp, 'agent');
        const env = opts.env;
        const pathKey = (_a = Object.keys(env).find((key) => key.toLowerCase() === 'path')) !== null && _a !== void 0 ? _a : 'PATH';
        env[pathKey] = [first, second, env[pathKey]].join(path.delimiter);
        const launcher = yield (0, openCodeAgentResolve_1.resolveLabwiredAgentLauncher)(undefined, Object.assign(Object.assign({}, opts), { env }));
        assert.ok(launcher);
        // where.exe expands Windows 8.3 temp paths to their long spelling.
        assert.strictEqual(fs.realpathSync.native(launcher.path), fs.realpathSync.native(dispatcher));
    }));
    it('uses the official PowerShell script beside a Windows cmd shim', function () {
        return __awaiter(this, void 0, void 0, function* () {
            if (process.platform !== 'win32')
                this.skip();
            const script = makeLauncher(tmp, 'labwired', dispatcherHelp, 'agent');
            const shim = path.join(tmp, 'labwired.cmd');
            fs.writeFileSync(shim, '@echo unexpected-shim-invocation\r\n');
            const launcher = yield (0, openCodeAgentResolve_1.resolveLabwiredAgentLauncher)(shim, options());
            assert.strictEqual(launcher === null || launcher === void 0 ? void 0 : launcher.path, script);
            assert.strictEqual(launcher === null || launcher === void 0 ? void 0 : launcher.executable, 'powershell.exe');
            assert.strictEqual(launcher === null || launcher === void 0 ? void 0 : launcher.args[launcher.args.length - 1], 'agent');
        });
    });
});
//# sourceMappingURL=openCodeAgent.test.js.map