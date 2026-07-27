import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { discoverFirmware, bestFirmware, isElf } from '../../firmware';

/**
 * Firmware discovery is what makes F5 work without a hand-written launch.json,
 * so the interesting cases are the ways it could pick the WRONG file: a build
 * script sitting next to the firmware, a `.d` depfile, a host binary competing
 * with a cross-compiled one.
 */

const ELF_MAGIC = Buffer.from([0x7f, 0x45, 0x4c, 0x46]);

describe('firmware discovery', () => {
    let root: string;

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'labwired-fw-'));
    });

    afterEach(() => {
        fs.rmSync(root, { recursive: true, force: true });
    });

    function write(rel: string, contents: Buffer | string, mtime?: Date): string {
        const full = path.join(root, rel);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, contents);
        if (mtime) {
            fs.utimesSync(full, mtime, mtime);
        }
        return full;
    }

    const elf = (rel: string, mtime?: Date) => write(rel, ELF_MAGIC, mtime);

    it('finds a cross-compiled ELF', () => {
        const fw = elf('target/thumbv7em-none-eabi/release/firmware');
        assert.strictEqual(bestFirmware(root)?.path, fw);
    });

    it('ignores files that are not ELFs', () => {
        // `target/release/build/...` holds host executables; a script that
        // happens to be executable must not be mistaken for firmware.
        write('target/thumbv7em-none-eabi/release/notes', 'just text');
        assert.strictEqual(bestFirmware(root), undefined);
    });

    it('ignores build artifacts sitting beside the firmware', () => {
        const fw = elf('target/thumbv7em-none-eabi/release/firmware');
        write('target/thumbv7em-none-eabi/release/firmware.d', 'dep info');
        write('target/thumbv7em-none-eabi/release/firmware.bin', ELF_MAGIC);
        write('target/thumbv7em-none-eabi/release/libcore.rlib', ELF_MAGIC);

        const found = discoverFirmware(root).map((c) => c.path);
        assert.deepStrictEqual(found, [fw]);
    });

    it('prefers the newest build', () => {
        elf('target/thumbv7em-none-eabi/release/old', new Date(Date.now() - 60_000));
        const recent = elf('target/thumbv7em-none-eabi/release/new', new Date());
        assert.strictEqual(bestFirmware(root)?.path, recent);
    });

    it('prefers a cross-compiled ELF over a newer host binary', () => {
        // On an embedded project a binary under target/release without a triple
        // is usually an xtask or build script — never the firmware, however
        // recently it was rebuilt.
        const cross = elf('target/thumbv7em-none-eabi/release/firmware', new Date(Date.now() - 60_000));
        elf('target/release/xtask', new Date());
        assert.strictEqual(bestFirmware(root)?.path, cross);
    });

    it('reports where it found the firmware', () => {
        elf('target/thumbv7em-none-eabi/debug/firmware');
        assert.strictEqual(bestFirmware(root)?.origin, 'target/thumbv7em-none-eabi/debug');
    });

    it('returns nothing for a project that has never been built', () => {
        write('Cargo.toml', '[package]\nname = "demo"\n');
        assert.deepStrictEqual(discoverFirmware(root), []);
        assert.strictEqual(bestFirmware(root), undefined);
    });

    it('does not throw on a missing directory', () => {
        assert.deepStrictEqual(discoverFirmware(path.join(root, 'nope')), []);
    });

    describe('isElf', () => {
        it('accepts the ELF magic', () => {
            assert.strictEqual(isElf(write('a.elf', ELF_MAGIC)), true);
        });

        it('rejects other content', () => {
            assert.strictEqual(isElf(write('b.elf', 'MZ not an elf')), false);
        });

        it('rejects a file too short to hold the magic', () => {
            assert.strictEqual(isElf(write('c.elf', Buffer.from([0x7f, 0x45]))), false);
        });

        it('rejects a missing file', () => {
            assert.strictEqual(isElf(path.join(root, 'absent')), false);
        });
    });
});
