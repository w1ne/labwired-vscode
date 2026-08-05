"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const mcpConfig_1 = require("../../mcpConfig");
describe('mcpSetup — shared hosted tools', () => {
    it('builds http server pointing at hosted MCP', () => {
        const cfg = (0, mcpConfig_1.buildHostedMcpConfig)({});
        assert.strictEqual(cfg.servers.labwired.type, 'http');
        assert.strictEqual(cfg.servers.labwired.url, mcpConfig_1.DEFAULT_MCP_URL);
        assert.ok(!cfg.servers.labwired.headers);
    });
    it('embeds bearer when signed in', () => {
        var _a;
        const cfg = (0, mcpConfig_1.buildHostedMcpConfig)({ accessToken: 'lwd_test' });
        assert.strictEqual((_a = cfg.servers.labwired.headers) === null || _a === void 0 ? void 0 : _a.Authorization, 'Bearer lwd_test');
    });
    it('input prompt mode avoids embedding secrets', () => {
        var _a, _b;
        const cfg = (0, mcpConfig_1.buildHostedMcpConfig)({ useInputPrompt: true });
        assert.ok((_a = cfg.inputs) === null || _a === void 0 ? void 0 : _a.some((i) => i.id === 'labwired-token'));
        assert.ok((((_b = cfg.servers.labwired.headers) === null || _b === void 0 ? void 0 : _b.Authorization) || '').includes('${input:labwired-token}'));
    });
    it('merge keeps other servers', () => {
        const merged = (0, mcpConfig_1.mergeMcpConfig)({ servers: { other: { type: 'http', url: 'https://example.com' } } }, (0, mcpConfig_1.buildHostedMcpConfig)({ accessToken: 'x' }));
        assert.ok(merged.servers.other);
        assert.ok(merged.servers.labwired);
    });
    it('claude install line uses shared URL', () => {
        const line = (0, mcpConfig_1.claudeMcpInstallLine)();
        assert.ok(line.includes('api.labwired.com/mcp'));
        assert.ok(line.startsWith('claude mcp add labwired'));
    });
});
//# sourceMappingURL=mcpSetup.test.js.map