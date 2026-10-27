"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const cli_1 = require("../../cli");
suite('LabWired runtime default', () => {
    test('manifest and CLI use the published v0.25.0 runtime by default', () => {
        const manifestPath = path.resolve(__dirname, '../../../package.json');
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        const manifestVersion = manifest.contributes.configuration.properties['labwired.cliVersion'].default;
        assert.strictEqual(manifestVersion, 'v0.25.0');
        assert.strictEqual(cli_1.CLI_VERSION, 'v0.25.0');
        assert.strictEqual(manifestVersion, cli_1.CLI_VERSION);
    });
    test('launch configuration does not assume a firmware triple or root system.yaml', () => {
        const manifestPath = path.resolve(__dirname, '../../../package.json');
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        const launch = manifest.contributes.debuggers[0].configurationAttributes.launch.properties;
        assert.strictEqual(launch.program.default, undefined);
        assert.strictEqual(launch.systemConfig.default, undefined);
    });
});
//# sourceMappingURL=runtimeVersion.test.js.map