import * as assert from 'assert';
import {
    buildHostedMcpConfig,
    claudeMcpInstallLine,
    mergeMcpConfig,
    DEFAULT_MCP_URL,
} from '../../mcpConfig';

describe('mcpSetup — shared hosted tools', () => {
    it('builds http server pointing at hosted MCP', () => {
        const cfg = buildHostedMcpConfig({});
        assert.strictEqual(cfg.servers.labwired.type, 'http');
        assert.strictEqual(cfg.servers.labwired.url, DEFAULT_MCP_URL);
        assert.ok(!cfg.servers.labwired.headers);
    });

    it('embeds bearer when signed in', () => {
        const cfg = buildHostedMcpConfig({ accessToken: 'lwd_test' });
        assert.strictEqual(cfg.servers.labwired.headers?.Authorization, 'Bearer lwd_test');
    });

    it('input prompt mode avoids embedding secrets', () => {
        const cfg = buildHostedMcpConfig({ useInputPrompt: true });
        assert.ok(cfg.inputs?.some((i) => i.id === 'labwired-token'));
        assert.ok(
            (cfg.servers.labwired.headers?.Authorization || '').includes('${input:labwired-token}')
        );
    });

    it('merge keeps other servers', () => {
        const merged = mergeMcpConfig(
            { servers: { other: { type: 'http', url: 'https://example.com' } } },
            buildHostedMcpConfig({ accessToken: 'x' })
        );
        assert.ok(merged.servers.other);
        assert.ok(merged.servers.labwired);
    });

    it('claude install line uses shared URL', () => {
        const line = claudeMcpInstallLine();
        assert.ok(line.includes('api.labwired.com/mcp'));
        assert.ok(line.startsWith('claude mcp add labwired'));
    });
});
