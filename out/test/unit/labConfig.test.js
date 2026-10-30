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
        assert.strictEqual(profile.runner.executable, process.platform === 'win32' ? `${runnerPath}.exe` : runnerPath);
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
    it('reads an optional runner build resolved relative to lab.yaml', () => {
        var _a;
        fs.writeFileSync(configFile, [
            'schema_version: "1.0"',
            'inputs: {}',
            'runner:',
            '  executable: ../target/release/labwired-pro',
            '  build:',
            '    command: bash',
            '    args: ["scripts/setup.sh", "runner"]',
            '    cwd: ..',
        ].join('\n'));
        const profile = (0, labConfig_1.readLabConfig)(configFile);
        assert.deepStrictEqual((_a = profile.runner) === null || _a === void 0 ? void 0 : _a.build, { command: 'bash', args: ['scripts/setup.sh', 'runner'], cwd: root });
    });
    it('rejects a malformed runner build', () => {
        fs.writeFileSync(configFile, 'schema_version: "1.0"\ninputs: {}\nrunner:\n  executable: x\n  build:\n    command: bash\n    args: bash\n');
        assert.throws(() => (0, labConfig_1.readLabConfig)(configFile), /runner\.build\.args must be an array of strings/);
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
    it('emits bare !at_start triggers as null tags core serde_yaml accepts', () => __awaiter(void 0, void 0, void 0, function* () {
        const profile = [
            'schema_version: "1.2"',
            'inputs: {}',
            'debug:',
            '  adapter:',
            '    executable: ../target/model-dap',
            'runner:',
            '  executable: ../target/release/labwired-pro',
            'uart_injections:',
            '  - uart: "uart0"',
            '    trigger: !at_start',
            '    bytes: [1, 2]',
            'stimuli:',
            '  - trigger: !after_cycles { cycles: 100 }',
            '    value: 1.0',
        ].join('\n') + '\n';
        fs.writeFileSync(configFile, profile);
        const module = require('../../labConfig');
        const testScript = yield module.createCoreCompatibleTestScript(configFile);
        try {
            const serialized = fs.readFileSync(testScript, 'utf8');
            assert.ok(!serialized.includes('!at_start ""'), serialized);
            assert.ok(!serialized.includes("!at_start ''"), serialized);
            assert.match(serialized, /trigger: !at_start null\b/);
            assert.match(serialized, /trigger: !after_cycles \{ cycles: 100 \}/);
            assert.ok(!serialized.includes('debug:'));
            assert.ok(!serialized.includes('runner:'));
        }
        finally {
            fs.rmSync(testScript, { force: true });
        }
    }));
    it('resolves multi-node inputs.env relative to lab.yaml for a plugin runner profile', () => {
        var _a;
        fs.writeFileSync(configFile, [
            'schema_version: "1.0"',
            'inputs:',
            '  env: ../demo/yaml-plus-plugin-env.yaml',
            'runner:',
            '  executable: ../target/release/labwired-pro',
            'debug:',
            '  adapter:',
            '    executable: ../target/debug/labwired-pro-dap',
        ].join('\n') + '\n');
        const profile = (0, labConfig_1.readLabConfig)(configFile);
        assert.strictEqual(profile.inputs.env, path.resolve(root, 'demo/yaml-plus-plugin-env.yaml'));
        assert.strictEqual(profile.inputs.firmware, undefined);
        assert.strictEqual(profile.inputs.system, undefined);
        assert.ok((_a = profile.runner) === null || _a === void 0 ? void 0 : _a.executable.includes('labwired-pro'));
        assert.deepStrictEqual((0, labConfig_1.runTestOverridesForLab)(profile), {});
    });
    it('rejects combining inputs.env with single-node firmware or system paths', () => {
        fs.writeFileSync(configFile, [
            'schema_version: "1.0"',
            'inputs:',
            '  env: ../demo/env.yaml',
            '  firmware: ../build/a.elf',
        ].join('\n') + '\n');
        assert.throws(() => (0, labConfig_1.readLabConfig)(configFile), /inputs\.env cannot be combined/);
    });
    it('keeps a YAML-chip-plus-plugin env profile intact for the plugin runner', () => __awaiter(void 0, void 0, void 0, function* () {
        var _a;
        // Shape matches the CowManager demo: one filesystem YAML chip node + one
        // ChipPlugin CPU node. No private IP — only public path names in the fixture.
        const demoDir = path.join(root, 'demo');
        fs.mkdirSync(demoDir, { recursive: true });
        const envPath = path.join(demoDir, 'yaml-plus-plugin-env.yaml');
        fs.writeFileSync(envPath, [
            'schema_version: "1.0"',
            'name: yaml-plus-plugin',
            'nodes:',
            '  - id: companion_yaml',
            '    system: companion-system.yaml',
            '    firmware: companion.elf',
            '  - id: plugin_cpu',
            '    system: plugin-system.yaml',
            '    firmware: plugin.elf',
            'interconnects: []',
        ].join('\n') + '\n');
        fs.writeFileSync(configFile, [
            'schema_version: "1.0"',
            'inputs:',
            '  env: ../demo/yaml-plus-plugin-env.yaml',
            'limits:',
            '  max_steps: 80000',
            'assertions:',
            '  - expected_stop_reason: max_steps',
            'runner:',
            '  executable: ../target/release/labwired-pro',
            'debug:',
            '  adapter:',
            '    executable: ../target/debug/labwired-pro-dap',
            '    build:',
            '      command: cargo',
            '      args: [build, -p, labwired-pro-dap]',
            '      cwd: ..',
        ].join('\n') + '\n');
        const profile = (0, labConfig_1.readLabConfig)(configFile);
        assert.ok((_a = profile.inputs.env) === null || _a === void 0 ? void 0 : _a.includes('yaml-plus-plugin-env.yaml'));
        assert.deepStrictEqual((0, labConfig_1.runTestOverridesForLab)(profile), {});
        const module = require('../../labConfig');
        const testScript = yield module.createCoreCompatibleTestScript(configFile);
        try {
            const serialized = fs.readFileSync(testScript, 'utf8');
            assert.ok(serialized.includes('env:'));
            assert.ok(serialized.includes('yaml-plus-plugin-env.yaml'));
            assert.ok(serialized.includes('max_steps'));
            assert.ok(!serialized.includes('debug:'));
            assert.ok(!serialized.includes('runner:'));
            assert.ok(!serialized.includes('labwired-pro-dap'));
            // Relative env path stays relative so core resolves beside the temp script.
            assert.ok(serialized.includes('../demo/yaml-plus-plugin-env.yaml'));
        }
        finally {
            fs.rmSync(testScript, { force: true });
        }
        const envBody = fs.readFileSync(envPath, 'utf8');
        assert.ok(envBody.includes('companion_yaml'));
        assert.ok(envBody.includes('plugin_cpu'));
        assert.ok(envBody.includes('companion-system.yaml'));
    }));
    it('preserves large YAML integers exactly when creating the core test script', () => __awaiter(void 0, void 0, void 0, function* () {
        const profile = [
            'schema_version: "1.2"',
            'inputs: {}',
            'limits:',
            '  max_vcd_bytes: 0x123456789abcdef0',
            '  max_uart_bytes: 18446744073709551615',
            'debug:',
            '  adapter: {}',
        ].join('\n') + '\n';
        fs.writeFileSync(configFile, profile);
        const module = require('../../labConfig');
        const testScript = yield module.createCoreCompatibleTestScript(configFile);
        try {
            const serialized = fs.readFileSync(testScript, 'utf8');
            assert.ok(serialized.includes('max_vcd_bytes: 0x123456789abcdef0'));
            assert.ok(serialized.includes('max_uart_bytes: 18446744073709551615'));
        }
        finally {
            fs.rmSync(testScript, { force: true });
        }
    }));
});
//# sourceMappingURL=labConfig.test.js.map