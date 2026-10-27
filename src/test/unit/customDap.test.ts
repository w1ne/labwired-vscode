import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { customDapExecutablePath, runCustomDapBuild } from '../../customDap';

describe('custom DAP build', () => {
    let root: string;

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'lw-custom-dap-'));
    });

    afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

    it('runs the build program with separate arguments and the configured cwd', async () => {
        const script = path.join(root, 'build.js');
        fs.writeFileSync(script, 'process.stdout.write(JSON.stringify({args: process.argv.slice(2), cwd: process.cwd()}));');

        const result = await runCustomDapBuild({
            command: process.execPath,
            args: [script, 'argument with spaces'],
            cwd: root,
        });

        assert.deepStrictEqual(JSON.parse(result.stdout), {
            args: ['argument with spaces'],
            cwd: fs.realpathSync(root),
        });
    });

    it('rejects failed builds with their captured stdout and stderr', async () => {
        const script = path.join(root, 'fail.js');
        fs.writeFileSync(script, 'console.log("build output"); console.error("build error"); process.exit(7);');

        await assert.rejects(
            runCustomDapBuild({ command: process.execPath, args: [script], cwd: root }),
            (error: Error) => error.message.includes('exit code 7')
                && error.message.includes('build output')
                && error.message.includes('build error')
        );
    });

    it('adds the Windows executable suffix only when no suffix was configured and the suffixed file exists', () => {
        const executable = path.join(root, 'custom-dap');
        const windowsExecutable = `${executable}.exe`;
        fs.writeFileSync(windowsExecutable, 'adapter');

        assert.strictEqual(customDapExecutablePath(executable, 'win32'), windowsExecutable);
        assert.strictEqual(customDapExecutablePath(`${executable}.cmd`, 'win32'), `${executable}.cmd`);
        assert.strictEqual(customDapExecutablePath(path.join(root, 'missing'), 'win32'), path.join(root, 'missing'));
    });
});
