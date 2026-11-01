"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const testSummary_1 = require("../../testSummary");
describe('Run Test summary', () => {
    const result = {
        status: 'pass',
        steps_executed: 80000,
        assertions: [
            { assertion: { uart_contains: 'M1 POR resetcause=0x00000001' }, passed: true },
            { assertion: { rtt_contains: 'K32W041Z_RTT_OK' }, passed: true },
            { assertion: { expected_stop_reason: 'max_steps' }, passed: true },
        ],
    };
    it('leads with the verdict and lists each check', () => {
        assert.deepStrictEqual((0, testSummary_1.formatTestSummary)(result, 0), [
            'PASS  3/3 checks  (80,000 steps)',
            '  ✓ uart_contains: M1 POR resetcause=0x00000001',
            '  ✓ rtt_contains: K32W041Z_RTT_OK',
            '  ✓ expected_stop_reason: max_steps',
        ]);
    });
    it('marks the failing check', () => {
        const failed = Object.assign(Object.assign({}, result), { status: 'fail', assertions: [Object.assign(Object.assign({}, result.assertions[0]), { passed: false }), result.assertions[1]] });
        assert.deepStrictEqual((0, testSummary_1.formatTestSummary)(failed, 1).slice(0, 2), [
            'FAIL  1/2 checks  (80,000 steps)',
            '  ✗ uart_contains: M1 POR resetcause=0x00000001',
        ]);
    });
    it('falls back to the exit code when the runner wrote no result', () => {
        assert.deepStrictEqual((0, testSummary_1.formatTestSummary)(undefined, 2), ['FAIL  runner exited with code 2, no result.json']);
    });
});
//# sourceMappingURL=testSummary.test.js.map