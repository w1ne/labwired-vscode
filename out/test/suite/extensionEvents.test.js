"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const extension_1 = require("../../extension");
function createDeps(status = 'Running') {
    const calls = {
        telemetry: [],
        topology: [],
        graphSignals: [],
        output: [],
        markUart: 0,
        uartChunks: [],
        syncStates: [],
        refreshes: {
            peripherals: 0,
            rtos: 0,
            memory: 0,
            trace: 0,
            profiling: 0,
        }
    };
    const deps = {
        simulatorManager: {
            status,
            syncDebugSessionStatus: (isRunning) => calls.syncStates.push(isRunning)
        },
        commandCenterProvider: {
            updateTelemetry: (data) => calls.telemetry.push(data),
            markUartActivity: () => { calls.markUart += 1; },
            appendUartOutput: (text) => calls.uartChunks.push(text)
        },
        graphingPanel: {
            updateSignals: (signals) => calls.graphSignals.push(signals)
        },
        peripheralProvider: {
            refresh: () => { calls.refreshes.peripherals += 1; }
        },
        rtosProvider: {
            refresh: () => { calls.refreshes.rtos += 1; }
        },
        memoryInspectorPanel: {
            refresh: () => { calls.refreshes.memory += 1; }
        },
        traceListPanel: {
            refresh: () => { calls.refreshes.trace += 1; }
        },
        profilingPanel: {
            refresh: () => { calls.refreshes.profiling += 1; }
        },
        outputChannel: {
            appendLine: (line) => calls.output.push(line)
        },
        sendTopologyTelemetry: (telemetry) => calls.topology.push(telemetry)
    };
    return { deps, calls };
}
suite('Extension Debug Event Handling', () => {
    test('processes telemetry and forwards status/signals', () => {
        const { deps, calls } = createDeps('Running');
        (0, extension_1.handleLabwiredDebugEvent)({
            session: { type: 'labwired' },
            event: 'telemetry',
            body: { pc: 0x8000000, signals: [{ name: 'pb0', value: 1 }] }
        }, deps);
        assert.strictEqual(calls.telemetry.length, 1);
        assert.strictEqual(calls.telemetry[0].status, 'Running');
        assert.strictEqual(calls.topology.length, 1);
        assert.strictEqual(calls.graphSignals.length, 1);
    });
    test('processes uart custom event', () => {
        const { deps, calls } = createDeps();
        (0, extension_1.handleLabwiredDebugEvent)({
            session: { type: 'labwired' },
            event: 'uart',
            body: { output: 'H563-IO\n' }
        }, deps);
        assert.deepStrictEqual(calls.output, ['H563-IO\n']);
        assert.strictEqual(calls.markUart, 1);
        assert.deepStrictEqual(calls.uartChunks, ['H563-IO\n']);
    });
    test('processes stdout/stderr output event', () => {
        const { deps, calls } = createDeps();
        (0, extension_1.handleLabwiredDebugEvent)({
            session: { type: 'labwired' },
            event: 'output',
            body: { category: 'stderr', output: 'Execution error\n' }
        }, deps);
        assert.deepStrictEqual(calls.output, ['Execution error\n']);
        assert.strictEqual(calls.markUart, 1);
        assert.deepStrictEqual(calls.uartChunks, ['Execution error\n']);
    });
    test('refreshes dependent views on continued/stopped', () => {
        const { deps, calls } = createDeps();
        (0, extension_1.handleLabwiredDebugEvent)({
            session: { type: 'labwired' },
            event: 'continued',
            body: {}
        }, deps);
        (0, extension_1.handleLabwiredDebugEvent)({
            session: { type: 'labwired' },
            event: 'stopped',
            body: {}
        }, deps);
        assert.deepStrictEqual(calls.syncStates, [true, false]);
        assert.strictEqual(calls.refreshes.peripherals, 2);
        assert.strictEqual(calls.refreshes.rtos, 2);
        assert.strictEqual(calls.refreshes.memory, 2);
        assert.strictEqual(calls.refreshes.trace, 2);
        assert.strictEqual(calls.refreshes.profiling, 2);
    });
    test('ignores non-labwired session events', () => {
        const { deps, calls } = createDeps();
        (0, extension_1.handleLabwiredDebugEvent)({
            session: { type: 'cppdbg' },
            event: 'uart',
            body: { output: 'ignored' }
        }, deps);
        assert.strictEqual(calls.output.length, 0);
        assert.strictEqual(calls.telemetry.length, 0);
        assert.strictEqual(calls.markUart, 0);
    });
});
//# sourceMappingURL=extensionEvents.test.js.map