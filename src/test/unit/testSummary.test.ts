import * as assert from 'assert';
import { formatTestSummary } from '../../testSummary';

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
        assert.deepStrictEqual(formatTestSummary(result, 0), [
            'PASS  3/3 checks  (80,000 steps)',
            '  ✓ uart_contains: M1 POR resetcause=0x00000001',
            '  ✓ rtt_contains: K32W041Z_RTT_OK',
            '  ✓ expected_stop_reason: max_steps',
        ]);
    });

    it('marks the failing check', () => {
        const failed = { ...result, status: 'fail', assertions: [{ ...result.assertions[0], passed: false }, result.assertions[1]] };
        assert.deepStrictEqual(formatTestSummary(failed, 1).slice(0, 2), [
            'FAIL  1/2 checks  (80,000 steps)',
            '  ✗ uart_contains: M1 POR resetcause=0x00000001',
        ]);
    });

    it('falls back to the exit code when the runner wrote no result', () => {
        assert.deepStrictEqual(formatTestSummary(undefined, 2), ['FAIL  runner exited with code 2, no result.json']);
    });
});
