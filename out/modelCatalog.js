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
exports.findOrCreateSystemYaml = exports.installCatalog = void 0;
const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const https = require("https");
const path = require("path");
const promises_1 = require("stream/promises");
const yaml = require("js-yaml");
const zlib_1 = require("zlib");
const DEFAULT_CATALOG_URL = 'https://raw.githubusercontent.com/w1ne/labwired-core/model-catalog';
const COMMIT_PATTERN = /^[a-f0-9]{40}$/i;
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;
const CHIP_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]*$/i;
const MAX_REDIRECTS = 5;
const CATALOG_ARCHIVE_FILE = 'configs.tar.gz';
function getTarStream() {
    return require('tar-stream');
}
function validateManifest(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('The LabWired catalog manifest is invalid.');
    }
    const manifest = value;
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
    const chips = manifest.chips;
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
function isChipName(value) {
    return CHIP_NAME_PATTERN.test(value) && value !== '.' && value !== '..';
}
function assertNotCancelled(token) {
    if (token.isCancellationRequested)
        throw new Error('LabWired catalog installation cancelled.');
}
function requestBuffer(url, token, progress, description, redirects = 0) {
    assertNotCancelled(token);
    const transport = url.protocol === 'https:' ? https : url.protocol === 'http:' ? http : undefined;
    if (!transport)
        return Promise.reject(new Error(`Unsupported catalog URL protocol '${url.protocol}'.`));
    return new Promise((resolve, reject) => {
        let settled = false;
        let received = 0;
        const chunks = [];
        let request;
        let cancelled = false;
        const cancellation = token.onCancellationRequested(() => {
            cancelled = true;
            request === null || request === void 0 ? void 0 : request.destroy(new Error('LabWired catalog installation cancelled.'));
        });
        const finish = (error, body) => {
            if (settled)
                return;
            settled = true;
            cancellation.dispose();
            if (error)
                reject(error);
            else
                resolve(body || Buffer.alloc(0));
        };
        const activeRequest = transport.get(url, (response) => {
            const status = response.statusCode || 0;
            if (status >= 300 && status < 400 && response.headers.location) {
                response.resume();
                if (redirects >= MAX_REDIRECTS) {
                    finish(new Error(`Too many redirects while downloading the LabWired ${description}.`));
                    return;
                }
                let nextUrl;
                try {
                    nextUrl = new URL(response.headers.location, url);
                }
                catch (_a) {
                    finish(new Error(`Invalid redirect while downloading the LabWired ${description}.`));
                    return;
                }
                if (url.protocol === 'https:' && nextUrl.protocol !== 'https:') {
                    finish(new Error(`Refusing an insecure redirect while downloading the LabWired ${description}.`));
                    return;
                }
                requestBuffer(nextUrl, token, progress, description, redirects + 1).then((body) => finish(undefined, body), (error) => finish(error));
                return;
            }
            if (status !== 200) {
                response.resume();
                finish(new Error(`Could not download the LabWired ${description} (HTTP ${status}).`));
                return;
            }
            const contentLength = Number(response.headers['content-length']);
            response.on('data', (chunk) => {
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
function readManifest(baseUrl, progress, token) {
    return __awaiter(this, void 0, void 0, function* () {
        const url = new URL('catalog.json', `${baseUrl.replace(/\/+$/, '')}/`);
        progress.report({ message: 'Reading LabWired model catalog…' });
        const bytes = yield requestBuffer(url, token, progress, 'catalog manifest');
        let parsed;
        try {
            parsed = JSON.parse(bytes.toString('utf8'));
        }
        catch (_a) {
            throw new Error('The LabWired catalog manifest is not valid JSON.');
        }
        return validateManifest(parsed);
    });
}
function safeArchivePath(rawPath) {
    if (!rawPath || rawPath.includes('\0') || rawPath.includes('\\') || rawPath.includes(':')
        || path.posix.isAbsolute(rawPath) || path.win32.isAbsolute(rawPath))
        return undefined;
    const normalizedSlashes = rawPath.endsWith('/') ? rawPath.slice(0, -1) : rawPath;
    const parts = normalizedSlashes.split('/');
    if (parts.some((part) => !part || part === '.' || part === '..'))
        return undefined;
    if (parts[0] !== 'configs' || parts.length < 1)
        return undefined;
    return normalizedSlashes;
}
function drainEntry(entry) {
    return __awaiter(this, void 0, void 0, function* () {
        yield new Promise((resolve, reject) => {
            entry.on('error', reject);
            entry.on('end', resolve);
            entry.resume();
        });
    });
}
function extractArchiveSafely(archivePath, stagingPath, token) {
    return __awaiter(this, void 0, void 0, function* () {
        const source = fs.createReadStream(archivePath);
        const gunzip = (0, zlib_1.createGunzip)();
        const extractor = getTarStream().extract();
        const stagingRoot = path.resolve(stagingPath);
        let settled = false;
        let cancellation;
        let pendingEntryWork;
        let failure;
        yield new Promise((resolve, reject) => {
            const finish = () => {
                if (settled || failure)
                    return;
                settled = true;
                cancellation === null || cancellation === void 0 ? void 0 : cancellation.dispose();
                resolve();
            };
            const settleFailure = () => {
                if (settled || !failure)
                    return;
                settled = true;
                cancellation === null || cancellation === void 0 ? void 0 : cancellation.dispose();
                reject(failure);
            };
            const fail = (error) => {
                if (settled || failure)
                    return;
                failure = error;
                source.destroy();
                gunzip.destroy();
                extractor.destroy();
                if (pendingEntryWork)
                    pendingEntryWork.then(settleFailure, settleFailure);
                else
                    settleFailure();
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
                const writeEntry = () => __awaiter(this, void 0, void 0, function* () {
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
                        yield fs.promises.mkdir(destination, { recursive: true, mode: 0o755 });
                        yield drainEntry(entry);
                    }
                    else {
                        yield fs.promises.mkdir(path.dirname(destination), { recursive: true, mode: 0o755 });
                        yield (0, promises_1.pipeline)(entry, fs.createWriteStream(destination, { flags: 'wx', mode: 0o644 }));
                    }
                });
                pendingEntryWork = writeEntry();
                pendingEntryWork.then(() => {
                    pendingEntryWork = undefined;
                    if (failure) {
                        settleFailure();
                        return;
                    }
                    next();
                }, (error) => {
                    pendingEntryWork = undefined;
                    fail(error);
                });
            });
            source.pipe(gunzip).pipe(extractor);
        });
    });
}
function isDirectoryWithoutFollowingLinks(directory) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const stat = yield fs.promises.lstat(directory);
            return stat.isDirectory() && !stat.isSymbolicLink();
        }
        catch (error) {
            if (error.code === 'ENOENT')
                return false;
            throw error;
        }
    });
}
function assertCatalogTree(configsPath, chips) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!(yield isDirectoryWithoutFollowingLinks(configsPath))) {
            throw new Error('The LabWired catalog archive does not contain a configs directory.');
        }
        for (const chip of chips) {
            const chipPath = path.join(configsPath, 'chips', `${chip}.yaml`);
            let stat;
            try {
                stat = yield fs.promises.lstat(chipPath);
            }
            catch (error) {
                if (error.code === 'ENOENT') {
                    throw new Error(`The LabWired catalog archive is missing the chip descriptor for '${chip}'.`);
                }
                throw error;
            }
            if (!stat.isFile() || stat.isSymbolicLink()) {
                throw new Error(`The LabWired catalog archive has an invalid chip descriptor for '${chip}'.`);
            }
        }
    });
}
function removeIfPresent(target) {
    return __awaiter(this, void 0, void 0, function* () {
        yield fs.promises.rm(target, { recursive: true, force: true });
    });
}
function readRegularFile(filePath) {
    return __awaiter(this, void 0, void 0, function* () {
        let stat;
        try {
            stat = yield fs.promises.lstat(filePath);
        }
        catch (error) {
            if (error.code === 'ENOENT')
                return undefined;
            throw error;
        }
        if (!stat.isFile() || stat.isSymbolicLink())
            return undefined;
        return fs.promises.readFile(filePath);
    });
}
function listCatalogFiles(directory) {
    return __awaiter(this, void 0, void 0, function* () {
        const files = new Map();
        const visit = (current) => __awaiter(this, void 0, void 0, function* () {
            const entries = yield fs.promises.readdir(current, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isSymbolicLink())
                    return false;
                const full = path.join(current, entry.name);
                if (entry.isDirectory()) {
                    if (!(yield visit(full)))
                        return false;
                    continue;
                }
                if (!entry.isFile())
                    return false;
                const relative = path.relative(directory, full).split(path.sep).join('/');
                files.set(relative, yield fs.promises.readFile(full));
            }
            return true;
        });
        try {
            if (!(yield visit(directory)))
                return undefined;
        }
        catch (error) {
            if (error.code === 'ENOENT')
                return undefined;
            throw error;
        }
        return files;
    });
}
function existingCatalogMatches(commitPath, configsPath, manifest, token) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!(yield isDirectoryWithoutFollowingLinks(configsPath)))
            return false;
        const archive = yield readRegularFile(path.join(commitPath, CATALOG_ARCHIVE_FILE));
        if (!archive)
            return false;
        const checksum = crypto.createHash('sha256').update(archive).digest('hex');
        if (checksum !== manifest.sha256)
            return false;
        const tempName = `.verify-${process.pid}-${crypto.randomBytes(8).toString('hex')}`;
        const tempPath = path.join(path.dirname(commitPath), tempName);
        const tempArchive = `${tempPath}.tar.gz`;
        try {
            yield fs.promises.mkdir(tempPath, { recursive: false, mode: 0o700 });
            yield fs.promises.writeFile(tempArchive, archive, { flag: 'wx', mode: 0o600 });
            yield extractArchiveSafely(tempArchive, tempPath, token);
            const extractedConfigs = path.join(tempPath, 'configs');
            yield assertCatalogTree(extractedConfigs, manifest.chips);
            const extracted = yield listCatalogFiles(extractedConfigs);
            const onDisk = yield listCatalogFiles(configsPath);
            if (!extracted || !onDisk)
                return false;
            for (const [relative, bytes] of extracted) {
                const current = onDisk.get(relative);
                if (!current || !current.equals(bytes))
                    return false;
            }
            for (const relative of onDisk.keys()) {
                if (!extracted.has(relative) && !/^systems\/[^/]+$/.test(relative))
                    return false;
            }
            return true;
        }
        catch (error) {
            if (token.isCancellationRequested)
                throw error;
            const message = error instanceof Error ? error.message : '';
            if (/cancelled/i.test(message))
                throw error;
            return false;
        }
        finally {
            yield removeIfPresent(tempPath);
            yield removeIfPresent(tempArchive);
        }
    });
}
function assertNoSymlinkOnPath(root, target) {
    return __awaiter(this, void 0, void 0, function* () {
        const relative = path.relative(root, target);
        if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
            throw new Error('The LabWired catalog path escapes its directory.');
        }
        const rootStat = yield fs.promises.lstat(root);
        if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
            throw new Error('The LabWired catalog directory is not a real directory.');
        }
        let current = root;
        for (const part of relative.split(path.sep)) {
            if (!part || part === '.')
                continue;
            current = path.join(current, part);
            let stat;
            try {
                stat = yield fs.promises.lstat(current);
            }
            catch (error) {
                if (error.code === 'ENOENT')
                    return;
                throw error;
            }
            if (stat.isSymbolicLink()) {
                throw new Error('The LabWired catalog path contains a symlink.');
            }
        }
    });
}
function installCatalog(rootPath, progress, token, baseUrl = DEFAULT_CATALOG_URL) {
    return __awaiter(this, void 0, void 0, function* () {
        assertNotCancelled(token);
        const manifest = yield readManifest(baseUrl, progress, token);
        const modelsPath = path.join(rootPath, '.labwired', 'models');
        const commitPath = path.join(modelsPath, manifest.core_commit);
        const configsPath = path.join(commitPath, 'configs');
        if (yield existingCatalogMatches(commitPath, configsPath, manifest, token)) {
            return Object.assign(Object.assign({}, manifest), { configsPath });
        }
        yield removeIfPresent(commitPath);
        yield fs.promises.mkdir(modelsPath, { recursive: true });
        const tempName = `.tmp-${process.pid}-${crypto.randomBytes(8).toString('hex')}`;
        const tempPath = path.join(modelsPath, tempName);
        const archivePath = `${tempPath}.tar.gz`;
        try {
            progress.report({ message: 'Downloading public LabWired model configs…' });
            const archiveUrl = new URL(manifest.archive, `${baseUrl.replace(/\/+$/, '')}/`);
            const archive = yield requestBuffer(archiveUrl, token, progress, 'public model configs');
            assertNotCancelled(token);
            const checksum = crypto.createHash('sha256').update(archive).digest('hex');
            if (checksum !== manifest.sha256)
                throw new Error('The LabWired catalog archive SHA-256 checksum does not match its manifest.');
            yield fs.promises.writeFile(archivePath, archive, { flag: 'wx' });
            yield fs.promises.mkdir(tempPath, { recursive: false, mode: 0o700 });
            progress.report({ message: 'Extracting public model configs…' });
            yield extractArchiveSafely(archivePath, tempPath, token);
            assertNotCancelled(token);
            const stagedConfigs = path.join(tempPath, 'configs');
            yield assertCatalogTree(stagedConfigs, manifest.chips);
            yield fs.promises.writeFile(path.join(tempPath, CATALOG_ARCHIVE_FILE), archive, { flag: 'wx', mode: 0o600 });
            yield fs.promises.mkdir(modelsPath, { recursive: true });
            try {
                yield fs.promises.rename(tempPath, commitPath);
            }
            catch (error) {
                if (!(yield existingCatalogMatches(commitPath, configsPath, manifest, token)))
                    throw error;
            }
            return Object.assign(Object.assign({}, manifest), { configsPath });
        }
        finally {
            yield removeIfPresent(tempPath);
            yield removeIfPresent(archivePath);
        }
    });
}
exports.installCatalog = installCatalog;
function findOrCreateSystemYaml(catalog, chip) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!isChipName(chip) || !catalog.chips.includes(chip)) {
            throw new Error(`'${chip}' is not a chip in the installed LabWired catalog.`);
        }
        const systemsPath = path.join(catalog.configsPath, 'systems');
        const systemPath = path.join(systemsPath, `${chip}.yaml`);
        yield assertNoSymlinkOnPath(catalog.configsPath, systemPath);
        try {
            const stat = yield fs.promises.lstat(systemPath);
            if (!stat.isFile() || stat.isSymbolicLink())
                throw new Error(`The LabWired system manifest for '${chip}' is not a regular file.`);
            return systemPath;
        }
        catch (error) {
            if (error.code !== 'ENOENT')
                throw error;
        }
        if (!(yield isDirectoryWithoutFollowingLinks(systemsPath))) {
            yield fs.promises.mkdir(systemsPath);
        }
        const fallback = yaml.dump({
            name: chip,
            chip: `../chips/${chip}.yaml`,
            external_devices: [],
        });
        try {
            yield fs.promises.writeFile(systemPath, fallback, { flag: 'wx' });
        }
        catch (error) {
            if (error.code !== 'EEXIST')
                throw error;
        }
        const stat = yield fs.promises.lstat(systemPath);
        if (!stat.isFile() || stat.isSymbolicLink())
            throw new Error(`The LabWired system manifest for '${chip}' is not a regular file.`);
        return systemPath;
    });
}
exports.findOrCreateSystemYaml = findOrCreateSystemYaml;
//# sourceMappingURL=modelCatalog.js.map