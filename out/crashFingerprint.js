"use strict";
/**
 * The parts of failure reporting that do not need an editor.
 *
 * Split out of crashReport.ts so they can be unit-tested without a VS Code
 * host: `import * as vscode` cannot load in plain mocha, and a fingerprint
 * function nobody can test is a fingerprint function nobody should trust with
 * "never put a path in this".
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorClass = exports.fingerprint = exports.platformSlug = exports.binarySourceOf = exports.setBinarySource = void 0;
/**
 * Which source each binary last resolved from. It lives here, in the module
 * with no editor import, for the third time today's lesson came up: anything a
 * unit test needs to reach cannot sit behind `import * as vscode`.
 */
const binarySources = new Map();
function setBinarySource(bin, source) {
    binarySources.set(bin, source);
}
exports.setBinarySource = setBinarySource;
/** Where `bin` was last resolved from, or `unknown` if it never resolved. */
function binarySourceOf(bin) {
    var _a;
    return (_a = binarySources.get(bin)) !== null && _a !== void 0 ? _a : 'unknown';
}
exports.binarySourceOf = binarySourceOf;
/** node's process.platform/arch in the vocabulary the release archives use. */
function platformSlug(platform, arch) {
    var _a;
    const map = {
        'darwin/arm64': 'darwin-aarch64',
        'darwin/x64': 'darwin-x86_64',
        'linux/x64': 'linux-x86_64',
        'linux/arm64': 'linux-aarch64',
        'win32/x64': 'windows-x86_64',
    };
    return (_a = map[`${platform}/${arch}`]) !== null && _a !== void 0 ? _a : 'unknown';
}
exports.platformSlug = platformSlug;
/**
 * A stable, non-reversible id for "this failure": FNV-1a over the error's type
 * and its first stack frame's function name. File paths never enter — in an
 * editor extension they are the user's project.
 */
function fingerprint(error) {
    var _a, _b;
    const name = error instanceof Error ? error.name : typeof error;
    const frame = error instanceof Error && typeof error.stack === 'string'
        ? ((_b = (_a = /at ([A-Za-z0-9_$.]+)/.exec(error.stack)) === null || _a === void 0 ? void 0 : _a[1]) !== null && _b !== void 0 ? _b : '')
        : '';
    let hash = 0x811c9dc5;
    for (const char of `${name}|${frame}`) {
        hash ^= char.charCodeAt(0);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
}
exports.fingerprint = fingerprint;
function errorClass(error) {
    if (error instanceof SyntaxError)
        return 'parse_error';
    const message = error instanceof Error ? error.message : String(error);
    if (/ENOENT|not found|no such file/i.test(message))
        return 'missing_binary';
    if (/GLIBC|libc\.so/i.test(message))
        return 'glibc_missing';
    if (/timed? ?out/i.test(message))
        return 'timeout';
    if (/404|ENOTFOUND|ECONNREFUSED|network/i.test(message))
        return 'network';
    return 'other';
}
exports.errorClass = errorClass;
//# sourceMappingURL=crashFingerprint.js.map