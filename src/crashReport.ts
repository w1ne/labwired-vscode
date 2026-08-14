/**
 * Report extension failures to POST /v1/telemetry/failure.
 *
 * The playground and the CLI both report now; the editor was the last surface
 * where a failure reached only the person it happened to. That matters more
 * here than elsewhere, because the extension's failures are the ones a user is
 * least able to describe: the Run button did nothing, F5 did nothing, and the
 * output channel scrolled past whatever said why.
 *
 * What leaves the machine is a fixed set of enumerated dimensions plus a
 * fingerprint. Never the error message: it routinely carries a workspace path,
 * a firmware name, or a customer's board. `hostClass` says where the binary
 * came from — bundled, PATH, or downloaded — which is the field that separates
 * "our release is broken" from "their PATH has something else on it".
 */
import * as https from 'https';
import { URL } from 'url';
import * as vscode from 'vscode';
import { DEFAULT_API_URL } from './mcpConfig';
import { errorClass, fingerprint, platformSlug } from './crashFingerprint';

/** One report per distinct failure per session. A retry loop is not new data. */
const reported = new Set<string>();

export type BinarySource = 'bundled' | 'path' | 'downloaded' | 'configured' | 'unknown';

function optedOut(): boolean {
    // VS Code's own telemetry switch governs this too: a user who turned that
    // off has already answered this question, and asking again in our own
    // setting would be asking until we get the answer we want.
    if (!vscode.env.isTelemetryEnabled) return true;
    return vscode.workspace.getConfiguration('labwired').get<boolean>('telemetry.enabled') === false;
}

function apiBase(): string {
    const configured = vscode.workspace.getConfiguration('labwired').get<string>('apiUrl');
    return (configured && configured.trim()) || DEFAULT_API_URL;
}

export interface CrashContext {
    /** Where in the extension's work it went wrong. */
    stage: 'boot' | 'run' | 'download' | 'verify';
    /** Where the simulator binary came from, when that is known. */
    binarySource?: BinarySource;
    extensionVersion: string;
}

/** Report one failure. Never throws, never blocks, never retries. */
export function reportCrash(error: unknown, context: CrashContext): void {
    if (optedOut()) return;
    try {
        const print = fingerprint(error);
        if (reported.has(print)) return;
        reported.add(print);

        const body = {
            surface: 'vscode',
            event: 'crash',
            stage: context.stage,
            platform: platformSlug(process.platform, process.arch),
            host_class: context.binarySource ?? 'unknown',
            release: context.extensionVersion,
            channel: 'vsix',
            error_class: errorClass(error),
            fingerprint: print,
        };

        // `https.request`, not fetch: the extension targets the Node the
        // editor ships, and this file must not be the one that needs a newer
        // one. Fire and forget, 3 second budget, every error swallowed.
        const payload = JSON.stringify(body);
        const url = new URL(`${apiBase()}/v1/telemetry/failure`);
        const request = https.request(
            {
                hostname: url.hostname,
                path: url.pathname,
                port: url.port || 443,
                method: 'POST',
                timeout: 3000,
                headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) },
            },
            (response) => { response.resume(); },
        );
        request.on('error', () => undefined);
        request.on('timeout', () => request.destroy());
        request.write(payload);
        request.end();
    } catch {
        // A failure reporter that can itself fail the extension is worse than none.
    }
}

/** Tests only. */
export function __resetCrashReporterForTests(): void {
    reported.clear();
}
