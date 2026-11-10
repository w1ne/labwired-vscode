// Agent discovery without a VS Code host. The Core CLI has the same `labwired`
// filename as the product dispatcher; the filename alone is not identification.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export const DEFAULT_AGENT_INSTALL =
    'curl -fsSL https://labwired.com/install | bash';

export interface AgentLauncher {
    path: string;
    executable: string;
    args: string[];
    kind: 'agent' | 'dispatcher';
}

export interface AgentResolveOptions {
    env?: NodeJS.ProcessEnv;
    home?: string;
}

function isFile(file: string): boolean {
    try { return fs.statSync(file).isFile(); } catch { return false; }
}

/** Use an argument array for PowerShell scripts; never execute a shell string. */
function invocation(file: string): { executable: string; args: string[]; path: string } | undefined {
    if (process.platform === 'win32') {
        if (/\.(cmd|bat)$/i.test(file)) {
            // The official .cmd shim has a sibling .ps1 dispatcher. Calling
            // that script directly avoids cmd.exe quoting and spawn limitations.
            const ps1 = file.replace(/\.(cmd|bat)$/i, '.ps1');
            if (!isFile(ps1)) return undefined;
            file = ps1;
        }
        if (/\.ps1$/i.test(file)) {
            return { executable: 'powershell.exe', args: ['-NoLogo', '-NoProfile', '-File', file], path: file };
        }
    }
    return { executable: file, args: [], path: file };
}

async function inspectLauncher(file: string, env: NodeJS.ProcessEnv): Promise<AgentLauncher | undefined> {
    if (!isFile(file)) return undefined;
    const command = invocation(file);
    if (!command) return undefined;
    try {
        const { stdout } = await execFileAsync(command.executable, [...command.args, '--help'], {
            // Windows PowerShell can take more than two seconds to cold-start.
            encoding: 'utf8', env, timeout: process.platform === 'win32' ? 5000 : 2000,
            maxBuffer: 128 * 1024, windowsHide: true,
        });
        if (stdout.includes('labwired agent [command]') && stdout.includes('labwired core <command>')) {
            return { ...command, args: [...command.args, 'agent'], kind: 'dispatcher' };
        }
        if (/^LabWired Agent(?:\s|$)/m.test(stdout)) {
            return { ...command, kind: 'agent' };
        }
    } catch {
        // Missing dependencies, a non-executable path or a timed-out probe do
        // not justify starting an unknown program in the user's terminal.
    }
    return undefined;
}

/** Resolve and identify a direct Agent launcher or the unified dispatcher. */
export async function resolveLabwiredAgentLauncher(
    configuredPath?: string,
    options: AgentResolveOptions = {},
): Promise<AgentLauncher | undefined> {
    const env = options.env ?? process.env;
    const home = options.home ?? os.homedir();
    const configured = (configuredPath || '').trim();
    if (configured) {
        if (!isFile(configured)) {
            throw new Error(`LabWired agent launcher does not exist at '${configured}'. Check labwired.agentPath.`);
        }
        const launcher = await inspectLauncher(configured, env);
        if (!launcher) {
            throw new Error(
                `'${configured}' did not identify as LabWired Agent. ` +
                'Set labwired.agentPath to labwired-agent or the unified labwired dispatcher, not the Core simulator.'
            );
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
            const { stdout } = await execFileAsync(locator, args, { encoding: 'utf8', env, timeout: 2000, windowsHide: true });
            candidates.push(...stdout.split(/\r?\n/).map((p) => p.trim()).filter(Boolean));
        } catch { /* No PATH match for this spelling. */ }
    }

    for (const candidate of new Set(candidates)) {
        const launcher = await inspectLauncher(candidate, env);
        if (launcher) return launcher;
    }
    return undefined;
}

export function agentInstallCommand(): string {
    if (process.platform === 'win32') {
        return 'irm https://labwired.com/install.ps1 | iex';
    }
    return DEFAULT_AGENT_INSTALL;
}
