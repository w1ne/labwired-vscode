import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { readLabConfig, resolveSystemConfigPath } from '../../labConfig';

describe('model profile lab.yaml', () => {
    let root: string;
    let configFile: string;

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'lw-model-profile-'));
        fs.mkdirSync(path.join(root, '.labwired'), { recursive: true });
        configFile = path.join(root, '.labwired', 'lab.yaml');
    });

    afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

    it('resolves model profile paths relative to .labwired/lab.yaml', () => {
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

        const profile = readLabConfig(configFile);

        assert.strictEqual(profile.inputs.firmware, path.resolve(root, 'target/thumbv7em-none-eabi/release/demo-m1'));
        assert.strictEqual(profile.inputs.system, path.resolve(root, 'crates/chips/k32w041z-system.yaml'));
        assert.strictEqual((profile as any).debug?.adapter?.executable, path.resolve(root, 'target/release/labwired-pro-dap'));
        assert.deepStrictEqual((profile as any).debug?.adapter?.build, {
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

        assert.throws(() => readLabConfig(configFile), /debug\.adapter\.executable/);
    });

    it('rejects malformed model profile adapter field types', () => {
        fs.writeFileSync(configFile, [
            'schema_version: "1.0"',
            'inputs: {}',
            'debug:',
            '  adapter:',
            '    executable: 42',
        ].join('\n'));

        assert.throws(() => readLabConfig(configFile), /debug\.adapter\.executable/);
    });

    it('prefers the active debug system path over the model profile path', () => {
        fs.writeFileSync(configFile, [
            'schema_version: "1.0"',
            'inputs:',
            '  system: ../profile/model-system.yaml',
        ].join('\n'));

        const activePath = path.resolve(root, 'running', 'other-system.yaml');
        assert.strictEqual(resolveSystemConfigPath(root, activePath), activePath);
    });

    it('uses the nested model profile system path when no debug session is active', () => {
        fs.writeFileSync(configFile, [
            'schema_version: "1.0"',
            'inputs:',
            '  system: ../crates/chips/k32w041z-system.yaml',
        ].join('\n'));

        assert.strictEqual(
            resolveSystemConfigPath(root),
            path.resolve(root, 'crates/chips/k32w041z-system.yaml')
        );
    });
});
