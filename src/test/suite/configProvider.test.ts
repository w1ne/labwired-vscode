import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { LabwiredConfigurationProvider } from '../../extension';

suite('LabwiredConfigurationProvider Test Suite', () => {
    let mockOutputChannel: any;
    let mockCpModule: any;
    let mockCheckFile: any;

    setup(() => {
        mockOutputChannel = {
            appendLine: (line: string) => console.log(line)
        };
        mockCpModule = {
            execSync: (cmd: string) => {
                if (cmd === 'rustc --print sysroot') return '/rust/sysroot';
                if (cmd === 'rustc -vV') return 'commit-hash: abcdef123';
                return '';
            }
        };
        mockCheckFile = async (p: string) => true;
    });

    test('resolveDebugConfiguration sets defaults and derives program/systemConfig from .labwired/lab.yaml', async () => {
        // New contract: an empty launch config gets its program + systemConfig from
        // the one-file .labwired/lab.yaml — no hardcoded target-triple guess.
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lw-cfg-'));
        fs.mkdirSync(path.join(tmp, '.labwired'), { recursive: true });
        fs.writeFileSync(
            path.join(tmp, '.labwired', 'lab.yaml'),
            'schema_version: "1.0"\ninputs:\n  firmware: ../target/firmware\n  system: ../system.yaml\n'
        );
        try {
            const provider = new LabwiredConfigurationProvider(mockOutputChannel, mockCpModule, mockCheckFile);
            const config: vscode.DebugConfiguration = { type: '', name: '', request: '' };
            const mockFolder = { uri: vscode.Uri.file(tmp), name: 'mock', index: 0 } as vscode.WorkspaceFolder;

            const resolved = await provider.resolveDebugConfiguration(mockFolder, config);
            assert.strictEqual(resolved?.type, 'labwired');
            assert.strictEqual(resolved?.name, 'LabWired: Launch');
            assert.strictEqual(resolved?.request, 'launch');
            assert.strictEqual(resolved?.stopOnEntry, false);
            assert.ok(resolved?.program.includes('firmware'));
            assert.ok(resolved?.systemConfig.includes('system.yaml'));
        } finally {
            fs.rmSync(tmp, { recursive: true, force: true });
        }
    });

    test('resolveDebugConfiguration returns undefined when no program and no lab.yaml', async () => {
        // Honest behavior: without a lab.yaml we no longer invent a hardcoded firmware path.
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lw-cfg-empty-'));
        try {
            const provider = new LabwiredConfigurationProvider(mockOutputChannel, mockCpModule, mockCheckFile);
            const config: vscode.DebugConfiguration = { type: '', name: '', request: '' };
            const mockFolder = { uri: vscode.Uri.file(tmp), name: 'mock', index: 0 } as vscode.WorkspaceFolder;

            const resolved = await provider.resolveDebugConfiguration(mockFolder, config);
            assert.strictEqual(resolved, undefined);
        } finally {
            fs.rmSync(tmp, { recursive: true, force: true });
        }
    });

    test('resolveDebugConfiguration offers Configure Model when no system profile is selected', async () => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lw-cfg-no-system-'));
        const firmware = path.join(tmp, 'firmware.elf');
        fs.writeFileSync(firmware, 'firmware');
        const originalErrorMessage = vscode.window.showErrorMessage;
        let prompt = '';
        let actions: string[] = [];
        try {
            (vscode.window as any).showErrorMessage = async (message: string, ...items: string[]) => {
                prompt = message;
                actions = items;
                return undefined;
            };
            const provider = new LabwiredConfigurationProvider(mockOutputChannel, mockCpModule, async () => true);
            const config: vscode.DebugConfiguration = {
                type: 'labwired', name: 'missing model profile', request: 'launch', program: firmware,
            };
            const mockFolder = { uri: vscode.Uri.file(tmp), name: 'mock', index: 0 } as vscode.WorkspaceFolder;

            const resolved = await provider.resolveDebugConfiguration(mockFolder, config);

            assert.strictEqual(resolved, undefined);
            assert.match(prompt, /model system YAML/i);
            assert.ok(actions.includes('Configure Model'));
        } finally {
            (vscode.window as any).showErrorMessage = originalErrorMessage;
            fs.rmSync(tmp, { recursive: true, force: true });
        }
    });

    test('resolveDebugConfiguration should auto-map Rust source', async () => {
        const provider = new LabwiredConfigurationProvider(mockOutputChannel, mockCpModule, mockCheckFile);
        const config: vscode.DebugConfiguration = {
            type: 'labwired',
            name: 'test',
            request: 'launch',
            program: '/path/to/firmware'
        };

        const resolved = await provider.resolveDebugConfiguration(undefined, config);
        assert.ok(resolved?.sourceMap);
        assert.strictEqual(resolved?.sourceMap['/rustc/abcdef123/library'], path.join('/rust/sysroot', 'lib', 'rustlib', 'src', 'rust', 'library'));
    });

    test('resolveDebugConfiguration should fail if program missing', async () => {
        mockCheckFile = async (p: string) => false;
        const provider = new LabwiredConfigurationProvider(mockOutputChannel, mockCpModule, mockCheckFile);
        const config: vscode.DebugConfiguration = {
            type: 'labwired',
            name: 'test',
            request: 'launch',
            program: '/missing/program'
        };

        const resolved = await provider.resolveDebugConfiguration(undefined, config);
        assert.strictEqual(resolved, undefined);
    });
});
