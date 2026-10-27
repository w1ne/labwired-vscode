// LabWired - Firmware Simulation Platform
// Copyright (C) 2026 Andrii Shylenko
//
// This software is released under the MIT License.
// See the LICENSE file in the project root for full license information.

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import * as path from 'path';
import * as vscode from 'vscode';
import * as yaml from 'js-yaml';

interface TarApi {
    list: (options: Record<string, unknown>) => Promise<void>;
    extract: (options: Record<string, unknown>) => Promise<void>;
}

const DEFAULT_CATALOG_URL = 'https://raw.githubusercontent.com/w1ne/labwired-core/model-catalog';
const COMMIT_PATTERN = /^[a-f0-9]{40}$/i;
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;
const CHIP_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]*$/i;
const MAX_REDIRECTS = 5;

export interface CatalogManifest {
    schema_version: 1;
    core_commit: string;
    archive: 'configs.tar.gz';
    sha256: string;
    chips: string[];
}

export interface InstalledCatalog extends CatalogManifest {
    configsPath: string;
}

interface ProgressReporter {
    report(value: { message?: string; increment?: number }): void;
}

interface CancellationTokenLike {
    readonly isCancellationRequested: boolean;
    onCancellationRequested(listener: () => unknown): { dispose(): unknown };
}

interface ArchiveEntry {
    path: string;
    type: string;
}

function getTar(): TarApi {
    return require('tar') as TarApi;
}

function validateManifest(value: unknown): CatalogManifest {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('The LabWired catalog manifest is invalid.');
    }

    const manifest = value as Record<string, unknown>;
    if (manifest.schema_version !== 1
        || typeof manifest.core_commit !== 'string'
        || !COMMIT_PATTERN.test(manifest.core_commit)
        || manifest.archive !== 'configs.tar.gz'
        || typeof manifest.sha256 !== 'string'
        || !SHA256_PATTERN.test(manifest.sha256)
        || !Array.isArray(manifest.chips)
        || manifest.chips.length === 0
        || !manifest.chips.every((chip) => typeof chip === 'string' && isChipName(chip))) {
        throw new Error('The LabWired catalog manifest has invalid schema, commit, archive, checksum, or chip names.');
    }

    const chips = manifest.chips as string[];
    if (new Set(chips).size !== chips.length) {
        throw new Error('The LabWired catalog manifest contains duplicate chip names.');
    }

    return {
        schema_version: 1,
        core_commit: manifest.core_commit.toLowerCase(),
        archive: 'configs.tar.gz',
        sha256: manifest.sha256.toLowerCase(),
        chips: chips.slice(),
    };
}

function isChipName(value: string): boolean {
    return CHIP_NAME_PATTERN.test(value) && value !== '.' && value !== '..';
}

function assertNotCancelled(token: CancellationTokenLike): void {
    if (token.isCancellationRequested) throw new Error('LabWired catalog installation cancelled.');
}

function requestBuffer(
    url: URL,
    token: CancellationTokenLike,
    progress: ProgressReporter,
    description: string,
    redirects = 0
): Promise<Buffer> {
    assertNotCancelled(token);
    const transport = url.protocol === 'https:' ? https : url.protocol === 'http:' ? http : undefined;
    if (!transport) return Promise.reject(new Error(`Unsupported catalog URL protocol '${url.protocol}'.`));

    return new Promise<Buffer>((resolve, reject) => {
        let settled = false;
        let received = 0;
        const chunks: Buffer[] = [];
        let request: http.ClientRequest | undefined;
        let cancelled = false;
        const cancellation = token.onCancellationRequested(() => {
            cancelled = true;
            request?.destroy(new Error('LabWired catalog installation cancelled.'));
        });

        const finish = (error?: Error, body?: Buffer) => {
            if (settled) return;
            settled = true;
            cancellation.dispose();
            if (error) reject(error);
            else resolve(body || Buffer.alloc(0));
        };

        const activeRequest = transport.get(url, (response) => {
            const status = response.statusCode || 0;
            if (status >= 300 && status < 400 && response.headers.location) {
                response.resume();
                if (redirects >= MAX_REDIRECTS) {
                    finish(new Error(`Too many redirects while downloading the LabWired ${description}.`));
                    return;
                }
                let nextUrl: URL;
                try {
                    nextUrl = new URL(response.headers.location, url);
                } catch {
                    finish(new Error(`Invalid redirect while downloading the LabWired ${description}.`));
                    return;
                }
                if (url.protocol === 'https:' && nextUrl.protocol !== 'https:') {
                    finish(new Error(`Refusing an insecure redirect while downloading the LabWired ${description}.`));
                    return;
                }
                requestBuffer(nextUrl, token, progress, description, redirects + 1).then(
                    (body) => finish(undefined, body),
                    (error: Error) => finish(error)
                );
                return;
            }

            if (status !== 200) {
                response.resume();
                finish(new Error(`Could not download the LabWired ${description} (HTTP ${status}).`));
                return;
            }

            const contentLength = Number(response.headers['content-length']);
            response.on('data', (chunk: Buffer | string) => {
                const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
                chunks.push(bytes);
                received += bytes.length;
                if (contentLength > 0) {
                    progress.report({
                        message: `${description}: ${Math.min(received, contentLength)} of ${contentLength} bytes`,
                    });
                }
            });
            response.on('end', () => finish(undefined, Buffer.concat(chunks)));
            response.on('error', (error) => finish(error));
        });
        request = activeRequest;
        if (cancelled || token.isCancellationRequested) {
            activeRequest.destroy(new Error('LabWired catalog installation cancelled.'));
        }
        activeRequest.setTimeout(30000, () => activeRequest.destroy(new Error(`Timed out downloading the LabWired ${description}.`)));
        activeRequest.on('error', (error) => {
            finish(token.isCancellationRequested
                ? new Error('LabWired catalog installation cancelled.')
                : error);
        });
    });
}

async function readManifest(baseUrl: string, progress: ProgressReporter, token: CancellationTokenLike): Promise<CatalogManifest> {
    const url = new URL('catalog.json', `${baseUrl.replace(/\/+$/, '')}/`);
    progress.report({ message: 'Reading LabWired model catalog…' });
    const bytes = await requestBuffer(url, token, progress, 'catalog manifest');
    let parsed: unknown;
    try {
        parsed = JSON.parse(bytes.toString('utf8'));
    } catch {
        throw new Error('The LabWired catalog manifest is not valid JSON.');
    }
    return validateManifest(parsed);
}

function safeArchivePath(rawPath: string): string | undefined {
    if (!rawPath || rawPath.includes('\0') || rawPath.includes('\\')
        || path.posix.isAbsolute(rawPath) || path.win32.isAbsolute(rawPath)) return undefined;

    const normalizedSlashes = rawPath.endsWith('/') ? rawPath.slice(0, -1) : rawPath;
    const parts = normalizedSlashes.split('/');
    if (parts.some((part) => !part || part === '.' || part === '..')) return undefined;
    if (parts[0] !== 'configs' || parts.length < 1) return undefined;
    return normalizedSlashes;
}

async function inspectArchive(archivePath: string): Promise<void> {
    const entries: ArchiveEntry[] = [];
    await getTar().list({
        file: archivePath,
        strict: true,
        onentry: (entry: ArchiveEntry) => entries.push({ path: entry.path, type: entry.type }),
    });

    if (entries.length === 0) throw new Error('The LabWired catalog archive is empty.');
    for (const entry of entries) {
        const safePath = safeArchivePath(entry.path);
        if (!safePath) throw new Error(`The LabWired catalog archive contains an unsafe path '${entry.path}'.`);
        if (entry.type !== 'File' && entry.type !== 'Directory') {
            throw new Error(`The LabWired catalog archive contains an unsafe link or entry '${entry.path}'.`);
        }
    }
}

async function isDirectoryWithoutFollowingLinks(directory: string): Promise<boolean> {
    try {
        const stat = await fs.promises.lstat(directory);
        return stat.isDirectory() && !stat.isSymbolicLink();
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
        throw error;
    }
}

async function assertCatalogTree(configsPath: string, chips: string[]): Promise<void> {
    if (!await isDirectoryWithoutFollowingLinks(configsPath)) {
        throw new Error('The LabWired catalog archive does not contain a configs directory.');
    }

    for (const chip of chips) {
        const chipPath = path.join(configsPath, 'chips', `${chip}.yaml`);
        let stat: fs.Stats;
        try {
            stat = await fs.promises.lstat(chipPath);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                throw new Error(`The LabWired catalog archive is missing the chip descriptor for '${chip}'.`);
            }
            throw error;
        }
        if (!stat.isFile() || stat.isSymbolicLink()) {
            throw new Error(`The LabWired catalog archive has an invalid chip descriptor for '${chip}'.`);
        }
    }
}

async function removeIfPresent(target: string): Promise<void> {
    await fs.promises.rm(target, { recursive: true, force: true });
}

export async function installCatalog(
    rootPath: string,
    progress: ProgressReporter,
    token: CancellationTokenLike,
    baseUrl = DEFAULT_CATALOG_URL
): Promise<InstalledCatalog> {
    assertNotCancelled(token);
    const manifest = await readManifest(baseUrl, progress, token);
    const modelsPath = path.join(rootPath, '.labwired', 'models');
    const commitPath = path.join(modelsPath, manifest.core_commit);
    const configsPath = path.join(commitPath, 'configs');

    if (await isDirectoryWithoutFollowingLinks(configsPath)) {
        await assertCatalogTree(configsPath, manifest.chips);
        return { ...manifest, configsPath };
    }

    await fs.promises.mkdir(modelsPath, { recursive: true });
    const tempName = `.tmp-${process.pid}-${crypto.randomBytes(8).toString('hex')}`;
    const tempPath = path.join(modelsPath, tempName);
    const archivePath = `${tempPath}.tar.gz`;

    try {
        progress.report({ message: 'Downloading public LabWired model configs…' });
        const archiveUrl = new URL(manifest.archive, `${baseUrl.replace(/\/+$/, '')}/`);
        const archive = await requestBuffer(archiveUrl, token, progress, 'public model configs');
        assertNotCancelled(token);
        const checksum = crypto.createHash('sha256').update(archive).digest('hex');
        if (checksum !== manifest.sha256) throw new Error('The LabWired catalog archive SHA-256 checksum does not match its manifest.');

        await fs.promises.writeFile(archivePath, archive, { flag: 'wx' });
        progress.report({ message: 'Checking catalog archive paths…' });
        await inspectArchive(archivePath);
        assertNotCancelled(token);

        await fs.promises.mkdir(tempPath, { recursive: false });
        progress.report({ message: 'Extracting public model configs…' });
        await getTar().extract({
            file: archivePath,
            cwd: tempPath,
            strict: true,
            filter: (entryPath: string) => safeArchivePath(entryPath) !== undefined,
        });
        assertNotCancelled(token);
        const stagedConfigs = path.join(tempPath, 'configs');
        await assertCatalogTree(stagedConfigs, manifest.chips);

        await fs.promises.mkdir(modelsPath, { recursive: true });
        try {
            await fs.promises.rename(tempPath, commitPath);
        } catch (error) {
            if (!await isDirectoryWithoutFollowingLinks(configsPath)) throw error;
            await assertCatalogTree(configsPath, manifest.chips);
        }
        return { ...manifest, configsPath };
    } finally {
        await removeIfPresent(tempPath);
        await removeIfPresent(archivePath);
    }
}

export async function findOrCreateSystemYaml(catalog: InstalledCatalog, chip: string): Promise<string> {
    if (!isChipName(chip) || !catalog.chips.includes(chip)) {
        throw new Error(`'${chip}' is not a chip in the installed LabWired catalog.`);
    }

    const systemsPath = path.join(catalog.configsPath, 'systems');
    const systemPath = path.join(systemsPath, `${chip}.yaml`);
    try {
        const stat = await fs.promises.lstat(systemPath);
        if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`The LabWired system manifest for '${chip}' is not a regular file.`);
        return systemPath;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }

    await fs.promises.mkdir(systemsPath, { recursive: true });
    const fallback = yaml.dump({
        name: chip,
        chip: `../chips/${chip}.yaml`,
        external_devices: [],
    });
    try {
        await fs.promises.writeFile(systemPath, fallback, { flag: 'wx' });
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }

    const stat = await fs.promises.lstat(systemPath);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`The LabWired system manifest for '${chip}' is not a regular file.`);
    return systemPath;
}
