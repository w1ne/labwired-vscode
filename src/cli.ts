// LabWired - Firmware Simulation Platform
// Copyright (C) 2026 Andrii Shylenko
//
// This software is released under the MIT License.
// See the LICENSE file in the project root for full license information.

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as https from 'https';
import { spawn, spawnSync } from 'child_process';
import { assetFor } from './platformAssets';

// The core release this extension downloads. Kept at the newest release on
// purpose: pinning two releases back is how the debugger shipped against a CLI
// that predated half the boards in the docs.
export const CLI_VERSION = 'v0.22.0';

/** The simulator/test-runner CLI. */
export const CLI_BIN = 'labwired';
/** The Debug Adapter the extension spawns for F5. Ships in the SAME tarball. */
export const DAP_BIN = 'labwired-dap';



export interface TestResult {
    exitCode: number;
    result: any | undefined;
}

export interface RunTestOptions {
    script: string;
    cwd: string;
    outputDir: string;
    firmware?: string;
    system?: string;
    apiKey?: string;
}

function cliVersion(): string {
    const configured = vscode.workspace.getConfiguration('labwired').get<string>('cliVersion');
    return configured && configured.trim().length > 0 ? configured.trim() : CLI_VERSION;
}

function binName(bin: string): string {
    return process.platform === 'win32' ? `${bin}.exe` : bin;
}

// Cache of resolved binary paths, keyed by bare binary name, for the lifetime
// of the extension host.
const cachedPaths = new Map<string, string>();

function log(output: vscode.OutputChannel | undefined, msg: string): void {
    if (output) {
        output.appendLine(`LabWired [cli]: ${msg}`);
    }
}

function existsFile(p: string): boolean {
    try {
        return fs.statSync(p).isFile();
    } catch {
        return false;
    }
}

function onPath(bin: string, output?: vscode.OutputChannel): string | undefined {
    // Locate via which/where. We deliberately do NOT probe with `--version`:
    // labwired-dap is a stdio DAP server that does not implement it, and
    // spawning it just to test would leave it waiting on stdin.
    try {
        const locator = process.platform === 'win32' ? 'where' : 'which';
        const found = spawnSync(locator, [binName(bin)], { encoding: 'utf8' });
        if (found.status === 0) {
            const first = found.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0];
            if (first && existsFile(first)) {
                return first;
            }
        }
    } catch (e) {
        log(output, `PATH probe for ${bin} failed: ${e}`);
    }
    return undefined;
}

function downloadTo(url: string, dest: string, output?: vscode.OutputChannel): Promise<void> {
    return new Promise((resolve, reject) => {
        const request = (u: string, redirects: number) => {
            if (redirects > 10) {
                reject(new Error('Too many redirects while downloading LabWired CLI.'));
                return;
            }
            https.get(u, { headers: { 'User-Agent': 'labwired-vscode' } }, (res) => {
                const status = res.statusCode ?? 0;
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
function findBinary(dir: string, bin: string): string | undefined {
    let entries: fs.Dirent[];
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
        return undefined;
    }
    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            const nested = findBinary(full, bin);
            if (nested) {
                return nested;
            }
        } else if (entry.name === binName(bin)) {
            return full;
        }
    }
    return undefined;
}

// In-flight download promise, so a Run and an F5 racing on first use share ONE
// download of the tarball rather than both fetching it and clobbering each other.
let inFlightDownload: Promise<string> | undefined;

/**
 * Download and extract the release tarball, returning the directory it was
 * extracted into. The tarball carries BOTH `labwired` and `labwired-dap`, so a
 * single download serves the Run button and the debugger alike.
 */
async function downloadRelease(context: vscode.ExtensionContext, output?: vscode.OutputChannel): Promise<string> {
    const platform = assetFor(process.platform, process.arch);
    if (!platform) {
        throw new Error(
            `Unsupported platform ${process.platform}/${process.arch}. Set labwired.cliPath to a labwired binary.`
        );
    }

    const version = cliVersion();
    const destDir = path.join(context.globalStorageUri.fsPath, 'cli', version);
    fs.mkdirSync(destDir, { recursive: true });

    const asset = `labwired-${version}-${platform}.tar.gz`;
    const url = `https://github.com/w1ne/labwired-core/releases/download/${version}/${asset}`;
    const tarball = path.join(destDir, asset);

    log(output, `Downloading ${url}`);
    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: `LabWired: Downloading simulator ${version}...`,
            cancellable: false,
        },
        () => downloadTo(url, tarball, output)
    );

    log(output, `Extracting ${tarball}`);
    const untar = spawnSync('tar', ['-xzf', tarball, '-C', destDir], { encoding: 'utf8' });
    if (untar.status !== 0) {
        throw new Error(`Failed to extract LabWired release: ${untar.stderr || untar.stdout}`);
    }

    fs.rm(tarball, { force: true }, () => undefined);
    return destDir;
}

/**
 * Resolve one of the release binaries, in order: explicit setting → bundled with
 * the extension → on PATH → downloaded release tarball (cached in globalStorage).
 *
 * `settingKey` is the `labwired.*` setting that pins an explicit path for this
 * binary; it always wins so a developer can point at their own build.
 */
async function resolveBinary(
    bin: string,
    settingKey: string,
    context: vscode.ExtensionContext,
    output?: vscode.OutputChannel
): Promise<string> {
    // 1. Explicit setting.
    const configured = vscode.workspace.getConfiguration('labwired').get<string>(settingKey);
    if (configured && configured.trim().length > 0 && existsFile(configured.trim())) {
        return configured.trim();
    }

    const cached = cachedPaths.get(bin);
    if (cached && existsFile(cached)) {
        return cached;
    }

    const remember = (p: string): string => {
        cachedPaths.set(bin, p);
        return p;
    };

    // 2. Bundled with the extension.
    const extPath = context.extensionPath;
    for (const p of [
        path.join(extPath, 'dist', 'bin', binName(bin)),
        path.join(extPath, 'bin', binName(bin)),
    ]) {
        if (existsFile(p)) {
            return remember(p);
        }
    }

    // 3. Already extracted by an earlier download of this same version.
    const version = cliVersion();
    const cacheDir = path.join(context.globalStorageUri.fsPath, 'cli', version);
    const alreadyDownloaded = findBinary(cacheDir, bin);
    if (alreadyDownloaded && existsFile(alreadyDownloaded)) {
        fs.chmodSync(alreadyDownloaded, 0o755);
        return remember(alreadyDownloaded);
    }

    // 4. On PATH.
    const onPathResolved = onPath(bin, output);
    if (onPathResolved) {
        return remember(onPathResolved);
    }

    // 5. Download the release tarball (once, shared between both binaries).
    if (!inFlightDownload) {
        inFlightDownload = downloadRelease(context, output).finally(() => {
            inFlightDownload = undefined;
        });
    }
    const destDir = await inFlightDownload;

    const binary = findBinary(destDir, bin);
    if (!binary) {
        throw new Error(
            `'${bin}' not found in the LabWired ${version} release. ` +
            `It ships from v0.19.3 onward — raise 'labwired.cliVersion', or set '${settingKey}' to your own build.`
        );
    }
    fs.chmodSync(binary, 0o755);
    return remember(binary);
}

/** Resolve the `labwired` CLI (the `labwired test` runner behind the Run button). */
export async function resolveCli(
    context: vscode.ExtensionContext,
    output?: vscode.OutputChannel
): Promise<string> {
    return resolveBinary(CLI_BIN, 'cliPath', context, output);
}

/** Resolve the `labwired-dap` Debug Adapter that backs F5. */
export async function resolveDap(
    context: vscode.ExtensionContext,
    output?: vscode.OutputChannel
): Promise<string> {
    return resolveBinary(DAP_BIN, 'dapPath', context, output);
}

export async function runTest(
    cli: string,
    opts: RunTestOptions,
    output: vscode.OutputChannel
): Promise<TestResult> {
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

    const env = { ...process.env, ...(opts.apiKey ? { LABWIRED_API_KEY: opts.apiKey } : {}) };

    log(output, `Running: ${cli} ${args.join(' ')}`);

    return new Promise<TestResult>((resolve, reject) => {
        const child = spawn(cli, args, { cwd: opts.cwd, env });

        child.stdout.on('data', (data: Buffer) => output.append(data.toString()));
        child.stderr.on('data', (data: Buffer) => output.append(data.toString()));

        child.on('error', reject);

        child.on('close', (code) => {
            const exitCode = code ?? -1;
            let result: any | undefined;
            const resultPath = path.join(opts.outputDir, 'result.json');
            try {
                result = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
            } catch {
                result = undefined;
            }
            resolve({ exitCode, result });
        });
    });
}
