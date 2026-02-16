import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';

suite('DAP E2E Test Suite', function () {
    this.timeout(60000); // E2E tests can be slow

    test('Should launch and stop at entry', async () => {
        const root = path.resolve(__dirname, '../../../../');
        const dapPath = process.env.LABWIRED_DAP_BIN || path.join(root, 'core/target/release/labwired-dap');
        const firmwarePath = path.join(root, 'core/target/thumbv7m-none-eabi/release/demo-blinky');

        // We need to ensure the extension is active
        const ext = vscode.extensions.getExtension('w1ne.labwired-vscode');
        assert.ok(ext, 'Extension not found');
        await ext.activate();

        // Update configuration for the test
        const config = vscode.workspace.getConfiguration('labwired');
        await config.update('dapPath', dapPath, vscode.ConfigurationTarget.Global);

        const debugConfig: vscode.DebugConfiguration = {
            type: 'labwired',
            name: 'E2E Test Launch',
            request: 'launch',
            program: firmwarePath,
            stopOnEntry: true,
            trace: true
        };

        let sessionStarted = false;
        let sessionTerminated = false;
        let stoppedEventReceived = false;

        const startDisposable = vscode.debug.onDidStartDebugSession(s => {
            if (s.name === debugConfig.name) {
                sessionStarted = true;
            }
        });

        const stopDisposable = vscode.debug.onDidTerminateDebugSession(s => {
            if (s.name === debugConfig.name) {
                sessionTerminated = true;
            }
        });

        // We can't easily listen to custom events via vscode.debug API for 'stopped' 
        // without a custom DebugAdapterTracker.

        const trackerDisposable = vscode.debug.registerDebugAdapterTrackerFactory('labwired', {
            createDebugAdapterTracker(session: vscode.DebugSession) {
                return {
                    onDidSendMessage: m => {
                        if (m.type === 'event' && m.event === 'stopped') {
                            stoppedEventReceived = true;
                        }
                    }
                };
            }
        });

        const started = await vscode.debug.startDebugging(undefined, debugConfig);
        assert.ok(started, 'Failed to start debugging');

        // Wait for stopped event
        let attempts = 0;
        while (!stoppedEventReceived && attempts < 100) {
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }

        assert.ok(sessionStarted, 'Debug session did not start');
        assert.ok(stoppedEventReceived, 'Did not receive stopped event');

        // Cleanup
        await vscode.debug.stopDebugging();

        startDisposable.dispose();
        stopDisposable.dispose();
        trackerDisposable.dispose();
    });
});
