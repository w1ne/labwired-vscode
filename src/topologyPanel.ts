import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class SystemTopologyPanel {
    public static currentPanel: SystemTopologyPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];

    public static createOrShow(extensionUri: vscode.Uri) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (SystemTopologyPanel.currentPanel) {
            SystemTopologyPanel.currentPanel._panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'labwired.topology',
            'LabWired: System Topology',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [extensionUri]
            }
        );

        SystemTopologyPanel.currentPanel = new SystemTopologyPanel(panel, extensionUri);
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;
        this._extensionUri = extensionUri;

        this._update();

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        const watcher = vscode.workspace.createFileSystemWatcher('**/system.yaml');
        watcher.onDidChange(() => this._update());
        this._disposables.push(watcher);
    }

    public sendTelemetry(data: any) {
        this._panel.webview.postMessage({ type: 'telemetry', data });
    }

    public dispose() {
        SystemTopologyPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) x.dispose();
        }
    }

    private async _update() {
        this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);

        // Fetch and send initial board data
        const boardData = await this._getBoardData();
        if (boardData) {
            this._panel.webview.postMessage({ type: 'update', data: boardData });
        }
    }

    private async _getBoardData(): Promise<any> {
        const workspaces = vscode.workspace.workspaceFolders;
        if (!workspaces) return null;

        const files = await vscode.workspace.findFiles('**/system.yaml', '**/node_modules/**', 1);
        if (files.length === 0) return null;

        try {
            const content = fs.readFileSync(files[0].fsPath, 'utf8');
            return this._parseYaml(content);
        } catch (e) {
            return null;
        }
    }

    private _parseYaml(content: string): any {
        const data: any = { name: 'Board', chip: 'MCU', devices: [], board_io: [] };
        let currentDevice: any = null;
        let currentBoardIo: any = null;
        let section: 'root' | 'external_devices' | 'board_io' = 'root';
        const lines = content.split('\n');

        const parseValue = (raw: string): string | number | boolean => {
            const value = raw.trim().replace(/^["']|["']$/g, '');
            if (value === 'true') return true;
            if (value === 'false') return false;
            if (/^-?\d+$/.test(value)) return Number(value);
            return value;
        };

        const parseKeyValue = (raw: string): { key: string; value: string | number | boolean } | null => {
            const idx = raw.indexOf(':');
            if (idx < 0) return null;
            const key = raw.slice(0, idx).trim();
            const value = parseValue(raw.slice(idx + 1));
            return { key, value };
        };

        const flushDevice = () => {
            if (currentDevice && typeof currentDevice.id === 'string' && currentDevice.id.length > 0) {
                data.devices.push(currentDevice);
            }
            currentDevice = null;
        };

        const flushBoardIo = () => {
            if (currentBoardIo && typeof currentBoardIo.id === 'string' && currentBoardIo.id.length > 0) {
                data.board_io.push(currentBoardIo);
            }
            currentBoardIo = null;
        };

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;

            if (trimmed.startsWith('name:')) {
                const kv = parseKeyValue(trimmed);
                if (kv && typeof kv.value === 'string') data.name = kv.value;
                continue;
            }

            if (trimmed.startsWith('chip:')) {
                const kv = parseKeyValue(trimmed);
                if (kv && typeof kv.value === 'string') data.chip = path.basename(kv.value).replace(/\.ya?ml$/i, '').toUpperCase();
                continue;
            }

            if (trimmed.startsWith('external_devices:')) {
                flushDevice();
                flushBoardIo();
                section = 'external_devices';
                continue;
            }

            if (trimmed.startsWith('board_io:')) {
                flushDevice();
                flushBoardIo();
                section = 'board_io';
                continue;
            }

            if (section === 'external_devices') {
                if (trimmed.startsWith('- ')) {
                    flushDevice();
                    currentDevice = { id: '' };
                    const kv = parseKeyValue(trimmed.slice(2));
                    if (kv && kv.key === 'id' && typeof kv.value === 'string') currentDevice.id = kv.value;
                } else if (currentDevice) {
                    const kv = parseKeyValue(trimmed);
                    if (!kv) continue;
                    if (kv.key === 'id' && typeof kv.value === 'string') currentDevice.id = kv.value;
                    if (kv.key === 'type' && typeof kv.value === 'string') currentDevice.type = kv.value;
                    if (kv.key === 'connection' && typeof kv.value === 'string') currentDevice.connection = kv.value;
                }
                continue;
            }

            if (section === 'board_io') {
                if (trimmed.startsWith('- ')) {
                    flushBoardIo();
                    currentBoardIo = { id: '' };
                    const kv = parseKeyValue(trimmed.slice(2));
                    if (kv && kv.key === 'id' && typeof kv.value === 'string') currentBoardIo.id = kv.value;
                } else if (currentBoardIo) {
                    const kv = parseKeyValue(trimmed);
                    if (!kv) continue;
                    if (kv.key === 'id' && typeof kv.value === 'string') currentBoardIo.id = kv.value;
                    if (kv.key === 'kind' && typeof kv.value === 'string') currentBoardIo.kind = kv.value;
                    if (kv.key === 'peripheral' && typeof kv.value === 'string') currentBoardIo.peripheral = kv.value;
                    if (kv.key === 'signal' && typeof kv.value === 'string') currentBoardIo.signal = kv.value;
                    if (kv.key === 'pin' && typeof kv.value === 'number') currentBoardIo.pin = kv.value;
                }
            }
        }

        flushDevice();
        flushBoardIo();
        return data;
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
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
