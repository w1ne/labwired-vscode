import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { normalizePathForComparison } from '../pathAssertions';
import { LabwiredConfigurationProvider } from '../../extension';
import { LabwiredCommandCenterProvider } from '../../commandCenter';
import { SystemTopologyPanel } from '../../topologyPanel';

suite('model profile views', function () {
    this.timeout(15000);

    let root: string;
    let systemFile: string;
    let firmwareFile: string;
    let workspaceFolder: vscode.WorkspaceFolder;
    let workspaceFoldersDescriptor: PropertyDescriptor | undefined;

    function createProfile(name: string) {
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
        } as vscode.WorkspaceFolder;
        const editor = {
            document: { uri: vscode.Uri.file(path.join(profileRoot, 'src', 'main.rs')) },
        } as vscode.TextEditor;
        return { root: profileRoot, systemPath, folder, editor };
    }

    suiteSetup(async () => {
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
        } as vscode.WorkspaceFolder;
        const workspaceApi = vscode.workspace as any;
        workspaceFoldersDescriptor = Object.getOwnPropertyDescriptor(workspaceApi, 'workspaceFolders');
        Object.defineProperty(workspaceApi, 'workspaceFolders', {
            configurable: true,
            value: [workspaceFolder],
        });
    });

    suiteTeardown(async () => {
        const workspaceApi = vscode.workspace as any;
        if (workspaceFoldersDescriptor) {
            Object.defineProperty(workspaceApi, 'workspaceFolders', workspaceFoldersDescriptor);
        } else {
            delete workspaceApi.workspaceFolders;
        }
        fs.rmSync(root, { recursive: true, force: true });
    });

    test('F5, device view, and topology view resolve the same nested system profile', async () => {
        const output = { appendLine: (_line: string) => undefined };
        const childProcess = {
            execSync: (command: string) => command === 'rustc --print sysroot'
                ? '/rust/sysroot'
                : 'commit-hash: abcdef123',
        };
        const configurationProvider = new LabwiredConfigurationProvider(
            output as any,
            childProcess,
            async (file) => fs.existsSync(file),
        );
        const debugConfig: vscode.DebugConfiguration = {
            type: 'labwired', name: 'Model profile test', request: 'launch'
        };
        const resolved = await configurationProvider.resolveDebugConfiguration(workspaceFolder, debugConfig);
        assert.strictEqual(
            resolved?.systemConfig && normalizePathForComparison(resolved.systemConfig),
            normalizePathForComparison(systemFile),
        );

        const boardMessages: any[] = [];
        const commandCenter = new LabwiredCommandCenterProvider(vscode.Uri.file(root), true);
        (commandCenter as any)._view = { webview: { postMessage: (message: any) => boardMessages.push(message) } };
        await commandCenter.updateBoard();
        const board = boardMessages.find((message) => message.type === 'boardUpdate')?.data;

        const topology = Object.create(SystemTopologyPanel.prototype) as any;
        const topologyBoard = await topology._getBoardData();

        assert.strictEqual(board?.name, 'Nested K32W041Z Model');
        assert.strictEqual(topologyBoard?.name, 'Nested K32W041Z Model');
    });

    test('command center and topology follow the active session workspace and resolve relative paths there', async () => {
        const secondRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lw-model-views-session-'));
        const activeSystem = path.join(secondRoot, 'profiles', 'active-system.yaml');
        const activeFirmware = path.join(secondRoot, 'target', 'active.elf');
        fs.mkdirSync(path.dirname(activeSystem), { recursive: true });
        fs.mkdirSync(path.dirname(activeFirmware), { recursive: true });
        fs.writeFileSync(activeSystem, 'name: Active Session Workspace\nchip: active-model\n');
        fs.writeFileSync(activeFirmware, 'firmware');

        const secondFolder = {
            uri: vscode.Uri.file(secondRoot), name: 'active-session-workspace', index: 1,
        } as vscode.WorkspaceFolder;
        const workspaceApi = vscode.workspace as any;
        const originalFolders = Object.getOwnPropertyDescriptor(workspaceApi, 'workspaceFolders');
        const debugApi = vscode.debug as any;
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

            const output = { appendLine: (_line: string) => undefined };
            const configurationProvider = new LabwiredConfigurationProvider(
                output as any,
                { execSync: (command: string) => command === 'rustc --print sysroot'
                    ? '/rust/sysroot'
                    : 'commit-hash: abcdef123' } as any,
                async (file) => fs.existsSync(file),
            );
            const f5 = await configurationProvider.resolveDebugConfiguration(secondFolder, {
                type: 'labwired', name: 'Active model', request: 'launch',
                program: activeFirmware, systemConfig: 'profiles/active-system.yaml',
            });

            const boardMessages: any[] = [];
            const commandCenter = new LabwiredCommandCenterProvider(vscode.Uri.file(secondRoot), true);
            (commandCenter as any)._view = { webview: { postMessage: (message: any) => boardMessages.push(message) } };
            await commandCenter.updateBoard();
            const topology = Object.create(SystemTopologyPanel.prototype) as any;
            const topologyBoard = await topology._getBoardData();
            const board = boardMessages.find((message) => message.type === 'boardUpdate')?.data;

            assert.strictEqual(
                f5?.systemConfig && normalizePathForComparison(f5.systemConfig),
                normalizePathForComparison(activeSystem),
            );
            assert.strictEqual(board?.name, 'Active Session Workspace');
            assert.strictEqual(topologyBoard?.name, 'Active Session Workspace');
        } finally {
            if (originalFolders) Object.defineProperty(workspaceApi, 'workspaceFolders', originalFolders);
            else delete workspaceApi.workspaceFolders;
            if (originalSession) Object.defineProperty(debugApi, 'activeDebugSession', originalSession);
            else delete debugApi.activeDebugSession;
            fs.rmSync(secondRoot, { recursive: true, force: true });
        }
    });

    test('an unrelated debugger session does not override the active editor model folder', async () => {
        const folderA = createProfile('Debugger Folder A');
        const folderB = createProfile('Editor Model Folder B');
        const workspaceApi = vscode.workspace as any;
        const originalFolders = Object.getOwnPropertyDescriptor(workspaceApi, 'workspaceFolders');
        const debugApi = vscode.debug as any;
        const originalSession = Object.getOwnPropertyDescriptor(debugApi, 'activeDebugSession');
        const windowApi = vscode.window as any;
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

            const messages: any[] = [];
            const commandCenter = new LabwiredCommandCenterProvider(vscode.Uri.file(folderB.root), true);
            (commandCenter as any)._view = { webview: { postMessage: (message: any) => messages.push(message) } };
            await commandCenter.updateBoard();
            const topology = Object.create(SystemTopologyPanel.prototype) as any;
            const topologyBoard = await topology._getBoardData();
            const commandCenterBoard = messages.find((message) => message.type === 'boardUpdate')?.data;

            assert.strictEqual(commandCenterBoard?.name, 'Editor Model Folder B');
            assert.strictEqual(topologyBoard?.name, 'Editor Model Folder B');
        } finally {
            if (originalFolders) Object.defineProperty(workspaceApi, 'workspaceFolders', originalFolders);
            else delete workspaceApi.workspaceFolders;
            if (originalSession) Object.defineProperty(debugApi, 'activeDebugSession', originalSession);
            else delete debugApi.activeDebugSession;
            if (originalEditor) Object.defineProperty(windowApi, 'activeTextEditor', originalEditor);
            else delete windowApi.activeTextEditor;
            fs.rmSync(folderA.root, { recursive: true, force: true });
            fs.rmSync(folderB.root, { recursive: true, force: true });
        }
    });

    test('both views refresh to the editor model folder after an editor change without a LabWired session', async () => {
        const folderA = createProfile('First Editor Model');
        const folderB = createProfile('Second Editor Model');
        const workspaceApi = vscode.workspace as any;
        const originalFolders = Object.getOwnPropertyDescriptor(workspaceApi, 'workspaceFolders');
        const originalCreateWatcher = Object.getOwnPropertyDescriptor(workspaceApi, 'createFileSystemWatcher');
        const debugApi = vscode.debug as any;
        const originalSession = Object.getOwnPropertyDescriptor(debugApi, 'activeDebugSession');
        const originalSessionChange = Object.getOwnPropertyDescriptor(debugApi, 'onDidChangeActiveDebugSession');
        const windowApi = vscode.window as any;
        const originalEditor = Object.getOwnPropertyDescriptor(windowApi, 'activeTextEditor');
        const originalEditorChange = Object.getOwnPropertyDescriptor(windowApi, 'onDidChangeActiveTextEditor');
        let currentEditor: vscode.TextEditor = folderA.editor;
        const editorChangeListeners: Array<(editor: vscode.TextEditor | undefined) => unknown> = [];
        const commandCenterMessages: any[] = [];
        const topologyMessages: any[] = [];
        const disposable = { dispose: () => undefined };
        try {
            Object.defineProperty(workspaceApi, 'workspaceFolders', {
                configurable: true,
                value: [folderA.folder, { ...folderB.folder, index: 1 }],
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
            windowApi.onDidChangeActiveTextEditor = (listener: (editor: vscode.TextEditor | undefined) => unknown) => {
                editorChangeListeners.push(listener);
                return disposable;
            };

            const webview: any = {
                asWebviewUri: (uri: vscode.Uri) => uri,
                postMessage: (message: any) => commandCenterMessages.push(message),
                onDidReceiveMessage: () => disposable,
            };
            const commandCenter = new LabwiredCommandCenterProvider(vscode.Uri.file(folderA.root), true);
            commandCenter.resolveWebviewView({ webview, onDidDispose: () => disposable } as any, {} as any, {} as any);

            const topologyPanel: any = {
                webview: {
                    asWebviewUri: (uri: vscode.Uri) => uri,
                    postMessage: (message: any) => topologyMessages.push(message),
                },
                onDidDispose: () => disposable,
                dispose: () => undefined,
            };
            new (SystemTopologyPanel as any)(topologyPanel, vscode.Uri.file(folderA.root));
            await new Promise((resolve) => setTimeout(resolve, 0));

            const initialCommandCenterBoards = commandCenterMessages.filter((message) => message.type === 'boardUpdate');
            const initialTopologyBoards = topologyMessages.filter((message) => message.type === 'update');
            const initialCommandCenterBoard = initialCommandCenterBoards[initialCommandCenterBoards.length - 1]?.data;
            const initialTopologyBoard = initialTopologyBoards[initialTopologyBoards.length - 1]?.data;
            assert.strictEqual(initialCommandCenterBoard?.name, 'First Editor Model');
            assert.strictEqual(initialTopologyBoard?.name, 'First Editor Model');
            assert.strictEqual(editorChangeListeners.length, 2);

            currentEditor = folderB.editor;
            await Promise.all(editorChangeListeners.map((listener) => listener(folderB.editor)));

            const updatedCommandCenterBoards = commandCenterMessages.filter((message) => message.type === 'boardUpdate');
            const updatedTopologyBoards = topologyMessages.filter((message) => message.type === 'update');
            const updatedCommandCenterBoard = updatedCommandCenterBoards[updatedCommandCenterBoards.length - 1]?.data;
            const updatedTopologyBoard = updatedTopologyBoards[updatedTopologyBoards.length - 1]?.data;
            assert.strictEqual(updatedCommandCenterBoard?.name, 'Second Editor Model');
            assert.strictEqual(updatedTopologyBoard?.name, 'Second Editor Model');
        } finally {
            if (originalFolders) Object.defineProperty(workspaceApi, 'workspaceFolders', originalFolders);
            else delete workspaceApi.workspaceFolders;
            if (originalCreateWatcher) Object.defineProperty(workspaceApi, 'createFileSystemWatcher', originalCreateWatcher);
            else delete workspaceApi.createFileSystemWatcher;
            if (originalSession) Object.defineProperty(debugApi, 'activeDebugSession', originalSession);
            else delete debugApi.activeDebugSession;
            if (originalSessionChange) Object.defineProperty(debugApi, 'onDidChangeActiveDebugSession', originalSessionChange);
            else delete debugApi.onDidChangeActiveDebugSession;
            if (originalEditor) Object.defineProperty(windowApi, 'activeTextEditor', originalEditor);
            else delete windowApi.activeTextEditor;
            if (originalEditorChange) Object.defineProperty(windowApi, 'onDidChangeActiveTextEditor', originalEditorChange);
            else delete windowApi.onDidChangeActiveTextEditor;
            fs.rmSync(folderA.root, { recursive: true, force: true });
            fs.rmSync(folderB.root, { recursive: true, force: true });
        }
    });
});
