// LabWired - Firmware Simulation Platform
// Copyright (C) 2026 Andrii Shylenko
//
// MIT. Drive the OpenCode agent the same way Embedder drives its CLI:
// extension is chrome; `labwired` is the agent runtime; tools are shared MCP.

import * as vscode from 'vscode';
import {
    agentInstallCommand,
    resolveLabwiredAgentLauncher,
} from './openCodeAgentResolve';

export {
    DEFAULT_AGENT_INSTALL,
    resolveLabwiredAgentLauncher,
    agentInstallCommand,
} from './openCodeAgentResolve';

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
            vscode.window.showInformationMessage(
                'Install command copied. Run it in a terminal, then retry Start OpenCode Agent.'
            );
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
        output.appendLine(
            'LabWired [agent]: ran install in terminal — when finished, run LabWired: Start OpenCode Agent again.'
        );
        return;
    }

    const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const term = vscode.window.createTerminal({
        name: 'LabWired OpenCode',
        cwd,
    });
    term.show(true);
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
