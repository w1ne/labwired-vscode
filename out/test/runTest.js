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
const fs = require("fs");
const os = require("os");
const path = require("path");
const test_electron_1 = require("@vscode/test-electron");
const vscodeTestPath_1 = require("./vscodeTestPath");
function main() {
    return __awaiter(this, void 0, void 0, function* () {
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
            const downloadedExecutable = yield (0, test_electron_1.downloadAndUnzipVSCode)();
            const vscodeExecutablePath = (0, vscodeTestPath_1.resolveVSCodeTestExecutable)(downloadedExecutable);
            yield (0, test_electron_1.runTests)({
                vscodeExecutablePath,
                extensionDevelopmentPath,
                extensionTestsPath,
                launchArgs: [
                    `--user-data-dir=${profilePath}`,
                    `--extensions-dir=${extensionsPath}`,
                ],
            });
        }
        catch (err) {
            console.error('Failed to run tests');
            process.exitCode = 1;
        }
        finally {
            yield Promise.all([
                fs.promises.rm(profilePath, { recursive: true, force: true }),
                fs.promises.rm(extensionsPath, { recursive: true, force: true }),
            ]);
            if (previousElectronRunAsNode === undefined) {
                delete process.env.ELECTRON_RUN_AS_NODE;
            }
            else {
                process.env.ELECTRON_RUN_AS_NODE = previousElectronRunAsNode;
            }
        }
    });
}
main();
//# sourceMappingURL=runTest.js.map