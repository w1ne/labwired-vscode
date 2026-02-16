import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

type ParsedExternalDevice = {
    id: string;
    type?: string;
    connection?: string;
};

type ParsedBoardIo = {
    id: string;
    kind?: string;
    peripheral?: string;
    pin?: number;
    signal?: string;
    active_high?: boolean;
};

type ParsedSystemYaml = {
    name: string;
    chip: string;
    devices: ParsedExternalDevice[];
    board_io: ParsedBoardIo[];
};

export class LabwiredCommandCenterProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'labwired.commandCenter';
    private _view?: vscode.WebviewView;
    private _latestStatus = 'Stopped';
    private _webviewReady = false;
    private _pendingUartActivity = false;
    private _pendingUartChunks: string[] = [];
    private static readonly MAX_PENDING_UART_CHUNKS = 64;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _demoUiEnabled: boolean,
    ) { }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.onDidReceiveMessage(data => {
            switch (data.type) {
                case 'openTopology':
                    vscode.commands.executeCommand('labwired.showTopology');
                    break;
                case 'openOutput':
                    vscode.commands.executeCommand('workbench.action.output.toggleOutput');
                    break;
                case 'configureProject':
                    vscode.commands.executeCommand('labwired.configureProject');
                    break;
                case 'ready':
                    this._webviewReady = true;
                    this.updateBoard();
                    this.updateStatus(this._latestStatus);
                    this.flushPendingUart();
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
            this._webviewReady = false;
            watcher.dispose();
        });

        this.updateBoard();
    }

    public updateTelemetry(data: any) {
        if (data && typeof data.status === 'string') {
            this._latestStatus = data.status;
        }

        if (this._view) {
            const payload = data && typeof data === 'object' ? data : {};
            this._view.webview.postMessage({
                type: 'telemetry',
                data: { ...payload, status: this._latestStatus }
            });
        }
    }

    public updateStatus(status: string) {
        this._latestStatus = status;
        if (this._view) {
            this._view.webview.postMessage({ type: 'status', status });
        }
    }

    public appendUartOutput(output: string) {
        if (typeof output !== 'string' || output.length === 0) {
            return;
        }

        if (this._pendingUartChunks.length >= LabwiredCommandCenterProvider.MAX_PENDING_UART_CHUNKS) {
            this._pendingUartChunks.shift();
        }
        this._pendingUartChunks.push(output);

        if (!this._demoUiEnabled || !this._view || !this._webviewReady) {
            return;
        }
        this._view.webview.postMessage({ type: 'uart', output });
    }

    public clearUartOutput() {
        this._pendingUartChunks = [];
        this._pendingUartActivity = false;
        if (this._demoUiEnabled && this._view && this._webviewReady) {
            this._view.webview.postMessage({ type: 'uartReset' });
        }
    }

    public markUartActivity() {
        this._pendingUartActivity = true;
        if (!this._view || !this._webviewReady) {
            return;
        }
        this._view.webview.postMessage({ type: 'uartActivity' });
        this._pendingUartActivity = false;
    }

    private flushPendingUart() {
        if (!this._view || !this._webviewReady) {
            return;
        }

        if (this._pendingUartActivity) {
            this._view.webview.postMessage({ type: 'uartActivity' });
            this._pendingUartActivity = false;
        }

        if (!this._demoUiEnabled || this._pendingUartChunks.length === 0) {
            return;
        }

        for (const chunk of this._pendingUartChunks) {
            this._view.webview.postMessage({ type: 'uart', output: chunk });
        }
        this._pendingUartChunks = [];
    }

    public async updateBoard() {
        if (!this._view) return;

        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) return;

        const rootPath = workspaceFolders[0].uri.fsPath;
        const systemYamlPath = path.join(rootPath, 'system.yaml');
        const activeSystemConfig = (() => {
            const session = vscode.debug.activeDebugSession;
            if (!session || session.type !== 'labwired') return undefined;
            const cfgPath = session.configuration?.systemConfig;
            return typeof cfgPath === 'string' ? cfgPath : undefined;
        })();

        try {
            let boardData: any | undefined;

            if (activeSystemConfig && fs.existsSync(activeSystemConfig)) {
                const content = fs.readFileSync(activeSystemConfig, 'utf8');
                boardData = this._parseSimpleYaml(content);
            } else if (fs.existsSync(systemYamlPath)) {
                const content = fs.readFileSync(systemYamlPath, 'utf8');
                boardData = this._parseSimpleYaml(content);
            } else {
                const files = await vscode.workspace.findFiles('**/system.yaml', '**/node_modules/**', 1);
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
        } catch (e) {
            console.error('Error updating board view in command center:', e);
        }
    }

    private _parseSimpleYaml(content: string): ParsedSystemYaml {
        const lines = content.split('\n');
        const data: ParsedSystemYaml = {
            name: 'Generic Board',
            chip: 'Unknown MCU',
            devices: [],
            board_io: []
        };

        let currentDevice: ParsedExternalDevice | null = null;
        let currentBoardIo: ParsedBoardIo | null = null;
        let section: 'root' | 'external_devices' | 'board_io' = 'root';

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

        const parseValue = (raw: string): string | number | boolean => {
            const value = raw.trim().replace(/^["']|["']$/g, '');
            if (value === 'true') return true;
            if (value === 'false') return false;
            if (/^-?\d+$/.test(value)) return Number(value);
            return value;
        };

        const parseKeyValue = (raw: string): { key: string; value: string | number | boolean } | null => {
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
            if (!trimmed || trimmed.startsWith('#')) continue;

            if (trimmed.startsWith('name:')) {
                const kv = parseKeyValue(trimmed);
                if (kv && typeof kv.value === 'string') {
                    data.name = kv.value;
                }
            } else if (trimmed.startsWith('chip:')) {
                const kv = parseKeyValue(trimmed);
                if (kv && typeof kv.value === 'string') {
                    data.chip = path.basename(kv.value).replace(/\.ya?ml$/i, '').toUpperCase();
                }
            } else if (trimmed.startsWith('external_devices:')) {
                flushDevice();
                flushBoardIo();
                section = 'external_devices';
            } else if (trimmed.startsWith('board_io:')) {
                flushDevice();
                flushBoardIo();
                section = 'board_io';
            } else if (section === 'external_devices') {
                if (trimmed.startsWith('- ')) {
                    flushDevice();
                    const kv = parseKeyValue(trimmed.slice(2));
                    currentDevice = { id: '' };
                    if (kv && kv.key === 'id' && typeof kv.value === 'string') {
                        currentDevice.id = kv.value;
                    }
                } else if (currentDevice) {
                    const kv = parseKeyValue(trimmed);
                    if (!kv) continue;
                    if (kv.key === 'id' && typeof kv.value === 'string') {
                        currentDevice.id = kv.value;
                    } else if (kv.key === 'type' && typeof kv.value === 'string') {
                        currentDevice.type = kv.value;
                    } else if (kv.key === 'connection' && typeof kv.value === 'string') {
                        currentDevice.connection = kv.value;
                    }
                }
            } else if (section === 'board_io') {
                if (trimmed.startsWith('- ')) {
                    flushBoardIo();
                    const kv = parseKeyValue(trimmed.slice(2));
                    currentBoardIo = { id: '' };
                    if (kv && kv.key === 'id' && typeof kv.value === 'string') {
                        currentBoardIo.id = kv.value;
                    }
                } else if (currentBoardIo) {
                    const kv = parseKeyValue(trimmed);
                    if (!kv) continue;
                    if (kv.key === 'id' && typeof kv.value === 'string') {
                        currentBoardIo.id = kv.value;
                    } else if (kv.key === 'kind' && typeof kv.value === 'string') {
                        currentBoardIo.kind = kv.value;
                    } else if (kv.key === 'peripheral' && typeof kv.value === 'string') {
                        currentBoardIo.peripheral = kv.value;
                    } else if (kv.key === 'signal' && typeof kv.value === 'string') {
                        currentBoardIo.signal = kv.value;
                    } else if (kv.key === 'pin' && typeof kv.value === 'number') {
                        currentBoardIo.pin = kv.value;
                    } else if (kv.key === 'active_high' && typeof kv.value === 'boolean') {
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

    private _getHtmlForWebview(webview: vscode.Webview) {
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'commandCenter.js'));
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'commandCenter.css'));
        const demoHudHtml = this._demoUiEnabled ? `
                        <div class="telemetry-item">
                            <span class="label">STATE</span>
                            <span id="hud-status" class="value">STOPPED</span>
                        </div>` : '';
        const uartPanelHtml = this._demoUiEnabled ? `
                        <div class="section-title">Live UART</div>
                        <div class="uart-panel">
                            <pre id="uart-output" class="uart-output">Waiting for UART...</pre>
                            <div class="uart-actions">
                                <button id="btn-clear-uart" class="btn-secondary">Clear UART</button>
                            </div>
                        </div>` : '';

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
${demoHudHtml}
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

                        <div class="section-title">Health & Issues</div>
                        <div id="health-list" class="health-list"></div>
                        <div class="health-actions">
                            <button id="btn-open-output" class="btn-secondary">Open Output</button>
                            <button id="btn-configure-project" class="btn-secondary">Configure Project</button>
                        </div>

${uartPanelHtml}
                        
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
