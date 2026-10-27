"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const labConfig_1 = require("../../labConfig");
describe('model profile lab.yaml', () => {
    let root;
    let configFile;
    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'lw-model-profile-'));
        fs.mkdirSync(path.join(root, '.labwired'), { recursive: true });
        configFile = path.join(root, '.labwired', 'lab.yaml');
    });
    afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
    it('resolves model profile paths relative to .labwired/lab.yaml', () => {
        var _a, _b, _c, _d;
        fs.writeFileSync(configFile, [
            'schema_version: "1.0"',
            'inputs:',
            '  firmware: ../target/thumbv7em-none-eabi/release/demo-m1',
            '  system: ../crates/chips/k32w041z-system.yaml',
            'debug:',
            '  adapter:',
            '    executable: ../target/release/labwired-pro-dap',
            '    build:',
            '      command: cargo',
            '      args: [build, -p, model-dap, --release]',
            '      cwd: ..',
        ].join('\n'));
        const profile = (0, labConfig_1.readLabConfig)(configFile);
        assert.strictEqual(profile.inputs.firmware, path.resolve(root, 'target/thumbv7em-none-eabi/release/demo-m1'));
        assert.strictEqual(profile.inputs.system, path.resolve(root, 'crates/chips/k32w041z-system.yaml'));
        assert.strictEqual((_b = (_a = profile.debug) === null || _a === void 0 ? void 0 : _a.adapter) === null || _b === void 0 ? void 0 : _b.executable, path.resolve(root, 'target/release/labwired-pro-dap'));
        assert.deepStrictEqual((_d = (_c = profile.debug) === null || _c === void 0 ? void 0 : _c.adapter) === null || _d === void 0 ? void 0 : _d.build, {
            command: 'cargo',
            args: ['build', '-p', 'model-dap', '--release'],
            cwd: root,
        });
    });
    it('rejects a model profile build without an executable with a field-specific error', () => {
        fs.writeFileSync(configFile, [
            'schema_version: "1.0"',
            'inputs: {}',
            'debug:',
            '  adapter:',
            '    build:',
            '      command: cargo',
            '      args: [build]',
        ].join('\n'));
        assert.throws(() => (0, labConfig_1.readLabConfig)(configFile), /debug\.adapter\.executable/);
    });
    it('rejects malformed model profile adapter field types', () => {
        fs.writeFileSync(configFile, [
            'schema_version: "1.0"',
            'inputs: {}',
            'debug:',
            '  adapter:',
            '    executable: 42',
        ].join('\n'));
        assert.throws(() => (0, labConfig_1.readLabConfig)(configFile), /debug\.adapter\.executable/);
    });
    it('prefers the active debug system path over the model profile path', () => {
        fs.writeFileSync(configFile, [
            'schema_version: "1.0"',
            'inputs:',
            '  system: ../profile/model-system.yaml',
        ].join('\n'));
        const activePath = path.resolve(root, 'running', 'other-system.yaml');
        assert.strictEqual((0, labConfig_1.resolveSystemConfigPath)(root, activePath), activePath);
    });
    it('uses the nested model profile system path when no debug session is active', () => {
        fs.writeFileSync(configFile, [
            'schema_version: "1.0"',
            'inputs:',
            '  system: ../crates/chips/k32w041z-system.yaml',
        ].join('\n'));
        assert.strictEqual((0, labConfig_1.resolveSystemConfigPath)(root), path.resolve(root, 'crates/chips/k32w041z-system.yaml'));
    });
});
//# sourceMappingURL=labConfig.test.js.map