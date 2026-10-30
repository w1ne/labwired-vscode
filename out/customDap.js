"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runCustomDapBuild = exports.customDapExecutablePath = void 0;
const child_process_1 = require("child_process");
const fs = require("fs");
const path = require("path");
function customDapExecutablePath(configuredPath, platform = process.platform) {
    if (platform !== 'win32' || path.extname(configuredPath).length > 0) {
        return configuredPath;
    }
    const windowsPath = `${configuredPath}.exe`;
    return fs.existsSync(windowsPath) ? windowsPath : configuredPath;
}
exports.customDapExecutablePath = customDapExecutablePath;
/** `onOutput` receives stdout and stderr as they arrive, for long first builds. */
function runCustomDapBuild(build, onOutput) {
    return new Promise((resolve, reject) => {
        const child = (0, child_process_1.spawn)(build.command, build.args, { cwd: build.cwd, shell: false });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (data) => {
            stdout += data.toString();
            onOutput === null || onOutput === void 0 ? void 0 : onOutput(data.toString());
        });
        child.stderr.on('data', (data) => {
            stderr += data.toString();
            onOutput === null || onOutput === void 0 ? void 0 : onOutput(data.toString());
        });
        child.on('error', (error) => {
            reject(new Error(`Could not run custom DAP build program '${build.command}': ${error.message}`));
        });
        child.on('close', (code) => {
            const exitCode = code !== null && code !== void 0 ? code : -1;
            if (exitCode !== 0) {
                reject(new Error(`Custom DAP build failed with exit code ${exitCode}.\n` +
                    `${stdout}${stderr}`));
                return;
            }
            resolve({ stdout, stderr });
        });
    });
}
exports.runCustomDapBuild = runCustomDapBuild;
//# sourceMappingURL=customDap.js.map