import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

describe('extension manifest', () => {
    it('runs as a workspace extension so debugging stays with remote project files', () => {
        const manifestPath = path.resolve(__dirname, '../../../package.json');
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as { extensionKind?: string[] };
        assert.deepStrictEqual(manifest.extensionKind, ['workspace']);
    });
});
