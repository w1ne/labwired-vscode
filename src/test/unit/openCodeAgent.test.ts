import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import {
    resolveLabwiredAgentLauncher,
    agentInstallCommand,
    DEFAULT_AGENT_INSTALL,
} from '../../openCodeAgentResolve';

const execFileAsync = promisify(execFile);
const dispatcherHelp = 'LabWired — firmware development tools\n  labwired agent [command]\n  labwired core <command>\n';

function makeLauncher(dir: string, name: string, help: string, verb = ''): string {
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
    let tmp: string;
    beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lw-agent path-')); });
    afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

    function options() {
        return { home: tmp, env: { ...process.env, LABWIRED_HOME: path.join(tmp, 'prefix') } };
    }
    it('install command is platform-appropriate', () => {
        const cmd = agentInstallCommand();
        if (process.platform === 'win32') {
            assert.ok(cmd.includes('install.ps1'));
        } else {
            assert.strictEqual(cmd, DEFAULT_AGENT_INSTALL);
        }
    });

    it('starts a direct agent launcher without adding a dispatcher verb', async () => {
        const file = makeLauncher(tmp, 'labwired-agent', 'LabWired Agent\n');
        const launcher = await resolveLabwiredAgentLauncher(file, options());
        assert.ok(launcher);
        assert.strictEqual(launcher.kind, 'agent');
        const result = await execFileAsync(launcher.executable, launcher.args);
        assert.strictEqual(result.stdout.trim(), 'agent-started');
    });

    it('starts the unified dispatcher with agent, including paths with spaces', async () => {
        const file = makeLauncher(tmp, 'labwired', dispatcherHelp, 'agent');
        const launcher = await resolveLabwiredAgentLauncher(file, options());
        assert.ok(launcher);
        assert.strictEqual(launcher.kind, 'dispatcher');
        assert.strictEqual(launcher.args[launcher.args.length - 1], 'agent');
        const result = await execFileAsync(launcher.executable, launcher.args);
        assert.strictEqual(result.stdout.trim(), 'agent-started');
    });

    it('rejects a configured Core simulator instead of opening it without firmware', async () => {
        const core = makeLauncher(tmp, 'labwired', 'LabWired Simulator\nUsage: labwired [OPTIONS]\n');
        await assert.rejects(resolveLabwiredAgentLauncher(core, options()), /not the Core simulator/);
    });

    it('reports a missing explicit path instead of silently choosing another installation', async () => {
        await assert.rejects(resolveLabwiredAgentLauncher(path.join(tmp, 'missing'), options()), /does not exist/);
    });

    it('resolves an agent in LABWIRED_HOME without relying on PATH', async () => {
        const opts = options();
        const file = makeLauncher(path.join(opts.env.LABWIRED_HOME, 'agent', 'bin'), 'labwired-agent', 'LabWired Agent\n');
        const launcher = await resolveLabwiredAgentLauncher(undefined, opts);
        assert.strictEqual(launcher?.path, file);
    });

    it('skips Core on PATH and finds a later dispatcher', async () => {
        const opts = options();
        const first = path.join(tmp, 'core');
        const second = path.join(tmp, 'product');
        makeLauncher(first, 'labwired', 'LabWired Simulator\n');
        const dispatcher = makeLauncher(second, 'labwired', dispatcherHelp, 'agent');
        const env: NodeJS.ProcessEnv = opts.env;
        const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path') ?? 'PATH';
        env[pathKey] = [first, second, env[pathKey]].join(path.delimiter);
        const launcher = await resolveLabwiredAgentLauncher(undefined, { ...opts, env });
        assert.ok(launcher);
        // where.exe expands Windows 8.3 temp paths to their long spelling.
        assert.strictEqual(fs.realpathSync.native(launcher.path), fs.realpathSync.native(dispatcher));
    });

    it('uses the official PowerShell script beside a Windows cmd shim', async function () {
        if (process.platform !== 'win32') this.skip();
        const script = makeLauncher(tmp, 'labwired', dispatcherHelp, 'agent');
        const shim = path.join(tmp, 'labwired.cmd');
        fs.writeFileSync(shim, '@echo unexpected-shim-invocation\r\n');
        const launcher = await resolveLabwiredAgentLauncher(shim, options());
        assert.strictEqual(launcher?.path, script);
        assert.strictEqual(launcher?.executable, 'powershell.exe');
        assert.strictEqual(launcher?.args[launcher.args.length - 1], 'agent');
    });
});
