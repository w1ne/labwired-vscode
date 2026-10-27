import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { downloadAndUnzipVSCode, runTests } from '@vscode/test-electron';
import { resolveVSCodeTestExecutable } from './vscodeTestPath';

async function main() {
    const previousElectronRunAsNode = process.env.ELECTRON_RUN_AS_NODE;
    const profilePath = path.join(os.tmpdir(), `lw-vscode-test-${process.pid}`);
    const extensionsPath = `${profilePath}-extensions`;
    // In some environments this is exported globally and makes VS Code launch as plain Node.
    delete process.env.ELECTRON_RUN_AS_NODE;
    try {
        // The folder containing the Extension Manifest package.json
        // Passed to `--extensionDevelopmentPath`
        const extensionDevelopmentPath = path.resolve(__dirname, '../../');

        // The path to test runner
        // Passed to --extensionTestsPath
        const extensionTestsPath = path.resolve(__dirname, './suite/index');

        // Download VS Code, account for the current macOS launcher name, then run the integration tests.
        const downloadedExecutable = await downloadAndUnzipVSCode();
        const vscodeExecutablePath = resolveVSCodeTestExecutable(downloadedExecutable);
        await runTests({
            vscodeExecutablePath,
            extensionDevelopmentPath,
            extensionTestsPath,
            launchArgs: [
                `--user-data-dir=${profilePath}`,
                `--extensions-dir=${extensionsPath}`,
            ],
        });
    } catch (err) {
        console.error('Failed to run tests');
        process.exitCode = 1;
    } finally {
        await Promise.all([
            fs.promises.rm(profilePath, { recursive: true, force: true }),
            fs.promises.rm(extensionsPath, { recursive: true, force: true }),
        ]);
        if (previousElectronRunAsNode === undefined) {
            delete process.env.ELECTRON_RUN_AS_NODE;
        } else {
            process.env.ELECTRON_RUN_AS_NODE = previousElectronRunAsNode;
        }
    }
}

main();
