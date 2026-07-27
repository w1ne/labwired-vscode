// LabWired - Firmware Simulation Platform
// Copyright (C) 2026 Andrii Shylenko
//
// This software is released under the MIT License.
// See the LICENSE file in the project root for full license information.

import * as vscode from 'vscode';

/**
 * "See all registers" — CPU core registers and every peripheral register the
 * chip can decode, in one searchable view that updates on each stop.
 *
 * The Peripherals tree already lists the same data, but a tree is the wrong
 * shape for the question people actually ask while debugging: *what changed?*
 * This panel diffs against the previous stop and marks the deltas, which is the
 * whole reason to look at registers at run time rather than reading a datasheet.
 *
 * Peripherals whose model advertises no register schema report `kind: "native"`
 * with an empty register list. That is surfaced as "no register names available"
 * rather than being hidden — the peripheral exists and is being simulated; only
 * its register *names* are unknown here.
 */

interface FieldView {
    name: string;
    bitOffset: number;
    bitWidth: number;
    value: number;
}

interface RegisterView {
    name: string;
    offset: number;
    size: number;
    value: number;
    access?: string;
    fields?: FieldView[];
}

interface PeripheralView {
    name: string;
    base: number;
    size: number;
    kind?: string;
    registers?: RegisterView[];
}

export class RegistersPanel {
    private panel: vscode.WebviewPanel | undefined;
    /** Previous values, keyed `peripheral.register`, for change highlighting. */
    private previous = new Map<string, number>();

    constructor(private readonly context: vscode.ExtensionContext) { }

    public async show(): Promise<void> {
        if (this.panel) {
            this.panel.reveal();
            await this.refresh();
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            'labwiredRegisters',
            'LabWired Registers',
            vscode.ViewColumn.Two,
            { enableScripts: true, retainContextWhenHidden: true }
        );

        this.panel.webview.html = this.html();
        this.panel.onDidDispose(() => {
            this.panel = undefined;
            this.previous.clear();
        }, null, this.context.subscriptions);

        await this.refresh();
    }

    /** Re-read from the adapter. Called on every `stopped` event. */
    public async refresh(): Promise<void> {
        if (!this.panel) {
            return;
        }

        const session = vscode.debug.activeDebugSession;
        if (!session || session.type !== 'labwired') {
            this.panel.webview.postMessage({ type: 'idle' });
            return;
        }

        const [cpu, peripherals] = await Promise.all([
            this.readCpuRegisters(session),
            this.readPeripherals(session),
        ]);

        // Mark what moved since the last stop, then remember the new values.
        const changed: string[] = [];
        const remember = (key: string, value: number) => {
            if (this.previous.has(key) && this.previous.get(key) !== value) {
                changed.push(key);
            }
            this.previous.set(key, value);
        };

        for (const reg of cpu) {
            remember(`cpu.${reg.name}`, reg.value);
        }
        for (const peripheral of peripherals) {
            for (const reg of peripheral.registers ?? []) {
                remember(`${peripheral.name}.${reg.name}`, reg.value);
            }
        }

        this.panel.webview.postMessage({ type: 'update', cpu, peripherals, changed });
    }

    /**
     * CPU registers, via the standard DAP scopes/variables walk.
     *
     * Register naming is architecture-specific (Cortex-M exposes R0..R12/SP/LR/PC,
     * RISC-V x0..x31/pc), so this takes whatever the adapter's "Registers" scope
     * reports rather than assuming a set.
     */
    private async readCpuRegisters(
        session: vscode.DebugSession
    ): Promise<{ name: string; value: number; raw: string }[]> {
        try {
            const threads = await session.customRequest('threads');
            const threadId = threads?.threads?.[0]?.id ?? 1;
            const stack = await session.customRequest('stackTrace', { threadId });
            const frameId = stack?.stackFrames?.[0]?.id;
            if (frameId === undefined) {
                return [];
            }

            const scopes = await session.customRequest('scopes', { frameId });
            const registerScope = (scopes?.scopes ?? []).find(
                (s: any) => String(s.name).toLowerCase() === 'registers'
            );
            if (!registerScope) {
                return [];
            }

            const variables = await session.customRequest('variables', {
                variablesReference: registerScope.variablesReference,
            });

            return (variables?.variables ?? []).map((v: any) => ({
                name: v.name,
                raw: v.value,
                value: Number.parseInt(String(v.value), 16) || 0,
            }));
        } catch {
            // A session that ended mid-request is normal, not an error worth
            // showing; the panel just renders empty until the next stop.
            return [];
        }
    }

    private async readPeripherals(session: vscode.DebugSession): Promise<PeripheralView[]> {
        try {
            const response = await session.customRequest('readPeripherals');
            return response?.peripherals ?? [];
        } catch {
            return [];
        }
    }

    private html(): string {
        return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  :root { color-scheme: light dark; }
  body {
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    margin: 0;
    padding: 12px;
  }
  h2 {
    font-size: 1.05em;
    font-weight: 600;
    margin: 18px 0 8px;
    padding-bottom: 4px;
    border-bottom: 1px solid var(--vscode-panel-border);
  }
  h2:first-of-type { margin-top: 0; }
  #filter {
    width: 100%;
    box-sizing: border-box;
    padding: 6px 8px;
    margin-bottom: 12px;
    color: var(--vscode-input-foreground);
    background: var(--vscode-input-background);
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 2px;
  }
  #filter:focus {
    outline: 1px solid var(--vscode-focusBorder);
    outline-offset: -1px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 4px;
  }
  .cell {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    padding: 3px 6px;
    border-radius: 2px;
    background: var(--vscode-textBlockQuote-background);
  }
  .name { opacity: 0.75; }
  .val {
    font-family: var(--vscode-editor-font-family, monospace);
    white-space: pre;
  }
  /* A changed value is the entire reason to watch registers while stepping. */
  .changed .val {
    color: var(--vscode-charts-orange, #d18616);
    font-weight: 600;
  }
  details { margin-bottom: 4px; }
  summary {
    cursor: pointer;
    padding: 3px 0;
    user-select: none;
  }
  summary .base {
    opacity: 0.6;
    font-family: var(--vscode-editor-font-family, monospace);
    margin-left: 8px;
  }
  table { border-collapse: collapse; width: 100%; margin: 4px 0 10px 14px; }
  td {
    padding: 2px 8px 2px 0;
    vertical-align: top;
    font-family: var(--vscode-editor-font-family, monospace);
  }
  td.reg { width: 30%; font-family: var(--vscode-font-family); }
  td.fields { opacity: 0.7; font-size: 0.92em; }
  tr.changed td { color: var(--vscode-charts-orange, #d18616); }
  .note { opacity: 0.6; font-style: italic; padding: 2px 0 6px 14px; }
  .empty { opacity: 0.7; padding: 24px 0; text-align: center; }
</style>
</head>
<body>
  <input id="filter" type="text" placeholder="Filter registers, peripherals, or fields…" autocomplete="off">
  <div id="content"><div class="empty">Start a LabWired debug session to see registers.</div></div>

<script>
  const content = document.getElementById('content');
  const filterInput = document.getElementById('filter');
  let state = { cpu: [], peripherals: [], changed: [] };
  let filter = '';

  const hex = (v, size) => '0x' + (v >>> 0).toString(16).padStart((size || 32) / 4, '0');
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  filterInput.addEventListener('input', () => {
    filter = filterInput.value.trim().toLowerCase();
    render();
  });

  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg.type === 'idle') {
      content.innerHTML = '<div class="empty">No active LabWired debug session.</div>';
      return;
    }
    if (msg.type === 'update') {
      state = msg;
      render();
    }
  });

  function matches(text) {
    return !filter || String(text).toLowerCase().includes(filter);
  }

  function renderCpu() {
    const regs = state.cpu.filter((r) => matches(r.name));
    if (regs.length === 0) return '';
    const changed = new Set(state.changed);
    const cells = regs.map((r) => {
      const cls = changed.has('cpu.' + r.name) ? 'cell changed' : 'cell';
      return '<div class="' + cls + '"><span class="name">' + esc(r.name) +
             '</span><span class="val">' + esc(r.raw) + '</span></div>';
    }).join('');
    return '<h2>CPU registers</h2><div class="grid">' + cells + '</div>';
  }

  function renderPeripheral(p) {
    const changed = new Set(state.changed);
    const registers = p.registers || [];

    // Keep a peripheral visible when its own name matches, even if no
    // individual register does — otherwise filtering by peripheral hides it.
    const nameHit = matches(p.name);
    const rows = registers.filter((r) =>
      nameHit || matches(r.name) || (r.fields || []).some((f) => matches(f.name)));

    if (!nameHit && rows.length === 0) return '';

    let body;
    if (registers.length === 0) {
      // Honest about the difference between "no registers" and "no names".
      body = '<div class="note">' +
        (p.kind === 'native'
          ? 'Simulated natively — no register names available for this peripheral.'
          : 'No registers reported.') +
        '</div>';
    } else {
      body = '<table>' + rows.map((r) => {
        const key = p.name + '.' + r.name;
        const fields = (r.fields || [])
          .filter((f) => f.value !== 0 || matches(f.name))
          .map((f) => esc(f.name) + '=' + f.value)
          .join('  ');
        return '<tr class="' + (changed.has(key) ? 'changed' : '') + '">' +
          '<td class="reg">' + esc(r.name) + '</td>' +
          '<td>' + hex(r.value, r.size) + '</td>' +
          '<td class="fields">' + fields + '</td></tr>';
      }).join('') + '</table>';
    }

    const count = registers.length ? ' (' + rows.length + '/' + registers.length + ')' : '';
    // Auto-open while filtering so matches are visible without clicking.
    const open = filter ? ' open' : '';
    return '<details' + open + '><summary>' + esc(p.name) + count +
      '<span class="base">' + hex(p.base) + '</span></summary>' + body + '</details>';
  }

  function render() {
    const cpu = renderCpu();
    const peripherals = state.peripherals.map(renderPeripheral).filter(Boolean).join('');
    const decoding = state.peripherals.filter((p) => (p.registers || []).length > 0).length;

    if (!cpu && !peripherals) {
      content.innerHTML = '<div class="empty">' +
        (filter ? 'Nothing matches “' + esc(filter) + '”.' : 'No registers reported yet.') +
        '</div>';
      return;
    }

    const heading = state.peripherals.length
      ? '<h2>Peripherals (' + decoding + ' of ' + state.peripherals.length + ' decoding registers)</h2>'
      : '';
    content.innerHTML = cpu + heading + peripherals;
  }
</script>
</body>
</html>`;
    }
}
