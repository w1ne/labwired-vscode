"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveVSCodeTestExecutable = void 0;
const fs = require("fs");
const path = require("path");
function resolveVSCodeTestExecutable(executablePath, platform = process.platform, exists = fs.existsSync) {
    const pathApi = platform === 'darwin' ? path.posix : path;
    if (platform !== 'darwin' || exists(executablePath) || pathApi.basename(executablePath) !== 'Electron') {
        return executablePath;
    }
    const currentLauncher = pathApi.join(pathApi.dirname(executablePath), 'Code');
    return exists(currentLauncher) ? currentLauncher : executablePath;
}
exports.resolveVSCodeTestExecutable = resolveVSCodeTestExecutable;
//# sourceMappingURL=vscodeTestPath.js.map