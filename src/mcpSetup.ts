// LabWired - Firmware Simulation Platform
// Copyright (C) 2026 Andrii Shylenko
//
// MIT. Ship vehicle for shared agent tools (labwired_* MCP) without the
// forked LabWired Editor product / its licenses.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { getAccessToken } from './auth';
import {
    DEFAULT_API_URL,
    buildHostedMcpConfig,
    claudeMcpInstallLine,
    mergeMcpConfig,
    type VsCodeMcpFile,
} from './mcpConfig';

export {
    DEFAULT_MCP_URL,
    DEFAULT_API_URL,
    buildHostedMcpConfig,
    claudeMcpInstallLine,
    mergeMcpConfig,
} from './mcpConfig';
export type { VsCodeMcpServer, VsCodeMcpFile } from './mcpConfig';

export async function writeWorkspaceMcpJson(
    folder: vscode.WorkspaceFolder,
    config: VsCodeMcpFile
): Promise<vscode.Uri> {
    const dir = path.join(folder.uri.fsPath, '.vscode');
    const file = path.join(dir, 'mcp.json');
    await fs.promises.mkdir(dir, { recursive: true });

    let existing: unknown = null;
    try {
        existing = JSON.parse(await fs.promises.readFile(file, 'utf8'));
    } catch {
        existing = null;
    }

    const merged = mergeMcpConfig(existing, config);
    await fs.promises.writeFile(file, JSON.stringify(merged, null, 2) + '\n', 'utf8');
    return vscode.Uri.file(file);
}

/**
 * LabWired: Configure Agent Tools — wires shared hosted MCP into the workspace
 * so VS Code agents use the same labwired_* tools as playground / CLI.
 */
export async function configureAgentTools(output: vscode.OutputChannel): Promise<void> {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
        vscode.window.showErrorMessage('LabWired: Open a folder/workspace first.');
        return;
    }

    const apiUrl =
        vscode.workspace.getConfiguration('labwired').get<string>('apiUrl')?.replace(/\/+$/, '') ||
        DEFAULT_API_URL;
    const mcpUrl = `${apiUrl}/mcp`;

    const token = await getAccessToken(true);
    let mode: 'signed-in' | 'prompt' | 'anonymous' = 'anonymous';
    if (token) {
        mode = 'signed-in';
    } else {
        const pick = await vscode.window.showQuickPick(
            [
                {
                    label: 'Sign in, then configure',
                    description: 'Recommended — hosted tools with your LabWired account',
                    id: 'signin',
                },
                {
                    label: 'Prompt for token each session',
                    description: 'mcp.json uses ${input:labwired-token}',
                    id: 'prompt',
                },
                {
                    label: 'URL only (public / OAuth MCP clients)',
                    description: 'No Bearer header — client may open browser auth',
                    id: 'anon',
                },
            ],
            { title: 'Configure LabWired agent tools' }
        );
        if (!pick) {
            return;
        }
        if (pick.id === 'signin') {
            await vscode.commands.executeCommand('labwired.signIn');
            const after = await getAccessToken(true);
            if (!after) {
                vscode.window.showWarningMessage(
                    'LabWired: Sign-in did not produce a token. Configure with prompt instead.'
                );
                mode = 'prompt';
            } else {
                mode = 'signed-in';
            }
        } else if (pick.id === 'prompt') {
            mode = 'prompt';
        }
    }

    const accessToken = mode === 'signed-in' ? await getAccessToken(true) : undefined;
    const config = buildHostedMcpConfig({
        mcpUrl,
        accessToken: accessToken || undefined,
        useInputPrompt: mode === 'prompt',
    });

    if (mode === 'signed-in' && accessToken) {
        const gitDir = path.join(folder.uri.fsPath, '.git');
        if (fs.existsSync(gitDir)) {
            const cont = await vscode.window.showWarningMessage(
                'This will write a Bearer token into .vscode/mcp.json. Do not commit that file.',
                { modal: true },
                'Write anyway',
                'Use prompt instead'
            );
            if (cont === 'Use prompt instead') {
                const promptCfg = buildHostedMcpConfig({ mcpUrl, useInputPrompt: true });
                const uri = await writeWorkspaceMcpJson(folder, promptCfg);
                await vscode.window.showTextDocument(uri);
                vscode.window.showInformationMessage(
                    'LabWired: MCP tools configured (token prompt). Reload window if the agent does not see tools yet.'
                );
                output.appendLine(`LabWired [mcp]: wrote ${uri.fsPath} (input prompt)`);
                return;
            }
            if (cont !== 'Write anyway') {
                return;
            }
        }
    }

    const uri = await writeWorkspaceMcpJson(folder, config);
    await vscode.window.showTextDocument(uri);

    const claude = claudeMcpInstallLine(mcpUrl);
    output.appendLine('LabWired [mcp]: shared agent tools');
    output.appendLine(`  mcp.json → ${uri.fsPath}`);
    output.appendLine(`  url      → ${mcpUrl}`);
    output.appendLine(`  mode     → ${mode}`);
    output.appendLine(`  Claude Code (same tools): ${claude}`);
    output.appendLine('  OpenCode agent (same tools): labwired login && labwired');
    output.show(true);

    vscode.window
        .showInformationMessage(
            'LabWired agent tools configured (same MCP tools as playground/CLI/OpenCode).',
            'Start OpenCode Agent',
            'Copy Claude command',
            'Reload window'
        )
        .then(async (choice) => {
            if (choice === 'Start OpenCode Agent') {
                await vscode.commands.executeCommand('labwired.startOpenCodeAgent');
            } else if (choice === 'Copy Claude command') {
                await vscode.env.clipboard.writeText(claude);
                vscode.window.showInformationMessage('Copied Claude MCP install command.');
            } else if (choice === 'Reload window') {
                await vscode.commands.executeCommand('workbench.action.reloadWindow');
            }
        });
}

export async function copyClaudeMcpLine(): Promise<void> {
    const apiUrl =
        vscode.workspace.getConfiguration('labwired').get<string>('apiUrl')?.replace(/\/+$/, '') ||
        DEFAULT_API_URL;
    const line = claudeMcpInstallLine(`${apiUrl}/mcp`);
    await vscode.env.clipboard.writeText(line);
    vscode.window.showInformationMessage('Copied: ' + line);
}
