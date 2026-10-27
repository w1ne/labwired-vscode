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
const path = require("path");
const os = require("os");
const fs = require("fs");
const extension_1 = require("../../extension");
suite('LabwiredConfigurationProvider Test Suite', () => {
    let mockOutputChannel;
    let mockCpModule;
    let mockCheckFile;
    setup(() => {
        mockOutputChannel = {
            appendLine: (line) => console.log(line)
        };
        mockCpModule = {
            execSync: (cmd) => {
                if (cmd === 'rustc --print sysroot')
                    return '/rust/sysroot';
                if (cmd === 'rustc -vV')
                    return 'commit-hash: abcdef123';
                return '';
            }
        };
        mockCheckFile = (p) => __awaiter(void 0, void 0, void 0, function* () { return true; });
    });
    test('resolveDebugConfiguration sets defaults and derives program/systemConfig from .labwired/lab.yaml', () => __awaiter(void 0, void 0, void 0, function* () {
        // New contract: an empty launch config gets its program + systemConfig from
        // the one-file .labwired/lab.yaml — no hardcoded target-triple guess.
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lw-cfg-'));
        fs.mkdirSync(path.join(tmp, '.labwired'), { recursive: true });
        fs.writeFileSync(path.join(tmp, '.labwired', 'lab.yaml'), 'schema_version: "1.0"\ninputs:\n  firmware: ../target/firmware\n  system: ../system.yaml\n');
        try {
            const provider = new extension_1.LabwiredConfigurationProvider(mockOutputChannel, mockCpModule, mockCheckFile);
            const config = { type: '', name: '', request: '' };
            const mockFolder = { uri: vscode.Uri.file(tmp), name: 'mock', index: 0 };
            const resolved = yield provider.resolveDebugConfiguration(mockFolder, config);
            assert.strictEqual(resolved === null || resolved === void 0 ? void 0 : resolved.type, 'labwired');
            assert.strictEqual(resolved === null || resolved === void 0 ? void 0 : resolved.name, 'LabWired: Launch');
            assert.strictEqual(resolved === null || resolved === void 0 ? void 0 : resolved.request, 'launch');
            assert.strictEqual(resolved === null || resolved === void 0 ? void 0 : resolved.stopOnEntry, false);
            assert.ok(resolved === null || resolved === void 0 ? void 0 : resolved.program.includes('firmware'));
            assert.ok(resolved === null || resolved === void 0 ? void 0 : resolved.systemConfig.includes('system.yaml'));
        }
        finally {
            fs.rmSync(tmp, { recursive: true, force: true });
        }
    }));
    test('resolveDebugConfiguration returns undefined when no program and no lab.yaml', () => __awaiter(void 0, void 0, void 0, function* () {
        // Honest behavior: without a lab.yaml we no longer invent a hardcoded firmware path.
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lw-cfg-empty-'));
        try {
            const provider = new extension_1.LabwiredConfigurationProvider(mockOutputChannel, mockCpModule, mockCheckFile);
            const config = { type: '', name: '', request: '' };
            const mockFolder = { uri: vscode.Uri.file(tmp), name: 'mock', index: 0 };
            const resolved = yield provider.resolveDebugConfiguration(mockFolder, config);
            assert.strictEqual(resolved, undefined);
        }
        finally {
            fs.rmSync(tmp, { recursive: true, force: true });
        }
    }));
    test('resolveDebugConfiguration offers Configure Model when no system profile is selected', () => __awaiter(void 0, void 0, void 0, function* () {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lw-cfg-no-system-'));
        const firmware = path.join(tmp, 'firmware.elf');
        fs.writeFileSync(firmware, 'firmware');
        const originalErrorMessage = vscode.window.showErrorMessage;
        let prompt = '';
        let actions = [];
        try {
            vscode.window.showErrorMessage = (message, ...items) => __awaiter(void 0, void 0, void 0, function* () {
                prompt = message;
                actions = items;
                return undefined;
            });
            const provider = new extension_1.LabwiredConfigurationProvider(mockOutputChannel, mockCpModule, () => __awaiter(void 0, void 0, void 0, function* () { return true; }));
            const config = {
                type: 'labwired', name: 'missing model profile', request: 'launch', program: firmware,
            };
            const mockFolder = { uri: vscode.Uri.file(tmp), name: 'mock', index: 0 };
            const resolved = yield provider.resolveDebugConfiguration(mockFolder, config);
            assert.strictEqual(resolved, undefined);
            assert.match(prompt, /model system YAML/i);
            assert.ok(actions.includes('Configure Model'));
        }
        finally {
            vscode.window.showErrorMessage = originalErrorMessage;
            fs.rmSync(tmp, { recursive: true, force: true });
        }
    }));
    test('resolveDebugConfiguration should auto-map Rust source', () => __awaiter(void 0, void 0, void 0, function* () {
        const provider = new extension_1.LabwiredConfigurationProvider(mockOutputChannel, mockCpModule, mockCheckFile);
        const config = {
            type: 'labwired',
            name: 'test',
            request: 'launch',
            program: '/path/to/firmware'
        };
        const resolved = yield provider.resolveDebugConfiguration(undefined, config);
        assert.ok(resolved === null || resolved === void 0 ? void 0 : resolved.sourceMap);
        assert.strictEqual(resolved === null || resolved === void 0 ? void 0 : resolved.sourceMap['/rustc/abcdef123/library'], path.join('/rust/sysroot', 'lib', 'rustlib', 'src', 'rust', 'library'));
    }));
    test('resolveDebugConfiguration should fail if program missing', () => __awaiter(void 0, void 0, void 0, function* () {
        mockCheckFile = (p) => __awaiter(void 0, void 0, void 0, function* () { return false; });
        const provider = new extension_1.LabwiredConfigurationProvider(mockOutputChannel, mockCpModule, mockCheckFile);
        const config = {
            type: 'labwired',
            name: 'test',
            request: 'launch',
            program: '/missing/program'
        };
        const resolved = yield provider.resolveDebugConfiguration(undefined, config);
        assert.strictEqual(resolved, undefined);
    }));
});
//# sourceMappingURL=configProvider.test.js.map