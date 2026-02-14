(function () {
    const vscode = acquireVsCodeApi();

    // Elements
    const mipsEl = document.getElementById('mips-value');
    const cyclesEl = document.getElementById('cycles-value');
    const pcEl = document.getElementById('pc-value');
    const hudStatusEl = document.getElementById('hud-status');
    const statusBadgeEl = document.getElementById('status-badge');
    const boardRoot = document.getElementById('board-root');
    const boardName = document.getElementById('board-name');
    const chipName = document.getElementById('chip-name');
    const deviceList = document.getElementById('device-list');
    const boardIoList = document.getElementById('board-io-list');
    const healthListEl = document.getElementById('health-list');
    const btnOpenOutput = document.getElementById('btn-open-output');
    const btnConfigureProject = document.getElementById('btn-configure-project');

    const uartOutputEl = document.getElementById('uart-output');
    const clearUartBtn = document.getElementById('btn-clear-uart');

    const boardIoStateElements = new Map();
    const boardIoChipStateElements = new Map();
    const boardIoById = new Map();

    const uartLines = [];
    let uartRemainder = '';
    const MAX_UART_LINES = 120;

    const healthState = {
        simulatorStatus: 'Stopped',
        boardLoaded: false,
        boardIoCount: 0,
        lastTelemetryAt: 0,
        lastUartAt: 0,
        lastBoardName: 'No System Loaded'
    };

    window.addEventListener('message', event => {
        const message = event.data;
        switch (message.type) {
            case 'telemetry':
                updateTelemetry(message.data || {});
                break;
            case 'boardUpdate':
                renderBoard(message.data || {});
                break;
            case 'status':
                updateStatusBadge(message.status);
                break;
            case 'uart':
                appendUartOutput(message.output);
                break;
            case 'uartReset':
                resetUartOutput();
                break;
            case 'uartActivity':
                healthState.lastUartAt = Date.now();
                evaluateHealth();
                break;
        }
    });

    setInterval(() => {
        evaluateHealth();
    }, 1000);

    function safeText(value, fallback) {
        if (typeof value !== 'string') return fallback;
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : fallback;
    }

    function boardIoPath(io) {
        const peripheral = safeText(io?.peripheral, '?').toUpperCase();
        const pin = typeof io?.pin === 'number' ? `[${io.pin}]` : '';
        return `${peripheral}${pin}`;
    }

    function compactNodeId(id, kind) {
        const raw = safeText(id, 'io');
        const match = raw.match(/_p([a-z])(\d+)$/i);
        if (!match) return raw;

        const pin = `P${match[1].toUpperCase()}${match[2]}`;
        const kindName = String(kind || '').toLowerCase();
        const prefix = kindName === 'button' ? 'BTN' : kindName === 'led' ? 'LED' : 'IO';
        return `${prefix} ${pin}`;
    }

    function asNumber(value) {
        if (typeof value === 'number' && Number.isFinite(value)) return value;
        if (typeof value === 'string') {
            const parsed = Number(value);
            if (Number.isFinite(parsed)) return parsed;
        }
        return null;
    }

    function updateTelemetry(data) {
        const mips = asNumber(data.mips);
        const cycles = asNumber(data.cycles) ?? asNumber(data.totalCycles);
        const pc = asNumber(data.pc) ?? asNumber(data.programCounter);

        if (mipsEl && mips !== null) mipsEl.textContent = mips.toFixed(2);
        if (cyclesEl && cycles !== null) cyclesEl.textContent = Math.trunc(cycles).toLocaleString();
        if (pcEl && pc !== null) pcEl.textContent = `0x${Math.trunc(pc).toString(16).toUpperCase().padStart(8, '0')}`;

        if (Array.isArray(data.board_io)) {
            updateBoardIoStates(data.board_io);
        }

        healthState.lastTelemetryAt = Date.now();
        updateStatusBadge(data.status);
        evaluateHealth();
    }

    function updateStatusBadge(status) {
        if (!statusBadgeEl || typeof status !== 'string') return;
        const isLive = status.toLowerCase() === 'running' || status.toLowerCase() === 'live';
        statusBadgeEl.textContent = isLive ? 'Live' : 'Stopped';
        statusBadgeEl.className = `badge ${isLive ? 'live' : 'stopped'}`;

        healthState.simulatorStatus = isLive ? 'Running' : 'Stopped';

        if (hudStatusEl) {
            hudStatusEl.textContent = (isLive ? 'RUNNING' : 'STOPPED');
            hudStatusEl.className = `value ${isLive ? 'status-running' : 'status-stopped'}`;
        }
    }

    function formatAge(ms) {
        if (ms < 1000) return '<1s';
        return `${Math.floor(ms / 1000)}s`;
    }

    function renderHealth(items) {
        if (!healthListEl) return;
        healthListEl.innerHTML = '';

        items.forEach((item) => {
            const row = document.createElement('div');
            row.className = `health-item ${item.level}`;
            row.innerHTML = `
                <div class="health-main">
                    <span class="health-label">${item.label}</span>
                    <span class="health-value">${item.value}</span>
                </div>
                <div class="health-detail">${item.detail}</div>
            `;
            healthListEl.appendChild(row);
        });
    }

    function evaluateHealth() {
        const now = Date.now();
        const running = healthState.simulatorStatus.toLowerCase() === 'running';

        const items = [];

        items.push({
            label: 'Workspace',
            value: healthState.boardLoaded ? 'OK' : 'MISSING',
            detail: healthState.boardLoaded
                ? `${healthState.lastBoardName}`
                : 'system.yaml not detected in this workspace',
            level: healthState.boardLoaded ? 'ok' : 'error'
        });

        items.push({
            label: 'Board IO',
            value: healthState.boardIoCount > 0 ? `${healthState.boardIoCount} mapped` : 'NONE',
            detail: healthState.boardIoCount > 0
                ? 'GPIO bindings available for state tracking'
                : 'No board_io entries found; IO state cannot be shown',
            level: healthState.boardIoCount > 0 ? 'ok' : 'warn'
        });

        items.push({
            label: 'Simulator',
            value: running ? 'RUNNING' : 'STOPPED',
            detail: running ? 'Core execution is active' : 'Start simulation to collect telemetry',
            level: running ? 'ok' : 'info'
        });

        if (running) {
            if (healthState.lastTelemetryAt === 0) {
                items.push({
                    label: 'Telemetry',
                    value: 'WAITING',
                    detail: 'No telemetry frames received yet',
                    level: 'warn'
                });
            } else {
                const age = now - healthState.lastTelemetryAt;
                items.push({
                    label: 'Telemetry',
                    value: age > 3000 ? 'STALE' : 'LIVE',
                    detail: `Last update ${formatAge(age)} ago`,
                    level: age > 3000 ? 'warn' : 'ok'
                });
            }

            if (healthState.lastUartAt === 0) {
                items.push({
                    label: 'UART Activity',
                    value: 'IDLE',
                    detail: 'No UART output observed yet',
                    level: 'warn'
                });
            } else {
                const age = now - healthState.lastUartAt;
                items.push({
                    label: 'UART Activity',
                    value: age > 10000 ? 'QUIET' : 'ACTIVE',
                    detail: `Last output ${formatAge(age)} ago`,
                    level: age > 10000 ? 'warn' : 'ok'
                });
            }
        } else {
            items.push({
                label: 'Telemetry',
                value: 'N/A',
                detail: 'Telemetry checks resume when simulator is running',
                level: 'info'
            });
            items.push({
                label: 'UART Activity',
                value: 'N/A',
                detail: 'UART checks resume when simulator is running',
                level: 'info'
            });
        }

        renderHealth(items);
    }

    function renderUartOutput() {
        if (!uartOutputEl) return;
        const lines = uartRemainder.length > 0
            ? [...uartLines, uartRemainder]
            : uartLines;
        uartOutputEl.textContent = lines.length > 0 ? lines.join('\n') : 'Waiting for UART...';
        uartOutputEl.scrollTop = uartOutputEl.scrollHeight;
    }

    function appendUartOutput(chunk) {
        if (typeof chunk !== 'string' || chunk.length === 0) return;

        const normalized = chunk.replace(/\r/g, '');
        const merged = uartRemainder + normalized;
        const parts = merged.split('\n');

        uartRemainder = parts.pop() ?? '';
        for (const line of parts) {
            uartLines.push(line);
        }

        if (uartLines.length > MAX_UART_LINES) {
            uartLines.splice(0, uartLines.length - MAX_UART_LINES);
        }

        healthState.lastUartAt = Date.now();
        renderUartOutput();
        evaluateHealth();
    }

    function resetUartOutput() {
        uartLines.length = 0;
        uartRemainder = '';
        if (uartOutputEl) {
            uartOutputEl.textContent = 'Waiting for UART...';
        }
        healthState.lastUartAt = 0;
        evaluateHealth();
    }

    function buildBoardNodes(data) {
        const devices = Array.isArray(data.devices) ? data.devices : [];
        if (devices.length > 0) {
            return devices.map((device) => ({
                id: safeText(device?.id, 'device'),
                label: safeText(device?.type, 'DEVICE').toUpperCase(),
                bus: safeText(device?.connection, 'GPIO'),
                ioId: null
            }));
        }

        const boardIo = Array.isArray(data.board_io) ? data.board_io : [];
        return boardIo.map((io) => ({
            id: safeText(io?.id, 'io'),
            label: safeText(io?.kind, 'IO').toUpperCase(),
            displayId: compactNodeId(io?.id, io?.kind),
            bus: boardIoPath(io),
            ioId: safeText(io?.id, '')
        }));
    }

    function renderBoard(data) {
        const boardNameText = safeText(data.name, 'No System Loaded');
        boardName.innerText = boardNameText;
        chipName.innerText = `MCU: ${safeText(data.chip, 'Unknown')}`;

        const boardIo = Array.isArray(data.board_io) ? data.board_io : [];
        healthState.boardLoaded = boardNameText !== 'No System Loaded';
        healthState.boardIoCount = boardIo.length;
        healthState.lastBoardName = boardNameText;

        renderBoardIo(boardIo);

        // Clear root
        boardRoot.innerHTML = '';
        deviceList.innerHTML = '';
        boardIoChipStateElements.clear();

        // Create SVG for connections
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.style.width = '100%';
        svg.style.height = '100%';
        svg.style.position = 'absolute';
        svg.style.top = '0';
        svg.style.left = '0';
        svg.style.pointerEvents = 'none';
        boardRoot.appendChild(svg);

        // Render MCU
        const mcu = document.createElement('div');
        mcu.className = 'mcu-chip';
        mcu.innerHTML = `
            <div class="mcu-glow"></div>
            <div class="mcu-label">${safeText(data.chip, 'MCU')}</div>
        `;
        boardRoot.appendChild(mcu);

        requestAnimationFrame(() => {
            const centerX = boardRoot.clientWidth / 2;
            const centerY = boardRoot.clientHeight / 2;

            mcu.style.left = `${centerX}px`;
            mcu.style.top = `${centerY}px`;

            const nodes = buildBoardNodes(data);
            if (nodes.length === 0) {
                const empty = document.createElement('div');
                empty.className = 'loading';
                empty.textContent = 'No external devices or board IO mapped';
                boardRoot.appendChild(empty);
                evaluateHealth();
                return;
            }

            const radius = Math.min(centerX, centerY) * 0.65;

            nodes.forEach((node, index) => {
                const angle = (index / nodes.length) * 2 * Math.PI - Math.PI / 2;
                const x = centerX + radius * Math.cos(angle);
                const y = centerY + radius * Math.sin(angle);

                const pChip = document.createElement('div');
                pChip.className = `peripheral-chip ${node.ioId ? 'board-io-node' : ''}`;
                pChip.style.left = `${x}px`;
                pChip.style.top = `${y}px`;
                pChip.innerHTML = `
                    <div class="chip-id">${node.displayId || node.id}</div>
                    <div class="chip-type">${node.label}</div>
                    ${node.ioId ? '<div class="chip-state unknown"></div>' : ''}
                `;
                boardRoot.appendChild(pChip);

                if (node.ioId) {
                    const chipState = pChip.querySelector('.chip-state');
                    if (chipState) {
                        boardIoChipStateElements.set(node.ioId, chipState);
                    }
                }

                const item = document.createElement('div');
                item.className = 'device-item';
                item.innerHTML = `
                    <div class="device-info">
                        <span class="device-id">${node.id}</span>
                        <span class="device-type">${node.label}</span>
                    </div>
                    <span class="device-bus">${node.bus}</span>
                `;
                deviceList.appendChild(item);

                const d = `M ${centerX} ${centerY} L ${x} ${y}`;
                const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                line.setAttribute('d', d);
                line.setAttribute('class', 'connection');
                svg.appendChild(line);
            });

            evaluateHealth();
        });
    }

    function renderBoardIo(boardIo) {
        if (!boardIoList) return;

        boardIoList.innerHTML = '';
        boardIoStateElements.clear();
        boardIoById.clear();

        if (!Array.isArray(boardIo) || boardIo.length === 0) {
            return;
        }

        const title = document.createElement('div');
        title.className = 'section-title';
        title.textContent = 'Board IO';
        boardIoList.appendChild(title);

        boardIo.forEach((io) => {
            const ioId = safeText(io?.id, 'io');
            const ioKind = safeText(io?.kind, 'io').toUpperCase();

            const row = document.createElement('div');
            row.className = 'board-io-item';
            row.innerHTML = `
                <div class="board-io-meta">
                    <span class="board-io-id">${ioId}</span>
                    <span class="board-io-path">${boardIoPath(io)}</span>
                </div>
                <div class="board-io-state">
                    <span class="board-io-chip ${String(io?.kind || '').toLowerCase()}">${ioKind}</span>
                    <span class="board-io-level unknown"></span>
                </div>
            `;
            boardIoList.appendChild(row);

            const level = row.querySelector('.board-io-level');
            if (level && ioId) {
                boardIoStateElements.set(ioId, level);
                boardIoById.set(ioId, io);
            }
        });
    }

    function updateBoardIoStates(states) {
        states.forEach((state) => {
            if (!state || !state.id) return;

            const config = boardIoById.get(state.id) || state;
            const active = typeof state.active === 'boolean' ? state.active : null;

            const level = boardIoStateElements.get(state.id);
            if (level) {
                setBoardIoLevel(level, config.kind, active);
            }

            const chipLevel = boardIoChipStateElements.get(state.id);
            if (chipLevel) {
                setBoardIoLevel(chipLevel, config.kind, active);
            }
        });
    }

    function setBoardIoLevel(levelEl, kind, active) {
        const kindName = String(kind || '').toLowerCase();
        const onText = kindName === 'button' ? 'PRESSED' : 'ON';
        const offText = kindName === 'button' ? 'RELEASED' : 'OFF';

        levelEl.classList.remove('unknown', 'on', 'off');

        if (active === null) {
            levelEl.textContent = '';
            levelEl.classList.add('unknown');
            return;
        }

        levelEl.textContent = active ? onText : offText;
        levelEl.classList.add(active ? 'on' : 'off');
    }

    document.getElementById('btn-expand')?.addEventListener('click', () => {
        vscode.postMessage({ type: 'openTopology' });
    });

    btnOpenOutput?.addEventListener('click', () => {
        vscode.postMessage({ type: 'openOutput' });
    });

    btnConfigureProject?.addEventListener('click', () => {
        vscode.postMessage({ type: 'configureProject' });
    });

    clearUartBtn?.addEventListener('click', () => {
        resetUartOutput();
    });

    evaluateHealth();
    vscode.postMessage({ type: 'ready' });
}());
