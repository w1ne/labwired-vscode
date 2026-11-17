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
const assert = require("assert");
const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
const crashFingerprint_1 = require("../../crashFingerprint");
suite('DAP E2E Test Suite', function () {
    this.timeout(120000); // Published release download and debugger startup can be slow
    test('Should launch and stop at entry', function () {
        return __awaiter(this, void 0, void 0, function* () {
            const root = path.resolve(__dirname, '../../../../');
            const dapPath = process.env.LABWIRED_DAP_BIN || path.join(root, 'core/target/release/labwired-dap');
            const firmwarePath = process.env.LABWIRED_DEMO_ELF || path.join(root, 'core/target/thumbv7m-none-eabi/release/demo-blinky');
            const systemPath = process.env.LABWIRED_SYSTEM_YAML;
            if (process.env.LABWIRED_REQUIRE_DAP_E2E === '1') {
                assert.ok(systemPath, 'Published DAP E2E requires LABWIRED_SYSTEM_YAML');
            }
            // CI's published-runtime job sets these three paths and requires the test;
            // a missing binary is a release-blocking failure, not a green skip.
            // Developer-only npm test may omit the fixtures and skip this test.
            for (const [label, file] of [['debug adapter', dapPath], ['firmware', firmwarePath], ...(systemPath ? [['system config', systemPath]] : [])]) {
                if (!fs.existsSync(file)) {
                    if (process.env.LABWIRED_REQUIRE_DAP_E2E === '1') {
                        assert.fail(`DAP E2E required but ${label} not found at ${file}`);
                    }
                    console.log(`DAP E2E skipped: ${label} not found at ${file}`);
                    this.skip();
                }
            }
            // We need to ensure the extension is active
            const ext = vscode.extensions.getExtension('w1ne.labwired-vscode');
            assert.ok(ext, 'Extension not found');
            yield ext.activate();
            // Update configuration for the test
            const config = vscode.workspace.getConfiguration('labwired');
            yield config.update('dapPath', dapPath, vscode.ConfigurationTarget.Global);
            const debugConfig = Object.assign(Object.assign({ type: 'labwired', name: 'E2E Test Launch', request: 'launch', program: firmwarePath }, (systemPath ? { systemConfig: systemPath } : {})), { stopOnEntry: true, trace: true });
            let startedSession;
            let stoppedEvents = 0;
            const startDisposable = vscode.debug.onDidStartDebugSession(s => {
                if (s.name === debugConfig.name)
                    startedSession = s;
            });
            const trackerDisposable = vscode.debug.registerDebugAdapterTrackerFactory('labwired', {
                createDebugAdapterTracker() {
                    return {
                        onDidSendMessage: m => {
                            if (m.type === 'event' && m.event === 'stopped')
                                stoppedEvents++;
                        }
                    };
                }
            });
            const awaitStopped = (previousCount) => __awaiter(this, void 0, void 0, function* () {
                for (let attempts = 0; stoppedEvents <= previousCount && attempts < 100; attempts++) {
                    yield new Promise(resolve => setTimeout(resolve, 100));
                }
                assert.ok(stoppedEvents > previousCount, 'Timed out waiting for the DAP stopped event');
            });
            try {
                const started = yield vscode.debug.startDebugging(undefined, debugConfig);
                assert.ok(started, 'Failed to start debugging');
                yield awaitStopped(0);
                const session = startedSession;
                assert.ok(session, 'Debug session did not start');
                // Exercise real Debug Adapter Protocol requests, not mocked providers.
                // This is the minimum Renode-class firmware debug flow: inspect a
                // target, read RAM, step an instruction, then reverse that step.
                const threads = yield session.customRequest('threads');
                assert.strictEqual(threads.threads[0].id, 1, 'No debug thread');
                const stack = yield session.customRequest('stackTrace', { threadId: 1 });
                assert.ok(stack.stackFrames.length > 0, 'No firmware stack frame');
                const initialPc = stack.stackFrames[0].instructionPointerReference;
                assert.ok(/^0x[0-9a-f]+$/i.test(initialPc), `Invalid PC ${initialPc}`);
                const scopes = yield session.customRequest('scopes', { frameId: stack.stackFrames[0].id });
                const registers = scopes.scopes.find((scope) => scope.name === 'Registers');
                assert.ok(registers, 'Registers scope is absent');
                const variables = yield session.customRequest('variables', { variablesReference: registers.variablesReference });
                assert.ok(variables.variables.length >= 16, 'CPU register values are missing');
                const memory = yield session.customRequest('readMemory', {
                    memoryReference: '0x20000000', count: 16
                });
                assert.strictEqual(Buffer.from(memory.data, 'base64').length, 16, 'Failed to read target SRAM');
                assert.strictEqual(memory.unreadableBytes, 0, 'Target SRAM was unexpectedly unreadable');
                let previousCount = stoppedEvents;
                yield session.customRequest('stepIn', { threadId: 1, granularity: 'instruction' });
                yield awaitStopped(previousCount);
                const stepped = yield session.customRequest('stackTrace', { threadId: 1 });
                const steppedPc = stepped.stackFrames[0].instructionPointerReference;
                assert.notStrictEqual(steppedPc, initialPc, 'Step did not advance the instruction pointer');
                previousCount = stoppedEvents;
                yield session.customRequest('stepBack', { threadId: 1 });
                yield awaitStopped(previousCount);
                const reversed = yield session.customRequest('stackTrace', { threadId: 1 });
                assert.strictEqual(reversed.stackFrames[0].instructionPointerReference, initialPc, 'Reverse step did not restore the previous PC');
            }
            finally {
                yield vscode.debug.stopDebugging();
                startDisposable.dispose();
                trackerDisposable.dispose();
            }
        });
    });
    test('Fresh install downloads the published DAP and starts firmware debugging', function () {
        return __awaiter(this, void 0, void 0, function* () {
            if (process.env.LABWIRED_TEST_AUTO_DOWNLOAD !== '1')
                this.skip();
            const firmwarePath = process.env.LABWIRED_DEMO_ELF;
            const systemPath = process.env.LABWIRED_SYSTEM_YAML;
            assert.ok(firmwarePath && fs.existsSync(firmwarePath), 'Published demo firmware is required');
            assert.ok(systemPath && fs.existsSync(systemPath), 'Built-in chip fixture is required');
            const ext = vscode.extensions.getExtension('w1ne.labwired-vscode');
            assert.ok(ext, 'Extension not found');
            yield ext.activate();
            const config = vscode.workspace.getConfiguration('labwired');
            // Clear the explicit override used by the first E2E test. The extension
            // must now resolve, download, unpack, and execute its DEFAULT runtime.
            yield config.update('dapPath', undefined, vscode.ConfigurationTarget.Global);
            yield config.update('cliVersion', undefined, vscode.ConfigurationTarget.Global);
            let stopped = false;
            let sessionStarted = false;
            const start = vscode.debug.onDidStartDebugSession(s => {
                if (s.name === 'Fresh Install F5')
                    sessionStarted = true;
            });
            const tracker = vscode.debug.registerDebugAdapterTrackerFactory('labwired', {
                createDebugAdapterTracker() {
                    return {
                        onDidSendMessage: m => {
                            if (m.type === 'event' && m.event === 'stopped')
                                stopped = true;
                        },
                    };
                },
            });
            try {
                assert.ok(yield vscode.debug.startDebugging(undefined, {
                    name: 'Fresh Install F5', type: 'labwired', request: 'launch',
                    program: firmwarePath, systemConfig: systemPath, stopOnEntry: true,
                }), 'VS Code failed to start the downloaded debugger');
                for (let attempts = 0; !stopped && attempts < 550; attempts++) {
                    yield new Promise(resolve => setTimeout(resolve, 100));
                }
                assert.ok(sessionStarted, 'Downloaded debugger never started');
                assert.ok(stopped, 'Downloaded debugger failed to stop at firmware entry');
                assert.strictEqual((0, crashFingerprint_1.binarySourceOf)('labwired-dap'), 'downloaded', 'Clearing an explicit DAP path must not reuse a previously configured binary');
            }
            finally {
                yield vscode.debug.stopDebugging();
                start.dispose();
                tracker.dispose();
            }
        });
    });
});
//# sourceMappingURL=dap.test.js.map