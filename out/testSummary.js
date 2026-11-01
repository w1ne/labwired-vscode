"use strict";
// What Run Test prints first: the verdict and one line per check. The
// runner's own log follows only when something failed.
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatTestSummary = exports.testPassed = void 0;
function testPassed(result, exitCode) {
    const status = result === null || result === void 0 ? void 0 : result.status;
    return status ? status === 'pass' || status === 'passed' : exitCode === 0;
}
exports.testPassed = testPassed;
function formatTestSummary(result, exitCode) {
    if (!result) {
        return [`${exitCode === 0 ? 'PASS' : 'FAIL'}  runner exited with code ${exitCode}, no result.json`];
    }
    const verdict = testPassed(result, exitCode) ? 'PASS' : 'FAIL';
    const assertions = Array.isArray(result.assertions) ? result.assertions : [];
    const passedCount = assertions.filter((a) => a.passed).length;
    const steps = typeof result.steps_executed === 'number' ? `  (${result.steps_executed.toLocaleString('en-US')} steps)` : '';
    return [
        `${verdict}  ${passedCount}/${assertions.length} checks${steps}`,
        ...assertions.map((a) => `  ${a.passed ? '✓' : '✗'} ${describeAssertion(a.assertion)}`),
    ];
}
exports.formatTestSummary = formatTestSummary;
function describeAssertion(assertion) {
    if (!assertion)
        return '(unnamed check)';
    return Object.entries(assertion)
        .map(([kind, value]) => `${kind}: ${typeof value === 'string' ? value : JSON.stringify(value)}`)
        .join(', ');
}
//# sourceMappingURL=testSummary.js.map