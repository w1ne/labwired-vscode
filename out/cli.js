"use strict";
// LabWired - Firmware Simulation Platform
// Copyright (C) 2026 Andrii Shylenko
//
// This software is released under the MIT License.
// See the LICENSE file in the project root for full license information.
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
exports.runTest = exports.resolveDap = exports.resolveCli = exports.DAP_BIN = exports.CLI_BIN = exports.CLI_VERSION = void 0;
const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
const https = require("https");
const child_process_1 = require("child_process");
const platformAssets_1 = require("./platformAssets");
const crashFingerprint_1 = require("./crashFingerprint");
// The core release this extension downloads. Kept at the newest release on
// purpose: pinning two releases back is how the debugger shipped against a CLI
// that predated half the boards in the docs.
exports.CLI_VERSION = 'v0.25.0';
/** The simulator/test-runner CLI. */
exports.CLI_BIN = 'labwired';
/** The Debug Adapter the extension spawns for F5. Ships in the SAME tarball. */
exports.DAP_BIN = 'labwired-dap';
function cliVersion() {
    const configured = vscode.workspace.getConfiguration('labwired').get('cliVersion');
    return configured && configured.trim().length > 0 ? configured.trim() : exports.CLI_VERSION;
}
function binName(bin) {
    return process.platform === 'win32' ? `${bin}.exe` : bin;
}
// Cache of resolved binary paths, keyed by bare binary name, for the lifetime
// of the extension host.
const cachedPaths = new Map();
// Where each resolved binary came from is recorded in crashFingerprint.ts:
// a crash report that says only "the simulator failed" cannot separate a
// broken release from a stale binary on somebody's PATH, and that module is
// the one a unit test can load.
function log(output, msg) {
    if (output) {
        output.appendLine(`LabWired [cli]: ${msg}`);
    }
}
function existsFile(p) {
    try {
        return fs.statSync(p).isFile();
    }
    catch (_a) {
        return false;
    }
}
function onPath(bin, output) {
    // Locate via which/where. We deliberately do NOT probe with `--version`:
    // labwired-dap is a stdio DAP server that does not implement it, and
    // spawning it just to test would leave it waiting on stdin.
    try {
        const locator = process.platform === 'win32' ? 'where' : 'which';
        const found = (0, child_process_1.spawnSync)(locator, [binName(bin)], { encoding: 'utf8' });
        if (found.status === 0) {
            const first = found.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0];
            if (first && existsFile(first)) {
                return first;
            }
        }
    }
    catch (e) {
        log(output, `PATH probe for ${bin} failed: ${e}`);
    }
    return undefined;
}
function downloadTo(url, dest, output) {
    return new Promise((resolve, reject) => {
        const request = (u, redirects) => {
            if (redirects > 10) {
                reject(new Error('Too many redirects while downloading LabWired CLI.'));
                return;
            }
            https.get(u, { headers: { 'User-Agent': 'labwired-vscode' } }, (res) => {
                var _a;
                const status = (_a = res.statusCode) !== null && _a !== void 0 ? _a : 0;
                if (status >= 300 && status < 400 && res.headers.location) {
                    res.resume();
                    request(res.headers.location, redirects + 1);
                    return;
                }
                if (status !== 200) {
                    res.resume();
                    reject(new Error(`Download failed (HTTP ${status}) for ${u}`));
                    return;
                }
                const file = fs.createWriteStream(dest);
                res.pipe(file);
                file.on('finish', () => file.close((err) => (err ? reject(err) : resolve())));
                file.on('error', (err) => {
                    fs.rm(dest, { force: true }, () => reject(err));
                });
            }).on('error', reject);
        };
        request(url, 0);
    });
}
// Recursively find a file with the given binary name inside a directory.
function findBinary(dir, bin) {
    let entries;
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    }
    catch (_a) {
        return undefined;
    }
    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            const nested = findBinary(full, bin);
            if (nested) {
                return nested;
            }
        }
        else if (entry.name === binName(bin)) {
            return full;
        }
    }
    return undefined;
}
// In-flight download promise, so a Run and an F5 racing on first use share ONE
// download of the tarball rather than both fetching it and clobbering each other.
let inFlightDownload;
/**
 * Download and extract the release tarball, returning the directory it was
 * extracted into. The tarball carries BOTH `labwired` and `labwired-dap`, so a
 * single download serves the Run button and the debugger alike.
 */
function downloadRelease(context, output) {
    return __awaiter(this, void 0, void 0, function* () {
        const platform = (0, platformAssets_1.assetFor)(process.platform, process.arch);
        if (!platform) {
            throw new Error(`Unsupported platform ${process.platform}/${process.arch}. Set labwired.cliPath to a labwired binary.`);
        }
        const version = cliVersion();
        const destDir = path.join(context.globalStorageUri.fsPath, 'cli', version);
        fs.mkdirSync(destDir, { recursive: true });
        const asset = `labwired-${version}-${platform}.tar.gz`;
        const url = `https://github.com/w1ne/labwired-core/releases/download/${version}/${asset}`;
        const tarball = path.join(destDir, asset);
        log(output, `Downloading ${url}`);
        yield vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `LabWired: Downloading simulator ${version}...`,
            cancellable: false,
        }, () => downloadTo(url, tarball, output));
        log(output, `Extracting ${tarball}`);
        const untar = (0, child_process_1.spawnSync)('tar', ['-xzf', tarball, '-C', destDir], { encoding: 'utf8' });
        if (untar.status !== 0) {
            throw new Error(`Failed to extract LabWired release: ${untar.stderr || untar.stdout}`);
        }
        fs.rm(tarball, { force: true }, () => undefined);
        return destDir;
    });
}
/**
 * Resolve one of the release binaries, in order: explicit setting → bundled with
 * the extension → on PATH → downloaded release tarball (cached in globalStorage).
 *
 * `settingKey` is the `labwired.*` setting that pins an explicit path for this
 * binary; it always wins so a developer can point at their own build.
 */
function resolveBinary(bin, settingKey, context, output) {
    return __awaiter(this, void 0, void 0, function* () {
        // 1. Explicit setting.
        const configured = vscode.workspace.getConfiguration('labwired').get(settingKey);
        if (configured && configured.trim().length > 0 && existsFile(configured.trim())) {
            (0, crashFingerprint_1.setBinarySource)(bin, 'configured');
            return configured.trim();
        }
        const cached = cachedPaths.get(bin);
        if (cached && existsFile(cached)) {
            return cached;
        }
        const remember = (p, source) => {
            cachedPaths.set(bin, p);
            (0, crashFingerprint_1.setBinarySource)(bin, source);
            return p;
        };
        // 2. Bundled with the extension.
        const extPath = context.extensionPath;
        for (const p of [
            path.join(extPath, 'dist', 'bin', binName(bin)),
            path.join(extPath, 'bin', binName(bin)),
        ]) {
            if (existsFile(p)) {
                return remember(p, 'bundled');
            }
        }
        // 3. Already extracted by an earlier download of this same version.
        const version = cliVersion();
        const cacheDir = path.join(context.globalStorageUri.fsPath, 'cli', version);
        const alreadyDownloaded = findBinary(cacheDir, bin);
        if (alreadyDownloaded && existsFile(alreadyDownloaded)) {
            fs.chmodSync(alreadyDownloaded, 0o755);
            return remember(alreadyDownloaded, 'downloaded');
        }
        // 4. On PATH.
        const onPathResolved = onPath(bin, output);
        if (onPathResolved) {
            return remember(onPathResolved, 'path');
        }
        // 5. Download the release tarball (once, shared between both binaries).
        if (!inFlightDownload) {
            inFlightDownload = downloadRelease(context, output).finally(() => {
                inFlightDownload = undefined;
            });
        }
        const destDir = yield inFlightDownload;
        const binary = findBinary(destDir, bin);
        if (!binary) {
            throw new Error(`'${bin}' not found in the LabWired ${version} release. ` +
                `It ships from v0.19.3 onward — raise 'labwired.cliVersion', or set '${settingKey}' to your own build.`);
        }
        fs.chmodSync(binary, 0o755);
        return remember(binary, 'downloaded');
    });
}
/** Resolve the `labwired` CLI (the `labwired test` runner behind the Run button). */
function resolveCli(context, output) {
    return __awaiter(this, void 0, void 0, function* () {
        return resolveBinary(exports.CLI_BIN, 'cliPath', context, output);
    });
}
exports.resolveCli = resolveCli;
/** Resolve the `labwired-dap` Debug Adapter that backs F5. */
function resolveDap(context, output) {
    return __awaiter(this, void 0, void 0, function* () {
        return resolveBinary(exports.DAP_BIN, 'dapPath', context, output);
    });
}
exports.resolveDap = resolveDap;
function runTest(cli, opts, output) {
    return __awaiter(this, void 0, void 0, function* () {
        const args = [
            'test',
            '--script', opts.script,
            '--output-dir', opts.outputDir,
            '--no-uart-stdout',
        ];
        if (opts.firmware) {
            args.push('--firmware', opts.firmware);
        }
        if (opts.system) {
            args.push('--system', opts.system);
        }
        const env = Object.assign(Object.assign({}, process.env), (opts.apiKey ? { LABWIRED_API_KEY: opts.apiKey } : {}));
        log(output, `Running: ${cli} ${args.join(' ')}`);
        return new Promise((resolve, reject) => {
            const child = (0, child_process_1.spawn)(cli, args, { cwd: opts.cwd, env });
            child.stdout.on('data', (data) => output.append(data.toString()));
            child.stderr.on('data', (data) => output.append(data.toString()));
            child.on('error', reject);
            child.on('close', (code) => {
                const exitCode = code !== null && code !== void 0 ? code : -1;
                let result;
                const resultPath = path.join(opts.outputDir, 'result.json');
                try {
                    result = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
                }
                catch (_a) {
                    result = undefined;
                }
                resolve({ exitCode, result });
            });
        });
    });
}
exports.runTest = runTest;
//# sourceMappingURL=cli.js.map