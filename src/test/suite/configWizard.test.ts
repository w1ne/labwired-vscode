import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as yaml from 'js-yaml';

const modelCatalogApi = require('../../modelCatalog');

function restoreOwnProperty(target: any, key: string, descriptor: PropertyDescriptor | undefined): void {
    if (descriptor) Object.defineProperty(target, key, descriptor);
    else delete target[key];
}

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
            const picks = ['Select local model YAML', 'Use standard LabWired DAP'];
            (vscode.window as any).showQuickPick = async () => picks.shift();
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

    test('saves a catalog model and separately selected firmware with portable relative paths', async () => {
        const originalOpenDialog = vscode.window.showOpenDialog;
        const originalQuickPick = vscode.window.showQuickPick;
        const originalProgress = vscode.window.withProgress;
        const originalInformation = vscode.window.showInformationMessage;
        const originalWarning = vscode.window.showWarningMessage;
        const originalInstall = modelCatalogApi.installCatalog;
        const originalFindOrCreate = modelCatalogApi.findOrCreateSystemYaml;
        const commit = 'b'.repeat(40);
        const configsPath = path.join(root, '.labwired', 'models', commit, 'configs');
        const systemPath = path.join(configsPath, 'systems', 'alpha.yaml');
        fs.mkdirSync(path.dirname(systemPath), { recursive: true });
        fs.writeFileSync(systemPath, 'chip: ../chips/alpha.yaml\nexternal_devices: []\n');
        const catalog = {
            schema_version: 1,
            core_commit: commit,
            archive: 'configs.tar.gz',
            sha256: '0'.repeat(64),
            chips: ['alpha', 'beta'],
            configsPath,
        };
        try {
            modelCatalogApi.installCatalog = async (rootPath: string) => {
                assert.strictEqual(rootPath, root);
                return catalog;
            };
            modelCatalogApi.findOrCreateSystemYaml = async (_catalog: unknown, chip: string) => {
                assert.strictEqual(chip, 'alpha');
                return systemPath;
            };
            const picks = ['Choose from LabWired catalog', 'alpha', 'Use standard LabWired DAP'];
            (vscode.window as any).showQuickPick = async () => picks.shift();
            (vscode.window as any).withProgress = async (_options: unknown, task: Function) => task(
                { report: () => undefined },
                { isCancellationRequested: false, onCancellationRequested: () => ({ dispose: () => undefined }) }
            );
            (vscode.window as any).showOpenDialog = async (options: any) =>
                options.filters?.['Firmware ELF'] ? [vscode.Uri.file(firmwareFile)] : undefined;
            (vscode.window as any).showInformationMessage = async () => undefined;
            (vscode.window as any).showWarningMessage = async () => 'Replace Profile';

            await vscode.commands.executeCommand('labwired.configureModel');

            const saved = yaml.load(fs.readFileSync(path.join(root, '.labwired', 'lab.yaml'), 'utf8')) as any;
            assert.strictEqual(saved.inputs.system, `models/${commit}/configs/systems/alpha.yaml`);
            assert.strictEqual(saved.inputs.firmware, '../target/thumbv7em-none-eabi/debug/demo-m1');
        } finally {
            (vscode.window as any).showOpenDialog = originalOpenDialog;
            (vscode.window as any).showQuickPick = originalQuickPick;
            (vscode.window as any).withProgress = originalProgress;
            (vscode.window as any).showInformationMessage = originalInformation;
            (vscode.window as any).showWarningMessage = originalWarning;
            modelCatalogApi.installCatalog = originalInstall;
            modelCatalogApi.findOrCreateSystemYaml = originalFindOrCreate;
        }
    });

    test('keeps the existing profile when catalog and local fallback selection are cancelled', async () => {
        const configPath = path.join(root, '.labwired', 'lab.yaml');
        fs.mkdirSync(path.dirname(configPath), { recursive: true });
        const originalBytes = 'schema_version: "1.0"\ninputs:\n  system: ../old/system.yaml\n';
        fs.writeFileSync(configPath, originalBytes);
        const originalWarning = vscode.window.showWarningMessage;
        const originalOpenDialog = vscode.window.showOpenDialog;
        const originalQuickPick = vscode.window.showQuickPick;
        const originalProgress = vscode.window.withProgress;
        const originalError = vscode.window.showErrorMessage;
        const originalInstall = modelCatalogApi.installCatalog;
        const originalFindOrCreate = modelCatalogApi.findOrCreateSystemYaml;
        const offeredFallbacks: string[][] = [];
        let pickerCalls = 0;
        try {
            (vscode.window as any).showWarningMessage = async () => 'Replace Profile';
            (vscode.window as any).showErrorMessage = async () => undefined;
            (vscode.window as any).showOpenDialog = async () => { pickerCalls++; return undefined; };
            const picks = ['Choose from LabWired catalog', 'Select local YAML'];
            (vscode.window as any).showQuickPick = async (items: string[]) => {
                offeredFallbacks.push(items);
                return picks.shift();
            };
            (vscode.window as any).withProgress = async (_options: unknown, task: Function) => task(
                { report: () => undefined },
                { isCancellationRequested: false, onCancellationRequested: () => ({ dispose: () => undefined }) }
            );
            modelCatalogApi.installCatalog = async () => { throw new Error('LabWired catalog installation cancelled.'); };
            modelCatalogApi.findOrCreateSystemYaml = async () => { throw new Error('Should not resolve a model after cancellation.'); };

            await vscode.commands.executeCommand('labwired.configureModel');

            assert.deepStrictEqual(offeredFallbacks[1], ['Select local YAML', 'Cancel']);
            assert.strictEqual(fs.readFileSync(configPath, 'utf8'), originalBytes);
            assert.strictEqual(pickerCalls, 1);
        } finally {
            (vscode.window as any).showWarningMessage = originalWarning;
            (vscode.window as any).showOpenDialog = originalOpenDialog;
            (vscode.window as any).showQuickPick = originalQuickPick;
            (vscode.window as any).withProgress = originalProgress;
            (vscode.window as any).showErrorMessage = originalError;
            modelCatalogApi.installCatalog = originalInstall;
            modelCatalogApi.findOrCreateSystemYaml = originalFindOrCreate;
        }
    });

    test('configures the workspace folder passed to the command', async () => {
        const primaryConfig = path.join(root, '.labwired', 'lab.yaml');
        fs.mkdirSync(path.dirname(primaryConfig), { recursive: true });
        fs.writeFileSync(primaryConfig, 'keep: primary\n');

        const targetRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lw-model-wizard-target-'));
        const targetSystem = path.join(targetRoot, 'config', 'target-system.yaml');
        const targetFirmware = path.join(targetRoot, 'build', 'target.elf');
        fs.mkdirSync(path.dirname(targetSystem), { recursive: true });
        fs.mkdirSync(path.dirname(targetFirmware), { recursive: true });
        fs.writeFileSync(targetSystem, 'name: Target Workspace\n');
        fs.writeFileSync(targetFirmware, 'firmware');

        const targetFolder = {
            uri: vscode.Uri.file(targetRoot), name: 'target-workspace', index: 1,
        } as vscode.WorkspaceFolder;
        const workspaceApi = vscode.workspace as any;
        const originalFolders = Object.getOwnPropertyDescriptor(workspaceApi, 'workspaceFolders');
        const originalOpenDialog = vscode.window.showOpenDialog;
        const originalQuickPick = vscode.window.showQuickPick;
        const originalInformation = vscode.window.showInformationMessage;
        const originalWarning = vscode.window.showWarningMessage;
        try {
            Object.defineProperty(workspaceApi, 'workspaceFolders', {
                configurable: true,
                value: [
                    { uri: vscode.Uri.file(root), name: 'primary-workspace', index: 0 },
                    targetFolder,
                ],
            });
            (vscode.window as any).showOpenDialog = async (options: any) =>
                options.filters?.['System YAML'] ? [vscode.Uri.file(targetSystem)] : [vscode.Uri.file(targetFirmware)];
            const picks = ['Select local model YAML', 'Use standard LabWired DAP'];
            (vscode.window as any).showQuickPick = async () => picks.shift();
            (vscode.window as any).showInformationMessage = async () => undefined;
            (vscode.window as any).showWarningMessage = async () => 'Replace Profile';

            await vscode.commands.executeCommand('labwired.configureModel', targetFolder);

            const saved = fs.readFileSync(path.join(targetRoot, '.labwired', 'lab.yaml'), 'utf8');
            assert.ok(saved.includes('system: ../config/target-system.yaml'));
            assert.ok(saved.includes('firmware: ../build/target.elf'));
            assert.strictEqual(fs.readFileSync(primaryConfig, 'utf8'), 'keep: primary\n');
        } finally {
            if (originalFolders) Object.defineProperty(workspaceApi, 'workspaceFolders', originalFolders);
            (vscode.window as any).showOpenDialog = originalOpenDialog;
            (vscode.window as any).showQuickPick = originalQuickPick;
            (vscode.window as any).showInformationMessage = originalInformation;
            (vscode.window as any).showWarningMessage = originalWarning;
            fs.rmSync(targetRoot, { recursive: true, force: true });
        }
    });

    test('keeps an existing model profile unchanged when overwrite is cancelled', async () => {
        const configPath = path.join(root, '.labwired', 'lab.yaml');
        fs.mkdirSync(path.dirname(configPath), { recursive: true });
        const originalBytes = 'schema_version: "1.0"\ninputs:\n  system: ../old/system.yaml\n';
        fs.writeFileSync(configPath, originalBytes);
        const originalWarning = vscode.window.showWarningMessage;
        const originalOpenDialog = vscode.window.showOpenDialog;
        const originalQuickPick = vscode.window.showQuickPick;
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
        const originalQuickPick = vscode.window.showQuickPick;
        let pickerCalls = 0;
        try {
            (vscode.window as any).showWarningMessage = async () => 'Replace Profile';
            (vscode.window as any).showQuickPick = async () => 'Select local model YAML';
            (vscode.window as any).showOpenDialog = async () => {
                pickerCalls++;
                return undefined;
            };
            const extension = vscode.extensions.getExtension('w1ne.labwired-vscode');
            assert.ok(extension);
            await extension.activate();
            await vscode.commands.executeCommand('labwired.configureModel');

            assert.strictEqual(fs.readFileSync(configPath, 'utf8'), originalBytes);
            assert.strictEqual(pickerCalls, 1);
        } finally {
            (vscode.window as any).showWarningMessage = originalWarning;
            (vscode.window as any).showOpenDialog = originalOpenDialog;
            (vscode.window as any).showQuickPick = originalQuickPick;
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
            const quickPicks = ['Select local model YAML', 'Configure custom DAP', 'Select existing executable', 'Build before each F5'];
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

    test('allows a not-yet-built custom DAP path when build-before-F5 is configured', async () => {
        const originalOpenDialog = vscode.window.showOpenDialog;
        const originalQuickPick = vscode.window.showQuickPick;
        const originalInputBox = vscode.window.showInputBox;
        const originalWarning = vscode.window.showWarningMessage;
        const customExecutable = path.join(root, 'target', 'release', 'future-custom-dap');
        fs.rmSync(customExecutable, { force: true });
        try {
            (vscode.window as any).showOpenDialog = async (options: any) =>
                options.filters?.['System YAML'] ? [vscode.Uri.file(systemFile)]
                    : options.filters?.['Firmware ELF'] ? [vscode.Uri.file(firmwareFile)]
                        : undefined;
            const picks = ['Select local model YAML', 'Configure custom DAP', 'Enter executable path', 'Build before each F5'];
            (vscode.window as any).showQuickPick = async () => picks.shift();
            const inputs = ['target/release/future-custom-dap', 'cargo', '["build", "--release"]', '.'];
            (vscode.window as any).showInputBox = async () => inputs.shift();
            (vscode.window as any).showWarningMessage = async () => 'Replace Profile';

            await vscode.commands.executeCommand('labwired.configureModel');

            const saved = yaml.load(fs.readFileSync(path.join(root, '.labwired', 'lab.yaml'), 'utf8')) as any;
            assert.strictEqual(saved.debug.adapter.executable, '../target/release/future-custom-dap');
            assert.deepStrictEqual(saved.debug.adapter.build, {
                command: 'cargo', args: ['build', '--release'], cwd: '..',
            });
            assert.strictEqual(fs.existsSync(customExecutable), false);
        } finally {
            (vscode.window as any).showOpenDialog = originalOpenDialog;
            (vscode.window as any).showQuickPick = originalQuickPick;
            (vscode.window as any).showInputBox = originalInputBox;
            (vscode.window as any).showWarningMessage = originalWarning;
        }
    });

    test('rejects a missing custom DAP path in prebuilt mode', async () => {
        const targetRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lw-prebuilt-config-'));
        const targetSystem = path.join(targetRoot, 'system.yaml');
        const targetFirmware = path.join(targetRoot, 'firmware.elf');
        const missingExecutable = path.join(targetRoot, 'missing-dap');
        fs.writeFileSync(targetSystem, 'name: Prebuilt Validation\n');
        fs.writeFileSync(targetFirmware, 'firmware');
        const folder = { uri: vscode.Uri.file(targetRoot), name: 'prebuilt-validation', index: 0 };
        const workspaceApi = vscode.workspace as any;
        const originalFolders = Object.getOwnPropertyDescriptor(workspaceApi, 'workspaceFolders');
        const originalOpenDialog = vscode.window.showOpenDialog;
        const originalQuickPick = vscode.window.showQuickPick;
        const originalInputBox = vscode.window.showInputBox;
        const originalError = vscode.window.showErrorMessage;
        try {
            Object.defineProperty(workspaceApi, 'workspaceFolders', { configurable: true, value: [folder] });
            (vscode.window as any).showOpenDialog = async (options: any) =>
                options.filters?.['System YAML'] ? [vscode.Uri.file(targetSystem)]
                    : options.filters?.['Firmware ELF'] ? [vscode.Uri.file(targetFirmware)]
                        : undefined;
            const picks = ['Select local model YAML', 'Configure custom DAP', 'Enter executable path', 'Use prebuilt executable'];
            (vscode.window as any).showQuickPick = async () => picks.shift();
            (vscode.window as any).showInputBox = async () => 'missing-dap';
            let errorMessage = '';
            (vscode.window as any).showErrorMessage = async (message: string) => { errorMessage = message; };

            await vscode.commands.executeCommand('labwired.configureModel');

            assert.match(errorMessage, /prebuilt.*exist|executable.*found/i);
            assert.strictEqual(fs.existsSync(path.join(targetRoot, '.labwired', 'lab.yaml')), false);
            assert.strictEqual(fs.existsSync(missingExecutable), false);
        } finally {
            if (originalFolders) Object.defineProperty(workspaceApi, 'workspaceFolders', originalFolders);
            (vscode.window as any).showOpenDialog = originalOpenDialog;
            (vscode.window as any).showQuickPick = originalQuickPick;
            (vscode.window as any).showInputBox = originalInputBox;
            (vscode.window as any).showErrorMessage = originalError;
            fs.rmSync(targetRoot, { recursive: true, force: true });
        }
    });

    test('accepts an extensionless entered Windows prebuilt path when its .exe exists', async () => {
        const targetRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lw-windows-prebuilt-config-'));
        const targetSystem = path.join(targetRoot, 'system.yaml');
        const targetFirmware = path.join(targetRoot, 'firmware.elf');
        const executable = path.join(targetRoot, 'target', 'debug', 'labwired-pro-dap');
        fs.mkdirSync(path.dirname(executable), { recursive: true });
        fs.writeFileSync(targetSystem, 'name: Windows Prebuilt Validation\n');
        fs.writeFileSync(targetFirmware, 'firmware');
        fs.writeFileSync(`${executable}.exe`, 'adapter');
        const folder = { uri: vscode.Uri.file(targetRoot), name: 'windows-prebuilt-validation', index: 0 };
        const workspaceApi = vscode.workspace as any;
        const originalFolders = Object.getOwnPropertyDescriptor(workspaceApi, 'workspaceFolders');
        const windowApi = vscode.window as any;
        const originalOpenDialog = Object.getOwnPropertyDescriptor(windowApi, 'showOpenDialog');
        const originalQuickPick = Object.getOwnPropertyDescriptor(windowApi, 'showQuickPick');
        const originalInputBox = Object.getOwnPropertyDescriptor(windowApi, 'showInputBox');
        const originalError = Object.getOwnPropertyDescriptor(windowApi, 'showErrorMessage');
        const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
        let errorMessage = '';
        try {
            const extension = vscode.extensions.getExtension('w1ne.labwired-vscode');
            assert.ok(extension);
            await extension.activate();
            Object.defineProperty(workspaceApi, 'workspaceFolders', { configurable: true, value: [folder] });
            Object.defineProperty(process, 'platform', { configurable: true, value: 'win32' });
            windowApi.showOpenDialog = async (options: any) =>
                options.filters?.['System YAML'] ? [vscode.Uri.file(targetSystem)]
                    : options.filters?.['Firmware ELF'] ? [vscode.Uri.file(targetFirmware)]
                        : undefined;
            const picks = ['Select local model YAML', 'Configure custom DAP', 'Enter executable path', 'Use prebuilt executable'];
            windowApi.showQuickPick = async () => picks.shift();
            windowApi.showInputBox = async () => 'target/debug/labwired-pro-dap';
            windowApi.showErrorMessage = async (message: string) => { errorMessage = message; };

            await vscode.commands.executeCommand('labwired.configureModel', folder);

            const saved = yaml.load(fs.readFileSync(path.join(targetRoot, '.labwired', 'lab.yaml'), 'utf8')) as any;
            assert.strictEqual(errorMessage, '');
            assert.strictEqual(saved.debug.adapter.executable, '../target/debug/labwired-pro-dap.exe');
        } finally {
            restoreOwnProperty(workspaceApi, 'workspaceFolders', originalFolders);
            restoreOwnProperty(windowApi, 'showOpenDialog', originalOpenDialog);
            restoreOwnProperty(windowApi, 'showQuickPick', originalQuickPick);
            restoreOwnProperty(windowApi, 'showInputBox', originalInputBox);
            restoreOwnProperty(windowApi, 'showErrorMessage', originalError);
            restoreOwnProperty(process, 'platform', originalPlatform);
            fs.rmSync(targetRoot, { recursive: true, force: true });
        }
    });
});
