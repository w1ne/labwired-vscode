import * as assert from 'assert';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import { gzipSync } from 'zlib';

const catalogModule = (() => {
    try {
        return require('../../modelCatalog');
    } catch {
        return {};
    }
})();

const coreCommit = 'a'.repeat(40);
const noProgress = { report: (_value: { message?: string; increment?: number }) => undefined };
const activeToken = {
    isCancellationRequested: false,
    onCancellationRequested: () => ({ dispose: () => undefined }),
};

interface TarEntry {
    name: string;
    content?: string;
    type?: string;
    linkName?: string;
    size?: number;
}

function octal(value: number, width: number): Buffer {
    return Buffer.from(value.toString(8).padStart(width - 1, '0') + '\0');
}

function makeTar(entries: TarEntry[]): Buffer {
    const blocks: Buffer[] = [];
    for (const entry of entries) {
        const content = Buffer.from(entry.content || '', 'utf8');
        const header = Buffer.alloc(512);
        header.write(entry.name, 0, 100, 'utf8');
        octal(0o644, 8).copy(header, 100);
        octal(0, 8).copy(header, 108);
        octal(0, 8).copy(header, 116);
        octal(entry.size ?? (entry.type === '5' ? 0 : content.length), 12).copy(header, 124);
        octal(0, 12).copy(header, 136);
        header.fill(0x20, 148, 156);
        header.write(entry.type || '0', 156, 1, 'ascii');
        if (entry.linkName) header.write(entry.linkName, 157, 100, 'utf8');
        header.write('ustar\0', 257, 6, 'ascii');
        header.write('00', 263, 2, 'ascii');
        let checksum = 0;
        for (const byte of header) checksum += byte;
        octal(checksum, 8).copy(header, 148);
        blocks.push(header);
        if (content.length > 0) {
            blocks.push(content);
            const padding = (512 - (content.length % 512)) % 512;
            if (padding > 0) blocks.push(Buffer.alloc(padding));
        }
    }
    blocks.push(Buffer.alloc(1024));
    return gzipSync(Buffer.concat(blocks));
}

function digest(bytes: Buffer): string {
    return crypto.createHash('sha256').update(bytes).digest('hex');
}

interface CatalogServerOptions {
    archive?: Buffer;
    manifest?: (sha256: string) => unknown;
    archiveDelayMs?: number;
}

async function startCatalogServer(options: CatalogServerOptions = {}): Promise<{
    baseUrl: string;
    close: () => Promise<void>;
    getArchiveRequests: () => number;
    waitForArchiveRequest: () => Promise<void>;
}> {
    const archive = options.archive || makeTar([
        { name: 'configs/chips/alpha.yaml', content: 'name: alpha\n' },
        { name: 'configs/systems/alpha.yaml', content: 'chip: ../chips/alpha.yaml\nexternal_devices: []\n' },
    ]);
    let archiveRequests = 0;
    let notifyArchiveRequest: () => void = () => undefined;
    const archiveRequested = new Promise<void>((resolve) => { notifyArchiveRequest = resolve; });
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
        } else if (request.url === '/configs.tar.gz') {
            archiveRequests++;
            notifyArchiveRequest();
            response.writeHead(200, { 'content-type': 'application/gzip' });
            const sendArchive = () => { if (!response.destroyed) response.end(archive); };
            if (options.archiveDelayMs) setTimeout(sendArchive, options.archiveDelayMs);
            else sendArchive();
        } else {
            response.writeHead(404);
            response.end('not found');
        }
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    return {
        baseUrl: `http://127.0.0.1:${address.port}`,
        close: () => new Promise<void>((resolve, reject) =>
            server.close((error) => error ? reject(error) : resolve())),
        getArchiveRequests: () => archiveRequests,
        waitForArchiveRequest: () => archiveRequested,
    };
}

describe('model catalog installer', function () {
    this.timeout(10000);

    let tempRoots: string[];
    beforeEach(() => { tempRoots = []; });
    afterEach(() => {
        for (const root of tempRoots) fs.rmSync(root, { recursive: true, force: true });
    });

    function makeRoot(): string {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lw-model-catalog-'));
        tempRoots.push(root);
        return root;
    }

    it('installs the verified config tree under the core commit and resolves a cached system YAML', async () => {
        assert.strictEqual(typeof catalogModule.installCatalog, 'function');
        assert.strictEqual(typeof catalogModule.findOrCreateSystemYaml, 'function');
        const server = await startCatalogServer();
        try {
            const root = makeRoot();
            const catalog = await catalogModule.installCatalog(root, noProgress, activeToken, server.baseUrl);
            const expectedConfigs = path.join(root, '.labwired', 'models', coreCommit, 'configs');
            assert.strictEqual(catalog.configsPath, expectedConfigs);
            assert.deepStrictEqual(catalog.chips, ['alpha']);
            assert.strictEqual(
                await catalogModule.findOrCreateSystemYaml(catalog, 'alpha'),
                path.join(expectedConfigs, 'systems', 'alpha.yaml')
            );
            assert.strictEqual(fs.readFileSync(path.join(expectedConfigs, 'chips', 'alpha.yaml'), 'utf8'), 'name: alpha\n');
        } finally {
            await server.close();
        }
    });

    it('creates the core-compatible relative system manifest when a catalog system is absent', async () => {
        const archive = makeTar([{ name: 'configs/chips/alpha.yaml', content: 'name: alpha\n' }]);
        const server = await startCatalogServer({ archive });
        try {
            const root = makeRoot();
            const catalog = await catalogModule.installCatalog(root, noProgress, activeToken, server.baseUrl);
            const systemPath = await catalogModule.findOrCreateSystemYaml(catalog, 'alpha');
            assert.strictEqual(systemPath, path.join(catalog.configsPath, 'systems', 'alpha.yaml'));
            assert.deepStrictEqual(require('js-yaml').load(fs.readFileSync(systemPath, 'utf8')), {
                name: 'alpha',
                chip: '../chips/alpha.yaml',
                external_devices: [],
            });
        } finally {
            await server.close();
        }
    });

    it('rejects a checksum mismatch before installing any catalog files', async () => {
        const server = await startCatalogServer({
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
            await assert.rejects(
                catalogModule.installCatalog(root, noProgress, activeToken, server.baseUrl),
                /checksum|sha-?256/i
            );
            assert.strictEqual(fs.existsSync(path.join(root, '.labwired', 'models', coreCommit)), false);
        } finally {
            await server.close();
        }
    });

    it('rejects traversal entries before extraction and removes staging files', async () => {
        const archive = makeTar([{ name: 'configs/../escape.yaml', content: 'bad: true\n' }]);
        const server = await startCatalogServer({ archive });
        try {
            const root = makeRoot();
            await assert.rejects(
                catalogModule.installCatalog(root, noProgress, activeToken, server.baseUrl),
                /unsafe|path|travers/i
            );
            assert.strictEqual(fs.existsSync(path.join(root, '.labwired', 'models', 'escape.yaml')), false);
            assert.deepStrictEqual(fs.readdirSync(path.join(root, '.labwired', 'models')), []);
        } finally {
            await server.close();
        }
    });

    it('rejects colon-bearing paths before extraction for cross-platform safety', async () => {
        const archive = makeTar([
            { name: 'configs/chips/alpha.yaml', content: 'name: alpha\n' },
            { name: 'configs/chips/alpha.yaml:payload', content: 'not a portable file\n' },
        ]);
        const server = await startCatalogServer({ archive });
        try {
            const root = makeRoot();
            await assert.rejects(
                catalogModule.installCatalog(root, noProgress, activeToken, server.baseUrl),
                /unsafe|path/i
            );
            assert.deepStrictEqual(fs.readdirSync(path.join(root, '.labwired', 'models')), []);
        } finally {
            await server.close();
        }
    });

    it('rejects links in the archive', async () => {
        const archive = makeTar([
            { name: 'configs/chips/alpha.yaml', content: 'name: alpha\n' },
            { name: 'configs/systems/alias.yaml', type: '2', linkName: '../chips/alpha.yaml' },
        ]);
        const server = await startCatalogServer({ archive });
        try {
            const root = makeRoot();
            await assert.rejects(
                catalogModule.installCatalog(root, noProgress, activeToken, server.baseUrl),
                /link|unsafe|entry/i
            );
        } finally {
            await server.close();
        }
    });

    it('rejects directory entries that carry file payload data', async () => {
        const archive = makeTar([
            { name: 'configs', type: '5', content: 'unexpected payload', size: 18 },
            { name: 'configs/chips/alpha.yaml', content: 'name: alpha\n' },
        ]);
        const server = await startCatalogServer({ archive });
        try {
            const root = makeRoot();
            await assert.rejects(
                catalogModule.installCatalog(root, noProgress, activeToken, server.baseUrl),
                /directory|unsafe|entry/i
            );
            assert.deepStrictEqual(fs.readdirSync(path.join(root, '.labwired', 'models')), []);
        } finally {
            await server.close();
        }
    });

    it('stops an in-flight download and removes temporary catalog files when cancelled', async () => {
        const server = await startCatalogServer({ archiveDelayMs: 1000 });
        try {
            const root = makeRoot();
            let cancelled = false;
            const listeners: Array<() => void> = [];
            const token = {
                get isCancellationRequested() { return cancelled; },
                onCancellationRequested(listener: () => void) {
                    listeners.push(listener);
                    return { dispose: () => undefined };
                },
            };
            const installation = catalogModule.installCatalog(root, noProgress, token, server.baseUrl);
            await server.waitForArchiveRequest();
            cancelled = true;
            listeners.slice().forEach((listener) => listener());

            await assert.rejects(installation, /cancel/i);
            assert.deepStrictEqual(fs.readdirSync(path.join(root, '.labwired', 'models')), []);
        } finally {
            await server.close();
        }
    });

    it('validates commit, archive, checksum, and chip names in the manifest', async () => {
        const invalidManifests = [
            (sha256: string) => ({ schema_version: 1, core_commit: 'not-a-commit', archive: 'configs.tar.gz', sha256, chips: ['alpha'] }),
            (sha256: string) => ({ schema_version: 1, core_commit: coreCommit, archive: 'other.tar.gz', sha256, chips: ['alpha'] }),
            (sha256: string) => ({ schema_version: 1, core_commit: coreCommit, archive: 'configs.tar.gz', sha256: 'bad', chips: ['alpha'] }),
            (sha256: string) => ({ schema_version: 1, core_commit: coreCommit, archive: 'configs.tar.gz', sha256, chips: ['../alpha'] }),
        ];
        for (const manifest of invalidManifests) {
            const server = await startCatalogServer({ manifest });
            try {
                await assert.rejects(
                    catalogModule.installCatalog(makeRoot(), noProgress, activeToken, server.baseUrl),
                    /manifest|invalid|commit|archive|checksum|chip/i
                );
                assert.strictEqual(server.getArchiveRequests(), 0);
            } finally {
                await server.close();
            }
        }
    });

    it('reuses a cached config tree without downloading the archive twice', async () => {
        const server = await startCatalogServer();
        try {
            const root = makeRoot();
            const first = await catalogModule.installCatalog(root, noProgress, activeToken, server.baseUrl);
            const second = await catalogModule.installCatalog(root, noProgress, activeToken, server.baseUrl);
            assert.strictEqual(first.configsPath, second.configsPath);
            assert.strictEqual(server.getArchiveRequests(), 1);
            assert.strictEqual(
                fs.readFileSync(path.join(root, '.labwired', 'models', coreCommit, 'configs', 'chips', 'alpha.yaml'), 'utf8'),
                'name: alpha\n',
            );
        } finally {
            await server.close();
        }
    });

    function preseedConfigs(root: string): string {
        const configs = path.join(root, '.labwired', 'models', coreCommit, 'configs');
        fs.mkdirSync(path.join(configs, 'chips'), { recursive: true });
        return configs;
    }

    it('replaces a preseeded config tree that does not match the archive checksum', async () => {
        const archive = makeTar([
            { name: 'configs/chips/alpha.yaml', content: 'name: alpha\n' },
            { name: 'configs/systems/alpha.yaml', content: 'chip: ../chips/alpha.yaml\nexternal_devices: []\n' },
        ]);
        const server = await startCatalogServer({ archive });
        try {
            const root = makeRoot();
            const configs = preseedConfigs(root);
            const commitPath = path.dirname(configs);
            fs.writeFileSync(path.join(configs, 'chips', 'alpha.yaml'), 'name: poisoned\n');
            fs.writeFileSync(path.join(commitPath, 'catalog.sha256'), `${digest(archive)}\n`);
            const catalog = await catalogModule.installCatalog(root, noProgress, activeToken, server.baseUrl);
            assert.strictEqual(catalog.configsPath, configs);
            assert.strictEqual(fs.readFileSync(path.join(configs, 'chips', 'alpha.yaml'), 'utf8'), 'name: alpha\n');
            assert.strictEqual(server.getArchiveRequests(), 1);
        } finally {
            await server.close();
        }
    });

    it('downloads the archive when a preseeded tree is missing a chip file', async () => {
        const server = await startCatalogServer();
        try {
            const root = makeRoot();
            const configs = preseedConfigs(root);
            fs.writeFileSync(path.join(configs, 'README'), 'incomplete tree\n');
            const catalog = await catalogModule.installCatalog(root, noProgress, activeToken, server.baseUrl);
            assert.strictEqual(fs.readFileSync(path.join(catalog.configsPath, 'chips', 'alpha.yaml'), 'utf8'), 'name: alpha\n');
            assert.strictEqual(server.getArchiveRequests(), 1);
        } finally {
            await server.close();
        }
    });

    it('replaces a cached tree whose files differ from the verified archive', async () => {
        const server = await startCatalogServer();
        try {
            const root = makeRoot();
            const catalog = await catalogModule.installCatalog(root, noProgress, activeToken, server.baseUrl);
            const chipPath = path.join(catalog.configsPath, 'chips', 'alpha.yaml');
            fs.writeFileSync(chipPath, 'name: poisoned\n');
            await catalogModule.installCatalog(root, noProgress, activeToken, server.baseUrl);
            assert.strictEqual(fs.readFileSync(chipPath, 'utf8'), 'name: alpha\n');
            assert.strictEqual(server.getArchiveRequests(), 2);
        } finally {
            await server.close();
        }
    });

    it('does not follow a symlinked systems directory when creating a system YAML', async function () {
        const server = await startCatalogServer();
        try {
            const root = makeRoot();
            const catalog = await catalogModule.installCatalog(root, noProgress, activeToken, server.baseUrl);
            const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'lw-model-catalog-outside-'));
            tempRoots.push(outside);
            const systemsPath = path.join(catalog.configsPath, 'systems');
            fs.rmSync(systemsPath, { recursive: true, force: true });
            try {
                fs.symlinkSync(outside, systemsPath, 'dir');
            } catch (error) {
                const code = (error as NodeJS.ErrnoException).code;
                if (code === 'EPERM' || code === 'EACCES') this.skip();
                throw error;
            }
            await assert.rejects(
                catalogModule.findOrCreateSystemYaml(catalog, 'alpha'),
                /symlink/i,
            );
            assert.strictEqual(fs.existsSync(path.join(outside, 'alpha.yaml')), false);
        } finally {
            await server.close();
        }
    });
});
