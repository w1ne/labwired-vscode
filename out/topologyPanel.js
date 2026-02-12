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
exports.SystemTopologyPanel = void 0;
const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
class SystemTopologyPanel {
    static createOrShow(extensionUri) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;
        if (SystemTopologyPanel.currentPanel) {
            SystemTopologyPanel.currentPanel._panel.reveal(column);
            return;
        }
        const panel = vscode.window.createWebviewPanel('labwired.topology', 'LabWired: System Topology', column || vscode.ViewColumn.One, {
            enableScripts: true,
            localResourceRoots: [extensionUri]
        });
        SystemTopologyPanel.currentPanel = new SystemTopologyPanel(panel, extensionUri);
    }
    constructor(panel, extensionUri) {
        this._disposables = [];
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._update();
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        const watcher = vscode.workspace.createFileSystemWatcher('**/system.yaml');
        watcher.onDidChange(() => this._update());
        this._disposables.push(watcher);
    }
    sendTelemetry(data) {
        this._panel.webview.postMessage({ type: 'telemetry', data });
    }
    dispose() {
        SystemTopologyPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x)
                x.dispose();
        }
    }
    _update() {
        return __awaiter(this, void 0, void 0, function* () {
            this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);
            // Fetch and send initial board data
            const boardData = yield this._getBoardData();
            if (boardData) {
                this._panel.webview.postMessage({ type: 'update', data: boardData });
            }
        });
    }
    _getBoardData() {
        return __awaiter(this, void 0, void 0, function* () {
            const workspaces = vscode.workspace.workspaceFolders;
            if (!workspaces)
                return null;
            const files = yield vscode.workspace.findFiles('**/system.yaml', '**/node_modules/**', 1);
            if (files.length === 0)
                return null;
            try {
                const content = fs.readFileSync(files[0].fsPath, 'utf8');
                return this._parseYaml(content);
            }
            catch (e) {
                return null;
            }
        });
    }
    _parseYaml(content) {
        // More robust parser than the simple one in commandCenter
        const data = { name: 'Board', chip: 'MCU', devices: [] };
        let currentDevice = null;
        const lines = content.split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('name:'))
                data.name = trimmed.split(':')[1].trim().replace(/"/g, '');
            else if (trimmed.startsWith('chip:'))
                data.chip = path.basename(trimmed.split(':')[1].trim(), '.yaml').toUpperCase();
            else if (trimmed.startsWith('- id:')) {
                if (currentDevice)
                    data.devices.push(currentDevice);
                currentDevice = { id: trimmed.split(':')[1].trim().replace(/"/g, '') };
            }
            else if (currentDevice && trimmed.startsWith('type:'))
                currentDevice.type = trimmed.split(':')[1].trim().replace(/"/g, '');
            else if (currentDevice && trimmed.startsWith('connection:'))
                currentDevice.connection = trimmed.split(':')[1].trim().replace(/"/g, '');
        }
        if (currentDevice)
            data.devices.push(currentDevice);
        return data;
    }
    _getHtmlForWebview(webview) {
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'topology.js'));
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'topology.css'));
        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <link href="${styleUri}" rel="stylesheet">
                <title>LabWired System Topology</title>
            </head>
            <body>
                <div class="topology-viewer">
                    <header class="hud-header">
                        <div class="title-group">
                            <h1 id="board-name">SYSTEM TOPOLOGY</h1>
                            <span id="chip-id" class="chip-badge">STM32F103</span>
                        </div>
                        <div class="metrics-overlay">
                            <div class="metric"><span class="label">MIPS</span><span id="mips">0.00</span></div>
                            <div class="metric"><span class="label">PC</span><span id="pc">0x00000000</span></div>
                        </div>
                    </header>
                    <div id="viewport" class="viewport">
                        <svg id="schematic" class="schematic"></svg>
                    </div>
                </div>
                <script src="${scriptUri}"></script>
            </body>
            </html>`;
    }
}
exports.SystemTopologyPanel = SystemTopologyPanel;
//# sourceMappingURL=topologyPanel.js.map