"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reportUsage = void 0;
/**
 * VS Code editor workflow counts, NOT unique-user analytics. A random token
 * lives only in this extension-host process. No installation ID, account,
 * project, source, board, prompt, path or error message leaves the machine.
 */
const crypto_1 = require("crypto");
const https = require("https");
const url_1 = require("url");
const vscode = require("vscode");
const mcpConfig_1 = require("./mcpConfig");
const usagePolicy_1 = require("./usagePolicy");
const sessionKey = (0, crypto_1.randomBytes)(12).toString('hex');
const counter = new usagePolicy_1.UsageSessionCounter(send);
function permitted() {
    return (0, usagePolicy_1.canSendUsage)(vscode.env.isTelemetryEnabled, vscode.workspace.getConfiguration('labwired').get('telemetry.enabled') !== false, process.env);
}
function send(event) {
    try {
        const base = vscode.workspace.getConfiguration('labwired').get('apiUrl') || mcpConfig_1.DEFAULT_API_URL;
        const url = new url_1.URL('/v1/events', base);
        if (url.protocol !== 'https:')
            return;
        const body = JSON.stringify((0, usagePolicy_1.makeUsageBeacon)(event, sessionKey));
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
    }
    catch (_a) {
        // The extension must work offline and never block debugging on analytics.
    }
}
/** Fire-and-forget. The active-session denominator needs one real user action. */
function reportUsage(event) {
    if (!permitted())
        return;
    counter.record(event);
}
exports.reportUsage = reportUsage;
//# sourceMappingURL=usageReport.js.map