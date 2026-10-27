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
const yaml = require("js-yaml");
const pathAssertions_1 = require("../pathAssertions");
const extension_1 = require("../../extension");
const commandCenter_1 = require("../../commandCenter");
const topologyPanel_1 = require("../../topologyPanel");
suite('model profile views', function () {
    this.timeout(15000);
    let root;
    let systemFile;
    let firmwareFile;
    let workspaceFolder;
    let workspaceFoldersDescriptor;
    function createProfile(name) {
        const profileRoot = fs.mkdtempSync(path.join(os.tmpdir(), `lw-model-${name.toLowerCase().replace(/\s+/g, '-')}-`));
        const systemPath = path.join(profileRoot, 'config', 'system.yaml');
        fs.mkdirSync(path.dirname(systemPath), { recursive: true });
        fs.writeFileSync(systemPath, `name: ${name}\nchip: ${name}\n`);
        fs.mkdirSync(path.join(profileRoot, '.labwired'), { recursive: true });
        fs.writeFileSync(path.join(profileRoot, '.labwired', 'lab.yaml'), yaml.dump({
            schema_version: '1.0',
            inputs: { system: '../config/system.yaml' },
        }));
        const folder = {
            uri: vscode.Uri.file(profileRoot), name, index: 0,
        };
        const editor = {
            document: { uri: vscode.Uri.file(path.join(profileRoot, 'src', 'main.rs')) },
        };
        return { root: profileRoot, systemPath, folder, editor };
    }
    suiteSetup(() => __awaiter(this, void 0, void 0, function* () {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'lw-model-views-'));
        systemFile = path.join(root, 'crates', 'chips', 'k32w041z-system.yaml');
        firmwareFile = path.join(root, 'target', 'release', 'model.elf');
        fs.mkdirSync(path.dirname(systemFile), { recursive: true });
        fs.mkdirSync(path.dirname(firmwareFile), { recursive: true });
        fs.writeFileSync(systemFile, 'name: Nested K32W041Z Model\nchip: k32w041z-system.yaml\n');
        fs.writeFileSync(firmwareFile, 'firmware');
        fs.mkdirSync(path.join(root, '.labwired'), { recursive: true });
        fs.writeFileSync(path.join(root, '.labwired', 'lab.yaml'), yaml.dump({
            schema_version: '1.0',
            inputs: {
                firmware: '../target/release/model.elf',
                system: '../crates/chips/k32w041z-system.yaml',
            },
        }));
        workspaceFolder = {
            uri: vscode.Uri.file(root), name: 'model-profile-views-test', index: 0,
        };
        const workspaceApi = vscode.workspace;
        workspaceFoldersDescriptor = Object.getOwnPropertyDescriptor(workspaceApi, 'workspaceFolders');
        Object.defineProperty(workspaceApi, 'workspaceFolders', {
            configurable: true,
            value: [workspaceFolder],
        });
    }));
    suiteTeardown(() => __awaiter(this, void 0, void 0, function* () {
        const workspaceApi = vscode.workspace;
        if (workspaceFoldersDescriptor) {
            Object.defineProperty(workspaceApi, 'workspaceFolders', workspaceFoldersDescriptor);
        }
        else {
            delete workspaceApi.workspaceFolders;
        }
        fs.rmSync(root, { recursive: true, force: true });
    }));
    test('F5, device view, and topology view resolve the same nested system profile', () => __awaiter(this, void 0, void 0, function* () {
        var _a;
        const output = { appendLine: (_line) => undefined };
        const childProcess = {
            execSync: (command) => command === 'rustc --print sysroot'
                ? '/rust/sysroot'
                : 'commit-hash: abcdef123',
        };
        const configurationProvider = new extension_1.LabwiredConfigurationProvider(output, childProcess, (file) => __awaiter(this, void 0, void 0, function* () { return fs.existsSync(file); }));
        const debugConfig = {
            type: 'labwired', name: 'Model profile test', request: 'launch'
        };
        const resolved = yield configurationProvider.resolveDebugConfiguration(workspaceFolder, debugConfig);
        assert.strictEqual((resolved === null || resolved === void 0 ? void 0 : resolved.systemConfig) && (0, pathAssertions_1.normalizePathForComparison)(resolved.systemConfig), (0, pathAssertions_1.normalizePathForComparison)(systemFile));
        const boardMessages = [];
        const commandCenter = new commandCenter_1.LabwiredCommandCenterProvider(vscode.Uri.file(root), true);
        commandCenter._view = { webview: { postMessage: (message) => boardMessages.push(message) } };
        yield commandCenter.updateBoard();
        const board = (_a = boardMessages.find((message) => message.type === 'boardUpdate')) === null || _a === void 0 ? void 0 : _a.data;
        const topology = Object.create(topologyPanel_1.SystemTopologyPanel.prototype);
        const topologyBoard = yield topology._getBoardData();
        assert.strictEqual(board === null || board === void 0 ? void 0 : board.name, 'Nested K32W041Z Model');
        assert.strictEqual(topologyBoard === null || topologyBoard === void 0 ? void 0 : topologyBoard.name, 'Nested K32W041Z Model');
    }));
    test('command center and topology follow the active session workspace and resolve relative paths there', () => __awaiter(this, void 0, void 0, function* () {
        var _b;
        const secondRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lw-model-views-session-'));
        const activeSystem = path.join(secondRoot, 'profiles', 'active-system.yaml');
        const activeFirmware = path.join(secondRoot, 'target', 'active.elf');
        fs.mkdirSync(path.dirname(activeSystem), { recursive: true });
        fs.mkdirSync(path.dirname(activeFirmware), { recursive: true });
        fs.writeFileSync(activeSystem, 'name: Active Session Workspace\nchip: active-model\n');
        fs.writeFileSync(activeFirmware, 'firmware');
        const secondFolder = {
            uri: vscode.Uri.file(secondRoot), name: 'active-session-workspace', index: 1,
        };
        const workspaceApi = vscode.workspace;
        const originalFolders = Object.getOwnPropertyDescriptor(workspaceApi, 'workspaceFolders');
        const debugApi = vscode.debug;
        const originalSession = Object.getOwnPropertyDescriptor(debugApi, 'activeDebugSession');
        const activeSession = {
            type: 'labwired',
            workspaceFolder: secondFolder,
            configuration: { systemConfig: 'profiles/active-system.yaml' },
        };
        try {
            Object.defineProperty(workspaceApi, 'workspaceFolders', {
                configurable: true,
                value: [workspaceFolder, secondFolder],
            });
            Object.defineProperty(debugApi, 'activeDebugSession', {
                configurable: true,
                get: () => activeSession,
            });
            const output = { appendLine: (_line) => undefined };
            const configurationProvider = new extension_1.LabwiredConfigurationProvider(output, { execSync: (command) => command === 'rustc --print sysroot'
                    ? '/rust/sysroot'
                    : 'commit-hash: abcdef123' }, (file) => __awaiter(this, void 0, void 0, function* () { return fs.existsSync(file); }));
            const f5 = yield configurationProvider.resolveDebugConfiguration(secondFolder, {
                type: 'labwired', name: 'Active model', request: 'launch',
                program: activeFirmware, systemConfig: 'profiles/active-system.yaml',
            });
            const boardMessages = [];
            const commandCenter = new commandCenter_1.LabwiredCommandCenterProvider(vscode.Uri.file(secondRoot), true);
            commandCenter._view = { webview: { postMessage: (message) => boardMessages.push(message) } };
            yield commandCenter.updateBoard();
            const topology = Object.create(topologyPanel_1.SystemTopologyPanel.prototype);
            const topologyBoard = yield topology._getBoardData();
            const board = (_b = boardMessages.find((message) => message.type === 'boardUpdate')) === null || _b === void 0 ? void 0 : _b.data;
            assert.strictEqual((f5 === null || f5 === void 0 ? void 0 : f5.systemConfig) && (0, pathAssertions_1.normalizePathForComparison)(f5.systemConfig), (0, pathAssertions_1.normalizePathForComparison)(activeSystem));
            assert.strictEqual(board === null || board === void 0 ? void 0 : board.name, 'Active Session Workspace');
            assert.strictEqual(topologyBoard === null || topologyBoard === void 0 ? void 0 : topologyBoard.name, 'Active Session Workspace');
        }
        finally {
            if (originalFolders)
                Object.defineProperty(workspaceApi, 'workspaceFolders', originalFolders);
            else
                delete workspaceApi.workspaceFolders;
            if (originalSession)
                Object.defineProperty(debugApi, 'activeDebugSession', originalSession);
            else
                delete debugApi.activeDebugSession;
            fs.rmSync(secondRoot, { recursive: true, force: true });
        }
    }));
    test('an unrelated debugger session does not override the active editor model folder', () => __awaiter(this, void 0, void 0, function* () {
        var _c;
        const folderA = createProfile('Debugger Folder A');
        const folderB = createProfile('Editor Model Folder B');
        const workspaceApi = vscode.workspace;
        const originalFolders = Object.getOwnPropertyDescriptor(workspaceApi, 'workspaceFolders');
        const debugApi = vscode.debug;
        const originalSession = Object.getOwnPropertyDescriptor(debugApi, 'activeDebugSession');
        const windowApi = vscode.window;
        const originalEditor = Object.getOwnPropertyDescriptor(windowApi, 'activeTextEditor');
        try {
            Object.defineProperty(workspaceApi, 'workspaceFolders', {
                configurable: true,
                value: [folderA.folder, folderB.folder],
            });
            Object.defineProperty(debugApi, 'activeDebugSession', {
                configurable: true,
                get: () => ({ type: 'python', workspaceFolder: folderA.folder, configuration: {} }),
            });
            Object.defineProperty(windowApi, 'activeTextEditor', {
                configurable: true,
                get: () => folderB.editor,
            });
            const messages = [];
            const commandCenter = new commandCenter_1.LabwiredCommandCenterProvider(vscode.Uri.file(folderB.root), true);
            commandCenter._view = { webview: { postMessage: (message) => messages.push(message) } };
            yield commandCenter.updateBoard();
            const topology = Object.create(topologyPanel_1.SystemTopologyPanel.prototype);
            const topologyBoard = yield topology._getBoardData();
            const commandCenterBoard = (_c = messages.find((message) => message.type === 'boardUpdate')) === null || _c === void 0 ? void 0 : _c.data;
            assert.strictEqual(commandCenterBoard === null || commandCenterBoard === void 0 ? void 0 : commandCenterBoard.name, 'Editor Model Folder B');
            assert.strictEqual(topologyBoard === null || topologyBoard === void 0 ? void 0 : topologyBoard.name, 'Editor Model Folder B');
        }
        finally {
            if (originalFolders)
                Object.defineProperty(workspaceApi, 'workspaceFolders', originalFolders);
            else
                delete workspaceApi.workspaceFolders;
            if (originalSession)
                Object.defineProperty(debugApi, 'activeDebugSession', originalSession);
            else
                delete debugApi.activeDebugSession;
            if (originalEditor)
                Object.defineProperty(windowApi, 'activeTextEditor', originalEditor);
            else
                delete windowApi.activeTextEditor;
            fs.rmSync(folderA.root, { recursive: true, force: true });
            fs.rmSync(folderB.root, { recursive: true, force: true });
        }
    }));
    test('both views refresh to the editor model folder after an editor change without a LabWired session', () => __awaiter(this, void 0, void 0, function* () {
        var _d, _e, _f, _g;
        const folderA = createProfile('First Editor Model');
        const folderB = createProfile('Second Editor Model');
        const workspaceApi = vscode.workspace;
        const originalFolders = Object.getOwnPropertyDescriptor(workspaceApi, 'workspaceFolders');
        const originalCreateWatcher = Object.getOwnPropertyDescriptor(workspaceApi, 'createFileSystemWatcher');
        const debugApi = vscode.debug;
        const originalSession = Object.getOwnPropertyDescriptor(debugApi, 'activeDebugSession');
        const originalSessionChange = Object.getOwnPropertyDescriptor(debugApi, 'onDidChangeActiveDebugSession');
        const windowApi = vscode.window;
        const originalEditor = Object.getOwnPropertyDescriptor(windowApi, 'activeTextEditor');
        const originalEditorChange = Object.getOwnPropertyDescriptor(windowApi, 'onDidChangeActiveTextEditor');
        let currentEditor = folderA.editor;
        const editorChangeListeners = [];
        const commandCenterMessages = [];
        const topologyMessages = [];
        const disposable = { dispose: () => undefined };
        try {
            Object.defineProperty(workspaceApi, 'workspaceFolders', {
                configurable: true,
                value: [folderA.folder, Object.assign(Object.assign({}, folderB.folder), { index: 1 })],
            });
            workspaceApi.createFileSystemWatcher = () => ({
                onDidChange: () => disposable,
                onDidCreate: () => disposable,
                onDidDelete: () => disposable,
                dispose: () => undefined,
            });
            Object.defineProperty(debugApi, 'activeDebugSession', {
                configurable: true,
                get: () => undefined,
            });
            debugApi.onDidChangeActiveDebugSession = () => disposable;
            Object.defineProperty(windowApi, 'activeTextEditor', {
                configurable: true,
                get: () => currentEditor,
            });
            windowApi.onDidChangeActiveTextEditor = (listener) => {
                editorChangeListeners.push(listener);
                return disposable;
            };
            const webview = {
                asWebviewUri: (uri) => uri,
                postMessage: (message) => commandCenterMessages.push(message),
                onDidReceiveMessage: () => disposable,
            };
            const commandCenter = new commandCenter_1.LabwiredCommandCenterProvider(vscode.Uri.file(folderA.root), true);
            commandCenter.resolveWebviewView({ webview, onDidDispose: () => disposable }, {}, {});
            const topologyPanel = {
                webview: {
                    asWebviewUri: (uri) => uri,
                    postMessage: (message) => topologyMessages.push(message),
                },
                onDidDispose: () => disposable,
                dispose: () => undefined,
            };
            new topologyPanel_1.SystemTopologyPanel(topologyPanel, vscode.Uri.file(folderA.root));
            yield new Promise((resolve) => setTimeout(resolve, 0));
            const initialCommandCenterBoards = commandCenterMessages.filter((message) => message.type === 'boardUpdate');
            const initialTopologyBoards = topologyMessages.filter((message) => message.type === 'update');
            const initialCommandCenterBoard = (_d = initialCommandCenterBoards[initialCommandCenterBoards.length - 1]) === null || _d === void 0 ? void 0 : _d.data;
            const initialTopologyBoard = (_e = initialTopologyBoards[initialTopologyBoards.length - 1]) === null || _e === void 0 ? void 0 : _e.data;
            assert.strictEqual(initialCommandCenterBoard === null || initialCommandCenterBoard === void 0 ? void 0 : initialCommandCenterBoard.name, 'First Editor Model');
            assert.strictEqual(initialTopologyBoard === null || initialTopologyBoard === void 0 ? void 0 : initialTopologyBoard.name, 'First Editor Model');
            assert.strictEqual(editorChangeListeners.length, 2);
            currentEditor = folderB.editor;
            yield Promise.all(editorChangeListeners.map((listener) => listener(folderB.editor)));
            const updatedCommandCenterBoards = commandCenterMessages.filter((message) => message.type === 'boardUpdate');
            const updatedTopologyBoards = topologyMessages.filter((message) => message.type === 'update');
            const updatedCommandCenterBoard = (_f = updatedCommandCenterBoards[updatedCommandCenterBoards.length - 1]) === null || _f === void 0 ? void 0 : _f.data;
            const updatedTopologyBoard = (_g = updatedTopologyBoards[updatedTopologyBoards.length - 1]) === null || _g === void 0 ? void 0 : _g.data;
            assert.strictEqual(updatedCommandCenterBoard === null || updatedCommandCenterBoard === void 0 ? void 0 : updatedCommandCenterBoard.name, 'Second Editor Model');
            assert.strictEqual(updatedTopologyBoard === null || updatedTopologyBoard === void 0 ? void 0 : updatedTopologyBoard.name, 'Second Editor Model');
        }
        finally {
            if (originalFolders)
                Object.defineProperty(workspaceApi, 'workspaceFolders', originalFolders);
            else
                delete workspaceApi.workspaceFolders;
            if (originalCreateWatcher)
                Object.defineProperty(workspaceApi, 'createFileSystemWatcher', originalCreateWatcher);
            else
                delete workspaceApi.createFileSystemWatcher;
            if (originalSession)
                Object.defineProperty(debugApi, 'activeDebugSession', originalSession);
            else
                delete debugApi.activeDebugSession;
            if (originalSessionChange)
                Object.defineProperty(debugApi, 'onDidChangeActiveDebugSession', originalSessionChange);
            else
                delete debugApi.onDidChangeActiveDebugSession;
            if (originalEditor)
                Object.defineProperty(windowApi, 'activeTextEditor', originalEditor);
            else
                delete windowApi.activeTextEditor;
            if (originalEditorChange)
                Object.defineProperty(windowApi, 'onDidChangeActiveTextEditor', originalEditorChange);
            else
                delete windowApi.onDidChangeActiveTextEditor;
            fs.rmSync(folderA.root, { recursive: true, force: true });
            fs.rmSync(folderB.root, { recursive: true, force: true });
        }
    }));
});
//# sourceMappingURL=modelProfileViews.test.js.map