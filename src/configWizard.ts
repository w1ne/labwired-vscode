// LabWired - Firmware Simulation Platform
// Copyright (C) 2026 Andrii Shylenko
//
// This software is released under the MIT License.
// See the LICENSE file in the project root for full license information.

import * as vscode from 'vscode';
import * as path from 'path';
import { writeLabConfig } from './labConfig';

export async function showConfigWizard(): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        vscode.window.showErrorMessage("Please open a workspace folder first.");
        return;
    }

    const rootPath = workspaceFolders[0].uri.fsPath;
    const labDir = path.join(rootPath, '.labwired');

    // 1. Pick the firmware ELF.
    const elfFiles = await vscode.workspace.findFiles('**/target/**/debug/*', '**/node_modules/**');
    const elfItems = elfFiles.map(f => ({
        label: path.basename(f.fsPath),
        description: vscode.workspace.asRelativePath(f),
        uri: f
    }));

    let selectedElf: { uri: vscode.Uri } | undefined;
    if (elfItems.length > 0) {
        selectedElf = await vscode.window.showQuickPick(elfItems, {
            placeHolder: 'Select firmware ELF file',
            title: 'LabWired: Configure Project'
        });
    }

    if (!selectedElf) {
        const manualPath = await vscode.window.showInputBox({
            prompt: 'Enter path to firmware ELF file (relative to workspace root)',
            placeHolder: 'e.g. target/thumbv7em-none-eabi/release/firmware',
            title: 'LabWired: Configure Project'
        });
        if (!manualPath) return;
        selectedElf = { uri: vscode.Uri.file(path.resolve(rootPath, manualPath)) };
    }

    // 2. Detect an optional system.yaml at the workspace root.
    const systemAbs = path.join(rootPath, 'system.yaml');
    const hasSystemYaml = await fileExists(systemAbs);

    // 3. Write .labwired/lab.yaml with inputs relative to .labwired/.
    const cfg = {
        schema_version: '1.0',
        inputs: {
            firmware: path.relative(labDir, selectedElf.uri.fsPath),
            ...(hasSystemYaml ? { system: path.relative(labDir, systemAbs) } : {}),
        },
        limits: { max_steps: 100000 },
        assertions: [{ expected_stop_reason: 'max_steps' }],
    };

    const written = writeLabConfig(rootPath, cfg);
    vscode.window.showInformationMessage(`LabWired: Wrote ${vscode.workspace.asRelativePath(written)}`);

    // 4. Offer SVD Import (Asset Foundry).
    const importSvd = await vscode.window.showQuickPick(['Yes', 'No'], {
        placeHolder: 'Do you want to import chip peripherals (SVD) now?',
        title: 'LabWired: Asset Foundry Setup'
    });

    if (importSvd === 'Yes') {
        await importSvdWizard();
    }
}

async function fileExists(filePath: string): Promise<boolean> {
    try {
        await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
        return true;
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
