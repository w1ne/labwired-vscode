(function () {
    const vscode = acquireVsCodeApi();

    // Elements
    const mipsEl = document.getElementById('mips-value');
    const cyclesEl = document.getElementById('cycles-value');
    const pcEl = document.getElementById('pc-value');
    const statusBadgeEl = document.getElementById('status-badge');
    const boardRoot = document.getElementById('board-root');
    const boardName = document.getElementById('board-name');
    const chipName = document.getElementById('chip-name');
    const deviceList = document.getElementById('device-list');
    const boardIoList = document.getElementById('board-io-list');
    const boardIoStateElements = new Map();
    const boardIoById = new Map();

    window.addEventListener('message', event => {
        const message = event.data;
        switch (message.type) {
            case 'telemetry':
                updateTelemetry(message.data);
                break;
            case 'boardUpdate':
                renderBoard(message.data);
                break;
            case 'status':
                updateStatusBadge(message.status);
                break;
        }
    });

    function updateTelemetry(data) {
        if (mipsEl && typeof data.mips === 'number') mipsEl.textContent = data.mips.toFixed(2);
        if (cyclesEl && typeof data.cycles === 'number') cyclesEl.textContent = data.cycles.toLocaleString();
        if (pcEl && typeof data.pc === 'number') pcEl.textContent = `0x${data.pc.toString(16).toUpperCase().padStart(8, '0')}`;

        if (Array.isArray(data.board_io)) {
            updateBoardIoStates(data.board_io);
        }

        updateStatusBadge(data.status);
    }

    function updateStatusBadge(status) {
        if (!statusBadgeEl || typeof status !== 'string') return;
        const isLive = status.toLowerCase() === 'running' || status.toLowerCase() === 'live';
        statusBadgeEl.textContent = isLive ? 'Live' : 'Stopped';
        statusBadgeEl.className = `badge ${isLive ? 'live' : 'stopped'}`;
    }

    function renderBoard(data) {
        boardName.innerText = data.name || 'Generic Board';
        chipName.innerText = `MCU: ${data.chip || 'Unknown'}`;
        renderBoardIo(data.board_io || []);

        // Clear root
        boardRoot.innerHTML = '';
        deviceList.innerHTML = '';

        // Create SVG for connections
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
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
            <div class="mcu-label">${data.chip || 'MCU'}</div>
        `;
        boardRoot.appendChild(mcu);

        // We need to wait for layout to get proper sizing
        requestAnimationFrame(() => {
            const centerX = boardRoot.clientWidth / 2;
            const centerY = boardRoot.clientHeight / 2;

            mcu.style.left = `${centerX}px`;
            mcu.style.top = `${centerY}px`;

            const devices = data.devices || [];
            const radius = Math.min(centerX, centerY) * 0.65;

            devices.forEach((device, index) => {
                const angle = (index / devices.length) * 2 * Math.PI - Math.PI / 2;
                const x = centerX + radius * Math.cos(angle);
                const y = centerY + radius * Math.sin(angle);

                const pChip = document.createElement('div');
                pChip.className = 'peripheral-chip';
                pChip.style.left = `${x}px`;
                pChip.style.top = `${y}px`;
                pChip.innerHTML = `
                    <div class="chip-id">${device.id}</div>
                    <div class="chip-type">${device.type}</div>
                `;
                boardRoot.appendChild(pChip);

                // Add list item
                const item = document.createElement('div');
                item.className = 'device-item';
                item.innerHTML = `
                    <div class="device-info">
                        <span class="device-id">${device.id}</span>
                        <span class="device-type">${device.type}</span>
                    </div>
                    <span class="device-bus">${device.connection || 'GPIO'}</span>
                `;
                deviceList.appendChild(item);

                // Draw connection
                if (device.connection) {
                    // Sleek curved lines
                    const d = `M ${centerX} ${centerY} L ${x} ${y}`;
                    const line = document.createElementNS("http://www.w3.org/2000/svg", "path");
                    line.setAttribute("d", d);
                    line.setAttribute("class", "connection");
                    svg.appendChild(line);
                }
            });
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
            const row = document.createElement('div');
            row.className = 'board-io-item';
            row.innerHTML = `
                <div class="board-io-meta">
                    <span class="board-io-id">${io.id || 'io'}</span>
                    <span class="board-io-path">${(io.peripheral || '?').toUpperCase()}${typeof io.pin === 'number' ? `[${io.pin}]` : ''}</span>
                </div>
                <div class="board-io-state">
                    <span class="board-io-chip ${String(io.kind || '').toLowerCase()}">${String(io.kind || 'io').toUpperCase()}</span>
                    <span class="board-io-level unknown">-</span>
                </div>
            `;
            boardIoList.appendChild(row);

            const level = row.querySelector('.board-io-level');
            if (level && io.id) {
                boardIoStateElements.set(io.id, level);
                boardIoById.set(io.id, io);
            }
        });
    }

    function updateBoardIoStates(states) {
        states.forEach((state) => {
            if (!state || !state.id) return;
            const level = boardIoStateElements.get(state.id);
            if (!level) return;
            const config = boardIoById.get(state.id) || state;
            setBoardIoLevel(level, config.kind, Boolean(state.active));
        });
    }

    function setBoardIoLevel(levelEl, kind, active) {
        const kindName = String(kind || '').toLowerCase();
        const onText = kindName === 'button' ? 'PRESSED' : 'ON';
        const offText = kindName === 'button' ? 'RELEASED' : 'OFF';
        levelEl.textContent = active ? onText : offText;
        levelEl.classList.remove('unknown', 'on', 'off');
        levelEl.classList.add(active ? 'on' : 'off');
    }

    document.getElementById('btn-expand')?.addEventListener('click', () => {
        vscode.postMessage({ type: 'openTopology' });
    });

    vscode.postMessage({ type: 'ready' });
}());
