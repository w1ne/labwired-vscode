import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as yaml from 'js-yaml';

suite('model profile configuration wizard', function () {
    this.timeout(15000);
    let root: string;
    let systemFile: string;
    let firmwareFile: string;
    let workspaceFoldersDescriptor: PropertyDescriptor | undefined;

    suiteSetup(async () => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'lw-model-wizard-'));
        systemFile = path.join(root, 'crates', 'chips', 'k32w041z-system.yaml');
        firmwareFile = path.join(root, 'target', 'thumbv7em-none-eabi', 'debug', 'demo-m1');
        fs.mkdirSync(path.dirname(systemFile), { recursive: true });
        fs.mkdirSync(path.dirname(firmwareFile), { recursive: true });
        fs.writeFileSync(systemFile, 'name: K32W041Z\n');
        fs.writeFileSync(firmwareFile, 'firmware');

        const workspaceApi = vscode.workspace as any;
        workspaceFoldersDescriptor = Object.getOwnPropertyDescriptor(workspaceApi, 'workspaceFolders');
        Object.defineProperty(workspaceApi, 'workspaceFolders', {
            configurable: true,
            value: [{ uri: vscode.Uri.file(root), name: 'model-profile-test', index: 0 }],
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

    test('saves a selected ELF and nested system YAML relative to .labwired', async () => {
        const originalOpenDialog = vscode.window.showOpenDialog;
        const originalQuickPick = vscode.window.showQuickPick;
        const originalInformation = vscode.window.showInformationMessage;
        const originalWarning = vscode.window.showWarningMessage;
        try {
            (vscode.window as any).showOpenDialog = async (options: any) =>
                options.filters?.['System YAML'] ? [vscode.Uri.file(systemFile)] : [vscode.Uri.file(firmwareFile)];
            (vscode.window as any).showQuickPick = async () => 'Use standard LabWired DAP';
            (vscode.window as any).showInformationMessage = async () => undefined;
            (vscode.window as any).showWarningMessage = async () => 'Replace Profile';

            const extension = vscode.extensions.getExtension('w1ne.labwired-vscode');
            assert.ok(extension);
            await extension.activate();
            await vscode.commands.executeCommand('labwired.configureModel');

            const saved = fs.readFileSync(path.join(root, '.labwired', 'lab.yaml'), 'utf8');
            assert.ok(saved.includes('firmware: ../target/thumbv7em-none-eabi/debug/demo-m1'));
            assert.ok(saved.includes('system: ../crates/chips/k32w041z-system.yaml'));
        } finally {
            (vscode.window as any).showOpenDialog = originalOpenDialog;
            (vscode.window as any).showQuickPick = originalQuickPick;
            (vscode.window as any).showInformationMessage = originalInformation;
            (vscode.window as any).showWarningMessage = originalWarning;
        }
    });

    test('keeps an existing model profile unchanged when overwrite is cancelled', async () => {
        const configPath = path.join(root, '.labwired', 'lab.yaml');
        fs.mkdirSync(path.dirname(configPath), { recursive: true });
        const originalBytes = 'schema_version: "1.0"\ninputs:\n  system: ../old/system.yaml\n';
        fs.writeFileSync(configPath, originalBytes);
        const originalWarning = vscode.window.showWarningMessage;
        const originalOpenDialog = vscode.window.showOpenDialog;
        let pickerCalls = 0;
        try {
            (vscode.window as any).showWarningMessage = async () => undefined;
            (vscode.window as any).showOpenDialog = async () => {
                pickerCalls++;
                return undefined;
            };
            const extension = vscode.extensions.getExtension('w1ne.labwired-vscode');
            assert.ok(extension);
            await extension.activate();
            await vscode.commands.executeCommand('labwired.configureModel');

            assert.strictEqual(fs.readFileSync(configPath, 'utf8'), originalBytes);
            assert.strictEqual(pickerCalls, 0);
        } finally {
            (vscode.window as any).showWarningMessage = originalWarning;
            (vscode.window as any).showOpenDialog = originalOpenDialog;
        }
    });

    test('keeps an existing model profile unchanged when a file picker is cancelled', async () => {
        const configPath = path.join(root, '.labwired', 'lab.yaml');
        const originalBytes = 'schema_version: "1.0"\ninputs:\n  system: ../old/system.yaml\n';
        fs.writeFileSync(configPath, originalBytes);
        const originalWarning = vscode.window.showWarningMessage;
        const originalOpenDialog = vscode.window.showOpenDialog;
        try {
            (vscode.window as any).showWarningMessage = async () => 'Overwrite';
            (vscode.window as any).showOpenDialog = async () => undefined;
            const extension = vscode.extensions.getExtension('w1ne.labwired-vscode');
            assert.ok(extension);
            await extension.activate();
            await vscode.commands.executeCommand('labwired.configureModel');

            assert.strictEqual(fs.readFileSync(configPath, 'utf8'), originalBytes);
        } finally {
            (vscode.window as any).showWarningMessage = originalWarning;
            (vscode.window as any).showOpenDialog = originalOpenDialog;
        }
    });

    test('saves an optional custom adapter build program, arguments, executable, and cwd', async () => {
        const originalOpenDialog = vscode.window.showOpenDialog;
        const originalQuickPick = vscode.window.showQuickPick;
        const originalInputBox = vscode.window.showInputBox;
        const originalWarning = vscode.window.showWarningMessage;
        const customExecutable = path.join(root, 'target', 'release', 'custom-dap');
        fs.mkdirSync(path.dirname(customExecutable), { recursive: true });
        fs.writeFileSync(customExecutable, 'adapter');
        try {
            (vscode.window as any).showOpenDialog = async (options: any) => {
                if (options.filters?.['System YAML']) return [vscode.Uri.file(systemFile)];
                if (options.filters?.['Firmware ELF']) return [vscode.Uri.file(firmwareFile)];
                return [vscode.Uri.file(customExecutable)];
            };
            const quickPicks = ['Configure custom DAP', 'Build before each F5'];
            (vscode.window as any).showQuickPick = async () => quickPicks.shift();
            const inputs = ['cargo', '["build", "-p", "custom-dap", "--release"]', '.'];
            (vscode.window as any).showInputBox = async () => inputs.shift();
            (vscode.window as any).showWarningMessage = async () => 'Replace Profile';
            const extension = vscode.extensions.getExtension('w1ne.labwired-vscode');
            assert.ok(extension);
            await extension.activate();
            await vscode.commands.executeCommand('labwired.configureModel');

            const saved = yaml.load(fs.readFileSync(path.join(root, '.labwired', 'lab.yaml'), 'utf8')) as any;
            assert.strictEqual(saved.debug.adapter.executable, '../target/release/custom-dap');
            assert.deepStrictEqual(saved.debug.adapter.build, {
                command: 'cargo',
                args: ['build', '-p', 'custom-dap', '--release'],
                cwd: '..',
            });
        } finally {
            (vscode.window as any).showOpenDialog = originalOpenDialog;
            (vscode.window as any).showQuickPick = originalQuickPick;
            (vscode.window as any).showInputBox = originalInputBox;
            (vscode.window as any).showWarningMessage = originalWarning;
        }
    });
});
