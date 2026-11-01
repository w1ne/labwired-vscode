"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const ansi_1 = require("../../ansi");
describe('Run Test output', () => {
    it('drops colour codes the simulator log prints', () => {
        assert.strictEqual((0, ansi_1.stripAnsi)('\x1b[2m2026-11-01T16:29:58Z\x1b[0m \x1b[32m INFO\x1b[0m \x1b[2mlabwired_loader\x1b[0m\x1b[2m:\x1b[0m ELF Entry Point: 0x8'), '2026-11-01T16:29:58Z  INFO labwired_loader: ELF Entry Point: 0x8');
    });
    it('leaves plain text alone', () => {
        assert.strictEqual((0, ansi_1.stripAnsi)('PASS  9/9 checks'), 'PASS  9/9 checks');
    });
});
//# sourceMappingURL=ansi.test.js.map