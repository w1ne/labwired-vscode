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
        try {
            vscode.window.showWarningMessage = () => __awaiter(this, void 0, void 0, function* () { return 'Overwrite'; });
            vscode.window.showOpenDialog = () => __awaiter(this, void 0, void 0, function* () { return undefined; });
            const extension = vscode.extensions.getExtension('w1ne.labwired-vscode');
            assert.ok(extension);
            yield extension.activate();
            yield vscode.commands.executeCommand('labwired.configureModel');
            assert.strictEqual(fs.readFileSync(configPath, 'utf8'), originalBytes);
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
                var _b, _c;
                if ((_b = options.filters) === null || _b === void 0 ? void 0 : _b['System YAML'])
                    return [vscode.Uri.file(systemFile)];
                if ((_c = options.filters) === null || _c === void 0 ? void 0 : _c['Firmware ELF'])
                    return [vscode.Uri.file(firmwareFile)];
                return [vscode.Uri.file(customExecutable)];
            });
            const quickPicks = ['Configure custom DAP', 'Build before each F5'];
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
});
//# sourceMappingURL=configWizard.test.js.map