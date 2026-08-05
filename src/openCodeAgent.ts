// LabWired - Firmware Simulation Platform
// Copyright (C) 2026 Andrii Shylenko
//
// MIT. Drive the OpenCode agent the same way Embedder drives its CLI:
// extension is chrome; `labwired` is the agent runtime; tools are shared MCP.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';

export const DEFAULT_AGENT_INSTALL =
    'curl -fsSL https://labwired.com/install | bash';

/** Locate the `labwired` agent launcher (OpenCode entry), not the sim CLI alone. */
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

/**
 * Open an integrated terminal running the OpenCode agent with the same
 * labwired_* tools (hosted after login, local MCP otherwise).
 */
export async function startOpenCodeAgent(output: vscode.OutputChannel): Promise<void> {
    const configured = vscode.workspace
        .getConfiguration('labwired')
        .get<string>('agentPath');
    let launcher = resolveLabwiredAgentLauncher(configured);

    if (!launcher) {
        const pick = await vscode.window.showInformationMessage(
            'LabWired agent (OpenCode) is not installed. Install it the same way as the CLI tools path?',
            'Install agent',
            'Copy install command',
            'Cancel'
        );
        if (pick === 'Copy install command') {
            await vscode.env.clipboard.writeText(agentInstallCommand());
            vscode.window.showInformationMessage('Install command copied. Run it in a terminal, then retry Start OpenCode Agent.');
            return;
        }
        if (pick !== 'Install agent') {
            return;
        }
        const term = vscode.window.createTerminal({
            name: 'LabWired Agent Install',
            cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
        });
        term.show(true);
        term.sendText(agentInstallCommand(), true);
        output.appendLine('LabWired [agent]: ran install in terminal — when finished, run LabWired: Start OpenCode Agent again.');
        return;
    }

    const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const term = vscode.window.createTerminal({
        name: 'LabWired OpenCode',
        cwd,
        env: {
            // Ensure agent kit / hosted session are visible to child
            ...(process.env.LABWIRED_HOME
                ? { LABWIRED_HOME: process.env.LABWIRED_HOME }
                : {}),
        },
    });
    term.show(true);
    // Same entry as CLI: prepare skills + MCP then OpenCode TUI
    const quoted =
        process.platform === 'win32' ? `"${launcher}"` : `'${launcher.replace(/'/g, `'\\''`)}'`;
    term.sendText(quoted, true);
    output.appendLine(`LabWired [agent]: started OpenCode via ${launcher}`);
    output.appendLine('  Same tools as Configure Agent Tools / playground: labwired_* MCP');
    output.appendLine('  Hosted: labwired login (in another terminal) then restart agent if needed');
}

export async function copyAgentInstallCommand(): Promise<void> {
    const cmd = agentInstallCommand();
    await vscode.env.clipboard.writeText(cmd);
    vscode.window.showInformationMessage(`Copied: ${cmd}`);
}
