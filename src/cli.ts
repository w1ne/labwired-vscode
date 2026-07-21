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

export const CLI_VERSION = 'v0.18.0';

// Maps Node's process.platform/process.arch onto the release-asset platform slug.
const PLATFORM_ASSETS: Record<string, string> = {
    'darwin/arm64': 'darwin-aarch64',
    'darwin/x64': 'darwin-x86_64',
    'linux/x64': 'linux-x86_64',
    'linux/arm64': 'linux-aarch64',
};

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

function binName(): string {
    return process.platform === 'win32' ? 'labwired.exe' : 'labwired';
}

// Cache of a resolved CLI path for the lifetime of the extension host.
let cachedCliPath: string | undefined;

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

function onPath(output?: vscode.OutputChannel): string | undefined {
    // Try running `labwired --version`; if that succeeds it is on PATH.
    try {
        const probe = spawnSync(binName(), ['--version'], { encoding: 'utf8' });
        if (probe.status === 0) {
            // Resolve the concrete location via which/where.
            const locator = process.platform === 'win32' ? 'where' : 'which';
            const found = spawnSync(locator, [binName()], { encoding: 'utf8' });
            if (found.status === 0) {
                const first = found.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0];
                if (first && existsFile(first)) {
                    return first;
                }
            }
            // Fall back to the bare name; spawn will resolve it via PATH.
            return binName();
        }
    } catch (e) {
        log(output, `PATH probe failed: ${e}`);
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

// Recursively find a file named `labwired` (or labwired.exe) inside a directory.
function findBinary(dir: string): string | undefined {
    let entries: fs.Dirent[];
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
        return undefined;
    }
    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            const nested = findBinary(full);
            if (nested) {
                return nested;
            }
        } else if (entry.name === binName()) {
            return full;
        }
    }
    return undefined;
}

async function downloadCli(context: vscode.ExtensionContext, output?: vscode.OutputChannel): Promise<string> {
    if (process.platform === 'win32') {
        throw new Error('Set labwired.cliPath — Windows CLI auto-download is not available yet.');
    }

    const platform = PLATFORM_ASSETS[`${process.platform}/${process.arch}`];
    if (!platform) {
        throw new Error(
            `Unsupported platform ${process.platform}/${process.arch}. Set labwired.cliPath to a labwired binary.`
        );
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
    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: `LabWired: Downloading CLI ${version}...`,
            cancellable: false,
        },
        () => downloadTo(url, tarball, output)
    );

    log(output, `Extracting ${tarball}`);
    const untar = spawnSync('tar', ['-xzf', tarball, '-C', destDir], { encoding: 'utf8' });
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
}

export async function resolveCli(
    context: vscode.ExtensionContext,
    output?: vscode.OutputChannel
): Promise<string> {
    // 1. Explicit setting.
    const configured = vscode.workspace.getConfiguration('labwired').get<string>('cliPath');
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
    const downloaded = await downloadCli(context, output);
    cachedCliPath = downloaded;
    return downloaded;
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
