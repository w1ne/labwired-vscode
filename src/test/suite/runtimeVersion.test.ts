import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { CLI_VERSION } from '../../cli';

suite('LabWired runtime default', () => {
    test('manifest and CLI use the published v0.25.0 runtime by default', () => {
        const manifestPath = path.resolve(__dirname, '../../../package.json');
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        const manifestVersion = manifest.contributes.configuration.properties['labwired.cliVersion'].default;

        assert.strictEqual(manifestVersion, 'v0.25.0');
        assert.strictEqual(CLI_VERSION, 'v0.25.0');
        assert.strictEqual(manifestVersion, CLI_VERSION);
    });

    test('launch configuration does not assume a firmware triple or root system.yaml', () => {
        const manifestPath = path.resolve(__dirname, '../../../package.json');
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        const launch = manifest.contributes.debuggers[0].configurationAttributes.launch.properties;

        assert.strictEqual(launch.program.default, undefined);
        assert.strictEqual(launch.systemConfig.default, undefined);
    });
});
