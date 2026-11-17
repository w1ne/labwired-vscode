/** Anonymous product workflow telemetry. Strict backend vocabulary; no free text. */
export const USAGE_EVENTS = [
    'vscode_activated',
    'vscode_active_session',
    'vscode_debug_started',
    'vscode_debug_ready',
    'vscode_debug_ended',
    'vscode_run_requested',
    'vscode_run_failed',
] as const;

export type VscodeUsageEvent = typeof USAGE_EVENTS[number];

export interface AnonymousUsageBeacon {
    event: VscodeUsageEvent;
    sessionKey: string;
}

/** Never accept arbitrary data: a reporter has no legitimate access to files, names or messages. */
export function makeUsageBeacon(event: VscodeUsageEvent, sessionKey: string): AnonymousUsageBeacon {
    if (!(USAGE_EVENTS as readonly string[]).includes(event)) {
        throw new Error('Unknown LabWired usage event');
    }
    if (!/^[A-Za-z0-9_-]{8,32}$/.test(sessionKey)) {
        throw new Error('Invalid ephemeral session token');
    }
    return { event, sessionKey };
}

/** Editor opt-out and explicit no-tracking flags all win over default opt-in. */
export function canSendUsage(
    editorTelemetryEnabled: boolean,
    labwiredTelemetryEnabled: boolean,
    env: Readonly<Record<string, string | undefined>>,
): boolean {
    if (!editorTelemetryEnabled || !labwiredTelemetryEnabled) return false;
    if (env.DO_NOT_TRACK !== undefined || env.LABWIRED_TELEMETRY === '0') return false;
    // CI matrices must never look like users. Explicit opt-in is allowed for a diagnostic.
    if (env.CI !== undefined && env.LABWIRED_TELEMETRY !== '1') return false;
    return true;
}

/** Activation alone is not evidence of use: only an explicit user action is. */
export function qualifiesAsActiveUse(event: VscodeUsageEvent): boolean {
    return event === 'vscode_debug_started' || event === 'vscode_run_requested';
}

/** Local, best-effort active session de-duplication. A new editor host can
 * generate a second count; never label this a distinct human or installation. */
export class UsageSessionCounter {
    private lastActiveUtcDay = '';

    constructor(private readonly emit: (event: VscodeUsageEvent) => void,
                private readonly now: () => Date = () => new Date()) {}

    public record(event: VscodeUsageEvent): void {
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
