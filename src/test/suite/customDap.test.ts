import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { LabwiredDebugAdapterDescriptorFactory } from '../../extension';
import { normalizePathForComparison } from '../pathAssertions';

suite('custom DAP launch', function () {
    this.timeout(15000);

    async function setStandardDapPath(file: string): Promise<unknown> {
        const config = vscode.workspace.getConfiguration('labwired');
        const oldValue = config.inspect<string>('dapPath')?.globalValue;
        await config.update('dapPath', file, vscode.ConfigurationTarget.Global);
        return oldValue;
    }

    async function restoreStandardDapPath(oldValue: unknown): Promise<void> {
        await vscode.workspace.getConfiguration('labwired').update(
            'dapPath', oldValue, vscode.ConfigurationTarget.Global
        );
    }

    function mockOutput() {
        const lines: string[] = [];
        let shown = false;
        return {
            channel: {
                append: (text: string) => lines.push(text),
                appendLine: (text: string) => lines.push(`${text}\n`),
                show: () => { shown = true; },
            },
            lines,
            wasShown: () => shown,
        };
    }

    test('runs the configured build and launches its executable', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lw-custom-dap-launch-'));
        const configDir = path.join(root, '.labwired');
        fs.mkdirSync(configDir, { recursive: true });
        const executable = path.join(root, 'target', 'release', 'custom-dap');
        const buildScript = path.join(root, 'build.js');
        fs.writeFileSync(buildScript, [
            'const fs = require("fs");',
            'fs.mkdirSync(require("path").dirname(process.argv[2]), {recursive:true});',
            'fs.writeFileSync(process.argv[2], "#!/usr/bin/env node\\nprocess.exit(0);\\n");',
            'fs.chmodSync(process.argv[2], 0o755);',
            'process.stdout.write("custom DAP built");',
        ].join('\n'));
        fs.writeFileSync(path.join(configDir, 'lab.yaml'), yaml.dump({
            schema_version: '1.0',
            inputs: {},
            debug: {
                adapter: {
                    executable: '../target/release/custom-dap',
                    build: {
                        command: process.execPath,
                        args: [buildScript, executable],
                        cwd: root,
                    },
                },
            },
        }));

        const standardDap = path.join(root, 'standard-dap');
        fs.writeFileSync(standardDap, 'standard');
        const oldDapPath = await setStandardDapPath(standardDap);
        const output = mockOutput();
        try {
            const factory = new LabwiredDebugAdapterDescriptorFactory({ extensionPath: root } as any, output.channel as any);
            const descriptor = await factory.createDebugAdapterDescriptor({
                workspaceFolder: { uri: vscode.Uri.file(root) },
                configuration: { type: 'labwired' },
            } as any, undefined);

            assert.strictEqual(
                normalizePathForComparison((descriptor as vscode.DebugAdapterExecutable).command),
                normalizePathForComparison(executable),
            );
            assert.ok(fs.existsSync(executable));
            assert.ok(output.lines.join('').includes('custom DAP built'));
        } finally {
            await restoreStandardDapPath(oldDapPath);
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    test('shows failed build output and does not launch a stale custom DAP', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lw-custom-dap-fail-'));
        const configDir = path.join(root, '.labwired');
        fs.mkdirSync(configDir, { recursive: true });
        const executable = path.join(root, 'target', 'release', 'custom-dap');
        fs.mkdirSync(path.dirname(executable), { recursive: true });
        fs.writeFileSync(executable, 'stale binary');
        const buildScript = path.join(root, 'fail.js');
        fs.writeFileSync(buildScript, 'console.log("fresh build failed"); process.exit(3);');
        fs.writeFileSync(path.join(configDir, 'lab.yaml'), yaml.dump({
            schema_version: '1.0',
            inputs: {},
            debug: {
                adapter: {
                    executable: '../target/release/custom-dap',
                    build: { command: process.execPath, args: [buildScript], cwd: root },
                },
            },
        }));

        const standardDap = path.join(root, 'standard-dap');
        fs.writeFileSync(standardDap, 'standard');
        const oldDapPath = await setStandardDapPath(standardDap);
        const output = mockOutput();
        const originalErrorMessage = vscode.window.showErrorMessage;
        (vscode.window as any).showErrorMessage = async () => undefined;
        try {
            const factory = new LabwiredDebugAdapterDescriptorFactory({ extensionPath: root } as any, output.channel as any);
            await assert.rejects(factory.createDebugAdapterDescriptor({
                workspaceFolder: { uri: vscode.Uri.file(root) },
                configuration: { type: 'labwired' },
            } as any, undefined), /exit code 3/);

            assert.ok(output.wasShown());
            assert.ok(output.lines.join('').includes('fresh build failed'));
        } finally {
            (vscode.window as any).showErrorMessage = originalErrorMessage;
            await restoreStandardDapPath(oldDapPath);
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    test('launches a configured prebuilt custom DAP without running a build', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lw-prebuilt-dap-'));
        const configDir = path.join(root, '.labwired');
        fs.mkdirSync(configDir, { recursive: true });
        const executable = path.join(root, 'custom-dap');
        fs.writeFileSync(executable, '#!/usr/bin/env node\nprocess.exit(0);\n');
        fs.chmodSync(executable, 0o755);
        fs.writeFileSync(path.join(configDir, 'lab.yaml'), yaml.dump({
            schema_version: '1.0',
            inputs: {},
            debug: { adapter: { executable: '../custom-dap' } },
        }));
        const standardDap = path.join(root, 'standard-dap');
        fs.writeFileSync(standardDap, 'standard');
        const oldDapPath = await setStandardDapPath(standardDap);
        try {
            const factory = new LabwiredDebugAdapterDescriptorFactory({ extensionPath: root } as any, mockOutput().channel as any);
            const descriptor = await factory.createDebugAdapterDescriptor({
                workspaceFolder: { uri: vscode.Uri.file(root) },
                configuration: { type: 'labwired' },
            } as any, undefined);

            assert.strictEqual(
                normalizePathForComparison((descriptor as vscode.DebugAdapterExecutable).command),
                normalizePathForComparison(executable),
            );
        } finally {
            await restoreStandardDapPath(oldDapPath);
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    test('keeps the standard DAP fallback when the model profile has no custom adapter', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lw-standard-dap-'));
        const configDir = path.join(root, '.labwired');
        fs.mkdirSync(configDir, { recursive: true });
        fs.writeFileSync(path.join(configDir, 'lab.yaml'), yaml.dump({ schema_version: '1.0', inputs: {} }));
        const standardDap = path.join(root, 'standard-dap');
        fs.writeFileSync(standardDap, 'standard');
        const oldDapPath = await setStandardDapPath(standardDap);
        try {
            const factory = new LabwiredDebugAdapterDescriptorFactory({ extensionPath: root } as any, mockOutput().channel as any);
            const descriptor = await factory.createDebugAdapterDescriptor({
                workspaceFolder: { uri: vscode.Uri.file(root) },
                configuration: { type: 'labwired' },
            } as any, undefined);

            assert.strictEqual((descriptor as vscode.DebugAdapterExecutable).command, standardDap);
        } finally {
            await restoreStandardDapPath(oldDapPath);
            fs.rmSync(root, { recursive: true, force: true });
        }
    });
});
