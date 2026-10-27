"use strict";
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
const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const zlib_1 = require("zlib");
const catalogModule = (() => {
    try {
        return require('../../modelCatalog');
    }
    catch (_a) {
        return {};
    }
})();
const coreCommit = 'a'.repeat(40);
const noProgress = { report: (_value) => undefined };
const activeToken = {
    isCancellationRequested: false,
    onCancellationRequested: () => ({ dispose: () => undefined }),
};
function octal(value, width) {
    return Buffer.from(value.toString(8).padStart(width - 1, '0') + '\0');
}
function makeTar(entries) {
    const blocks = [];
    for (const entry of entries) {
        const content = Buffer.from(entry.content || '', 'utf8');
        const header = Buffer.alloc(512);
        header.write(entry.name, 0, 100, 'utf8');
        octal(0o644, 8).copy(header, 100);
        octal(0, 8).copy(header, 108);
        octal(0, 8).copy(header, 116);
        octal(entry.type === '5' ? 0 : content.length, 12).copy(header, 124);
        octal(0, 12).copy(header, 136);
        header.fill(0x20, 148, 156);
        header.write(entry.type || '0', 156, 1, 'ascii');
        if (entry.linkName)
            header.write(entry.linkName, 157, 100, 'utf8');
        header.write('ustar\0', 257, 6, 'ascii');
        header.write('00', 263, 2, 'ascii');
        let checksum = 0;
        for (const byte of header)
            checksum += byte;
        octal(checksum, 8).copy(header, 148);
        blocks.push(header);
        if (content.length > 0) {
            blocks.push(content);
            const padding = (512 - (content.length % 512)) % 512;
            if (padding > 0)
                blocks.push(Buffer.alloc(padding));
        }
    }
    blocks.push(Buffer.alloc(1024));
    return (0, zlib_1.gzipSync)(Buffer.concat(blocks));
}
function digest(bytes) {
    return crypto.createHash('sha256').update(bytes).digest('hex');
}
function startCatalogServer(options = {}) {
    return __awaiter(this, void 0, void 0, function* () {
        const archive = options.archive || makeTar([
            { name: 'configs/chips/alpha.yaml', content: 'name: alpha\n' },
            { name: 'configs/systems/alpha.yaml', content: 'chip: ../chips/alpha.yaml\nexternal_devices: []\n' },
        ]);
        let archiveRequests = 0;
        let notifyArchiveRequest = () => undefined;
        const archiveRequested = new Promise((resolve) => { notifyArchiveRequest = resolve; });
        const server = http.createServer((request, response) => {
            if (request.url === '/catalog.json') {
                const manifest = options.manifest
                    ? options.manifest(digest(archive))
                    : {
                        schema_version: 1,
                        core_commit: coreCommit,
                        archive: 'configs.tar.gz',
                        sha256: digest(archive),
                        chips: ['alpha'],
                    };
                response.writeHead(200, { 'content-type': 'application/json' });
                response.end(JSON.stringify(manifest));
            }
            else if (request.url === '/configs.tar.gz') {
                archiveRequests++;
                notifyArchiveRequest();
                response.writeHead(200, { 'content-type': 'application/gzip' });
                const sendArchive = () => { if (!response.destroyed)
                    response.end(archive); };
                if (options.archiveDelayMs)
                    setTimeout(sendArchive, options.archiveDelayMs);
                else
                    sendArchive();
            }
            else {
                response.writeHead(404);
                response.end('not found');
            }
        });
        yield new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        const address = server.address();
        assert.ok(address && typeof address !== 'string');
        return {
            baseUrl: `http://127.0.0.1:${address.port}`,
            close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
            getArchiveRequests: () => archiveRequests,
            waitForArchiveRequest: () => archiveRequested,
        };
    });
}
describe('model catalog installer', function () {
    this.timeout(10000);
    let tempRoots;
    beforeEach(() => { tempRoots = []; });
    afterEach(() => {
        for (const root of tempRoots)
            fs.rmSync(root, { recursive: true, force: true });
    });
    function makeRoot() {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lw-model-catalog-'));
        tempRoots.push(root);
        return root;
    }
    it('installs the verified config tree under the core commit and resolves a cached system YAML', () => __awaiter(this, void 0, void 0, function* () {
        assert.strictEqual(typeof catalogModule.installCatalog, 'function');
        assert.strictEqual(typeof catalogModule.findOrCreateSystemYaml, 'function');
        const server = yield startCatalogServer();
        try {
            const root = makeRoot();
            const catalog = yield catalogModule.installCatalog(root, noProgress, activeToken, server.baseUrl);
            const expectedConfigs = path.join(root, '.labwired', 'models', coreCommit, 'configs');
            assert.strictEqual(catalog.configsPath, expectedConfigs);
            assert.deepStrictEqual(catalog.chips, ['alpha']);
            assert.strictEqual(yield catalogModule.findOrCreateSystemYaml(catalog, 'alpha'), path.join(expectedConfigs, 'systems', 'alpha.yaml'));
            assert.strictEqual(fs.readFileSync(path.join(expectedConfigs, 'chips', 'alpha.yaml'), 'utf8'), 'name: alpha\n');
        }
        finally {
            yield server.close();
        }
    }));
    it('creates the core-compatible relative system manifest when a catalog system is absent', () => __awaiter(this, void 0, void 0, function* () {
        const archive = makeTar([{ name: 'configs/chips/alpha.yaml', content: 'name: alpha\n' }]);
        const server = yield startCatalogServer({ archive });
        try {
            const root = makeRoot();
            const catalog = yield catalogModule.installCatalog(root, noProgress, activeToken, server.baseUrl);
            const systemPath = yield catalogModule.findOrCreateSystemYaml(catalog, 'alpha');
            assert.strictEqual(systemPath, path.join(catalog.configsPath, 'systems', 'alpha.yaml'));
            assert.deepStrictEqual(require('js-yaml').load(fs.readFileSync(systemPath, 'utf8')), {
                name: 'alpha',
                chip: '../chips/alpha.yaml',
                external_devices: [],
            });
        }
        finally {
            yield server.close();
        }
    }));
    it('rejects a checksum mismatch before installing any catalog files', () => __awaiter(this, void 0, void 0, function* () {
        const server = yield startCatalogServer({
            manifest: () => ({
                schema_version: 1,
                core_commit: coreCommit,
                archive: 'configs.tar.gz',
                sha256: '0'.repeat(64),
                chips: ['alpha'],
            }),
        });
        try {
            const root = makeRoot();
            yield assert.rejects(catalogModule.installCatalog(root, noProgress, activeToken, server.baseUrl), /checksum|sha-?256/i);
            assert.strictEqual(fs.existsSync(path.join(root, '.labwired', 'models', coreCommit)), false);
        }
        finally {
            yield server.close();
        }
    }));
    it('rejects traversal entries before extraction and removes staging files', () => __awaiter(this, void 0, void 0, function* () {
        const archive = makeTar([{ name: 'configs/../escape.yaml', content: 'bad: true\n' }]);
        const server = yield startCatalogServer({ archive });
        try {
            const root = makeRoot();
            yield assert.rejects(catalogModule.installCatalog(root, noProgress, activeToken, server.baseUrl), /unsafe|path|travers/i);
            assert.strictEqual(fs.existsSync(path.join(root, '.labwired', 'models', 'escape.yaml')), false);
            assert.deepStrictEqual(fs.readdirSync(path.join(root, '.labwired', 'models')), []);
        }
        finally {
            yield server.close();
        }
    }));
    it('rejects links in the archive', () => __awaiter(this, void 0, void 0, function* () {
        const archive = makeTar([
            { name: 'configs/chips/alpha.yaml', content: 'name: alpha\n' },
            { name: 'configs/systems/alias.yaml', type: '2', linkName: '../chips/alpha.yaml' },
        ]);
        const server = yield startCatalogServer({ archive });
        try {
            const root = makeRoot();
            yield assert.rejects(catalogModule.installCatalog(root, noProgress, activeToken, server.baseUrl), /link|unsafe|entry/i);
        }
        finally {
            yield server.close();
        }
    }));
    it('stops an in-flight download and removes temporary catalog files when cancelled', () => __awaiter(this, void 0, void 0, function* () {
        const server = yield startCatalogServer({ archiveDelayMs: 1000 });
        try {
            const root = makeRoot();
            let cancelled = false;
            const listeners = [];
            const token = {
                get isCancellationRequested() { return cancelled; },
                onCancellationRequested(listener) {
                    listeners.push(listener);
                    return { dispose: () => undefined };
                },
            };
            const installation = catalogModule.installCatalog(root, noProgress, token, server.baseUrl);
            yield server.waitForArchiveRequest();
            cancelled = true;
            listeners.slice().forEach((listener) => listener());
            yield assert.rejects(installation, /cancel/i);
            assert.deepStrictEqual(fs.readdirSync(path.join(root, '.labwired', 'models')), []);
        }
        finally {
            yield server.close();
        }
    }));
    it('validates commit, archive, checksum, and chip names in the manifest', () => __awaiter(this, void 0, void 0, function* () {
        const invalidManifests = [
            (sha256) => ({ schema_version: 1, core_commit: 'not-a-commit', archive: 'configs.tar.gz', sha256, chips: ['alpha'] }),
            (sha256) => ({ schema_version: 1, core_commit: coreCommit, archive: 'other.tar.gz', sha256, chips: ['alpha'] }),
            (sha256) => ({ schema_version: 1, core_commit: coreCommit, archive: 'configs.tar.gz', sha256: 'bad', chips: ['alpha'] }),
            (sha256) => ({ schema_version: 1, core_commit: coreCommit, archive: 'configs.tar.gz', sha256, chips: ['../alpha'] }),
        ];
        for (const manifest of invalidManifests) {
            const server = yield startCatalogServer({ manifest });
            try {
                yield assert.rejects(catalogModule.installCatalog(makeRoot(), noProgress, activeToken, server.baseUrl), /manifest|invalid|commit|archive|checksum|chip/i);
                assert.strictEqual(server.getArchiveRequests(), 0);
            }
            finally {
                yield server.close();
            }
        }
    }));
    it('reuses a cached config tree without downloading the archive twice', () => __awaiter(this, void 0, void 0, function* () {
        const server = yield startCatalogServer();
        try {
            const root = makeRoot();
            const first = yield catalogModule.installCatalog(root, noProgress, activeToken, server.baseUrl);
            const second = yield catalogModule.installCatalog(root, noProgress, activeToken, server.baseUrl);
            assert.strictEqual(first.configsPath, second.configsPath);
            assert.strictEqual(server.getArchiveRequests(), 1);
        }
        finally {
            yield server.close();
        }
    }));
});
//# sourceMappingURL=modelCatalog.test.js.map