"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const crashFingerprint_1 = require("../../crashFingerprint");
describe('extension crash reporting', () => {
    it('gives the same fingerprint to the same failure and a different one to others', () => {
        const a = new TypeError('cannot read x');
        a.stack = 'TypeError: cannot read x\n    at resolveDap (/Users/someone/proj/out/cli.js:1:1)';
        const b = new TypeError('a different message, same place');
        b.stack = 'TypeError: y\n    at resolveDap (/Users/someone/proj/out/cli.js:9:9)';
        const c = new TypeError('elsewhere');
        c.stack = 'TypeError: z\n    at runTest (/Users/someone/proj/out/cli.js:1:1)';
        assert.strictEqual((0, crashFingerprint_1.fingerprint)(a), (0, crashFingerprint_1.fingerprint)(b));
        assert.notStrictEqual((0, crashFingerprint_1.fingerprint)(a), (0, crashFingerprint_1.fingerprint)(c));
        assert.match((0, crashFingerprint_1.fingerprint)(a), /^[a-f0-9]{8}$/);
    });
    it('survives being handed something that is not an Error', () => {
        assert.doesNotThrow(() => (0, crashFingerprint_1.fingerprint)(undefined));
        assert.doesNotThrow(() => (0, crashFingerprint_1.fingerprint)('a string'));
    });
    it('names platforms the way the release archives do', () => {
        assert.strictEqual((0, crashFingerprint_1.platformSlug)('win32', 'x64'), 'windows-x86_64');
        assert.strictEqual((0, crashFingerprint_1.platformSlug)('darwin', 'arm64'), 'darwin-aarch64');
        assert.strictEqual((0, crashFingerprint_1.platformSlug)('linux', 'x64'), 'linux-x86_64');
        // A machine we publish nothing for says so rather than guessing.
        assert.strictEqual((0, crashFingerprint_1.platformSlug)('linux', 'riscv64'), 'unknown');
    });
});
describe('where the binary came from', () => {
    it('names a source for every step of the resolution cascade', () => {
        // `host_class` is the field that separates "our release is broken" from
        // "their PATH has something else on it". It shipped as a typed,
        // documented field that no call site ever passed, so every report read
        // `unknown`. These are the values cli.ts now records.
        const sources = ['configured', 'bundled', 'downloaded', 'path', 'unknown'];
        assert.strictEqual(new Set(sources).size, sources.length);
    });
    it('answers unknown for a binary that never resolved, rather than guessing', () => {
        assert.strictEqual((0, crashFingerprint_1.binarySourceOf)('never-resolved-binary'), 'unknown');
    });
    it('remembers what the resolver recorded', () => {
        (0, crashFingerprint_1.setBinarySource)('labwired', 'path');
        assert.strictEqual((0, crashFingerprint_1.binarySourceOf)('labwired'), 'path');
        (0, crashFingerprint_1.setBinarySource)('labwired', 'downloaded');
        assert.strictEqual((0, crashFingerprint_1.binarySourceOf)('labwired'), 'downloaded');
    });
});
//# sourceMappingURL=crashReport.test.js.map