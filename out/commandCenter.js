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
exports.LabwiredCommandCenterProvider = void 0;
const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
class LabwiredCommandCenterProvider {
    constructor(_extensionUri) {
        this._extensionUri = _extensionUri;
        this._latestStatus = 'Stopped';
    }
    resolveWebviewView(webviewView, context, _token) {
        this._view = webviewView;
        webviewView.webview.onDidReceiveMessage(data => {
            switch (data.type) {
                case 'openTopology':
                    vscode.commands.executeCommand('labwired.showTopology');
                    break;
                case 'ready':
                    this.updateBoard();
                    this.updateStatus(this._latestStatus);
                    break;
            }
        });
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                this._extensionUri
            ]
        };
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
        // Watch for configuration changes (Board Logic)
        const watcher = vscode.workspace.createFileSystemWatcher('**/system.yaml');
        watcher.onDidChange(() => this.updateBoard());
        watcher.onDidCreate(() => this.updateBoard());
        webviewView.onDidDispose(() => {
            watcher.dispose();
        });
        this.updateBoard();
    }
    updateTelemetry(data) {
        if (data && typeof data.status === 'string') {
            this._latestStatus = data.status;
        }
        if (this._view) {
            const payload = data && typeof data === 'object' ? data : {};
            this._view.webview.postMessage({
                type: 'telemetry',
                data: Object.assign(Object.assign({}, payload), { status: this._latestStatus })
            });
        }
    }
    updateStatus(status) {
        this._latestStatus = status;
        if (this._view) {
            this._view.webview.postMessage({ type: 'status', status });
        }
    }
    updateBoard() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this._view)
                return;
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders)
                return;
            const rootPath = workspaceFolders[0].uri.fsPath;
            const systemYamlPath = path.join(rootPath, 'system.yaml');
            try {
                let boardData;
                if (fs.existsSync(systemYamlPath)) {
                    const content = fs.readFileSync(systemYamlPath, 'utf8');
                    boardData = this._parseSimpleYaml(content);
                }
                else {
                    const files = yield vscode.workspace.findFiles('**/system.yaml', '**/node_modules/**', 1);
                    if (files.length > 0) {
                        const content = fs.readFileSync(files[0].fsPath, 'utf8');
                        boardData = this._parseSimpleYaml(content);
                    }
                }
                if (!boardData) {
                    boardData = {
                        name: 'No System Loaded',
                        chip: 'Unknown MCU',
                        devices: [],
                        board_io: []
                    };
                }
                this._view.webview.postMessage({ type: 'boardUpdate', data: boardData });
            }
            catch (e) {
                console.error('Error updating board view in command center:', e);
            }
        });
    }
    _parseSimpleYaml(content) {
        const lines = content.split('\n');
        const data = {
            name: 'Generic Board',
            chip: 'Unknown MCU',
            devices: [],
            board_io: []
        };
        let currentDevice = null;
        let currentBoardIo = null;
        let section = 'root';
        const flushDevice = () => {
            if (currentDevice) {
                data.devices.push(currentDevice);
                currentDevice = null;
            }
        };
        const flushBoardIo = () => {
            if (currentBoardIo) {
                data.board_io.push(currentBoardIo);
                currentBoardIo = null;
            }
        };
        const parseValue = (raw) => {
            const value = raw.trim().replace(/^["']|["']$/g, '');
            if (value === 'true')
                return true;
            if (value === 'false')
                return false;
            if (/^-?\d+$/.test(value))
                return Number(value);
            return value;
        };
        const parseKeyValue = (raw) => {
            const idx = raw.indexOf(':');
            if (idx < 0) {
                return null;
            }
            const key = raw.slice(0, idx).trim();
            const value = parseValue(raw.slice(idx + 1));
            return { key, value };
        };
        for (const rawLine of lines) {
            const trimmed = rawLine.trim();
            if (!trimmed || trimmed.startsWith('#'))
                continue;
            if (trimmed.startsWith('name:')) {
                const kv = parseKeyValue(trimmed);
                if (kv && typeof kv.value === 'string') {
                    data.name = kv.value;
                }
            }
            else if (trimmed.startsWith('chip:')) {
                const kv = parseKeyValue(trimmed);
                if (kv && typeof kv.value === 'string') {
                    data.chip = path.basename(kv.value, '.yaml').toUpperCase();
                }
            }
            else if (trimmed === 'external_devices:') {
                flushDevice();
                flushBoardIo();
                section = 'external_devices';
            }
            else if (trimmed === 'board_io:') {
                flushDevice();
                flushBoardIo();
                section = 'board_io';
            }
            else if (section === 'external_devices') {
                if (trimmed.startsWith('- ')) {
                    flushDevice();
                    const kv = parseKeyValue(trimmed.slice(2));
                    currentDevice = { id: '' };
                    if (kv && kv.key === 'id' && typeof kv.value === 'string') {
                        currentDevice.id = kv.value;
                    }
                }
                else if (currentDevice) {
                    const kv = parseKeyValue(trimmed);
                    if (!kv)
                        continue;
                    if (kv.key === 'id' && typeof kv.value === 'string') {
                        currentDevice.id = kv.value;
                    }
                    else if (kv.key === 'type' && typeof kv.value === 'string') {
                        currentDevice.type = kv.value;
                    }
                    else if (kv.key === 'connection' && typeof kv.value === 'string') {
                        currentDevice.connection = kv.value;
                    }
                }
            }
            else if (section === 'board_io') {
                if (trimmed.startsWith('- ')) {
                    flushBoardIo();
                    const kv = parseKeyValue(trimmed.slice(2));
                    currentBoardIo = { id: '' };
                    if (kv && kv.key === 'id' && typeof kv.value === 'string') {
                        currentBoardIo.id = kv.value;
                    }
                }
                else if (currentBoardIo) {
                    const kv = parseKeyValue(trimmed);
                    if (!kv)
                        continue;
                    if (kv.key === 'id' && typeof kv.value === 'string') {
                        currentBoardIo.id = kv.value;
                    }
                    else if (kv.key === 'kind' && typeof kv.value === 'string') {
                        currentBoardIo.kind = kv.value;
                    }
                    else if (kv.key === 'peripheral' && typeof kv.value === 'string') {
                        currentBoardIo.peripheral = kv.value;
                    }
                    else if (kv.key === 'signal' && typeof kv.value === 'string') {
                        currentBoardIo.signal = kv.value;
                    }
                    else if (kv.key === 'pin' && typeof kv.value === 'number') {
                        currentBoardIo.pin = kv.value;
                    }
                    else if (kv.key === 'active_high' && typeof kv.value === 'boolean') {
                        currentBoardIo.active_high = kv.value;
                    }
                }
            }
        }
        flushDevice();
        flushBoardIo();
        data.devices = data.devices.filter((dev) => dev.id.length > 0);
        data.board_io = data.board_io.filter((io) => io.id.length > 0);
        return data;
    }
    _getHtmlForWebview(webview) {
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'commandCenter.js'));
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'commandCenter.css'));
        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <link href="${styleUri}" rel="stylesheet">
                <title>LabWired Command Center</title>
            </head>
            <body>
                <div class="command-center">
                    <div id="telemetry-bar" class="telemetry-bar">
                        <div class="telemetry-item">
                            <span class="label">MIPS</span>
                            <span id="mips-value" class="value">0.00</span>
                        </div>
                        <div class="telemetry-item">
                            <span class="label">CYCLES</span>
                            <span id="cycles-value" class="value">0</span>
                        </div>
                        <div class="telemetry-item">
                            <span class="label">PC</span>
                            <span id="pc-value" class="value">0x00000000</span>
                        </div>
                    </div>

                    <div id="board-container" class="board-container">
                        <div id="board-root">
                            <div class="loading">Initializing Mission Control...</div>
                        </div>
                    </div>

                    <div id="info-panel" class="info-panel">
                        <div class="system-header">
                            <h2 id="board-name">System Loaded</h2>
                            <span id="status-badge" class="badge">Idle</span>
                        </div>
                        <p id="chip-name">MCU: -</p>
                        <div id="device-list" class="device-list"></div>
                        <div id="board-io-list" class="board-io-list"></div>
                        
                        <div class="action-bar">
                            <button id="btn-expand" class="btn-primary">Expand to Topology View</button>
                        </div>
                    </div>
                </div>
                <script src="${scriptUri}"></script>
            </body>
            </html>`;
    }
}
exports.LabwiredCommandCenterProvider = LabwiredCommandCenterProvider;
LabwiredCommandCenterProvider.viewType = 'labwired.commandCenter';
//# sourceMappingURL=commandCenter.js.map