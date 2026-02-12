import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class LabwiredCommandCenterProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'labwired.commandCenter';
    private _view?: vscode.WebviewView;
    private _latestStatus = 'Stopped';

    constructor(
        private readonly _extensionUri: vscode.Uri,
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

    public async updateBoard() {
        if (!this._view) return;

        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) return;

        const rootPath = workspaceFolders[0].uri.fsPath;
        const systemYamlPath = path.join(rootPath, 'system.yaml');

        try {
            let boardData: any | undefined;

            if (fs.existsSync(systemYamlPath)) {
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
                    devices: []
                };
            }

            this._view.webview.postMessage({ type: 'boardUpdate', data: boardData });
        } catch (e) {
            console.error('Error updating board view in command center:', e);
        }
    }

    private _parseSimpleYaml(content: string): any {
        const lines = content.split('\n');
        const data: any = {
            name: 'Generic Board',
            chip: 'Unknown MCU',
            devices: []
        };

        let currentDevice: any = null;

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;

            if (trimmed.startsWith('name:')) {
                data.name = trimmed.split(':')[1].trim().replace(/"/g, '');
            } else if (trimmed.startsWith('chip:')) {
                const chipPath = trimmed.split(':')[1].trim().replace(/"/g, '');
                data.chip = path.basename(chipPath, '.yaml').toUpperCase();
            } else if (trimmed.startsWith('- id:')) {
                if (currentDevice) data.devices.push(currentDevice);
                currentDevice = { id: trimmed.split(':')[1].trim().replace(/"/g, '') };
            } else if (currentDevice && trimmed.startsWith('type:')) {
                currentDevice.type = trimmed.split(':')[1].trim().replace(/"/g, '');
            } else if (currentDevice && trimmed.startsWith('connection:')) {
                currentDevice.connection = trimmed.split(':')[1].trim().replace(/"/g, '');
            }
        }

        if (currentDevice) data.devices.push(currentDevice);
        return data;
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
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
