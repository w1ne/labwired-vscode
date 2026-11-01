import * as assert from 'assert';
import { stripAnsi } from '../../ansi';

describe('Run Test output', () => {
    it('drops colour codes the simulator log prints', () => {
        assert.strictEqual(
            stripAnsi('\x1b[2m2026-11-01T16:29:58Z\x1b[0m \x1b[32m INFO\x1b[0m \x1b[2mlabwired_loader\x1b[0m\x1b[2m:\x1b[0m ELF Entry Point: 0x8'),
            '2026-11-01T16:29:58Z  INFO labwired_loader: ELF Entry Point: 0x8'
        );
    });

    it('leaves plain text alone', () => {
        assert.strictEqual(stripAnsi('PASS  9/9 checks'), 'PASS  9/9 checks');
    });
});
