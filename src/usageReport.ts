/**
 * VS Code editor workflow counts, NOT unique-user analytics. A random token
 * lives only in this extension-host process. No installation ID, account,
 * project, source, board, prompt, path or error message leaves the machine.
 */
import { randomBytes } from 'crypto';
import * as https from 'https';
import { URL } from 'url';
import * as vscode from 'vscode';
import { DEFAULT_API_URL } from './mcpConfig';
import { canSendUsage, makeUsageBeacon, UsageSessionCounter, type VscodeUsageEvent } from './usagePolicy';

const sessionKey = randomBytes(12).toString('hex');
const counter = new UsageSessionCounter(send);

function permitted(): boolean {
    return canSendUsage(
        vscode.env.isTelemetryEnabled,
        vscode.workspace.getConfiguration('labwired').get<boolean>('telemetry.enabled') !== false,
        process.env,
    );
}

function send(event: VscodeUsageEvent): void {
    try {
        const base = vscode.workspace.getConfiguration('labwired').get<string>('apiUrl') || DEFAULT_API_URL;
        const url = new URL('/v1/events', base);
        if (url.protocol !== 'https:') return;
        const body = JSON.stringify(makeUsageBeacon(event, sessionKey));
        const request = https.request({
            hostname: url.hostname,
            port: url.port || 443,
            path: url.pathname,
            method: 'POST',
            timeout: 2500,
            headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) },
        }, (response) => response.resume());
        request.on('error', () => undefined);
        request.on('timeout', () => request.destroy());
        request.end(body);
    } catch {
        // The extension must work offline and never block debugging on analytics.
    }
}

/** Fire-and-forget. The active-session denominator needs one real user action. */
export function reportUsage(event: VscodeUsageEvent): void {
    if (!permitted()) return;
    counter.record(event);
}
