"use strict";
// LabWired - Firmware Simulation Platform
// Copyright (C) 2026 Andrii Shylenko
//
// MIT. Drive the OpenCode agent the same way Embedder drives its CLI:
// extension is chrome; `labwired` is the agent runtime; tools are shared MCP.
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
exports.copyAgentInstallCommand = exports.startOpenCodeAgent = exports.agentInstallCommand = exports.resolveLabwiredAgentLauncher = exports.DEFAULT_AGENT_INSTALL = void 0;
const vscode = require("vscode");
const openCodeAgentResolve_1 = require("./openCodeAgentResolve");
var openCodeAgentResolve_2 = require("./openCodeAgentResolve");
Object.defineProperty(exports, "DEFAULT_AGENT_INSTALL", { enumerable: true, get: function () { return openCodeAgentResolve_2.DEFAULT_AGENT_INSTALL; } });
Object.defineProperty(exports, "resolveLabwiredAgentLauncher", { enumerable: true, get: function () { return openCodeAgentResolve_2.resolveLabwiredAgentLauncher; } });
Object.defineProperty(exports, "agentInstallCommand", { enumerable: true, get: function () { return openCodeAgentResolve_2.agentInstallCommand; } });
/**
 * Open an integrated terminal running the OpenCode agent with the same
 * labwired_* tools (hosted after login, local MCP otherwise).
 */
function startOpenCodeAgent(output) {
    var _a, _b, _c, _d;
    return __awaiter(this, void 0, void 0, function* () {
        const configured = vscode.workspace
            .getConfiguration('labwired')
            .get('agentPath');
        let launcher = (0, openCodeAgentResolve_1.resolveLabwiredAgentLauncher)(configured);
        if (!launcher) {
            const pick = yield vscode.window.showInformationMessage('LabWired agent (OpenCode) is not installed. Install it the same way as the CLI tools path?', 'Install agent', 'Copy install command', 'Cancel');
            if (pick === 'Copy install command') {
                yield vscode.env.clipboard.writeText((0, openCodeAgentResolve_1.agentInstallCommand)());
                vscode.window.showInformationMessage('Install command copied. Run it in a terminal, then retry Start OpenCode Agent.');
                return;
            }
            if (pick !== 'Install agent') {
                return;
            }
            const term = vscode.window.createTerminal({
                name: 'LabWired Agent Install',
                cwd: (_b = (_a = vscode.workspace.workspaceFolders) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.uri.fsPath,
            });
            term.show(true);
            term.sendText((0, openCodeAgentResolve_1.agentInstallCommand)(), true);
            output.appendLine('LabWired [agent]: ran install in terminal — when finished, run LabWired: Start OpenCode Agent again.');
            return;
        }
        const cwd = (_d = (_c = vscode.workspace.workspaceFolders) === null || _c === void 0 ? void 0 : _c[0]) === null || _d === void 0 ? void 0 : _d.uri.fsPath;
        const term = vscode.window.createTerminal({
            name: 'LabWired OpenCode',
            cwd,
        });
        term.show(true);
        const quoted = process.platform === 'win32' ? `"${launcher}"` : `'${launcher.replace(/'/g, `'\\''`)}'`;
        term.sendText(quoted, true);
        output.appendLine(`LabWired [agent]: started OpenCode via ${launcher}`);
        output.appendLine('  Same tools as Configure Agent Tools / playground: labwired_* MCP');
        output.appendLine('  Hosted: labwired login (in another terminal) then restart agent if needed');
    });
}
exports.startOpenCodeAgent = startOpenCodeAgent;
function copyAgentInstallCommand() {
    return __awaiter(this, void 0, void 0, function* () {
        const cmd = (0, openCodeAgentResolve_1.agentInstallCommand)();
        yield vscode.env.clipboard.writeText(cmd);
        vscode.window.showInformationMessage(`Copied: ${cmd}`);
    });
}
exports.copyAgentInstallCommand = copyAgentInstallCommand;
//# sourceMappingURL=openCodeAgent.js.map