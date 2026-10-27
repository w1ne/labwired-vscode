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
const vscode = require("vscode");
const fs = require("fs");
const os = require("os");
const path = require("path");
function restoreOwnProperty(target, key, descriptor) {
    if (descriptor)
        Object.defineProperty(target, key, descriptor);
    else
        delete target[key];
}
function makeWorkspace(name, index) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), `lw-start-${name.toLowerCase()}-`));
    return {
        root,
        folder: { uri: vscode.Uri.file(root), name, index },
    };
}
suite('multi-root simulator start', function () {
    this.timeout(15000);
    test('starts in the active editor workspace when no LabWired session is active', () => __awaiter(this, void 0, void 0, function* () {
        const first = makeWorkspace('first', 0);
        const current = makeWorkspace('current', 1);
        const workspaceApi = vscode.workspace;
        const debugApi = vscode.debug;
        const windowApi = vscode.window;
        const originalFolders = Object.getOwnPropertyDescriptor(workspaceApi, 'workspaceFolders');
        const originalSession = Object.getOwnPropertyDescriptor(debugApi, 'activeDebugSession');
        const originalStartDebugging = Object.getOwnPropertyDescriptor(debugApi, 'startDebugging');
        const originalEditor = Object.getOwnPropertyDescriptor(windowApi, 'activeTextEditor');
        let startedFolder;
        try {
            const extension = vscode.extensions.getExtension('w1ne.labwired-vscode');
            assert.ok(extension);
            yield extension.activate();
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
                value: (folder, _config) => __awaiter(this, void 0, void 0, function* () {
                    startedFolder = folder;
                    return true;
                }),
            });
            yield vscode.commands.executeCommand('labwired.startSimulator');
            assert.strictEqual(startedFolder === null || startedFolder === void 0 ? void 0 : startedFolder.uri.fsPath, current.folder.uri.fsPath);
        }
        finally {
            restoreOwnProperty(workspaceApi, 'workspaceFolders', originalFolders);
            restoreOwnProperty(debugApi, 'activeDebugSession', originalSession);
            restoreOwnProperty(debugApi, 'startDebugging', originalStartDebugging);
            restoreOwnProperty(windowApi, 'activeTextEditor', originalEditor);
            fs.rmSync(first.root, { recursive: true, force: true });
            fs.rmSync(current.root, { recursive: true, force: true });
        }
    }));
    test('preserves the active LabWired session workspace and configuration', () => __awaiter(this, void 0, void 0, function* () {
        const first = makeWorkspace('session', 0);
        const current = makeWorkspace('editor', 1);
        const workspaceApi = vscode.workspace;
        const debugApi = vscode.debug;
        const windowApi = vscode.window;
        const originalFolders = Object.getOwnPropertyDescriptor(workspaceApi, 'workspaceFolders');
        const originalSession = Object.getOwnPropertyDescriptor(debugApi, 'activeDebugSession');
        const originalStartDebugging = Object.getOwnPropertyDescriptor(debugApi, 'startDebugging');
        const originalEditor = Object.getOwnPropertyDescriptor(windowApi, 'activeTextEditor');
        let startedFolder;
        let startedConfig;
        const sessionConfig = {
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
            yield extension.activate();
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
                value: (folder, config) => __awaiter(this, void 0, void 0, function* () {
                    startedFolder = folder;
                    startedConfig = config;
                    return true;
                }),
            });
            yield vscode.commands.executeCommand('labwired.startSimulator');
            assert.strictEqual(startedFolder === null || startedFolder === void 0 ? void 0 : startedFolder.uri.fsPath, first.folder.uri.fsPath);
            assert.strictEqual(startedConfig === null || startedConfig === void 0 ? void 0 : startedConfig.program, sessionConfig.program);
            assert.strictEqual(startedConfig === null || startedConfig === void 0 ? void 0 : startedConfig.systemConfig, sessionConfig.systemConfig);
            assert.strictEqual(startedConfig === null || startedConfig === void 0 ? void 0 : startedConfig.cwd, sessionConfig.cwd);
            assert.deepStrictEqual(startedConfig === null || startedConfig === void 0 ? void 0 : startedConfig.args, sessionConfig.args);
            assert.strictEqual(startedConfig === null || startedConfig === void 0 ? void 0 : startedConfig.stopOnEntry, false);
        }
        finally {
            restoreOwnProperty(workspaceApi, 'workspaceFolders', originalFolders);
            restoreOwnProperty(debugApi, 'activeDebugSession', originalSession);
            restoreOwnProperty(debugApi, 'startDebugging', originalStartDebugging);
            restoreOwnProperty(windowApi, 'activeTextEditor', originalEditor);
            fs.rmSync(first.root, { recursive: true, force: true });
            fs.rmSync(current.root, { recursive: true, force: true });
        }
    }));
    test('Run builds and tests the active editor workspace', () => __awaiter(this, void 0, void 0, function* () {
        var _a;
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
        const workspaceApi = vscode.workspace;
        const debugApi = vscode.debug;
        const windowApi = vscode.window;
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
        const originalCliPath = (_a = settings.inspect('cliPath')) === null || _a === void 0 ? void 0 : _a.globalValue;
        const originalCapture = process.env.LW_RUN_CAPTURE;
        let buildCwd;
        try {
            const extension = vscode.extensions.getExtension('w1ne.labwired-vscode');
            assert.ok(extension);
            yield extension.activate();
            yield settings.update('cliPath', cliPath, vscode.ConfigurationTarget.Global);
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
                value: (_options, task) => __awaiter(this, void 0, void 0, function* () { return task({ report: () => undefined }, { isCancellationRequested: false }); }),
            });
            Object.defineProperty(windowApi, 'showInformationMessage', {
                configurable: true,
                value: () => __awaiter(this, void 0, void 0, function* () { return undefined; }),
            });
            Object.defineProperty(windowApi, 'showErrorMessage', {
                configurable: true,
                value: () => __awaiter(this, void 0, void 0, function* () { return undefined; }),
            });
            Object.defineProperty(debugApi, 'startDebugging', {
                configurable: true,
                value: () => __awaiter(this, void 0, void 0, function* () { return true; }),
            });
            Object.defineProperty(childProcess, 'exec', {
                configurable: true,
                value: (_command, options, callback) => {
                    buildCwd = options.cwd;
                    callback(null, 'build complete', '');
                    return {};
                },
            });
            yield vscode.commands.executeCommand('labwired.compileAndRun');
            assert.strictEqual(buildCwd, current.root);
            const cliRun = JSON.parse(fs.readFileSync(capturePath, 'utf8'));
            assert.strictEqual(cliRun.cwd, fs.realpathSync(current.root));
            assert.ok(cliRun.args.includes(path.join(current.root, '.labwired', 'lab.yaml')));
        }
        finally {
            restoreOwnProperty(workspaceApi, 'workspaceFolders', originalFolders);
            restoreOwnProperty(debugApi, 'activeDebugSession', originalSession);
            restoreOwnProperty(debugApi, 'startDebugging', originalStartDebugging);
            restoreOwnProperty(windowApi, 'activeTextEditor', originalEditor);
            restoreOwnProperty(windowApi, 'withProgress', originalWithProgress);
            restoreOwnProperty(windowApi, 'showInformationMessage', originalInformation);
            restoreOwnProperty(windowApi, 'showErrorMessage', originalError);
            restoreOwnProperty(childProcess, 'exec', originalExec);
            yield settings.update('cliPath', originalCliPath, vscode.ConfigurationTarget.Global);
            if (originalCapture === undefined)
                delete process.env.LW_RUN_CAPTURE;
            else
                process.env.LW_RUN_CAPTURE = originalCapture;
            fs.rmSync(first.root, { recursive: true, force: true });
            fs.rmSync(current.root, { recursive: true, force: true });
        }
    }));
});
//# sourceMappingURL=startSimulator.test.js.map