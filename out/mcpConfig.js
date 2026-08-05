"use strict";
// Pure MCP config builders (no vscode import — unit-testable).
Object.defineProperty(exports, "__esModule", { value: true });
exports.mergeMcpConfig = exports.claudeMcpInstallLine = exports.buildHostedMcpConfig = exports.DEFAULT_API_URL = exports.DEFAULT_MCP_URL = void 0;
exports.DEFAULT_MCP_URL = 'https://api.labwired.com/mcp';
exports.DEFAULT_API_URL = 'https://api.labwired.com';
/**
 * Build a workspace mcp.json that points every agent at the **same** hosted
 * LabWired tools surface (`labwired_*`).
 */
function buildHostedMcpConfig(opts) {
    const url = (opts.mcpUrl || exports.DEFAULT_MCP_URL).replace(/\/+$/, '');
    const server = {
        type: 'http',
        url,
    };
    if (opts.useInputPrompt && !opts.accessToken) {
        return {
            inputs: [
                {
                    type: 'promptString',
                    id: 'labwired-token',
                    description: 'LabWired access token (Sign in via LabWired: Sign in, or labwired login)',
                    password: true,
                },
            ],
            servers: {
                labwired: Object.assign(Object.assign({}, server), { headers: {
                        Authorization: 'Bearer ${input:labwired-token}',
                    } }),
            },
        };
    }
    if (opts.accessToken) {
        server.headers = {
            Authorization: `Bearer ${opts.accessToken}`,
        };
    }
    return {
        servers: {
            labwired: server,
        },
    };
}
exports.buildHostedMcpConfig = buildHostedMcpConfig;
/** Claude Code one-liner — same tools, no VS Code required. */
function claudeMcpInstallLine(mcpUrl = exports.DEFAULT_MCP_URL) {
    return `claude mcp add labwired --transport http ${mcpUrl.replace(/\/+$/, '')}`;
}
exports.claudeMcpInstallLine = claudeMcpInstallLine;
/** Merge labwired server into an existing mcp.json document. */
function mergeMcpConfig(existing, next) {
    var _a;
    const base = existing && typeof existing === 'object' && existing !== null && 'servers' in existing
        ? JSON.parse(JSON.stringify(existing))
        : { servers: {} };
    base.servers = Object.assign(Object.assign({}, (base.servers || {})), next.servers);
    if ((_a = next.inputs) === null || _a === void 0 ? void 0 : _a.length) {
        const byId = new Map((base.inputs || []).map((i) => [i.id, i]));
        for (const input of next.inputs) {
            byId.set(input.id, input);
        }
        base.inputs = Array.from(byId.values());
    }
    return base;
}
exports.mergeMcpConfig = mergeMcpConfig;
//# sourceMappingURL=mcpConfig.js.map