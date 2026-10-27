import * as assert from 'assert';
import { PLATFORM_ASSETS, assetFor } from '../../platformAssets';

describe('release assets per platform', () => {
    it('covers every platform core publishes an archive for', () => {
        assert.deepStrictEqual(Object.keys(PLATFORM_ASSETS).sort(), [
            'darwin/arm64', 'darwin/x64', 'linux/arm64', 'linux/x64', 'win32/x64',
        ]);
    });

    it('installs on Windows rather than telling people to build their own', () => {
        // The extension used to throw "Windows auto-download is not available
        // yet" here, which was true only because no leg of the release ever
        // built the target.
        assert.strictEqual(assetFor('win32', 'x64'), 'windows-x86_64');
    });

    it('names assets the way the release workflow does', () => {
        assert.strictEqual(assetFor('darwin', 'arm64'), 'darwin-aarch64');
        assert.strictEqual(assetFor('linux', 'x64'), 'linux-x86_64');
        assert.strictEqual(assetFor('linux', 'arm64'), 'linux-aarch64');
    });

    it('supports the Linux extension host used by WSL', () => {
        assert.strictEqual(assetFor('linux', 'x64'), 'linux-x86_64');
        assert.strictEqual(assetFor('linux', 'arm64'), 'linux-aarch64');
    });

    it('says nothing rather than guessing for a machine we do not publish for', () => {
        assert.strictEqual(assetFor('linux', 'riscv64'), undefined);
        assert.strictEqual(assetFor('win32', 'arm64'), undefined);
    });
});
