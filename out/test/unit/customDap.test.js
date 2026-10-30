"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const customDap_1 = require("../../customDap");
describe('custom DAP build', () => {
    let root;
    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'lw-custom-dap-'));
    });
    afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
    it('runs the build program with separate arguments and the configured cwd', () => __awaiter(void 0, void 0, void 0, function* () {
        const script = path.join(root, 'build.js');
        fs.writeFileSync(script, 'process.stdout.write(JSON.stringify({args: process.argv.slice(2), cwd: process.cwd()}));');
        const result = yield (0, customDap_1.runCustomDapBuild)({
            command: process.execPath,
            args: [script, 'argument with spaces'],
            cwd: root,
        });
        assert.deepStrictEqual(JSON.parse(result.stdout), {
            args: ['argument with spaces'],
            cwd: fs.realpathSync(root),
        });
    }));
    it('streams build output as it arrives', () => __awaiter(void 0, void 0, void 0, function* () {
        const script = path.join(root, 'stream.js');
        fs.writeFileSync(script, 'process.stdout.write("one\\n"); process.stderr.write("two\\n");');
        const chunks = [];
        yield (0, customDap_1.runCustomDapBuild)({ command: process.execPath, args: [script], cwd: root }, (chunk) => chunks.push(chunk));
        assert.strictEqual(chunks.join('').split('\n').filter(Boolean).sort().join(','), 'one,two');
    }));
    it('rejects failed builds with their captured stdout and stderr', () => __awaiter(void 0, void 0, void 0, function* () {
        const script = path.join(root, 'fail.js');
        fs.writeFileSync(script, 'console.log("build output"); console.error("build error"); process.exit(7);');
        yield assert.rejects((0, customDap_1.runCustomDapBuild)({ command: process.execPath, args: [script], cwd: root }), (error) => error.message.includes('exit code 7')
            && error.message.includes('build output')
            && error.message.includes('build error'));
    }));
    it('adds the Windows executable suffix only when no suffix was configured and the suffixed file exists', () => {
        const executable = path.join(root, 'custom-dap');
        const windowsExecutable = `${executable}.exe`;
        fs.writeFileSync(windowsExecutable, 'adapter');
        assert.strictEqual((0, customDap_1.customDapExecutablePath)(executable, 'win32'), windowsExecutable);
        assert.strictEqual((0, customDap_1.customDapExecutablePath)(`${executable}.cmd`, 'win32'), `${executable}.cmd`);
        assert.strictEqual((0, customDap_1.customDapExecutablePath)(path.join(root, 'missing'), 'win32'), path.join(root, 'missing'));
    });
});
//# sourceMappingURL=customDap.test.js.map