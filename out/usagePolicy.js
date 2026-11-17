"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UsageSessionCounter = exports.qualifiesAsActiveUse = exports.canSendUsage = exports.makeUsageBeacon = exports.USAGE_EVENTS = void 0;
/** Anonymous product workflow telemetry. Strict backend vocabulary; no free text. */
exports.USAGE_EVENTS = [
    'vscode_activated',
    'vscode_active_session',
    'vscode_debug_started',
    'vscode_debug_ready',
    'vscode_debug_ended',
    'vscode_run_requested',
    'vscode_run_failed',
];
/** Never accept arbitrary data: a reporter has no legitimate access to files, names or messages. */
function makeUsageBeacon(event, sessionKey) {
    if (!exports.USAGE_EVENTS.includes(event)) {
        throw new Error('Unknown LabWired usage event');
    }
    if (!/^[A-Za-z0-9_-]{8,32}$/.test(sessionKey)) {
        throw new Error('Invalid ephemeral session token');
    }
    return { event, sessionKey };
}
exports.makeUsageBeacon = makeUsageBeacon;
/** Editor opt-out and explicit no-tracking flags all win over default opt-in. */
function canSendUsage(editorTelemetryEnabled, labwiredTelemetryEnabled, env) {
    if (!editorTelemetryEnabled || !labwiredTelemetryEnabled)
        return false;
    if (env.DO_NOT_TRACK !== undefined || env.LABWIRED_TELEMETRY === '0')
        return false;
    // CI matrices must never look like users. Explicit opt-in is allowed for a diagnostic.
    if (env.CI !== undefined && env.LABWIRED_TELEMETRY !== '1')
        return false;
    return true;
}
exports.canSendUsage = canSendUsage;
/** Activation alone is not evidence of use: only an explicit user action is. */
function qualifiesAsActiveUse(event) {
    return event === 'vscode_debug_started' || event === 'vscode_run_requested';
}
exports.qualifiesAsActiveUse = qualifiesAsActiveUse;
/** Local, best-effort active session de-duplication. A new editor host can
 * generate a second count; never label this a distinct human or installation. */
class UsageSessionCounter {
    constructor(emit, now = () => new Date()) {
        this.emit = emit;
        this.now = now;
        this.lastActiveUtcDay = '';
    }
    record(event) {
        if (qualifiesAsActiveUse(event)) {
            const day = this.now().toISOString().slice(0, 10);
            if (day !== this.lastActiveUtcDay) {
                this.lastActiveUtcDay = day;
                this.emit('vscode_active_session');
            }
        }
        this.emit(event);
    }
}
exports.UsageSessionCounter = UsageSessionCounter;
//# sourceMappingURL=usagePolicy.js.map