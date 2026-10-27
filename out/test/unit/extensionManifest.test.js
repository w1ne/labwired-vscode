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
    it('uses a Node 16-compatible streaming tar parser for catalog archives', () => {
        var _a, _b, _c;
        const manifestPath = path.resolve(__dirname, '../../../package.json');
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        const tarStreamPath = require.resolve('tar-stream/package.json');
        const tarStream = JSON.parse(fs.readFileSync(tarStreamPath, 'utf8'));
        assert.strictEqual((_a = manifest.dependencies) === null || _a === void 0 ? void 0 : _a.tar, undefined);
        assert.ok((_b = manifest.dependencies) === null || _b === void 0 ? void 0 : _b['tar-stream']);
        assert.match(((_c = tarStream.engines) === null || _c === void 0 ? void 0 : _c.node) || '', /^>=\s*(?:[0-9]|1[0-6])(?:\.|$)/);
    });
});
//# sourceMappingURL=extensionManifest.test.js.map