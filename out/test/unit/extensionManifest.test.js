"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const fs = require("fs");
const path = require("path");
describe('extension manifest', () => {
    it('runs as a workspace extension so debugging stays with remote project files', () => {
        const manifestPath = path.resolve(__dirname, '../../../package.json');
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        assert.deepStrictEqual(manifest.extensionKind, ['workspace']);
    });
});
//# sourceMappingURL=extensionManifest.test.js.map