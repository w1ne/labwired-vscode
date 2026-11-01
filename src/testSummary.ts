// What Run Test prints first: the verdict and one line per check. The
// runner's own log follows only when something failed.

interface AssertionResult {
    assertion?: Record<string, unknown>;
    passed?: boolean;
}

export function testPassed(result: any | undefined, exitCode: number): boolean {
    const status = result?.status;
    return status ? status === 'pass' || status === 'passed' : exitCode === 0;
}

export function formatTestSummary(result: any | undefined, exitCode: number): string[] {
    if (!result) {
        return [`${exitCode === 0 ? 'PASS' : 'FAIL'}  runner exited with code ${exitCode}, no result.json`];
    }
    const verdict = testPassed(result, exitCode) ? 'PASS' : 'FAIL';
    const assertions: AssertionResult[] = Array.isArray(result.assertions) ? result.assertions : [];
    const passedCount = assertions.filter((a) => a.passed).length;
    const steps = typeof result.steps_executed === 'number' ? `  (${result.steps_executed.toLocaleString('en-US')} steps)` : '';
    return [
        `${verdict}  ${passedCount}/${assertions.length} checks${steps}`,
        ...assertions.map((a) => `  ${a.passed ? '✓' : '✗'} ${describeAssertion(a.assertion)}`),
    ];
}

function describeAssertion(assertion: Record<string, unknown> | undefined): string {
    if (!assertion) return '(unnamed check)';
    return Object.entries(assertion)
        .map(([kind, value]) => `${kind}: ${typeof value === 'string' ? value : JSON.stringify(value)}`)
        .join(', ');
}
