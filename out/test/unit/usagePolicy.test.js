"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const usagePolicy_1 = require("../../usagePolicy");
describe('anonymous VS Code usage policy', () => {
    it('sends only the two fixed fields and uses the backend event vocabulary', () => {
        for (const event of usagePolicy_1.USAGE_EVENTS) {
            const body = (0, usagePolicy_1.makeUsageBeacon)(event, 'aabbccddeeff001122334455');
            assert.deepStrictEqual(Object.keys(body).sort(), ['event', 'sessionKey']);
            assert.strictEqual(body.event, event);
        }
    });
    it('rejects invalid or arbitrary events and invalid session tokens', () => {
        assert.throws(() => (0, usagePolicy_1.makeUsageBeacon)('vscode_send_source', 'aabbccddeeff001122334455'));
        assert.throws(() => (0, usagePolicy_1.makeUsageBeacon)('vscode_debug_ready', 'too short'));
        assert.throws(() => (0, usagePolicy_1.makeUsageBeacon)('vscode_debug_ready', '12345'));
    });
    it('never reports under VS Code opt-out or the LabWired switch', () => {
        assert.strictEqual((0, usagePolicy_1.canSendUsage)(false, true, {}), false);
        assert.strictEqual((0, usagePolicy_1.canSendUsage)(true, false, {}), false);
        assert.strictEqual((0, usagePolicy_1.canSendUsage)(true, true, { DO_NOT_TRACK: '1' }), false);
        assert.strictEqual((0, usagePolicy_1.canSendUsage)(true, true, { LABWIRED_TELEMETRY: '0' }), false);
        assert.strictEqual((0, usagePolicy_1.canSendUsage)(true, true, { CI: 'true' }), false);
        assert.strictEqual((0, usagePolicy_1.canSendUsage)(true, true, { CI: 'true', LABWIRED_TELEMETRY: '1' }), true);
        assert.strictEqual((0, usagePolicy_1.canSendUsage)(true, true, {}), true);
    });
    it('emits one active editor-host day on first deliberate use, not on activation', () => {
        const events = [];
        let now = new Date('2026-11-17T18:00:00Z');
        const counter = new usagePolicy_1.UsageSessionCounter(e => events.push(e), () => now);
        counter.record('vscode_activated');
        counter.record('vscode_debug_started');
        counter.record('vscode_debug_ready');
        counter.record('vscode_run_requested');
        assert.deepStrictEqual(events, [
            'vscode_activated', 'vscode_active_session', 'vscode_debug_started',
            'vscode_debug_ready', 'vscode_run_requested',
        ]);
        now = new Date('2026-11-18T00:01:00Z');
        counter.record('vscode_run_requested');
        assert.deepStrictEqual(events.slice(-2), ['vscode_active_session', 'vscode_run_requested']);
    });
    it('does not count passive extension activation as active use', () => {
        assert.strictEqual((0, usagePolicy_1.qualifiesAsActiveUse)('vscode_activated'), false);
        assert.strictEqual((0, usagePolicy_1.qualifiesAsActiveUse)('vscode_debug_ready'), false);
        assert.strictEqual((0, usagePolicy_1.qualifiesAsActiveUse)('vscode_debug_started'), true);
        assert.strictEqual((0, usagePolicy_1.qualifiesAsActiveUse)('vscode_run_requested'), true);
    });
});
//# sourceMappingURL=usagePolicy.test.js.map