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
function restoreOwnProperty(target, key, descriptor) {
    if (descriptor)
        Object.defineProperty(target, key, descriptor);
    else
        delete target[key];
}
suite('model profile configuration wizard', function () {
    this.timeout(15000);
    let root;
    let systemFile;
    let firmwareFile;
    let workspaceFoldersDescriptor;
    suiteSetup(() => __awaiter(this, void 0, void 0, function* () {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'lw-model-wizard-'));
        systemFile = path.join(root, 'crates', 'chips', 'k32w041z-system.yaml');
        firmwareFile = path.join(root, 'target', 'thumbv7em-none-eabi', 'debug', 'demo-m1');
        fs.mkdirSync(path.dirname(systemFile), { recursive: true });
        fs.mkdirSync(path.dirname(firmwareFile), { recursive: true });
        fs.writeFileSync(systemFile, 'name: K32W041Z\n');
        fs.writeFileSync(firmwareFile, 'firmware');
        const workspaceApi = vscode.workspace;
        workspaceFoldersDescriptor = Object.getOwnPropertyDescriptor(workspaceApi, 'workspaceFolders');
        Object.defineProperty(workspaceApi, 'workspaceFolders', {
            configurable: true,
            value: [{ uri: vscode.Uri.file(root), name: 'model-profile-test', index: 0 }],
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
    test('saves a selected ELF and nested system YAML relative to .labwired', () => __awaiter(this, void 0, void 0, function* () {
        const originalOpenDialog = vscode.window.showOpenDialog;
        const originalQuickPick = vscode.window.showQuickPick;
        const originalInformation = vscode.window.showInformationMessage;
        const originalWarning = vscode.window.showWarningMessage;
        try {
            vscode.window.showOpenDialog = (options) => __awaiter(this, void 0, void 0, function* () { var _a; return ((_a = options.filters) === null || _a === void 0 ? void 0 : _a['System YAML']) ? [vscode.Uri.file(systemFile)] : [vscode.Uri.file(firmwareFile)]; });
            vscode.window.showQuickPick = () => __awaiter(this, void 0, void 0, function* () { return 'Use standard LabWired DAP'; });
            vscode.window.showInformationMessage = () => __awaiter(this, void 0, void 0, function* () { return undefined; });
            vscode.window.showWarningMessage = () => __awaiter(this, void 0, void 0, function* () { return 'Replace Profile'; });
            const extension = vscode.extensions.getExtension('w1ne.labwired-vscode');
            assert.ok(extension);
            yield extension.activate();
            yield vscode.commands.executeCommand('labwired.configureModel');
            const saved = fs.readFileSync(path.join(root, '.labwired', 'lab.yaml'), 'utf8');
            assert.ok(saved.includes('firmware: ../target/thumbv7em-none-eabi/debug/demo-m1'));
            assert.ok(saved.includes('system: ../crates/chips/k32w041z-system.yaml'));
        }
        finally {
            vscode.window.showOpenDialog = originalOpenDialog;
            vscode.window.showQuickPick = originalQuickPick;
            vscode.window.showInformationMessage = originalInformation;
            vscode.window.showWarningMessage = originalWarning;
        }
    }));
    test('configures the workspace folder passed to the command', () => __awaiter(this, void 0, void 0, function* () {
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
        };
        const workspaceApi = vscode.workspace;
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
            vscode.window.showOpenDialog = (options) => __awaiter(this, void 0, void 0, function* () { var _b; return ((_b = options.filters) === null || _b === void 0 ? void 0 : _b['System YAML']) ? [vscode.Uri.file(targetSystem)] : [vscode.Uri.file(targetFirmware)]; });
            vscode.window.showQuickPick = () => __awaiter(this, void 0, void 0, function* () { return 'Use standard LabWired DAP'; });
            vscode.window.showInformationMessage = () => __awaiter(this, void 0, void 0, function* () { return undefined; });
            vscode.window.showWarningMessage = () => __awaiter(this, void 0, void 0, function* () { return 'Replace Profile'; });
            yield vscode.commands.executeCommand('labwired.configureModel', targetFolder);
            const saved = fs.readFileSync(path.join(targetRoot, '.labwired', 'lab.yaml'), 'utf8');
            assert.ok(saved.includes('system: ../config/target-system.yaml'));
            assert.ok(saved.includes('firmware: ../build/target.elf'));
            assert.strictEqual(fs.readFileSync(primaryConfig, 'utf8'), 'keep: primary\n');
        }
        finally {
            if (originalFolders)
                Object.defineProperty(workspaceApi, 'workspaceFolders', originalFolders);
            vscode.window.showOpenDialog = originalOpenDialog;
            vscode.window.showQuickPick = originalQuickPick;
            vscode.window.showInformationMessage = originalInformation;
            vscode.window.showWarningMessage = originalWarning;
            fs.rmSync(targetRoot, { recursive: true, force: true });
        }
    }));
    test('keeps an existing model profile unchanged when overwrite is cancelled', () => __awaiter(this, void 0, void 0, function* () {
        const configPath = path.join(root, '.labwired', 'lab.yaml');
        fs.mkdirSync(path.dirname(configPath), { recursive: true });
        const originalBytes = 'schema_version: "1.0"\ninputs:\n  system: ../old/system.yaml\n';
        fs.writeFileSync(configPath, originalBytes);
        const originalWarning = vscode.window.showWarningMessage;
        const originalOpenDialog = vscode.window.showOpenDialog;
        let pickerCalls = 0;
        try {
            vscode.window.showWarningMessage = () => __awaiter(this, void 0, void 0, function* () { return undefined; });
            vscode.window.showOpenDialog = () => __awaiter(this, void 0, void 0, function* () {
                pickerCalls++;
                return undefined;
            });
            const extension = vscode.extensions.getExtension('w1ne.labwired-vscode');
            assert.ok(extension);
            yield extension.activate();
            yield vscode.commands.executeCommand('labwired.configureModel');
            assert.strictEqual(fs.readFileSync(configPath, 'utf8'), originalBytes);
            assert.strictEqual(pickerCalls, 0);
        }
        finally {
            vscode.window.showWarningMessage = originalWarning;
            vscode.window.showOpenDialog = originalOpenDialog;
        }
    }));
    test('keeps an existing model profile unchanged when a file picker is cancelled', () => __awaiter(this, void 0, void 0, function* () {
        const configPath = path.join(root, '.labwired', 'lab.yaml');
        const originalBytes = 'schema_version: "1.0"\ninputs:\n  system: ../old/system.yaml\n';
        fs.writeFileSync(configPath, originalBytes);
        const originalWarning = vscode.window.showWarningMessage;
        const originalOpenDialog = vscode.window.showOpenDialog;
        let pickerCalls = 0;
        try {
            vscode.window.showWarningMessage = () => __awaiter(this, void 0, void 0, function* () { return 'Replace Profile'; });
            vscode.window.showOpenDialog = () => __awaiter(this, void 0, void 0, function* () {
                pickerCalls++;
                return undefined;
            });
            const extension = vscode.extensions.getExtension('w1ne.labwired-vscode');
            assert.ok(extension);
            yield extension.activate();
            yield vscode.commands.executeCommand('labwired.configureModel');
            assert.strictEqual(fs.readFileSync(configPath, 'utf8'), originalBytes);
            assert.strictEqual(pickerCalls, 1);
        }
        finally {
            vscode.window.showWarningMessage = originalWarning;
            vscode.window.showOpenDialog = originalOpenDialog;
        }
    }));
    test('saves an optional custom adapter build program, arguments, executable, and cwd', () => __awaiter(this, void 0, void 0, function* () {
        const originalOpenDialog = vscode.window.showOpenDialog;
        const originalQuickPick = vscode.window.showQuickPick;
        const originalInputBox = vscode.window.showInputBox;
        const originalWarning = vscode.window.showWarningMessage;
        const customExecutable = path.join(root, 'target', 'release', 'custom-dap');
        fs.mkdirSync(path.dirname(customExecutable), { recursive: true });
        fs.writeFileSync(customExecutable, 'adapter');
        try {
            vscode.window.showOpenDialog = (options) => __awaiter(this, void 0, void 0, function* () {
                var _c, _d;
                if ((_c = options.filters) === null || _c === void 0 ? void 0 : _c['System YAML'])
                    return [vscode.Uri.file(systemFile)];
                if ((_d = options.filters) === null || _d === void 0 ? void 0 : _d['Firmware ELF'])
                    return [vscode.Uri.file(firmwareFile)];
                return [vscode.Uri.file(customExecutable)];
            });
            const quickPicks = ['Configure custom DAP', 'Select existing executable', 'Build before each F5'];
            vscode.window.showQuickPick = () => __awaiter(this, void 0, void 0, function* () { return quickPicks.shift(); });
            const inputs = ['cargo', '["build", "-p", "custom-dap", "--release"]', '.'];
            vscode.window.showInputBox = () => __awaiter(this, void 0, void 0, function* () { return inputs.shift(); });
            vscode.window.showWarningMessage = () => __awaiter(this, void 0, void 0, function* () { return 'Replace Profile'; });
            const extension = vscode.extensions.getExtension('w1ne.labwired-vscode');
            assert.ok(extension);
            yield extension.activate();
            yield vscode.commands.executeCommand('labwired.configureModel');
            const saved = yaml.load(fs.readFileSync(path.join(root, '.labwired', 'lab.yaml'), 'utf8'));
            assert.strictEqual(saved.debug.adapter.executable, '../target/release/custom-dap');
            assert.deepStrictEqual(saved.debug.adapter.build, {
                command: 'cargo',
                args: ['build', '-p', 'custom-dap', '--release'],
                cwd: '..',
            });
        }
        finally {
            vscode.window.showOpenDialog = originalOpenDialog;
            vscode.window.showQuickPick = originalQuickPick;
            vscode.window.showInputBox = originalInputBox;
            vscode.window.showWarningMessage = originalWarning;
        }
    }));
    test('allows a not-yet-built custom DAP path when build-before-F5 is configured', () => __awaiter(this, void 0, void 0, function* () {
        const originalOpenDialog = vscode.window.showOpenDialog;
        const originalQuickPick = vscode.window.showQuickPick;
        const originalInputBox = vscode.window.showInputBox;
        const originalWarning = vscode.window.showWarningMessage;
        const customExecutable = path.join(root, 'target', 'release', 'future-custom-dap');
        fs.rmSync(customExecutable, { force: true });
        try {
            vscode.window.showOpenDialog = (options) => __awaiter(this, void 0, void 0, function* () {
                var _e, _f;
                return ((_e = options.filters) === null || _e === void 0 ? void 0 : _e['System YAML']) ? [vscode.Uri.file(systemFile)]
                    : ((_f = options.filters) === null || _f === void 0 ? void 0 : _f['Firmware ELF']) ? [vscode.Uri.file(firmwareFile)]
                        : undefined;
            });
            const picks = ['Configure custom DAP', 'Enter executable path', 'Build before each F5'];
            vscode.window.showQuickPick = () => __awaiter(this, void 0, void 0, function* () { return picks.shift(); });
            const inputs = ['target/release/future-custom-dap', 'cargo', '["build", "--release"]', '.'];
            vscode.window.showInputBox = () => __awaiter(this, void 0, void 0, function* () { return inputs.shift(); });
            vscode.window.showWarningMessage = () => __awaiter(this, void 0, void 0, function* () { return 'Replace Profile'; });
            yield vscode.commands.executeCommand('labwired.configureModel');
            const saved = yaml.load(fs.readFileSync(path.join(root, '.labwired', 'lab.yaml'), 'utf8'));
            assert.strictEqual(saved.debug.adapter.executable, '../target/release/future-custom-dap');
            assert.deepStrictEqual(saved.debug.adapter.build, {
                command: 'cargo', args: ['build', '--release'], cwd: '..',
            });
            assert.strictEqual(fs.existsSync(customExecutable), false);
        }
        finally {
            vscode.window.showOpenDialog = originalOpenDialog;
            vscode.window.showQuickPick = originalQuickPick;
            vscode.window.showInputBox = originalInputBox;
            vscode.window.showWarningMessage = originalWarning;
        }
    }));
    test('rejects a missing custom DAP path in prebuilt mode', () => __awaiter(this, void 0, void 0, function* () {
        const targetRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lw-prebuilt-config-'));
        const targetSystem = path.join(targetRoot, 'system.yaml');
        const targetFirmware = path.join(targetRoot, 'firmware.elf');
        const missingExecutable = path.join(targetRoot, 'missing-dap');
        fs.writeFileSync(targetSystem, 'name: Prebuilt Validation\n');
        fs.writeFileSync(targetFirmware, 'firmware');
        const folder = { uri: vscode.Uri.file(targetRoot), name: 'prebuilt-validation', index: 0 };
        const workspaceApi = vscode.workspace;
        const originalFolders = Object.getOwnPropertyDescriptor(workspaceApi, 'workspaceFolders');
        const originalOpenDialog = vscode.window.showOpenDialog;
        const originalQuickPick = vscode.window.showQuickPick;
        const originalInputBox = vscode.window.showInputBox;
        const originalError = vscode.window.showErrorMessage;
        try {
            Object.defineProperty(workspaceApi, 'workspaceFolders', { configurable: true, value: [folder] });
            vscode.window.showOpenDialog = (options) => __awaiter(this, void 0, void 0, function* () {
                var _g, _h;
                return ((_g = options.filters) === null || _g === void 0 ? void 0 : _g['System YAML']) ? [vscode.Uri.file(targetSystem)]
                    : ((_h = options.filters) === null || _h === void 0 ? void 0 : _h['Firmware ELF']) ? [vscode.Uri.file(targetFirmware)]
                        : undefined;
            });
            const picks = ['Configure custom DAP', 'Enter executable path', 'Use prebuilt executable'];
            vscode.window.showQuickPick = () => __awaiter(this, void 0, void 0, function* () { return picks.shift(); });
            vscode.window.showInputBox = () => __awaiter(this, void 0, void 0, function* () { return 'missing-dap'; });
            let errorMessage = '';
            vscode.window.showErrorMessage = (message) => __awaiter(this, void 0, void 0, function* () { errorMessage = message; });
            yield vscode.commands.executeCommand('labwired.configureModel');
            assert.match(errorMessage, /prebuilt.*exist|executable.*found/i);
            assert.strictEqual(fs.existsSync(path.join(targetRoot, '.labwired', 'lab.yaml')), false);
            assert.strictEqual(fs.existsSync(missingExecutable), false);
        }
        finally {
            if (originalFolders)
                Object.defineProperty(workspaceApi, 'workspaceFolders', originalFolders);
            vscode.window.showOpenDialog = originalOpenDialog;
            vscode.window.showQuickPick = originalQuickPick;
            vscode.window.showInputBox = originalInputBox;
            vscode.window.showErrorMessage = originalError;
            fs.rmSync(targetRoot, { recursive: true, force: true });
        }
    }));
    test('accepts an extensionless entered Windows prebuilt path when its .exe exists', () => __awaiter(this, void 0, void 0, function* () {
        const targetRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lw-windows-prebuilt-config-'));
        const targetSystem = path.join(targetRoot, 'system.yaml');
        const targetFirmware = path.join(targetRoot, 'firmware.elf');
        const executable = path.join(targetRoot, 'target', 'debug', 'labwired-pro-dap');
        fs.mkdirSync(path.dirname(executable), { recursive: true });
        fs.writeFileSync(targetSystem, 'name: Windows Prebuilt Validation\n');
        fs.writeFileSync(targetFirmware, 'firmware');
        fs.writeFileSync(`${executable}.exe`, 'adapter');
        const folder = { uri: vscode.Uri.file(targetRoot), name: 'windows-prebuilt-validation', index: 0 };
        const workspaceApi = vscode.workspace;
        const originalFolders = Object.getOwnPropertyDescriptor(workspaceApi, 'workspaceFolders');
        const windowApi = vscode.window;
        const originalOpenDialog = Object.getOwnPropertyDescriptor(windowApi, 'showOpenDialog');
        const originalQuickPick = Object.getOwnPropertyDescriptor(windowApi, 'showQuickPick');
        const originalInputBox = Object.getOwnPropertyDescriptor(windowApi, 'showInputBox');
        const originalError = Object.getOwnPropertyDescriptor(windowApi, 'showErrorMessage');
        const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
        let errorMessage = '';
        try {
            const extension = vscode.extensions.getExtension('w1ne.labwired-vscode');
            assert.ok(extension);
            yield extension.activate();
            Object.defineProperty(workspaceApi, 'workspaceFolders', { configurable: true, value: [folder] });
            Object.defineProperty(process, 'platform', { configurable: true, value: 'win32' });
            windowApi.showOpenDialog = (options) => __awaiter(this, void 0, void 0, function* () {
                var _j, _k;
                return ((_j = options.filters) === null || _j === void 0 ? void 0 : _j['System YAML']) ? [vscode.Uri.file(targetSystem)]
                    : ((_k = options.filters) === null || _k === void 0 ? void 0 : _k['Firmware ELF']) ? [vscode.Uri.file(targetFirmware)]
                        : undefined;
            });
            const picks = ['Configure custom DAP', 'Enter executable path', 'Use prebuilt executable'];
            windowApi.showQuickPick = () => __awaiter(this, void 0, void 0, function* () { return picks.shift(); });
            windowApi.showInputBox = () => __awaiter(this, void 0, void 0, function* () { return 'target/debug/labwired-pro-dap'; });
            windowApi.showErrorMessage = (message) => __awaiter(this, void 0, void 0, function* () { errorMessage = message; });
            yield vscode.commands.executeCommand('labwired.configureModel', folder);
            const saved = yaml.load(fs.readFileSync(path.join(targetRoot, '.labwired', 'lab.yaml'), 'utf8'));
            assert.strictEqual(errorMessage, '');
            assert.strictEqual(saved.debug.adapter.executable, '../target/debug/labwired-pro-dap.exe');
        }
        finally {
            restoreOwnProperty(workspaceApi, 'workspaceFolders', originalFolders);
            restoreOwnProperty(windowApi, 'showOpenDialog', originalOpenDialog);
            restoreOwnProperty(windowApi, 'showQuickPick', originalQuickPick);
            restoreOwnProperty(windowApi, 'showInputBox', originalInputBox);
            restoreOwnProperty(windowApi, 'showErrorMessage', originalError);
            restoreOwnProperty(process, 'platform', originalPlatform);
            fs.rmSync(targetRoot, { recursive: true, force: true });
        }
    }));
});
//# sourceMappingURL=configWizard.test.js.map