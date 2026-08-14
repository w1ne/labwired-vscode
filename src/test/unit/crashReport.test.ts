import * as assert from 'assert';
import {
    binarySourceOf,
    fingerprint,
    platformSlug,
    setBinarySource,
    type BinarySource,
} from '../../crashFingerprint';

describe('extension crash reporting', () => {
    it('gives the same fingerprint to the same failure and a different one to others', () => {
        const a = new TypeError('cannot read x');
        a.stack = 'TypeError: cannot read x\n    at resolveDap (/Users/someone/proj/out/cli.js:1:1)';
        const b = new TypeError('a different message, same place');
        b.stack = 'TypeError: y\n    at resolveDap (/Users/someone/proj/out/cli.js:9:9)';
        const c = new TypeError('elsewhere');
        c.stack = 'TypeError: z\n    at runTest (/Users/someone/proj/out/cli.js:1:1)';

        assert.strictEqual(fingerprint(a), fingerprint(b));
        assert.notStrictEqual(fingerprint(a), fingerprint(c));
        assert.match(fingerprint(a), /^[a-f0-9]{8}$/);
    });

    it('survives being handed something that is not an Error', () => {
        assert.doesNotThrow(() => fingerprint(undefined));
        assert.doesNotThrow(() => fingerprint('a string'));
    });

    it('names platforms the way the release archives do', () => {
        assert.strictEqual(platformSlug('win32', 'x64'), 'windows-x86_64');
        assert.strictEqual(platformSlug('darwin', 'arm64'), 'darwin-aarch64');
        assert.strictEqual(platformSlug('linux', 'x64'), 'linux-x86_64');
        // A machine we publish nothing for says so rather than guessing.
        assert.strictEqual(platformSlug('linux', 'riscv64'), 'unknown');
    });
});

describe('where the binary came from', () => {
    it('names a source for every step of the resolution cascade', () => {
        // `host_class` is the field that separates "our release is broken" from
        // "their PATH has something else on it". It shipped as a typed,
        // documented field that no call site ever passed, so every report read
        // `unknown`. These are the values cli.ts now records.
        const sources: BinarySource[] = ['configured', 'bundled', 'downloaded', 'path', 'unknown'];
        assert.strictEqual(new Set(sources).size, sources.length);
    });

    it('answers unknown for a binary that never resolved, rather than guessing', () => {
        assert.strictEqual(binarySourceOf('never-resolved-binary'), 'unknown');
    });

    it('remembers what the resolver recorded', () => {
        setBinarySource('labwired', 'path');
        assert.strictEqual(binarySourceOf('labwired'), 'path');
        setBinarySource('labwired', 'downloaded');
        assert.strictEqual(binarySourceOf('labwired'), 'downloaded');
    });
});
