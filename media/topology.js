(function () {
    const vscode = acquireVsCodeApi();
    const svg = document.getElementById('schematic');
    const boardNameEl = document.getElementById('board-name');
    const chipIdEl = document.getElementById('chip-id');
    const mipsEl = document.getElementById('mips');
    const pcEl = document.getElementById('pc');

    let currentBoard = null;
    const pulseThrottle = new Map(); // Track last pulse time per wire

    window.addEventListener('message', event => {
        const message = event.data;
        switch (message.type) {
            case 'update':
                currentBoard = message.data;
                renderTopology(message.data);
                break;
            case 'telemetry':
                updateHUD(message.data);
                break;
        }
    });

    function updateHUD(data) {
        if (mipsEl) mipsEl.textContent = data.mips.toFixed(2);
        if (pcEl) pcEl.textContent = `0x${data.pc.toString(16).toUpperCase().padStart(8, '0')}`;
    }

    function renderTopology(data) {
        boardNameEl.textContent = (data.name || 'SYSTEM').toUpperCase();
        chipIdEl.textContent = data.chip || 'MCU';

        svg.innerHTML = ''; // Clear
        const width = window.innerWidth;
        const height = window.innerHeight - 80;
        svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

        const centerX = width / 2;
        const centerY = height / 2;

        // Draw MCU
        const mcuSize = 120;
        const mcuGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
        const mcu = createRect(centerX - mcuSize / 2, centerY - mcuSize / 2, mcuSize, mcuSize, 'mcu-block');
        mcuGroup.appendChild(mcu);
        const mcuLabel = createText(centerX, centerY, data.chip, 'mcu-label');
        mcuGroup.appendChild(mcuLabel);
        svg.appendChild(mcuGroup);

        // Group devices by Bus/Connection
        const devices = data.devices || [];
        const groups = {};
        devices.forEach(d => {
            const bus = d.connection || 'GPIO';
            if (!groups[bus]) groups[bus] = [];
            groups[bus].push(d);
        });

        const busKeys = Object.keys(groups);
        const totalGroups = busKeys.length;
        const radius = Math.min(width, height) * 0.35;

        busKeys.forEach((bus, gIndex) => {
            const groupDevices = groups[bus];
            // Allocate a sector for this bus
            const sectorStart = (gIndex / totalGroups) * 2 * Math.PI;
            const sectorSize = (1 / totalGroups) * 2 * Math.PI;

            // Draw Bus Label (optional, maybe a hub node?)
            // strictly, we just distribute devices in this sector

            groupDevices.forEach((device, dIndex) => {
                // Distribute within sector
                const angle = sectorStart + (sectorSize * (dIndex + 1) / (groupDevices.length + 1)) - Math.PI / 2;
                const px = centerX + radius * Math.cos(angle);
                const py = centerY + radius * Math.sin(angle);

                // Connection Wire
                const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
                // Use orthogonal or curved routing for "Schematic" feel?
                // For now, straight lines with a "bus node" feel if multiple devices share it
                // Simple star topology is safest for dynamic layout
                const d = `M ${centerX} ${centerY} L ${px} ${py}`;
                path.setAttribute('d', d);
                path.setAttribute('class', `wire-main wire-${bus.toLowerCase()}`); // unique class per bus type?
                path.id = `wire-${device.id}`;
                svg.appendChild(path);

                // Peripheral Block
                const pSize = 80;
                const pGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
                pGroup.setAttribute('transform', `translate(${px - pSize / 2}, ${py - pSize / 2})`);

                const rect = createRect(0, 0, pSize, pSize, 'device-block');
                pGroup.appendChild(rect);

                const label = createText(pSize / 2, pSize / 3, device.id, 'device-id');
                pGroup.appendChild(label);

                const type = createText(pSize / 2, pSize / 1.5, device.type, 'device-type');
                pGroup.appendChild(type);

                const busLabel = createText(pSize / 2, pSize - 10, bus, 'device-bus');
                pGroup.appendChild(busLabel);

                svg.appendChild(pGroup);
            });
        });
    }

    function createRect(x, y, w, h, cls) {
        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        rect.setAttribute('x', x);
        rect.setAttribute('y', y);
        rect.setAttribute('width', w);
        rect.setAttribute('height', h);
        rect.setAttribute('class', cls);
        return rect;
    }

    function createText(x, y, txt, cls) {
        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute('x', x);
        text.setAttribute('y', y);
        text.setAttribute('class', cls);
        text.setAttribute('text-anchor', 'middle');
        text.textContent = txt;
        return text;
    }
}());
