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
    it('resolves the optional runner relative to lab.yaml and uses its Windows executable suffix', () => {
        fs.writeFileSync(configFile, [
            'schema_version: "1.0"',
            'inputs: {}',
            'runner:',
            '  executable: ../target/release/labwired-pro',
        ].join('\n'));
        const runnerPath = path.resolve(root, 'target', 'release', 'labwired-pro');
        fs.mkdirSync(path.dirname(runnerPath), { recursive: true });
        fs.writeFileSync(`${runnerPath}.exe`, 'runner');
        const profile = (0, labConfig_1.readLabConfig)(configFile);
        assert.strictEqual(profile.runner.executable, runnerPath);
        assert.strictEqual(require('../../labConfig').resolveProfileExecutablePath(configFile, '../target/release/labwired-pro', 'win32'), `${runnerPath}.exe`);
    });
    it('reads extension profile fields from core scripts with custom stimulus tags', () => {
        fs.writeFileSync(configFile, [
            'schema_version: "1.2"',
            'inputs:',
            '  firmware: ../build/model.elf',
            'limits:',
            '  max_steps: 5000',
            'stimuli:',
            '  - target: { component: drive_motor, channel: stall }',
            '    trigger: !after_cycles { cycles: 100 }',
            '    value: 1.0',
            'runner:',
            '  executable: ../target/release/labwired-pro',
        ].join('\n'));
        const profile = (0, labConfig_1.readLabConfig)(configFile);
        assert.strictEqual(profile.runner.executable, path.resolve(root, 'target/release/labwired-pro'));
        assert.strictEqual(profile.inputs.firmware, path.resolve(root, 'build/model.elf'));
    });
    it('reads core fault triggers tagged on_write and on_read', () => {
        fs.writeFileSync(configFile, [
            'schema_version: "1.2"',
            'inputs: {}',
            'faults:',
            '  - id: write_fault',
            '    kind: missing_clock',
            '    target: { peripheral: clock }',
            '    trigger: !on_write { register: CTRL }',
            '  - id: read_fault',
            '    kind: missing_clock',
            '    target: { peripheral: clock }',
            '    trigger: !on_read { register: STAT }',
            'runner:',
            '  executable: ../target/release/labwired-pro',
        ].join('\n'));
        const profile = (0, labConfig_1.readLabConfig)(configFile);
        assert.strictEqual(profile.runner.executable, path.resolve(root, 'target/release/labwired-pro'));
        assert.deepStrictEqual(profile.faults.map((fault) => fault.trigger), [
            { register: 'CTRL' },
            { register: 'STAT' },
        ]);
    });
    it('rejects malformed runner profile fields', () => {
        fs.writeFileSync(configFile, 'schema_version: "1.0"\ninputs: {}\nrunner: []\n');
        assert.throws(() => (0, labConfig_1.readLabConfig)(configFile), /lab\.yaml runner must be a mapping/);
        fs.writeFileSync(configFile, 'schema_version: "1.0"\ninputs: {}\nrunner:\n  executable: 42\n');
        assert.throws(() => (0, labConfig_1.readLabConfig)(configFile), /runner\.executable/);
    });
    it('removes extension-only fields while preserving the core script verbatim', () => __awaiter(void 0, void 0, void 0, function* () {
        const corePrefix = [
            'schema_version: "1.2"',
            'inputs:',
            '  firmware: ../build/model.elf',
            '  system: ../configs/system.yaml',
            'limits:',
            '  max_steps: 5000',
            '  max_cycles: 2500',
            'assertions:',
            '  - expected_stop_reason: max_steps',
        ].join('\n') + '\n';
        const extensionFields = [
            'debug:',
            '  adapter:',
            '    executable: ../target/model-dap',
            'runner:',
            '  executable: ../target/release/labwired-pro',
        ].join('\n') + '\n';
        const coreSuffix = [
            'stack_paint: false',
            'faults: []',
            'verdict: null',
            'stimuli:',
            '  - target:',
            '      component: drive_motor',
            '      channel: stall',
            '    trigger: !after_cycles { cycles: 100 }',
            '    value: 1.0',
        ].join('\n') + '\n';
        const profile = `${corePrefix}${extensionFields}${coreSuffix}`;
        const coreTestScript = `${corePrefix}${coreSuffix}`;
        fs.writeFileSync(configFile, profile);
        const labConfigModule = require('../../labConfig');
        assert.strictEqual(typeof labConfigModule.createCoreCompatibleTestScript, 'function');
        const testScriptPath = yield labConfigModule.createCoreCompatibleTestScript(configFile);
        try {
            assert.notStrictEqual(testScriptPath, configFile);
            assert.strictEqual(path.dirname(testScriptPath), path.dirname(configFile));
            assert.strictEqual(fs.readFileSync(testScriptPath, 'utf8'), coreTestScript);
            assert.strictEqual(fs.readFileSync(configFile, 'utf8'), profile);
        }
        finally {
            fs.rmSync(testScriptPath, { force: true });
        }
    }));
    it('removes extension keys from an indented root mapping and preserves comments and blank lines', () => __awaiter(void 0, void 0, void 0, function* () {
        const profile = [
            '# profile header',
            '',
            '  schema_version: "1.2"',
            '  inputs: {}',
            '  debug:',
            '    adapter:',
            '      executable: ../target/model-dap',
            '  runner:',
            '    executable: ../target/release/labwired-pro',
            '  # this comment describes the following core limit',
            '  limits:',
            '    max_steps: 5000',
            '# profile footer',
        ].join('\n') + '\n';
        fs.writeFileSync(configFile, profile);
        const module = require('../../labConfig');
        const testScript = yield module.createCoreCompatibleTestScript(configFile);
        try {
            const serialized = fs.readFileSync(testScript, 'utf8');
            const parsed = require('js-yaml').load(serialized);
            assert.deepStrictEqual(parsed, {
                schema_version: '1.2',
                inputs: {},
                limits: { max_steps: 5000 },
            });
            assert.ok(!serialized.includes('debug:'));
            assert.ok(!serialized.includes('runner:'));
            assert.ok(serialized.includes('# profile header'));
            assert.ok(serialized.includes('# this comment describes the following core limit'));
            assert.ok(serialized.includes('# profile footer'));
            assert.ok(serialized.includes('# profile header\n\n'));
        }
        finally {
            fs.rmSync(testScript, { force: true });
        }
    }));
    it('removes extension keys from a flow-style root mapping', () => __awaiter(void 0, void 0, void 0, function* () {
        const profile = '{ schema_version: "1.2", inputs: { firmware: ../build/model.elf }, debug: { adapter: { executable: ../target/model-dap } }, runner: { executable: ../target/release/labwired-pro }, limits: { max_steps: 5000 }, assertions: [] }\n';
        fs.writeFileSync(configFile, profile);
        const module = require('../../labConfig');
        const testScript = yield module.createCoreCompatibleTestScript(configFile);
        try {
            const serialized = fs.readFileSync(testScript, 'utf8');
            const parsed = require('js-yaml').load(serialized);
            assert.deepStrictEqual(parsed, {
                schema_version: '1.2',
                inputs: { firmware: '../build/model.elf' },
                limits: { max_steps: 5000 },
                assertions: [],
            });
        }
        finally {
            fs.rmSync(testScript, { force: true });
        }
    }));
});
//# sourceMappingURL=labConfig.test.js.map