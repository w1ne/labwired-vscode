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
const extension_1 = require("../../extension");
const pathAssertions_1 = require("../pathAssertions");
suite('custom DAP launch', function () {
    this.timeout(15000);
    function setStandardDapPath(file) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            const config = vscode.workspace.getConfiguration('labwired');
            const oldValue = (_a = config.inspect('dapPath')) === null || _a === void 0 ? void 0 : _a.globalValue;
            yield config.update('dapPath', file, vscode.ConfigurationTarget.Global);
            return oldValue;
        });
    }
    function restoreStandardDapPath(oldValue) {
        return __awaiter(this, void 0, void 0, function* () {
            yield vscode.workspace.getConfiguration('labwired').update('dapPath', oldValue, vscode.ConfigurationTarget.Global);
        });
    }
    function mockOutput() {
        const lines = [];
        let shown = false;
        return {
            channel: {
                append: (text) => lines.push(text),
                appendLine: (text) => lines.push(`${text}\n`),
                show: () => { shown = true; },
            },
            lines,
            wasShown: () => shown,
        };
    }
    test('runs the configured build and launches its executable', () => __awaiter(this, void 0, void 0, function* () {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lw-custom-dap-launch-'));
        const configDir = path.join(root, '.labwired');
        fs.mkdirSync(configDir, { recursive: true });
        const executable = path.join(root, 'target', 'release', 'custom-dap');
        const buildScript = path.join(root, 'build.js');
        fs.writeFileSync(buildScript, [
            'const fs = require("fs");',
            'fs.mkdirSync(require("path").dirname(process.argv[2]), {recursive:true});',
            'fs.writeFileSync(process.argv[2], "#!/usr/bin/env node\\nprocess.exit(0);\\n");',
            'fs.chmodSync(process.argv[2], 0o755);',
            'process.stdout.write("custom DAP built");',
        ].join('\n'));
        fs.writeFileSync(path.join(configDir, 'lab.yaml'), yaml.dump({
            schema_version: '1.0',
            inputs: {},
            debug: {
                adapter: {
                    executable: '../target/release/custom-dap',
                    build: {
                        command: process.execPath,
                        args: [buildScript, executable],
                        cwd: root,
                    },
                },
            },
        }));
        const standardDap = path.join(root, 'standard-dap');
        fs.writeFileSync(standardDap, 'standard');
        const oldDapPath = yield setStandardDapPath(standardDap);
        const output = mockOutput();
        try {
            const factory = new extension_1.LabwiredDebugAdapterDescriptorFactory({ extensionPath: root }, output.channel);
            const descriptor = yield factory.createDebugAdapterDescriptor({
                workspaceFolder: { uri: vscode.Uri.file(root) },
                configuration: { type: 'labwired' },
            }, undefined);
            assert.strictEqual((0, pathAssertions_1.normalizePathForComparison)(descriptor.command), (0, pathAssertions_1.normalizePathForComparison)(executable));
            assert.ok(fs.existsSync(executable));
            assert.ok(output.lines.join('').includes('custom DAP built'));
        }
        finally {
            yield restoreStandardDapPath(oldDapPath);
            fs.rmSync(root, { recursive: true, force: true });
        }
    }));
    test('shows failed build output and does not launch a stale custom DAP', () => __awaiter(this, void 0, void 0, function* () {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lw-custom-dap-fail-'));
        const configDir = path.join(root, '.labwired');
        fs.mkdirSync(configDir, { recursive: true });
        const executable = path.join(root, 'target', 'release', 'custom-dap');
        fs.mkdirSync(path.dirname(executable), { recursive: true });
        fs.writeFileSync(executable, 'stale binary');
        const buildScript = path.join(root, 'fail.js');
        fs.writeFileSync(buildScript, 'console.log("fresh build failed"); process.exit(3);');
        fs.writeFileSync(path.join(configDir, 'lab.yaml'), yaml.dump({
            schema_version: '1.0',
            inputs: {},
            debug: {
                adapter: {
                    executable: '../target/release/custom-dap',
                    build: { command: process.execPath, args: [buildScript], cwd: root },
                },
            },
        }));
        const standardDap = path.join(root, 'standard-dap');
        fs.writeFileSync(standardDap, 'standard');
        const oldDapPath = yield setStandardDapPath(standardDap);
        const output = mockOutput();
        const originalErrorMessage = vscode.window.showErrorMessage;
        vscode.window.showErrorMessage = () => __awaiter(this, void 0, void 0, function* () { return undefined; });
        try {
            const factory = new extension_1.LabwiredDebugAdapterDescriptorFactory({ extensionPath: root }, output.channel);
            yield assert.rejects(factory.createDebugAdapterDescriptor({
                workspaceFolder: { uri: vscode.Uri.file(root) },
                configuration: { type: 'labwired' },
            }, undefined), /exit code 3/);
            assert.ok(output.wasShown());
            assert.ok(output.lines.join('').includes('fresh build failed'));
        }
        finally {
            vscode.window.showErrorMessage = originalErrorMessage;
            yield restoreStandardDapPath(oldDapPath);
            fs.rmSync(root, { recursive: true, force: true });
        }
    }));
    test('launches a configured prebuilt custom DAP without running a build', () => __awaiter(this, void 0, void 0, function* () {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lw-prebuilt-dap-'));
        const configDir = path.join(root, '.labwired');
        fs.mkdirSync(configDir, { recursive: true });
        const executable = path.join(root, 'custom-dap');
        fs.writeFileSync(executable, '#!/usr/bin/env node\nprocess.exit(0);\n');
        fs.chmodSync(executable, 0o755);
        fs.writeFileSync(path.join(configDir, 'lab.yaml'), yaml.dump({
            schema_version: '1.0',
            inputs: {},
            debug: { adapter: { executable: '../custom-dap' } },
        }));
        const standardDap = path.join(root, 'standard-dap');
        fs.writeFileSync(standardDap, 'standard');
        const oldDapPath = yield setStandardDapPath(standardDap);
        try {
            const factory = new extension_1.LabwiredDebugAdapterDescriptorFactory({ extensionPath: root }, mockOutput().channel);
            const descriptor = yield factory.createDebugAdapterDescriptor({
                workspaceFolder: { uri: vscode.Uri.file(root) },
                configuration: { type: 'labwired' },
            }, undefined);
            assert.strictEqual((0, pathAssertions_1.normalizePathForComparison)(descriptor.command), (0, pathAssertions_1.normalizePathForComparison)(executable));
        }
        finally {
            yield restoreStandardDapPath(oldDapPath);
            fs.rmSync(root, { recursive: true, force: true });
        }
    }));
    test('keeps the standard DAP fallback when the model profile has no custom adapter', () => __awaiter(this, void 0, void 0, function* () {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lw-standard-dap-'));
        const configDir = path.join(root, '.labwired');
        fs.mkdirSync(configDir, { recursive: true });
        fs.writeFileSync(path.join(configDir, 'lab.yaml'), yaml.dump({ schema_version: '1.0', inputs: {} }));
        const standardDap = path.join(root, 'standard-dap');
        fs.writeFileSync(standardDap, 'standard');
        const oldDapPath = yield setStandardDapPath(standardDap);
        try {
            const factory = new extension_1.LabwiredDebugAdapterDescriptorFactory({ extensionPath: root }, mockOutput().channel);
            const descriptor = yield factory.createDebugAdapterDescriptor({
                workspaceFolder: { uri: vscode.Uri.file(root) },
                configuration: { type: 'labwired' },
            }, undefined);
            assert.strictEqual(descriptor.command, standardDap);
        }
        finally {
            yield restoreStandardDapPath(oldDapPath);
            fs.rmSync(root, { recursive: true, force: true });
        }
    }));
});
//# sourceMappingURL=customDap.test.js.map