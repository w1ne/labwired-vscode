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
const commandCenter_1 = require("../../commandCenter");
const topologyPanel_1 = require("../../topologyPanel");
suite('model profile views', function () {
    this.timeout(15000);
    let root;
    let systemFile;
    let firmwareFile;
    let workspaceFolder;
    let workspaceFoldersDescriptor;
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
        assert.strictEqual(resolved === null || resolved === void 0 ? void 0 : resolved.systemConfig, systemFile);
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
});
//# sourceMappingURL=modelProfileViews.test.js.map