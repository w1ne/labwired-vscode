// LabWired - Firmware Simulation Platform
// Copyright (C) 2026 Andrii Shylenko
//
// This software is released under the MIT License.
// See the LICENSE file in the project root for full license information.

import * as vscode from 'vscode';
import * as path from 'path';
import { findLabConfig, LabConfig, LabDebugAdapter, writeLabConfig } from './labConfig';
import { ModelWorkspaceTarget, resolveCurrentModelWorkspaceFolder } from './workspaceSelection';
import { customDapExecutablePath } from './customDap';

export async function showModelConfigWizard(target?: ModelWorkspaceTarget): Promise<void> {
    const workspaceFolder = resolveCurrentModelWorkspaceFolder(target);
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('Please open a workspace folder first.');
        return;
    }

    const rootPath = workspaceFolder.uri.fsPath;
    const labDir = path.join(rootPath, '.labwired');
    const relativePath = (absolutePath: string) =>
        path.relative(labDir, absolutePath).split(path.sep).join('/');
    const existingConfig = findLabConfig(rootPath);
    if (existingConfig) {
        const choice = await vscode.window.showWarningMessage(
            'LabWired: .labwired/lab.yaml already exists. Replace this model profile?',
            { modal: true },
            'Replace Profile'
        );
        if (choice !== 'Replace Profile') return;
    }

    const systemUris = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        filters: { 'System YAML': ['yaml', 'yml'] },
        title: 'LabWired: Select Model System YAML',
        openLabel: 'Select System YAML',
    });
    if (!systemUris?.[0]) return;

    const firmwareUris = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        filters: { 'Firmware ELF': ['elf', 'out', 'bin', '*'] },
        title: 'LabWired: Select Firmware ELF',
        openLabel: 'Select Firmware',
    });
    if (!firmwareUris?.[0]) return;

    let adapter: LabDebugAdapter | undefined;
    const adapterChoice = await vscode.window.showQuickPick(
        ['Use standard LabWired DAP', 'Configure custom DAP'],
        {
            title: 'LabWired: Configure Model',
            placeHolder: 'Choose the debugger for this model',
            ignoreFocusOut: true,
        }
    );
    if (!adapterChoice) return;

    if (adapterChoice === 'Configure custom DAP') {
        const executableSource = await vscode.window.showQuickPick(
            ['Select existing executable', 'Enter executable path'],
            {
                title: 'LabWired: Configure Custom DAP',
                placeHolder: 'Choose an existing executable or enter its future build output path',
                ignoreFocusOut: true,
            }
        );
        if (!executableSource) return;

        let executablePath: string;
        if (executableSource === 'Select existing executable') {
            const executableUris = await vscode.window.showOpenDialog({
                canSelectFiles: true,
                canSelectFolders: false,
                canSelectMany: false,
                filters: { 'Executable': ['*'] },
                title: 'LabWired: Select Custom DAP Executable',
                openLabel: 'Select Executable',
            });
            if (!executableUris?.[0]) return;
            executablePath = executableUris[0].fsPath;
        } else {
            const executableText = await vscode.window.showInputBox({
                title: 'LabWired: Configure Custom DAP',
                prompt: 'Executable path (absolute or relative to the project root)',
                placeHolder: 'target/release/labwired-dap',
                ignoreFocusOut: true,
            });
            if (executableText === undefined || !executableText.trim()) return;
            executablePath = path.resolve(rootPath, executableText.trim());
        }

        const buildChoice = await vscode.window.showQuickPick(
            ['Use prebuilt executable', 'Build before each F5'],
            {
                title: 'LabWired: Configure Model',
                placeHolder: 'Choose whether LabWired should build the custom DAP before launch',
                ignoreFocusOut: true,
            }
        );
        if (!buildChoice) return;

        if (buildChoice === 'Use prebuilt executable') {
            executablePath = customDapExecutablePath(executablePath);
            if (!await fileExists(executablePath)) {
                vscode.window.showErrorMessage(`LabWired: Prebuilt custom DAP executable was not found at '${executablePath}'.`);
                return;
            }
        }

        let build: { command: string; args: string[]; cwd?: string } | undefined;
        if (buildChoice === 'Build before each F5') {
            const command = await vscode.window.showInputBox({
                title: 'LabWired: Configure Custom DAP Build',
                prompt: 'Build program to run (for example: cargo)',
                placeHolder: 'cargo',
                ignoreFocusOut: true,
            });
            if (!command?.trim()) return;

            const argsText = await vscode.window.showInputBox({
                title: 'LabWired: Configure Custom DAP Build',
                prompt: 'Build arguments as a JSON array of strings',
                value: '[]',
                placeHolder: '["build", "--release"]',
                ignoreFocusOut: true,
            });
            if (argsText === undefined) return;

            let args: unknown;
            try {
                args = JSON.parse(argsText);
            } catch {
                vscode.window.showErrorMessage('LabWired: Build arguments must be a JSON array of strings.');
                return;
            }
            if (!Array.isArray(args) || !args.every((arg) => typeof arg === 'string')) {
                vscode.window.showErrorMessage('LabWired: Build arguments must be a JSON array of strings.');
                return;
            }

            const cwdText = await vscode.window.showInputBox({
                title: 'LabWired: Configure Custom DAP Build',
                prompt: 'Working directory (absolute or relative to the project root)',
                value: '.',
                placeHolder: '.',
                ignoreFocusOut: true,
            });
            if (cwdText === undefined) return;
            const cwd = path.resolve(rootPath, cwdText.trim() || '.');
            build = { command: command.trim(), args, cwd: relativePath(cwd) };
        }

        adapter = {
            executable: relativePath(executablePath),
            ...(build ? { build } : {}),
        };
    }

    const config: LabConfig = {
        schema_version: '1.0',
        inputs: {
            firmware: relativePath(firmwareUris[0].fsPath),
            system: relativePath(systemUris[0].fsPath),
        },
        ...(adapter ? { debug: { adapter } } : {}),
        limits: { max_steps: 100000 },
        assertions: [{ expected_stop_reason: 'max_steps' }],
    };

    const written = writeLabConfig(rootPath, config);
    vscode.window.showInformationMessage(`LabWired: Wrote ${vscode.workspace.asRelativePath(written)}`);
}

export async function showConfigWizard(): Promise<void> {
    return showModelConfigWizard();
}

async function fileExists(filePath: string): Promise<boolean> {
    try {
        const stat = await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
        return (stat.type & vscode.FileType.File) !== 0;
    } catch {
        return false;
    }
}

export async function importSvdWizard(): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        vscode.window.showErrorMessage("Please open a workspace folder first.");
        return;
    }
    const rootPath = workspaceFolders[0].uri.fsPath;

    // 1. Select SVD File
    const svdFiles = await vscode.workspace.findFiles('**/*.svd', '**/node_modules/**');
    let selectedSvd: vscode.Uri | undefined;

    if (svdFiles.length === 0) {
        const uris = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            filters: { 'SVD Files': ['svd'] },
            title: 'Select SVD File'
        });
        if (uris && uris.length > 0) selectedSvd = uris[0];
    } else {
        const items = svdFiles.map(f => ({
            label: path.basename(f.fsPath),
            description: vscode.workspace.asRelativePath(f),
            uri: f
        }));
        items.push({ label: "$(file-directory) Browse...", description: "Select from disk", uri: vscode.Uri.file("") });

        const selection = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select SVD file to import',
            title: 'LabWired: Import SVD (Asset Foundry)'
        });

        if (selection) {
            if (selection.label.startsWith("$(file-directory)")) {
                const uris = await vscode.window.showOpenDialog({
                    canSelectFiles: true,
                    filters: { 'SVD Files': ['svd'] }
                });
                if (uris && uris.length > 0) selectedSvd = uris[0];
            } else {
                selectedSvd = selection.uri;
            }
        }
    }

    if (!selectedSvd) return;

    // 2. Output Filename
    const outputName = await vscode.window.showInputBox({
        prompt: 'Enter output Rust filename',
        value: 'peripherals.rs',
        placeHolder: 'peripherals.rs'
    });

    if (!outputName) return;

    const cliPath = await getCliPath();
    if (!cliPath) {
        vscode.window.showErrorMessage("LabWired CLI not found. Please build the core project.");
        return;
    }

    // 3. Run Pipeline: SVD -> IR -> Rust
    const irPath = path.join(rootPath, 'labwired_ir.json');
    const rsPath = path.join(rootPath, outputName);

    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Asset Foundry: Generating Code...",
        cancellable: false
    }, async (progress) => {
        const cp = require('child_process');
        const exec = (cmd: string) => new Promise((res, rej) => {
            cp.exec(cmd, { cwd: rootPath }, (err: any, stdout: string, stderr: string) => {
                if (err) rej(stderr || stdout);
                else res(stdout);
            });
        });

        try {
            // Step A: SVD -> IR
            progress.report({ message: "Parsing SVD..." });
            await exec(`${cliPath} asset import-svd --input "${selectedSvd?.fsPath}" --output "${irPath}"`);

            // Step B: IR -> Rust
            progress.report({ message: `Generating ${outputName}...` });
            await exec(`${cliPath} asset codegen --input "${irPath}" --output "${rsPath}"`);

            vscode.window.showInformationMessage(`Asset Foundry: Successfully generated ${outputName}`);

            // Open the generated file
            const doc = await vscode.workspace.openTextDocument(rsPath);
            await vscode.window.showTextDocument(doc);

        } catch (e) {
            vscode.window.showErrorMessage(`Asset Foundry Failed: ${e}`);
        }
    });

    // 4. Update system.yaml (optional, if we want to auto-configure sim)
    // For now, focusing on the code generation part as requested.
}

async function getCliPath(): Promise<string | undefined> {
    const config = vscode.workspace.getConfiguration('labwired');
    const configuredPath = config.get<string>('cliPath');
    if (configuredPath && await fileExists(configuredPath)) {
        return configuredPath;
    }

    const binName = process.platform === 'win32' ? 'labwired.exe' : 'labwired';
    const extensionPath = vscode.extensions.getExtension('w1ne.labwired-vscode')?.extensionUri.fsPath;
    const workspaces = vscode.workspace.workspaceFolders || [];
    const candidates: string[] = [];

    if (extensionPath) {
        candidates.push(path.join(extensionPath, 'dist', 'bin', binName));
        candidates.push(path.join(extensionPath, 'bin', binName));
    }

    for (const folder of workspaces) {
        let current = folder.uri.fsPath;
        for (let i = 0; i < 5; i++) {
            candidates.push(path.join(current, binName));
            candidates.push(path.join(current, 'target', 'debug', binName));
            candidates.push(path.join(current, 'target', 'release', binName));
            candidates.push(path.join(current, 'core', 'target', 'debug', binName));
            candidates.push(path.join(current, 'core', 'target', 'release', binName));
            const parent = path.dirname(current);
            if (parent === current) break;
            current = parent;
        }
    }

    for (const entry of (process.env.PATH || '').split(path.delimiter).filter(Boolean)) {
        candidates.push(path.join(entry, binName));
    }

    for (const candidate of candidates) {
        if (await fileExists(candidate)) {
            return candidate;
        }
    }

    return undefined;
}
