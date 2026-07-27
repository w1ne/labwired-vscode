"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const firmware_1 = require("../../firmware");
/**
 * Firmware discovery is what makes F5 work without a hand-written launch.json,
 * so the interesting cases are the ways it could pick the WRONG file: a build
 * script sitting next to the firmware, a `.d` depfile, a host binary competing
 * with a cross-compiled one.
 */
const ELF_MAGIC = Buffer.from([0x7f, 0x45, 0x4c, 0x46]);
describe('firmware discovery', () => {
    let root;
    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'labwired-fw-'));
    });
    afterEach(() => {
        fs.rmSync(root, { recursive: true, force: true });
    });
    function write(rel, contents, mtime) {
        const full = path.join(root, rel);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, contents);
        if (mtime) {
            fs.utimesSync(full, mtime, mtime);
        }
        return full;
    }
    const elf = (rel, mtime) => write(rel, ELF_MAGIC, mtime);
    it('finds a cross-compiled ELF', () => {
        var _a;
        const fw = elf('target/thumbv7em-none-eabi/release/firmware');
        assert.strictEqual((_a = (0, firmware_1.bestFirmware)(root)) === null || _a === void 0 ? void 0 : _a.path, fw);
    });
    it('ignores files that are not ELFs', () => {
        // `target/release/build/...` holds host executables; a script that
        // happens to be executable must not be mistaken for firmware.
        write('target/thumbv7em-none-eabi/release/notes', 'just text');
        assert.strictEqual((0, firmware_1.bestFirmware)(root), undefined);
    });
    it('ignores build artifacts sitting beside the firmware', () => {
        const fw = elf('target/thumbv7em-none-eabi/release/firmware');
        write('target/thumbv7em-none-eabi/release/firmware.d', 'dep info');
        write('target/thumbv7em-none-eabi/release/firmware.bin', ELF_MAGIC);
        write('target/thumbv7em-none-eabi/release/libcore.rlib', ELF_MAGIC);
        const found = (0, firmware_1.discoverFirmware)(root).map((c) => c.path);
        assert.deepStrictEqual(found, [fw]);
    });
    it('prefers the newest build', () => {
        var _a;
        elf('target/thumbv7em-none-eabi/release/old', new Date(Date.now() - 60000));
        const recent = elf('target/thumbv7em-none-eabi/release/new', new Date());
        assert.strictEqual((_a = (0, firmware_1.bestFirmware)(root)) === null || _a === void 0 ? void 0 : _a.path, recent);
    });
    it('prefers a cross-compiled ELF over a newer host binary', () => {
        var _a;
        // On an embedded project a binary under target/release without a triple
        // is usually an xtask or build script — never the firmware, however
        // recently it was rebuilt.
        const cross = elf('target/thumbv7em-none-eabi/release/firmware', new Date(Date.now() - 60000));
        elf('target/release/xtask', new Date());
        assert.strictEqual((_a = (0, firmware_1.bestFirmware)(root)) === null || _a === void 0 ? void 0 : _a.path, cross);
    });
    it('reports where it found the firmware', () => {
        var _a;
        elf('target/thumbv7em-none-eabi/debug/firmware');
        assert.strictEqual((_a = (0, firmware_1.bestFirmware)(root)) === null || _a === void 0 ? void 0 : _a.origin, 'target/thumbv7em-none-eabi/debug');
    });
    it('returns nothing for a project that has never been built', () => {
        write('Cargo.toml', '[package]\nname = "demo"\n');
        assert.deepStrictEqual((0, firmware_1.discoverFirmware)(root), []);
        assert.strictEqual((0, firmware_1.bestFirmware)(root), undefined);
    });
    it('does not throw on a missing directory', () => {
        assert.deepStrictEqual((0, firmware_1.discoverFirmware)(path.join(root, 'nope')), []);
    });
    describe('isElf', () => {
        it('accepts the ELF magic', () => {
            assert.strictEqual((0, firmware_1.isElf)(write('a.elf', ELF_MAGIC)), true);
        });
        it('rejects other content', () => {
            assert.strictEqual((0, firmware_1.isElf)(write('b.elf', 'MZ not an elf')), false);
        });
        it('rejects a file too short to hold the magic', () => {
            assert.strictEqual((0, firmware_1.isElf)(write('c.elf', Buffer.from([0x7f, 0x45]))), false);
        });
        it('rejects a missing file', () => {
            assert.strictEqual((0, firmware_1.isElf)(path.join(root, 'absent')), false);
        });
    });
});
//# sourceMappingURL=firmware.test.js.map