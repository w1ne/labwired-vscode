"use strict";
// LabWired - Firmware Simulation Platform
// Copyright (C) 2026 Andrii Shylenko
//
// MIT. Ship vehicle for shared agent tools (labwired_* MCP) without the
// forked LabWired Editor product / its licenses.
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
exports.copyClaudeMcpLine = exports.configureAgentTools = exports.writeWorkspaceMcpJson = exports.mergeMcpConfig = exports.claudeMcpInstallLine = exports.buildHostedMcpConfig = exports.DEFAULT_API_URL = exports.DEFAULT_MCP_URL = void 0;
const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const auth_1 = require("./auth");
const mcpConfig_1 = require("./mcpConfig");
var mcpConfig_2 = require("./mcpConfig");
Object.defineProperty(exports, "DEFAULT_MCP_URL", { enumerable: true, get: function () { return mcpConfig_2.DEFAULT_MCP_URL; } });
Object.defineProperty(exports, "DEFAULT_API_URL", { enumerable: true, get: function () { return mcpConfig_2.DEFAULT_API_URL; } });
Object.defineProperty(exports, "buildHostedMcpConfig", { enumerable: true, get: function () { return mcpConfig_2.buildHostedMcpConfig; } });
Object.defineProperty(exports, "claudeMcpInstallLine", { enumerable: true, get: function () { return mcpConfig_2.claudeMcpInstallLine; } });
Object.defineProperty(exports, "mergeMcpConfig", { enumerable: true, get: function () { return mcpConfig_2.mergeMcpConfig; } });
function writeWorkspaceMcpJson(folder, config) {
    return __awaiter(this, void 0, void 0, function* () {
        const dir = path.join(folder.uri.fsPath, '.vscode');
        const file = path.join(dir, 'mcp.json');
        yield fs.promises.mkdir(dir, { recursive: true });
        let existing = null;
        try {
            existing = JSON.parse(yield fs.promises.readFile(file, 'utf8'));
        }
        catch (_a) {
            existing = null;
        }
        const merged = (0, mcpConfig_1.mergeMcpConfig)(existing, config);
        yield fs.promises.writeFile(file, JSON.stringify(merged, null, 2) + '\n', 'utf8');
        return vscode.Uri.file(file);
    });
}
exports.writeWorkspaceMcpJson = writeWorkspaceMcpJson;
/**
 * LabWired: Configure Agent Tools — wires shared hosted MCP into the workspace
 * so VS Code agents use the same labwired_* tools as playground / CLI.
 */
function configureAgentTools(output) {
    var _a, _b;
    return __awaiter(this, void 0, void 0, function* () {
        const folder = (_a = vscode.workspace.workspaceFolders) === null || _a === void 0 ? void 0 : _a[0];
        if (!folder) {
            vscode.window.showErrorMessage('LabWired: Open a folder/workspace first.');
            return;
        }
        const apiUrl = ((_b = vscode.workspace.getConfiguration('labwired').get('apiUrl')) === null || _b === void 0 ? void 0 : _b.replace(/\/+$/, '')) ||
            mcpConfig_1.DEFAULT_API_URL;
        const mcpUrl = `${apiUrl}/mcp`;
        const token = yield (0, auth_1.getAccessToken)(true);
        let mode = 'anonymous';
        if (token) {
            mode = 'signed-in';
        }
        else {
            const pick = yield vscode.window.showQuickPick([
                {
                    label: 'Sign in, then configure',
                    description: 'Recommended — hosted tools with your LabWired account',
                    id: 'signin',
                },
                {
                    label: 'Prompt for token each session',
                    description: 'mcp.json uses ${input:labwired-token}',
                    id: 'prompt',
                },
                {
                    label: 'URL only (public / OAuth MCP clients)',
                    description: 'No Bearer header — client may open browser auth',
                    id: 'anon',
                },
            ], { title: 'LabWired agent tools (shared MCP)' });
            if (!pick) {
                return;
            }
            if (pick.id === 'signin') {
                yield vscode.commands.executeCommand('labwired.signIn');
                const after = yield (0, auth_1.getAccessToken)(true);
                if (!after) {
                    vscode.window.showWarningMessage('LabWired: Sign-in did not produce a token. Configure with prompt instead.');
                    mode = 'prompt';
                }
                else {
                    mode = 'signed-in';
                }
            }
            else if (pick.id === 'prompt') {
                mode = 'prompt';
            }
        }
        const accessToken = mode === 'signed-in' ? yield (0, auth_1.getAccessToken)(true) : undefined;
        const config = (0, mcpConfig_1.buildHostedMcpConfig)({
            mcpUrl,
            accessToken: accessToken || undefined,
            useInputPrompt: mode === 'prompt',
        });
        if (mode === 'signed-in' && accessToken) {
            const gitDir = path.join(folder.uri.fsPath, '.git');
            if (fs.existsSync(gitDir)) {
                const cont = yield vscode.window.showWarningMessage('This will write a Bearer token into .vscode/mcp.json. Do not commit that file.', { modal: true }, 'Write anyway', 'Use prompt instead');
                if (cont === 'Use prompt instead') {
                    const promptCfg = (0, mcpConfig_1.buildHostedMcpConfig)({ mcpUrl, useInputPrompt: true });
                    const uri = yield writeWorkspaceMcpJson(folder, promptCfg);
                    yield vscode.window.showTextDocument(uri);
                    vscode.window.showInformationMessage('LabWired: MCP tools configured (token prompt). Reload window if the agent does not see tools yet.');
                    output.appendLine(`LabWired [mcp]: wrote ${uri.fsPath} (input prompt)`);
                    return;
                }
                if (cont !== 'Write anyway') {
                    return;
                }
            }
        }
        const uri = yield writeWorkspaceMcpJson(folder, config);
        yield vscode.window.showTextDocument(uri);
        const claude = (0, mcpConfig_1.claudeMcpInstallLine)(mcpUrl);
        output.appendLine('LabWired [mcp]: shared agent tools');
        output.appendLine(`  mcp.json → ${uri.fsPath}`);
        output.appendLine(`  url      → ${mcpUrl}`);
        output.appendLine(`  mode     → ${mode}`);
        output.appendLine(`  Claude Code (same tools): ${claude}`);
        output.show(true);
        vscode.window
            .showInformationMessage('LabWired agent tools configured (same labwired_* MCP as playground/CLI).', 'Copy Claude install line', 'Reload window')
            .then((choice) => __awaiter(this, void 0, void 0, function* () {
            if (choice === 'Copy Claude install line') {
                yield vscode.env.clipboard.writeText(claude);
                vscode.window.showInformationMessage('Copied Claude MCP install line.');
            }
            else if (choice === 'Reload window') {
                yield vscode.commands.executeCommand('workbench.action.reloadWindow');
            }
        }));
    });
}
exports.configureAgentTools = configureAgentTools;
function copyClaudeMcpLine() {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        const apiUrl = ((_a = vscode.workspace.getConfiguration('labwired').get('apiUrl')) === null || _a === void 0 ? void 0 : _a.replace(/\/+$/, '')) ||
            mcpConfig_1.DEFAULT_API_URL;
        const line = (0, mcpConfig_1.claudeMcpInstallLine)(`${apiUrl}/mcp`);
        yield vscode.env.clipboard.writeText(line);
        vscode.window.showInformationMessage('Copied: ' + line);
    });
}
exports.copyClaudeMcpLine = copyClaudeMcpLine;
//# sourceMappingURL=mcpSetup.js.map