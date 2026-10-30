import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { detectProjectBuild } from '../../projectBuild';

/**
 * Run Test builds the firmware first when the workspace has a build file. A
 * workspace that is only a `.labwired/lab.yaml` over committed ELFs (a model
 * delivery, a multi-node env demo) has nothing to build and must still run.
 */
describe('project build detection', () => {
    let root: string;

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'labwired-build-'));
    });

    afterEach(() => {
        fs.rmSync(root, { recursive: true, force: true });
    });

    const exists = async (p: string) => fs.existsSync(p);

    it('builds a Cargo project in release mode', async () => {
        fs.writeFileSync(path.join(root, 'Cargo.toml'), '');
        assert.deepStrictEqual(await detectProjectBuild(root, exists), { projectType: 'Cargo', command: 'cargo build --release' });
    });

    it('prefers Cargo when a Makefile is also present', async () => {
        fs.writeFileSync(path.join(root, 'Cargo.toml'), '');
        fs.writeFileSync(path.join(root, 'Makefile'), '');
        assert.strictEqual((await detectProjectBuild(root, exists))?.projectType, 'Cargo');
    });

    it('builds a Makefile project with make', async () => {
        fs.writeFileSync(path.join(root, 'Makefile'), '');
        assert.deepStrictEqual(await detectProjectBuild(root, exists), { projectType: 'Makefile', command: 'make' });
    });

    it('skips the build when lab.yaml sets build: false, even with a Cargo.toml', async () => {
        fs.writeFileSync(path.join(root, 'Cargo.toml'), '');
        assert.strictEqual(await detectProjectBuild(root, exists, { build: false }), null);
    });

    it('has no build step for a lab.yaml-only workspace', async () => {
        fs.mkdirSync(path.join(root, '.labwired'));
        fs.writeFileSync(path.join(root, '.labwired', 'lab.yaml'), 'schema_version: "1.0"\n');
        assert.strictEqual(await detectProjectBuild(root, exists), null);
    });
});
