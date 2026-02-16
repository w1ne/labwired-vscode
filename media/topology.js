(function () {
    const svg = document.getElementById('schematic');
    const boardNameEl = document.getElementById('board-name');
    const chipIdEl = document.getElementById('chip-id');
    const mipsEl = document.getElementById('mips');
    const pcEl = document.getElementById('pc');

    let currentBoard = null;
    const nodeElements = new Map();
    const boardIoState = new Map();

    window.addEventListener('message', event => {
        const message = event.data;
        switch (message.type) {
            case 'update':
                currentBoard = normalizeBoard(message.data || {});
                renderTopology(currentBoard);
                break;
            case 'telemetry':
                updateTelemetry(message.data || {});
                break;
        }
    });

    window.addEventListener('resize', () => {
        if (currentBoard) {
            renderTopology(currentBoard);
        }
    });

    function safeText(value, fallback) {
        if (typeof value !== 'string') return fallback;
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : fallback;
    }

    function normalizeBoard(data) {
        const boardIo = Array.isArray(data.board_io)
            ? data.board_io.map((item) => ({
                id: safeText(item?.id, 'io'),
                kind: safeText(item?.kind, 'io').toLowerCase(),
                peripheral: safeText(item?.peripheral, 'gpio').toUpperCase(),
                pin: typeof item?.pin === 'number' ? item.pin : null
            }))
            : [];

        const devices = Array.isArray(data.devices)
            ? data.devices.map((item) => ({
                id: safeText(item?.id, 'device'),
                kind: safeText(item?.type, 'device').toLowerCase(),
                bus: safeText(item?.connection, 'GPIO')
            }))
            : [];

        return {
            name: safeText(data?.name, 'SYSTEM'),
            chip: safeText(data?.chip, 'MCU'),
            board_io: boardIo,
            devices
        };
    }

    function getNodes(board) {
        if (board.board_io.length > 0) {
            return board.board_io.map((io) => ({
                id: io.id,
                kind: io.kind,
                title: io.id,
                subtitle: `${io.peripheral}${io.pin !== null ? `[${io.pin}]` : ''}`,
                bus: 'GPIO'
            }));
        }

        return board.devices.map((dev) => ({
            id: dev.id,
            kind: dev.kind,
            title: dev.id,
            subtitle: safeText(dev.bus, 'GPIO'),
            bus: safeText(dev.bus, 'GPIO')
        }));
    }

    function updateTelemetry(data) {
        if (mipsEl && typeof data.mips === 'number') {
            mipsEl.textContent = data.mips.toFixed(2);
        }
        if (pcEl && typeof data.pc === 'number') {
            pcEl.textContent = `0x${data.pc.toString(16).toUpperCase().padStart(8, '0')}`;
        }

        if (Array.isArray(data.board_io)) {
            data.board_io.forEach((state) => {
                if (!state || !state.id) return;
                boardIoState.set(state.id, typeof state.active === 'boolean' ? state.active : null);
            });
            applyNodeStates();
        }
    }

    function stateView(kind, active) {
        if (active === null || active === undefined) {
            return { label: 'UNAVAILABLE', css: 'unknown' };
        }

        if (kind === 'button') {
            return active
                ? { label: 'PRESSED', css: 'on' }
                : { label: 'RELEASED', css: 'off' };
        }

        return active
            ? { label: 'ON', css: 'on' }
            : { label: 'OFF', css: 'off' };
    }

    function applyNodeStates() {
        nodeElements.forEach((entry, id) => {
            const active = boardIoState.has(id) ? boardIoState.get(id) : null;
            const view = stateView(entry.kind, active);

            entry.pill.classList.remove('on', 'off', 'unknown');
            entry.pill.classList.add(view.css);
            entry.text.textContent = view.label;
        });
    }

    function renderTopology(board) {
        boardNameEl.textContent = board.name.toUpperCase();
        chipIdEl.textContent = board.chip;

        svg.innerHTML = '';
        nodeElements.clear();

        const width = window.innerWidth;
        const height = Math.max(window.innerHeight - 70, 360);
        svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

        const centerX = width / 2;
        const centerY = height / 2;

        const mcuW = 220;
        const mcuH = 120;
        const mcuGroup = createGroup(centerX - mcuW / 2, centerY - mcuH / 2);
        mcuGroup.appendChild(createRect(0, 0, mcuW, mcuH, 'mcu-block'));
        mcuGroup.appendChild(createText(mcuW / 2, 48, board.chip, 'mcu-label'));
        mcuGroup.appendChild(createText(mcuW / 2, 76, 'CORE', 'mcu-sub-label'));
        svg.appendChild(mcuGroup);

        const nodes = getNodes(board);
        if (nodes.length === 0) {
            svg.appendChild(createText(centerX, centerY + 120, 'No mapped devices or board IO', 'empty-label'));
            return;
        }

        const cardW = 180;
        const cardH = 92;
        const radius = Math.min(width, height) * 0.34;

        nodes.forEach((node, index) => {
            const angle = (index / nodes.length) * 2 * Math.PI - Math.PI / 2;
            const x = centerX + radius * Math.cos(angle);
            const y = centerY + radius * Math.sin(angle);

            const wire = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            wire.setAttribute('d', `M ${centerX} ${centerY} L ${x} ${y}`);
            wire.setAttribute('class', 'wire-main');
            svg.appendChild(wire);

            const g = createGroup(x - cardW / 2, y - cardH / 2);
            const rect = createRect(0, 0, cardW, cardH, `node-card ${node.kind}`);
            g.appendChild(rect);

            g.appendChild(createText(12, 24, node.title, 'node-title', 'start'));
            g.appendChild(createText(12, 45, node.subtitle, 'node-subtitle', 'start'));

            const kindLabel = safeText(node.kind, 'io').toUpperCase();
            g.appendChild(createText(12, 67, kindLabel, 'node-kind', 'start'));

            const state = stateView(node.kind, boardIoState.has(node.id) ? boardIoState.get(node.id) : null);
            const statePill = createRect(cardW - 86, cardH - 28, 74, 18, `node-state-pill ${state.css}`);
            const stateText = createText(cardW - 49, cardH - 15, state.label, 'node-state-text');
            g.appendChild(statePill);
            g.appendChild(stateText);

            nodeElements.set(node.id, { kind: node.kind, pill: statePill, text: stateText });
            svg.appendChild(g);
        });

        applyNodeStates();
    }

    function createGroup(x, y) {
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('transform', `translate(${x}, ${y})`);
        return g;
    }

    function createRect(x, y, w, h, cls) {
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', x);
        rect.setAttribute('y', y);
        rect.setAttribute('width', w);
        rect.setAttribute('height', h);
        rect.setAttribute('class', cls);
        rect.setAttribute('rx', '10');
        return rect;
    }

    function createText(x, y, txt, cls, anchor = 'middle') {
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', x);
        text.setAttribute('y', y);
        text.setAttribute('class', cls);
        text.setAttribute('text-anchor', anchor);
        text.textContent = txt;
        return text;
    }
}());
