"use strict";
// Which release archive belongs to which machine.
//
// Split out of cli.ts so it can be unit-tested without a VS Code host: this
// table decides whether the extension can install the simulator at all, and
// Windows sat missing from it for as long as core built no Windows archive.
Object.defineProperty(exports, "__esModule", { value: true });
exports.assetFor = exports.PLATFORM_ASSETS = void 0;
/** Node's `process.platform`/`process.arch` → the core release asset slug. */
exports.PLATFORM_ASSETS = {
    'darwin/arm64': 'darwin-aarch64',
    'darwin/x64': 'darwin-x86_64',
    'linux/x64': 'linux-x86_64',
    'linux/arm64': 'linux-aarch64',
    // The v0.25.0 runtime publishes Windows x64. Extraction uses `tar`, which
    // ships with Windows 10 and later, and binaryName() appends the .exe.
    'win32/x64': 'windows-x86_64',
};
/** The asset slug for a machine, or undefined if we publish nothing for it. */
function assetFor(platform, arch) {
    return exports.PLATFORM_ASSETS[`${platform}/${arch}`];
}
exports.assetFor = assetFor;
//# sourceMappingURL=platformAssets.js.map