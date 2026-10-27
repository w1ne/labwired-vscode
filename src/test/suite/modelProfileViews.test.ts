import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as yaml from 'js-yaml';
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
        assert.strictEqual(resolved?.systemConfig, systemFile);

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

            assert.strictEqual(f5?.systemConfig, activeSystem);
            assert.strictEqual(board?.name, 'Active Session Workspace');
            assert.strictEqual(topologyBoard?.name, 'Active Session Workspace');
        } finally {
            if (originalFolders) Object.defineProperty(workspaceApi, 'workspaceFolders', originalFolders);
            if (originalSession) Object.defineProperty(debugApi, 'activeDebugSession', originalSession);
            else delete debugApi.activeDebugSession;
            fs.rmSync(secondRoot, { recursive: true, force: true });
        }
    });
});
