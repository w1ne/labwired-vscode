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
import { pipeline } from 'stream/promises';
import * as vscode from 'vscode';
import * as yaml from 'js-yaml';
import { createGunzip } from 'zlib';

interface TarStreamHeader {
    name: string;
    type: string;
    size: number;
}

interface TarStreamEntry extends NodeJS.ReadableStream {}

interface TarStreamExtractor {
    on(event: 'entry', listener: (header: TarStreamHeader, entry: TarStreamEntry, next: (error?: Error) => void) => void): this;
    on(event: 'finish', listener: () => void): this;
    on(event: 'error', listener: (error: Error) => void): this;
    destroy(error?: Error): this;
}

interface TarStreamApi {
    extract: () => TarStreamExtractor;
}

const DEFAULT_CATALOG_URL = 'https://raw.githubusercontent.com/w1ne/labwired-core/model-catalog';
const COMMIT_PATTERN = /^[a-f0-9]{40}$/i;
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;
const CHIP_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]*$/i;
const MAX_REDIRECTS = 5;
const CATALOG_ARCHIVE_FILE = 'configs.tar.gz';

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

function getTarStream(): TarStreamApi {
    return require('tar-stream') as TarStreamApi;
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
    if (!rawPath || rawPath.includes('\0') || rawPath.includes('\\') || rawPath.includes(':')
        || path.posix.isAbsolute(rawPath) || path.win32.isAbsolute(rawPath)) return undefined;

    const normalizedSlashes = rawPath.endsWith('/') ? rawPath.slice(0, -1) : rawPath;
    const parts = normalizedSlashes.split('/');
    if (parts.some((part) => !part || part === '.' || part === '..')) return undefined;
    if (parts[0] !== 'configs' || parts.length < 1) return undefined;
    return normalizedSlashes;
}

async function drainEntry(entry: TarStreamEntry): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        entry.on('error', reject);
        entry.on('end', resolve);
        entry.resume();
    });
}

async function extractArchiveSafely(archivePath: string, stagingPath: string, token: CancellationTokenLike): Promise<void> {
    const source = fs.createReadStream(archivePath);
    const gunzip = createGunzip();
    const extractor = getTarStream().extract();
    const stagingRoot = path.resolve(stagingPath);
    let settled = false;
    let cancellation: { dispose: () => unknown } | undefined;
    let pendingEntryWork: Promise<void> | undefined;
    let failure: Error | undefined;

    await new Promise<void>((resolve, reject) => {
        const finish = () => {
            if (settled || failure) return;
            settled = true;
            cancellation?.dispose();
            resolve();
        };
        const settleFailure = () => {
            if (settled || !failure) return;
            settled = true;
            cancellation?.dispose();
            reject(failure);
        };
        const fail = (error: Error) => {
            if (settled || failure) return;
            failure = error;
            source.destroy();
            gunzip.destroy();
            extractor.destroy();
            if (pendingEntryWork) pendingEntryWork.then(settleFailure, settleFailure);
            else settleFailure();
        };

        cancellation = token.onCancellationRequested(() => fail(new Error('LabWired catalog installation cancelled.')));
        if (token.isCancellationRequested) {
            fail(new Error('LabWired catalog installation cancelled.'));
            return;
        }

        source.on('error', fail);
        gunzip.on('error', fail);
        extractor.on('error', fail);
        extractor.on('finish', finish);
        extractor.on('entry', (header, entry, next) => {
            const writeEntry = async () => {
                assertNotCancelled(token);
                const safePath = safeArchivePath(header.name);
                if (!safePath) {
                    throw new Error(`The LabWired catalog archive contains an unsafe path '${header.name}'.`);
                }
                if (header.type !== 'file' && header.type !== 'directory') {
                    throw new Error(`The LabWired catalog archive contains an unsafe link or entry '${header.name}'.`);
                }
                if (!Number.isSafeInteger(header.size) || header.size < 0) {
                    throw new Error(`The LabWired catalog archive contains an invalid entry size for '${header.name}'.`);
                }
                if (header.type === 'directory' && header.size !== 0) {
                    throw new Error(`The LabWired catalog archive directory '${header.name}' contains file data.`);
                }

                const destination = path.resolve(stagingRoot, ...safePath.split('/'));
                if (!destination.startsWith(`${stagingRoot}${path.sep}`)) {
                    throw new Error(`The LabWired catalog archive path '${header.name}' escapes its staging directory.`);
                }

                if (header.type === 'directory') {
                    await fs.promises.mkdir(destination, { recursive: true, mode: 0o755 });
                    await drainEntry(entry);
                } else {
                    await fs.promises.mkdir(path.dirname(destination), { recursive: true, mode: 0o755 });
                    await pipeline(entry, fs.createWriteStream(destination, { flags: 'wx', mode: 0o644 }));
                }
            };

            pendingEntryWork = writeEntry();
            pendingEntryWork.then(() => {
                pendingEntryWork = undefined;
                if (failure) {
                    settleFailure();
                    return;
                }
                next();
            }, (error: Error) => {
                pendingEntryWork = undefined;
                fail(error);
            });
        });

        source.pipe(gunzip).pipe(extractor as unknown as NodeJS.WritableStream);
    });
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

async function readRegularFile(filePath: string): Promise<Buffer | undefined> {
    let stat: fs.Stats;
    try {
        stat = await fs.promises.lstat(filePath);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
        throw error;
    }
    if (!stat.isFile() || stat.isSymbolicLink()) return undefined;
    return fs.promises.readFile(filePath);
}

async function listCatalogFiles(directory: string): Promise<Map<string, Buffer> | undefined> {
    const files = new Map<string, Buffer>();
    const visit = async (current: string): Promise<boolean> => {
        const entries = await fs.promises.readdir(current, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isSymbolicLink()) return false;
            const full = path.join(current, entry.name);
            if (entry.isDirectory()) {
                if (!await visit(full)) return false;
                continue;
            }
            if (!entry.isFile()) return false;
            const relative = path.relative(directory, full).split(path.sep).join('/');
            files.set(relative, await fs.promises.readFile(full));
        }
        return true;
    };

    try {
        if (!await visit(directory)) return undefined;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
        throw error;
    }
    return files;
}

async function existingCatalogMatches(
    commitPath: string,
    configsPath: string,
    manifest: CatalogManifest,
    token: CancellationTokenLike,
): Promise<boolean> {
    if (!await isDirectoryWithoutFollowingLinks(configsPath)) return false;
    const archive = await readRegularFile(path.join(commitPath, CATALOG_ARCHIVE_FILE));
    if (!archive) return false;
    const checksum = crypto.createHash('sha256').update(archive).digest('hex');
    if (checksum !== manifest.sha256) return false;

    const tempName = `.verify-${process.pid}-${crypto.randomBytes(8).toString('hex')}`;
    const tempPath = path.join(path.dirname(commitPath), tempName);
    const tempArchive = `${tempPath}.tar.gz`;
    try {
        await fs.promises.mkdir(tempPath, { recursive: false, mode: 0o700 });
        await fs.promises.writeFile(tempArchive, archive, { flag: 'wx', mode: 0o600 });
        await extractArchiveSafely(tempArchive, tempPath, token);
        const extractedConfigs = path.join(tempPath, 'configs');
        await assertCatalogTree(extractedConfigs, manifest.chips);
        const extracted = await listCatalogFiles(extractedConfigs);
        const onDisk = await listCatalogFiles(configsPath);
        if (!extracted || !onDisk) return false;
        for (const [relative, bytes] of extracted) {
            const current = onDisk.get(relative);
            if (!current || !current.equals(bytes)) return false;
        }
        for (const relative of onDisk.keys()) {
            if (!extracted.has(relative) && !/^systems\/[^/]+$/.test(relative)) return false;
        }
        return true;
    } catch (error) {
        if (token.isCancellationRequested) throw error;
        const message = error instanceof Error ? error.message : '';
        if (/cancelled/i.test(message)) throw error;
        return false;
    } finally {
        await removeIfPresent(tempPath);
        await removeIfPresent(tempArchive);
    }
}

async function assertNoSymlinkOnPath(root: string, target: string): Promise<void> {
    const relative = path.relative(root, target);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error('The LabWired catalog path escapes its directory.');
    }
    const rootStat = await fs.promises.lstat(root);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
        throw new Error('The LabWired catalog directory is not a real directory.');
    }

    let current = root;
    for (const part of relative.split(path.sep)) {
        if (!part || part === '.') continue;
        current = path.join(current, part);
        let stat: fs.Stats;
        try {
            stat = await fs.promises.lstat(current);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
            throw error;
        }
        if (stat.isSymbolicLink()) {
            throw new Error('The LabWired catalog path contains a symlink.');
        }
    }
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

    if (await existingCatalogMatches(commitPath, configsPath, manifest, token)) {
        return { ...manifest, configsPath };
    }
    await removeIfPresent(commitPath);

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
        await fs.promises.mkdir(tempPath, { recursive: false, mode: 0o700 });
        progress.report({ message: 'Extracting public model configs…' });
        await extractArchiveSafely(archivePath, tempPath, token);
        assertNotCancelled(token);
        const stagedConfigs = path.join(tempPath, 'configs');
        await assertCatalogTree(stagedConfigs, manifest.chips);
        await fs.promises.writeFile(
            path.join(tempPath, CATALOG_ARCHIVE_FILE),
            archive,
            { flag: 'wx', mode: 0o600 }
        );

        await fs.promises.mkdir(modelsPath, { recursive: true });
        try {
            await fs.promises.rename(tempPath, commitPath);
        } catch (error) {
            if (!await existingCatalogMatches(commitPath, configsPath, manifest, token)) throw error;
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
    await assertNoSymlinkOnPath(catalog.configsPath, systemPath);
    try {
        const stat = await fs.promises.lstat(systemPath);
        if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`The LabWired system manifest for '${chip}' is not a regular file.`);
        return systemPath;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }

    if (!await isDirectoryWithoutFollowingLinks(systemsPath)) {
        await fs.promises.mkdir(systemsPath);
    }
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
