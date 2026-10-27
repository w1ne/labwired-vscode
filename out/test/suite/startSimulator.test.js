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
const pathAssertions_1 = require("../pathAssertions");
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
    test('Run prefers the project runner and falls back to the stock CLI', () => __awaiter(this, void 0, void 0, function* () {
        var _a;
        const first = makeWorkspace('run-first', 0);
        const current = makeWorkspace('run-current', 1);
        fs.writeFileSync(path.join(current.root, 'Makefile'), 'all:\n\t@true\n');
        fs.mkdirSync(path.join(current.root, '.labwired'), { recursive: true });
        const corePrefix = [
            'schema_version: "1.2"',
            'inputs:',
            '  firmware: ../build/model.elf',
            '  system: ../configs/model.yaml',
            'limits:',
            '  max_steps: 5000',
            '  max_cycles: 2500',
            'assertions:',
            '  - expected_stop_reason: max_steps',
        ].join('\n') + '\n';
        const extensionFields = [
            'debug:',
            '  adapter:',
            '    executable: ../target/model-dap',
            'runner:',
            '  executable: ../target/release/labwired-pro',
        ].join('\n') + '\n';
        const coreSuffix = [
            'stack_paint: false',
            'faults: []',
            'verdict: null',
            'stimuli:',
            '  - target:',
            '      component: drive_motor',
            '      channel: stall',
            '    trigger: !after_cycles { cycles: 100 }',
            '    value: 1.0',
        ].join('\n') + '\n';
        const originalScript = `${corePrefix}${extensionFields}${coreSuffix}`;
        const coreTestScript = `${corePrefix}${coreSuffix}`;
        fs.writeFileSync(path.join(current.root, '.labwired', 'lab.yaml'), originalScript);
        const cliPath = process.execPath;
        const labConfigPath = path.join(current.root, '.labwired', 'lab.yaml');
        const configuredRunner = path.join(current.root, 'target', 'release', 'labwired-pro');
        const expectedRunner = process.platform === 'win32' ? `${configuredRunner}.exe` : configuredRunner;
        fs.mkdirSync(path.dirname(configuredRunner), { recursive: true });
        fs.writeFileSync(expectedRunner, 'test runner');
        const cliModule = require('../../cli');
        const originalRunTest = Object.getOwnPropertyDescriptor(cliModule, 'runTest');
        const originalResolveCli = Object.getOwnPropertyDescriptor(cliModule, 'resolveCli');
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
        let buildCwd;
        let stockCliResolutions = 0;
        const runScripts = [];
        try {
            const extension = vscode.extensions.getExtension('w1ne.labwired-vscode');
            assert.ok(extension);
            yield extension.activate();
            yield settings.update('cliPath', cliPath, vscode.ConfigurationTarget.Global);
            Object.defineProperty(cliModule, 'runTest', {
                configurable: true,
                writable: true,
                value: (cli, options) => __awaiter(this, void 0, void 0, function* () {
                    runScripts.push({
                        cli,
                        path: options.script,
                        cwd: options.cwd,
                        content: fs.readFileSync(options.script, 'utf8'),
                        existedDuringRun: fs.existsSync(options.script),
                    });
                    return { exitCode: 0, result: { status: 'pass' } };
                }),
            });
            Object.defineProperty(cliModule, 'resolveCli', {
                configurable: true,
                writable: true,
                value: () => __awaiter(this, void 0, void 0, function* () {
                    stockCliResolutions++;
                    return 'stock-cli';
                }),
            });
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
            assert.strictEqual((0, pathAssertions_1.normalizePathForComparison)(buildCwd), (0, pathAssertions_1.normalizePathForComparison)(current.root));
            const runnerRun = runScripts[0];
            assert.strictEqual((0, pathAssertions_1.normalizePathForComparison)(runnerRun.cwd), (0, pathAssertions_1.normalizePathForComparison)(current.root));
            assert.strictEqual((0, pathAssertions_1.normalizePathForComparison)(runnerRun.cli), (0, pathAssertions_1.normalizePathForComparison)(expectedRunner));
            assert.notStrictEqual(runnerRun.path, labConfigPath);
            assert.strictEqual((0, pathAssertions_1.normalizePathForComparison)(path.dirname(runnerRun.path)), (0, pathAssertions_1.normalizePathForComparison)(path.dirname(labConfigPath)));
            assert.strictEqual(runnerRun.existedDuringRun, true);
            assert.strictEqual(runnerRun.content, coreTestScript);
            assert.strictEqual(fs.existsSync(runnerRun.path), false);
            assert.strictEqual(fs.readFileSync(labConfigPath, 'utf8'), originalScript);
            assert.strictEqual(stockCliResolutions, 0);
            const stockScript = `${corePrefix}${coreSuffix}`;
            fs.writeFileSync(labConfigPath, stockScript);
            yield vscode.commands.executeCommand('labwired.compileAndRun');
            assert.strictEqual(stockCliResolutions, 1);
            const stockRun = runScripts[1];
            assert.strictEqual(stockRun.cli, 'stock-cli');
            assert.strictEqual(stockRun.content, stockScript);
            assert.strictEqual(fs.existsSync(stockRun.path), false);
            assert.strictEqual(fs.readFileSync(labConfigPath, 'utf8'), stockScript);
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
            restoreOwnProperty(cliModule, 'runTest', originalRunTest);
            restoreOwnProperty(cliModule, 'resolveCli', originalResolveCli);
            yield settings.update('cliPath', originalCliPath, vscode.ConfigurationTarget.Global);
            fs.rmSync(first.root, { recursive: true, force: true });
            fs.rmSync(current.root, { recursive: true, force: true });
        }
    }));
});
//# sourceMappingURL=startSimulator.test.js.map