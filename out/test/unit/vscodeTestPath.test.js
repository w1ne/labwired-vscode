"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const pathModule = (() => {
    try {
        return require('../vscodeTestPath');
    }
    catch (_a) {
        return {};
    }
})();
describe('VS Code test executable path', () => {
    it('uses the current macOS Code launcher when the legacy Electron path is missing', () => {
        assert.strictEqual(typeof pathModule.resolveVSCodeTestExecutable, 'function');
        assert.strictEqual(pathModule.resolveVSCodeTestExecutable('/cache/Visual Studio Code.app/Contents/MacOS/Electron', 'darwin', (candidate) => candidate.endsWith('/Code')), '/cache/Visual Studio Code.app/Contents/MacOS/Code');
    });
    it('keeps the downloaded executable path when it exists or is not macOS', () => {
        assert.strictEqual(pathModule.resolveVSCodeTestExecutable('/cache/Code', 'darwin', () => true), '/cache/Code');
        assert.strictEqual(pathModule.resolveVSCodeTestExecutable('/cache/Electron', 'linux', () => false), '/cache/Electron');
    });
});
//# sourceMappingURL=vscodeTestPath.test.js.map