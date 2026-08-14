"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.__resetCrashReporterForTests = exports.reportCrash = void 0;
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
const https = require("https");
const url_1 = require("url");
const vscode = require("vscode");
const mcpConfig_1 = require("./mcpConfig");
const crashFingerprint_1 = require("./crashFingerprint");
/** One report per distinct failure per session. A retry loop is not new data. */
const reported = new Set();
function optedOut() {
    // VS Code's own telemetry switch governs this too: a user who turned that
    // off has already answered this question, and asking again in our own
    // setting would be asking until we get the answer we want.
    if (!vscode.env.isTelemetryEnabled)
        return true;
    return vscode.workspace.getConfiguration('labwired').get('telemetry.enabled') === false;
}
function apiBase() {
    const configured = vscode.workspace.getConfiguration('labwired').get('apiUrl');
    return (configured && configured.trim()) || mcpConfig_1.DEFAULT_API_URL;
}
/** Report one failure. Never throws, never blocks, never retries. */
function reportCrash(error, context) {
    var _a;
    if (optedOut())
        return;
    try {
        const print = (0, crashFingerprint_1.fingerprint)(error);
        if (reported.has(print))
            return;
        reported.add(print);
        const body = {
            surface: 'vscode',
            event: 'crash',
            stage: context.stage,
            platform: (0, crashFingerprint_1.platformSlug)(process.platform, process.arch),
            host_class: (_a = context.binarySource) !== null && _a !== void 0 ? _a : 'unknown',
            release: context.extensionVersion,
            channel: 'vsix',
            error_class: (0, crashFingerprint_1.errorClass)(error),
            fingerprint: print,
        };
        // `https.request`, not fetch: the extension targets the Node the
        // editor ships, and this file must not be the one that needs a newer
        // one. Fire and forget, 3 second budget, every error swallowed.
        const payload = JSON.stringify(body);
        const url = new url_1.URL(`${apiBase()}/v1/telemetry/failure`);
        const request = https.request({
            hostname: url.hostname,
            path: url.pathname,
            port: url.port || 443,
            method: 'POST',
            timeout: 3000,
            headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) },
        }, (response) => { response.resume(); });
        request.on('error', () => undefined);
        request.on('timeout', () => request.destroy());
        request.write(payload);
        request.end();
    }
    catch (_b) {
        // A failure reporter that can itself fail the extension is worse than none.
    }
}
exports.reportCrash = reportCrash;
/** Tests only. */
function __resetCrashReporterForTests() {
    reported.clear();
}
exports.__resetCrashReporterForTests = __resetCrashReporterForTests;
//# sourceMappingURL=crashReport.js.map