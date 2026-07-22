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
exports.runTest = exports.resolveCli = exports.CLI_VERSION = void 0;
const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
const https = require("https");
const child_process_1 = require("child_process");
exports.CLI_VERSION = 'v0.18.0';
// Maps Node's process.platform/process.arch onto the release-asset platform slug.
const PLATFORM_ASSETS = {
    'darwin/arm64': 'darwin-aarch64',
    'darwin/x64': 'darwin-x86_64',
    'linux/x64': 'linux-x86_64',
    'linux/arm64': 'linux-aarch64',
};
function cliVersion() {
    const configured = vscode.workspace.getConfiguration('labwired').get('cliVersion');
    return configured && configured.trim().length > 0 ? configured.trim() : exports.CLI_VERSION;
}
function binName() {
    return process.platform === 'win32' ? 'labwired.exe' : 'labwired';
}
// Cache of a resolved CLI path for the lifetime of the extension host.
let cachedCliPath;
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
function onPath(output) {
    // Try running `labwired --version`; if that succeeds it is on PATH.
    try {
        const probe = (0, child_process_1.spawnSync)(binName(), ['--version'], { encoding: 'utf8' });
        if (probe.status === 0) {
            // Resolve the concrete location via which/where.
            const locator = process.platform === 'win32' ? 'where' : 'which';
            const found = (0, child_process_1.spawnSync)(locator, [binName()], { encoding: 'utf8' });
            if (found.status === 0) {
                const first = found.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0];
                if (first && existsFile(first)) {
                    return first;
                }
            }
            // Fall back to the bare name; spawn will resolve it via PATH.
            return binName();
        }
    }
    catch (e) {
        log(output, `PATH probe failed: ${e}`);
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
// Recursively find a file named `labwired` (or labwired.exe) inside a directory.
function findBinary(dir) {
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
            const nested = findBinary(full);
            if (nested) {
                return nested;
            }
        }
        else if (entry.name === binName()) {
            return full;
        }
    }
    return undefined;
}
function downloadCli(context, output) {
    return __awaiter(this, void 0, void 0, function* () {
        if (process.platform === 'win32') {
            throw new Error('Set labwired.cliPath — Windows CLI auto-download is not available yet.');
        }
        const platform = PLATFORM_ASSETS[`${process.platform}/${process.arch}`];
        if (!platform) {
            throw new Error(`Unsupported platform ${process.platform}/${process.arch}. Set labwired.cliPath to a labwired binary.`);
        }
        const version = cliVersion();
        const destDir = path.join(context.globalStorageUri.fsPath, 'cli', version);
        fs.mkdirSync(destDir, { recursive: true });
        // If a previous download already extracted the binary, reuse it.
        const existing = findBinary(destDir);
        if (existing && existsFile(existing)) {
            return existing;
        }
        const asset = `labwired-${version}-${platform}.tar.gz`;
        const url = `https://github.com/w1ne/labwired-core/releases/download/${version}/${asset}`;
        const tarball = path.join(destDir, asset);
        log(output, `Downloading ${url}`);
        yield vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `LabWired: Downloading CLI ${version}...`,
            cancellable: false,
        }, () => downloadTo(url, tarball, output));
        log(output, `Extracting ${tarball}`);
        const untar = (0, child_process_1.spawnSync)('tar', ['-xzf', tarball, '-C', destDir], { encoding: 'utf8' });
        if (untar.status !== 0) {
            throw new Error(`Failed to extract LabWired CLI: ${untar.stderr || untar.stdout}`);
        }
        const binary = findBinary(destDir);
        if (!binary) {
            throw new Error(`LabWired CLI binary not found inside ${asset}.`);
        }
        fs.chmodSync(binary, 0o755);
        fs.rm(tarball, { force: true }, () => undefined);
        return binary;
    });
}
function resolveCli(context, output) {
    return __awaiter(this, void 0, void 0, function* () {
        // 1. Explicit setting.
        const configured = vscode.workspace.getConfiguration('labwired').get('cliPath');
        if (configured && configured.trim().length > 0 && existsFile(configured.trim())) {
            return configured.trim();
        }
        if (cachedCliPath && existsFile(cachedCliPath)) {
            return cachedCliPath;
        }
        // 2. Bundled with the extension.
        const extPath = context.extensionPath;
        for (const p of [
            path.join(extPath, 'dist', 'bin', binName()),
            path.join(extPath, 'bin', binName()),
        ]) {
            if (existsFile(p)) {
                cachedCliPath = p;
                return p;
            }
        }
        // 3. On PATH.
        const onPathResolved = onPath(output);
        if (onPathResolved) {
            cachedCliPath = onPathResolved;
            return onPathResolved;
        }
        // 4. Download the release tarball.
        const downloaded = yield downloadCli(context, output);
        cachedCliPath = downloaded;
        return downloaded;
    });
}
exports.resolveCli = resolveCli;
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