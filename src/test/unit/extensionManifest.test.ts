import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

describe('extension manifest', () => {
    it('runs as a workspace extension so debugging stays with remote project files', () => {
        const manifestPath = path.resolve(__dirname, '../../../package.json');
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as { extensionKind?: string[] };
        assert.deepStrictEqual(manifest.extensionKind, ['workspace']);
    });

    it('uses a Node 16-compatible streaming tar parser for catalog archives', () => {
        const manifestPath = path.resolve(__dirname, '../../../package.json');
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
            dependencies?: Record<string, string>;
        };
        const tarStreamPath = require.resolve('tar-stream/package.json');
        const tarStream = JSON.parse(fs.readFileSync(tarStreamPath, 'utf8')) as {
            engines?: { node?: string };
        };
        assert.strictEqual(manifest.dependencies?.tar, undefined);
        assert.ok(manifest.dependencies?.['tar-stream']);
        assert.match(tarStream.engines?.node || '', /^>=\s*(?:[0-9]|1[0-6])(?:\.|$)/);
    });
});
