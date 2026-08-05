// Pure MCP config builders (no vscode import — unit-testable).

export const DEFAULT_MCP_URL = 'https://api.labwired.com/mcp';
export const DEFAULT_API_URL = 'https://api.labwired.com';

/** VS Code / Copilot Chat MCP server entry (workspace `.vscode/mcp.json`). */
export interface VsCodeMcpServer {
    type: 'http';
    url: string;
    headers?: Record<string, string>;
}

export interface VsCodeMcpFile {
    inputs?: Array<{
        type: string;
        id: string;
        description: string;
        password?: boolean;
    }>;
    servers: Record<string, VsCodeMcpServer>;
}

/**
 * Build a workspace mcp.json that points every agent at the **same** hosted
 * LabWired tools surface (`labwired_*`).
 */
export function buildHostedMcpConfig(opts: {
    mcpUrl?: string;
    accessToken?: string;
    useInputPrompt?: boolean;
}): VsCodeMcpFile {
    const url = (opts.mcpUrl || DEFAULT_MCP_URL).replace(/\/+$/, '');
    const server: VsCodeMcpServer = {
        type: 'http',
        url,
    };

    if (opts.useInputPrompt && !opts.accessToken) {
        return {
            inputs: [
                {
                    type: 'promptString',
                    id: 'labwired-token',
                    description:
                        'LabWired access token (Sign in via LabWired: Sign in, or labwired login)',
                    password: true,
                },
            ],
            servers: {
                labwired: {
                    ...server,
                    headers: {
                        Authorization: 'Bearer ${input:labwired-token}',
                    },
                },
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

/** Claude Code one-liner — same tools, no VS Code required. */
export function claudeMcpInstallLine(mcpUrl = DEFAULT_MCP_URL): string {
    return `claude mcp add labwired --transport http ${mcpUrl.replace(/\/+$/, '')}`;
}

/** Merge labwired server into an existing mcp.json document. */
export function mergeMcpConfig(existing: unknown, next: VsCodeMcpFile): VsCodeMcpFile {
    const base: VsCodeMcpFile =
        existing && typeof existing === 'object' && existing !== null && 'servers' in (existing as object)
            ? (JSON.parse(JSON.stringify(existing)) as VsCodeMcpFile)
            : { servers: {} };

    base.servers = { ...(base.servers || {}), ...next.servers };
    if (next.inputs?.length) {
        const byId = new Map((base.inputs || []).map((i) => [i.id, i]));
        for (const input of next.inputs) {
            byId.set(input.id, input);
        }
        base.inputs = Array.from(byId.values());
    }
    return base;
}
