import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

function restoreOwnProperty(target: any, key: string, descriptor: PropertyDescriptor | undefined): void {
    if (descriptor) Object.defineProperty(target, key, descriptor);
    else delete target[key];
}

function makeWorkspace(name: string, index: number): { root: string; folder: vscode.WorkspaceFolder } {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), `lw-start-${name.toLowerCase()}-`));
    return {
        root,
        folder: { uri: vscode.Uri.file(root), name, index } as vscode.WorkspaceFolder,
    };
}

suite('multi-root simulator start', function () {
    this.timeout(15000);

    test('starts in the active editor workspace when no LabWired session is active', async () => {
        const first = makeWorkspace('first', 0);
        const current = makeWorkspace('current', 1);
        const workspaceApi = vscode.workspace as any;
        const debugApi = vscode.debug as any;
        const windowApi = vscode.window as any;
        const originalFolders = Object.getOwnPropertyDescriptor(workspaceApi, 'workspaceFolders');
        const originalSession = Object.getOwnPropertyDescriptor(debugApi, 'activeDebugSession');
        const originalStartDebugging = Object.getOwnPropertyDescriptor(debugApi, 'startDebugging');
        const originalEditor = Object.getOwnPropertyDescriptor(windowApi, 'activeTextEditor');
        let startedFolder: vscode.WorkspaceFolder | undefined;

        try {
            const extension = vscode.extensions.getExtension('w1ne.labwired-vscode');
            assert.ok(extension);
            await extension.activate();
            Object.defineProperty(workspaceApi, 'workspaceFolders', {
                configurable: true,
                value: [first.folder, current.folder],
            });
            Object.defineProperty(debugApi, 'activeDebugSession', {
                configurable: true,
                get: () => undefined,
            });
            Object.defineProperty(windowApi, 'activeTextEditor', {
                configurable: true,
                get: () => ({ document: { uri: vscode.Uri.file(path.join(current.root, 'src', 'main.rs')) } }),
            });
            Object.defineProperty(debugApi, 'startDebugging', {
                configurable: true,
                value: async (folder: vscode.WorkspaceFolder, _config: vscode.DebugConfiguration) => {
                    startedFolder = folder;
                    return true;
                },
            });

            await vscode.commands.executeCommand('labwired.startSimulator');

            assert.strictEqual(startedFolder?.uri.fsPath, current.folder.uri.fsPath);
        } finally {
            restoreOwnProperty(workspaceApi, 'workspaceFolders', originalFolders);
            restoreOwnProperty(debugApi, 'activeDebugSession', originalSession);
            restoreOwnProperty(debugApi, 'startDebugging', originalStartDebugging);
            restoreOwnProperty(windowApi, 'activeTextEditor', originalEditor);
            fs.rmSync(first.root, { recursive: true, force: true });
            fs.rmSync(current.root, { recursive: true, force: true });
        }
    });

    test('preserves the active LabWired session workspace and configuration', async () => {
        const first = makeWorkspace('session', 0);
        const current = makeWorkspace('editor', 1);
        const workspaceApi = vscode.workspace as any;
        const debugApi = vscode.debug as any;
        const windowApi = vscode.window as any;
        const originalFolders = Object.getOwnPropertyDescriptor(workspaceApi, 'workspaceFolders');
        const originalSession = Object.getOwnPropertyDescriptor(debugApi, 'activeDebugSession');
        const originalStartDebugging = Object.getOwnPropertyDescriptor(debugApi, 'startDebugging');
        const originalEditor = Object.getOwnPropertyDescriptor(windowApi, 'activeTextEditor');
        let startedFolder: vscode.WorkspaceFolder | undefined;
        let startedConfig: vscode.DebugConfiguration | undefined;
        const sessionConfig: vscode.DebugConfiguration = {
            type: 'labwired',
            request: 'launch',
            name: 'Active session model',
            program: '/models/session.elf',
            systemConfig: '/models/session-system.yaml',
            cwd: '/models/runtime',
            args: ['--model-specific'],
            stopOnEntry: true,
        };

        try {
            const extension = vscode.extensions.getExtension('w1ne.labwired-vscode');
            assert.ok(extension);
            await extension.activate();
            Object.defineProperty(workspaceApi, 'workspaceFolders', {
                configurable: true,
                value: [first.folder, current.folder],
            });
            Object.defineProperty(debugApi, 'activeDebugSession', {
                configurable: true,
                get: () => ({ type: 'labwired', workspaceFolder: first.folder, configuration: sessionConfig }),
            });
            Object.defineProperty(windowApi, 'activeTextEditor', {
                configurable: true,
                get: () => ({ document: { uri: vscode.Uri.file(path.join(current.root, 'src', 'main.rs')) } }),
            });
            Object.defineProperty(debugApi, 'startDebugging', {
                configurable: true,
                value: async (folder: vscode.WorkspaceFolder, config: vscode.DebugConfiguration) => {
                    startedFolder = folder;
                    startedConfig = config;
                    return true;
                },
            });

            await vscode.commands.executeCommand('labwired.startSimulator');

            assert.strictEqual(startedFolder?.uri.fsPath, first.folder.uri.fsPath);
            assert.strictEqual(startedConfig?.program, sessionConfig.program);
            assert.strictEqual(startedConfig?.systemConfig, sessionConfig.systemConfig);
            assert.strictEqual(startedConfig?.cwd, sessionConfig.cwd);
            assert.deepStrictEqual(startedConfig?.args, sessionConfig.args);
            assert.strictEqual(startedConfig?.stopOnEntry, false);
        } finally {
            restoreOwnProperty(workspaceApi, 'workspaceFolders', originalFolders);
            restoreOwnProperty(debugApi, 'activeDebugSession', originalSession);
            restoreOwnProperty(debugApi, 'startDebugging', originalStartDebugging);
            restoreOwnProperty(windowApi, 'activeTextEditor', originalEditor);
            fs.rmSync(first.root, { recursive: true, force: true });
            fs.rmSync(current.root, { recursive: true, force: true });
        }
    });

    test('Run builds and tests the active editor workspace', async () => {
        const first = makeWorkspace('run-first', 0);
        const current = makeWorkspace('run-current', 1);
        fs.writeFileSync(path.join(current.root, 'Makefile'), 'all:\n\t@true\n');
        fs.mkdirSync(path.join(current.root, '.labwired'), { recursive: true });
        fs.writeFileSync(path.join(current.root, '.labwired', 'lab.yaml'), [
            'schema_version: "1.0"',
            'inputs:',
            '  firmware: ../build/model.elf',
        ].join('\n') + '\n');

        const capturePath = path.join(current.root, 'run-capture.json');
        const cliPath = path.join(current.root, 'fake-labwired-cli');
        fs.writeFileSync(cliPath, [
            '#!/usr/bin/env node',
            'const fs = require("fs");',
            'fs.writeFileSync(process.env.LW_RUN_CAPTURE, JSON.stringify({ cwd: process.cwd(), args: process.argv.slice(2) }));',
        ].join('\n') + '\n');
        fs.chmodSync(cliPath, 0o755);

        const workspaceApi = vscode.workspace as any;
        const debugApi = vscode.debug as any;
        const windowApi = vscode.window as any;
        const originalFolders = Object.getOwnPropertyDescriptor(workspaceApi, 'workspaceFolders');
        const originalSession = Object.getOwnPropertyDescriptor(debugApi, 'activeDebugSession');
        const originalStartDebugging = Object.getOwnPropertyDescriptor(debugApi, 'startDebugging');
        const originalEditor = Object.getOwnPropertyDescriptor(windowApi, 'activeTextEditor');
        const originalWithProgress = Object.getOwnPropertyDescriptor(windowApi, 'withProgress');
        const originalInformation = Object.getOwnPropertyDescriptor(windowApi, 'showInformationMessage');
        const originalError = Object.getOwnPropertyDescriptor(windowApi, 'showErrorMessage');
        const childProcess = require('child_process');
        const originalExec = Object.getOwnPropertyDescriptor(childProcess, 'exec');
        const settings = vscode.workspace.getConfiguration('labwired');
        const originalCliPath = settings.inspect<string>('cliPath')?.globalValue;
        const originalCapture = process.env.LW_RUN_CAPTURE;
        let buildCwd: string | undefined;

        try {
            const extension = vscode.extensions.getExtension('w1ne.labwired-vscode');
            assert.ok(extension);
            await extension.activate();
            await settings.update('cliPath', cliPath, vscode.ConfigurationTarget.Global);
            process.env.LW_RUN_CAPTURE = capturePath;
            Object.defineProperty(workspaceApi, 'workspaceFolders', {
                configurable: true,
                value: [first.folder, current.folder],
            });
            Object.defineProperty(debugApi, 'activeDebugSession', {
                configurable: true,
                get: () => undefined,
            });
            Object.defineProperty(windowApi, 'activeTextEditor', {
                configurable: true,
                get: () => ({ document: { uri: vscode.Uri.file(path.join(current.root, 'src', 'main.rs')) } }),
            });
            Object.defineProperty(windowApi, 'withProgress', {
                configurable: true,
                value: async (_options: any, task: (progress: any, token: any) => Promise<unknown>) =>
                    task({ report: () => undefined }, { isCancellationRequested: false }),
            });
            Object.defineProperty(windowApi, 'showInformationMessage', {
                configurable: true,
                value: async () => undefined,
            });
            Object.defineProperty(windowApi, 'showErrorMessage', {
                configurable: true,
                value: async () => undefined,
            });
            Object.defineProperty(debugApi, 'startDebugging', {
                configurable: true,
                value: async () => true,
            });
            Object.defineProperty(childProcess, 'exec', {
                configurable: true,
                value: (_command: string, options: { cwd: string }, callback: (error: Error | null, stdout: string, stderr: string) => void) => {
                    buildCwd = options.cwd;
                    callback(null, 'build complete', '');
                    return {};
                },
            });

            await vscode.commands.executeCommand('labwired.compileAndRun');

            assert.strictEqual(buildCwd, current.root);
            const cliRun = JSON.parse(fs.readFileSync(capturePath, 'utf8'));
            assert.strictEqual(cliRun.cwd, fs.realpathSync(current.root));
            assert.ok(cliRun.args.includes(path.join(current.root, '.labwired', 'lab.yaml')));
        } finally {
            restoreOwnProperty(workspaceApi, 'workspaceFolders', originalFolders);
            restoreOwnProperty(debugApi, 'activeDebugSession', originalSession);
            restoreOwnProperty(debugApi, 'startDebugging', originalStartDebugging);
            restoreOwnProperty(windowApi, 'activeTextEditor', originalEditor);
            restoreOwnProperty(windowApi, 'withProgress', originalWithProgress);
            restoreOwnProperty(windowApi, 'showInformationMessage', originalInformation);
            restoreOwnProperty(windowApi, 'showErrorMessage', originalError);
            restoreOwnProperty(childProcess, 'exec', originalExec);
            await settings.update('cliPath', originalCliPath, vscode.ConfigurationTarget.Global);
            if (originalCapture === undefined) delete process.env.LW_RUN_CAPTURE;
            else process.env.LW_RUN_CAPTURE = originalCapture;
            fs.rmSync(first.root, { recursive: true, force: true });
            fs.rmSync(current.root, { recursive: true, force: true });
        }
    });
});
