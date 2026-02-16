import * as path from 'path';

import { runTests } from '@vscode/test-electron';

async function main() {
    const previousElectronRunAsNode = process.env.ELECTRON_RUN_AS_NODE;
    // In some environments this is exported globally and makes VS Code launch as plain Node.
    delete process.env.ELECTRON_RUN_AS_NODE;
    try {
        // The folder containing the Extension Manifest package.json
        // Passed to `--extensionDevelopmentPath`
        const extensionDevelopmentPath = path.resolve(__dirname, '../../');

        // The path to test runner
        // Passed to --extensionTestsPath
        const extensionTestsPath = path.resolve(__dirname, './suite/index');

        // Download VS Code, unzip it and run the integration test
        await runTests({ extensionDevelopmentPath, extensionTestsPath });
    } catch (err) {
        console.error('Failed to run tests');
        process.exit(1);
    } finally {
        if (previousElectronRunAsNode === undefined) {
            delete process.env.ELECTRON_RUN_AS_NODE;
        } else {
            process.env.ELECTRON_RUN_AS_NODE = previousElectronRunAsNode;
        }
    }
}

main();
