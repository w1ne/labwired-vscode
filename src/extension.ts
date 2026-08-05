// LabWired - Firmware Simulation Platform
// Copyright (C) 2026 Andrii Shylenko
//
// This software is released under the MIT License.
// See the LICENSE file in the project root for full license information.

import * as vscode from 'vscode';
import * as path from 'path';
import { LabwiredCommandCenterProvider } from './commandCenter';
import { TimelinePanel } from './timeline';
import { PeripheralProvider } from './peripheralProvider';
import { RTOSProvider } from './rtosProvider';
import { GraphingPanel } from './graphing_panel';
import { DockerManager } from './docker';
import { MemoryInspectorPanel } from './memoryInspector';
import { TraceListPanel } from './traceList';
import { ProfilingPanel } from './profilingPanel';
import { SimulatorManager } from './simulatorManager';
import { SystemTopologyPanel } from './topologyPanel';
import { SimulatorViewProvider } from './simulatorView';
import { showConfigWizard } from './configWizard';
import { resolveCli, resolveDap, runTest } from './cli';
import { findLabConfig, readLabConfig, migrateLabConfig } from './labConfig';
import { bestFirmware } from './firmware';
import { RegistersPanel } from './registersPanel';
import { LabwiredAuthProvider, AUTH_ID, AUTH_LABEL, SCOPES } from './auth';
import { configureAgentTools, copyClaudeMcpLine } from './mcpSetup';
import { startOpenCodeAgent, copyAgentInstallCommand } from './openCodeAgent';

type DebugEventLike = {
    session: { type: string };
    event: string;
    body?: any;
};

type DebugEventDeps = {
    simulatorManager: Pick<SimulatorManager, 'status' | 'syncDebugSessionStatus'>;
    commandCenterProvider: Pick<LabwiredCommandCenterProvider, 'updateTelemetry' | 'markUartActivity' | 'appendUartOutput'>;
    graphingPanel: Pick<GraphingPanel, 'updateSignals'>;
    peripheralProvider: Pick<PeripheralProvider, 'refresh'>;
    rtosProvider: Pick<RTOSProvider, 'refresh'>;
    memoryInspectorPanel: Pick<MemoryInspectorPanel, 'refresh'>;
    registersPanel: Pick<RegistersPanel, 'refresh'>;
    traceListPanel: Pick<TraceListPanel, 'refresh'>;
    profilingPanel: Pick<ProfilingPanel, 'refresh'>;
    outputChannel: Pick<vscode.OutputChannel, 'appendLine'>;
    sendTopologyTelemetry: (telemetry: any) => void;
};

export function handleLabwiredDebugEvent(e: DebugEventLike, deps: DebugEventDeps) {
    if (e.session.type !== 'labwired') {
        return;
    }

    if (e.event === 'telemetry') {
        const telemetry = { ...(e.body || {}), status: deps.simulatorManager.status };
        deps.commandCenterProvider.updateTelemetry(telemetry);
        deps.sendTopologyTelemetry(telemetry);
        if (e.body?.signals) {
            deps.graphingPanel.updateSignals(e.body.signals);
        }
        return;
    }

    if (e.event === 'uart') {
        const payload = e.body as { output?: unknown } | undefined;
        const output = typeof payload?.output === 'string'
            ? payload.output
            : String(payload?.output ?? '');
        if (output.length > 0) {
            deps.outputChannel.appendLine(output);
            deps.commandCenterProvider.markUartActivity();
            deps.commandCenterProvider.appendUartOutput(output);
        }
        return;
    }

    if (e.event === 'output') {
        const body = e.body || {};
        if (body.category === 'stdout' || body.category === 'stderr') {
            const output = typeof body.output === 'string' ? body.output : String(body.output ?? '');
            if (output.length > 0) {
                deps.outputChannel.appendLine(output);
                deps.commandCenterProvider.markUartActivity();
                deps.commandCenterProvider.appendUartOutput(output);
            }
        }
        return;
    }

    if (e.event === 'continued') {
        deps.simulatorManager.syncDebugSessionStatus(true);
        deps.peripheralProvider.refresh();
        deps.rtosProvider.refresh();
        deps.memoryInspectorPanel.refresh();
        deps.registersPanel.refresh();
        deps.traceListPanel.refresh();
        deps.profilingPanel.refresh();
        return;
    }

    if (e.event === 'stopped') {
        deps.simulatorManager.syncDebugSessionStatus(false);
        deps.peripheralProvider.refresh();
        deps.rtosProvider.refresh();
        deps.memoryInspectorPanel.refresh();
        deps.registersPanel.refresh();
        deps.traceListPanel.refresh();
        deps.profilingPanel.refresh();
    }
}


export class LabwiredConfigurationProvider implements vscode.DebugConfigurationProvider {
    constructor(
        private readonly output: vscode.OutputChannel,
        private readonly cpModule: any = require('child_process'),
        private readonly checkFile: (p: string) => Promise<boolean> = fileExists
    ) { }

    /**
     * What F5 launches when the workspace has no `launch.json`.
     *
     * Without this, VS Code drops the user into the "select a debug
     * configuration" picker and then writes a launch.json they have to fill in
     * by hand. Everything here is resolved for real in
     * `resolveDebugConfiguration`, so the config can stay empty of paths.
     */
    provideDebugConfigurations(_folder: vscode.WorkspaceFolder | undefined): vscode.DebugConfiguration[] {
        return [
            {
                type: 'labwired',
                request: 'launch',
                name: 'LabWired: Debug firmware',
                // No `program`: resolveDebugConfiguration fills it from
                // .labwired/lab.yaml, or by finding the built ELF.
                stopOnEntry: true,
            },
        ];
    }

    async resolveDebugConfiguration(folder: vscode.WorkspaceFolder | undefined, config: vscode.DebugConfiguration, token?: vscode.CancellationToken): Promise<vscode.DebugConfiguration | undefined> {
        this.output.appendLine(`LabWired: Resolving debug configuration...`);

        if (!config.type && !config.request && !config.name) {
            // This is a "stub" config from an empty launch.json or no launch.json
            config.type = 'labwired';
            config.name = 'LabWired: Launch';
            config.request = 'launch';
            config.stopOnEntry = false;
        }

        // Default program + systemConfig from the one-file contract (.labwired/lab.yaml).
        const labRoot = folder?.uri.fsPath;
        if (labRoot) {
            const labConfigPath = findLabConfig(labRoot);
            if (labConfigPath) {
                const labDir = path.join(labRoot, '.labwired');
                try {
                    const lab = readLabConfig(labConfigPath);
                    if (!config.program && lab.inputs?.firmware) {
                        config.program = path.resolve(labDir, lab.inputs.firmware);
                        this.output.appendLine(`LabWired: Program from lab.yaml: ${config.program}`);
                    }
                    if (!config.systemConfig && lab.inputs?.system) {
                        config.systemConfig = path.resolve(labDir, lab.inputs.system);
                        this.output.appendLine(`LabWired: System config from lab.yaml: ${config.systemConfig}`);
                    }
                } catch (e) {
                    this.output.appendLine(`LabWired: Failed to read lab.yaml: ${e}`);
                }
            }
        }

        const rootPath = folder?.uri.fsPath;
        if (typeof config.program === 'string') {
            config.program = resolveDebugPath(config.program, rootPath);
        }
        if (typeof config.systemConfig === 'string') {
            config.systemConfig = resolveDebugPath(config.systemConfig, rootPath);
        }
        if (typeof config.mcuConfig === 'string') {
            config.mcuConfig = resolveDebugPath(config.mcuConfig, rootPath);
        }
        if (typeof config.cwd === 'string') {
            config.cwd = resolveDebugPath(config.cwd, rootPath);
        }

        // Nothing named a firmware — find the built ELF rather than making the
        // user write one out. This is what lets F5 work in a project that has
        // been built but never configured for LabWired.
        if (!config.program && rootPath) {
            const found = bestFirmware(rootPath);
            if (found) {
                config.program = found.path;
                this.output.appendLine(`LabWired: Using firmware from ${found.origin}: ${found.path}`);
            }
        }

        if (!config.program || !await this.checkFile(config.program)) {
            this.output.appendLine('LabWired: no firmware found to debug.');
            // Deliberately NOT awaited. Awaiting would hold the launch open until
            // the user clicks something — the session should abort now, and the
            // offer to fix it is an aside, not a gate.
            void vscode.window
                .showErrorMessage(
                    'LabWired: no built firmware found. Build the project first, or set it up so LabWired knows which ELF to run.',
                    'Set up LabWired',
                    'Open Output'
                )
                .then((choice) => {
                    if (choice === 'Set up LabWired') {
                        return vscode.commands.executeCommand('labwired.configureProject');
                    }
                    if (choice === 'Open Output') {
                        this.output.show();
                    }
                    return undefined;
                });
            return undefined; // abort launch
        }

        // Auto-detect Rust source for standard library to avoid "File not found" errors
        try {
            const sysroot = this.cpModule.execSync('rustc --print sysroot').toString().trim();
            const hashMatch = this.cpModule.execSync('rustc -vV').toString().match(/commit-hash:\s+([0-9a-f]+)/);

            if (hashMatch) {
                const hash = hashMatch[1];
                if (!config.sourceMap) {
                    config.sourceMap = {};
                }
                const rustSrcPath = path.join(sysroot, 'lib', 'rustlib', 'src', 'rust', 'library');
                config.sourceMap[`/rustc/${hash}/library`] = rustSrcPath;
                this.output.appendLine(`LabWired: Mapped Rust source ${hash} to ${rustSrcPath}`);
            }
        } catch (e) {
            // Silent catch to ensure debugger still starts even if rustc isn't in path
            this.output.appendLine(`LabWired: Could not auto-map Rust source: ${e}`);
        }

        this.output.appendLine(`LabWired: Launching ${config.program}`);
        return config;
    }
}

export class LabwiredDebugAdapterDescriptorFactory implements vscode.DebugAdapterDescriptorFactory {
    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly output: vscode.OutputChannel
    ) { }

    async createDebugAdapterDescriptor(session: vscode.DebugSession, executable: vscode.DebugAdapterExecutable | undefined): Promise<vscode.DebugAdapterDescriptor> {
        this.output.appendLine("LabWired: Creating Debug Adapter Descriptor...");

        // 1. Check User Config
        const config = vscode.workspace.getConfiguration('labwired');
        const executionMode = config.get<string>('executionMode') || 'local';

        if (executionMode === 'docker') {
            const dockerImage = config.get<string>('docker.image') || 'w1ne/labwired-dev:latest';
            const dockerArgs = config.get<string[]>('docker.runArgs') || [];
            const dockerManager = new DockerManager(this.output);

            const workspaceFolder = session.workspaceFolder;
            if (!workspaceFolder) {
                throw new Error("Debugging in Docker requires an open workspace.");
            }

            // Ensure image exists
            if (!await dockerManager.imageExists(dockerImage)) {
                const selection = await vscode.window.showErrorMessage(`Docker image '${dockerImage}' not found. Pull it now?`, 'Yes', 'No');
                if (selection === 'Yes') {
                    await dockerManager.pullImage(dockerImage);
                } else {
                    throw new Error("Docker image missing.");
                }
            }

            this.output.appendLine(`LabWired: Starting DAP in Docker container (${dockerImage})...`);

            const args = dockerManager.getDapArgs(dockerImage, workspaceFolder.uri.fsPath, dockerArgs);
            // The first arg is 'run', but DebugAdapterExecutable expects the command as first arg.
            // Actually, we want to run 'docker'.
            return new vscode.DebugAdapterExecutable('docker', args);
        }

        // Same cascade the CLI uses: setting → bundled → PATH → downloaded
        // release. `labwired-dap` ships in the same tarball as `labwired`, so a
        // user who has run anything already has it.
        let dapPath: string;
        try {
            dapPath = await resolveDap(this.context, this.output);
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            vscode.window.showErrorMessage(`LabWired: could not find the debug adapter. ${message}`);
            throw e;
        }

        this.output.appendLine(`LabWired: Using DAP binary at ${dapPath}`);

        return new vscode.DebugAdapterExecutable(dapPath, []);
    }
}

export function activate(context: vscode.ExtensionContext) {
    const outputChannel = vscode.window.createOutputChannel("LabWired");
    context.subscriptions.push(outputChannel);
    outputChannel.appendLine("LabWired Activated.");

    // Optional LabWired sign-in (OAuth). Purely for HOSTED extras — running the
    // simulator locally is free and never requires this. Note: OAuth tokens here
    // are Clerk JWTs, NOT `lwk_live_` CLI keys, so they are deliberately never
    // wired into the local run path below.
    const authProvider = new LabwiredAuthProvider(context, outputChannel);
    context.subscriptions.push(authProvider);
    context.subscriptions.push(authProvider.uriHandlerRegistration);
    context.subscriptions.push(
        vscode.authentication.registerAuthenticationProvider(AUTH_ID, AUTH_LABEL, authProvider, {
            supportsMultipleAccounts: false,
        })
    );

    const authStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    context.subscriptions.push(authStatusBar);
    const renderAuthStatus = (session: vscode.AuthenticationSession | undefined) => {
        if (session) {
            authStatusBar.text = `$(account) LabWired · ${session.account.label}`;
            authStatusBar.tooltip = 'Signed in — click to sign out. Use “Configure Agent Tools” for MCP.';
            authStatusBar.command = 'labwired.signOut';
        } else {
            authStatusBar.text = '$(account) LabWired';
            authStatusBar.tooltip = 'Sign in for hosted agent tools (optional — local debug stays free)';
            authStatusBar.command = 'labwired.signIn';
        }
        authStatusBar.show();
    };
    const refreshAuthStatus = async () => {
        const session = await vscode.authentication.getSession(AUTH_ID, SCOPES, { createIfNone: false });
        renderAuthStatus(session);
    };
    context.subscriptions.push(authProvider.onDidChangeSessions(() => { void refreshAuthStatus(); }));
    void refreshAuthStatus();

    context.subscriptions.push(vscode.commands.registerCommand('labwired.signIn', async () => {
        try {
            const session = await vscode.authentication.getSession(AUTH_ID, SCOPES, { createIfNone: true });
            if (session) {
                const next = await vscode.window.showInformationMessage(
                    `Signed in to LabWired as ${session.account.label}`,
                    'Configure Agent Tools'
                );
                if (next === 'Configure Agent Tools') {
                    await configureAgentTools(outputChannel);
                }
            }
        } catch (e) {
            vscode.window.showErrorMessage(`LabWired: Sign-in failed: ${e instanceof Error ? e.message : e}`);
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('labwired.signOut', async () => {
        const session = await vscode.authentication.getSession(AUTH_ID, SCOPES, { createIfNone: false });
        if (!session) {
            vscode.window.showInformationMessage('LabWired: Not signed in.');
            return;
        }
        await authProvider.removeSession(session.id);
        vscode.window.showInformationMessage('Signed out of LabWired');
    }));

    context.subscriptions.push(vscode.commands.registerCommand('labwired.configureAgentTools', async () => {
        try {
            await configureAgentTools(outputChannel);
        } catch (e) {
            vscode.window.showErrorMessage(`LabWired: Configure agent tools failed: ${e instanceof Error ? e.message : e}`);
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('labwired.copyClaudeMcpInstall', async () => {
        await copyClaudeMcpLine();
    }));

    context.subscriptions.push(vscode.commands.registerCommand('labwired.startOpenCodeAgent', async () => {
        try {
            await startOpenCodeAgent(outputChannel);
        } catch (e) {
            vscode.window.showErrorMessage(`LabWired: Start OpenCode Agent failed: ${e instanceof Error ? e.message : e}`);
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('labwired.copyAgentInstall', async () => {
        await copyAgentInstallCommand();
    }));

    // Simulator Management
    const simulatorManager = new SimulatorManager(outputChannel);
    const simulatorViewProvider = new SimulatorViewProvider(simulatorManager);
    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('labwired.simulator', simulatorViewProvider)
    );
    context.subscriptions.push(vscode.debug.onDidStartDebugSession((session) => {
        if (session.type === 'labwired') {
            simulatorManager.syncDebugSessionStatus(true);
        }
    }));
    context.subscriptions.push(vscode.debug.onDidTerminateDebugSession((session) => {
        if (session.type === 'labwired') {
            simulatorManager.syncDebugSessionStatus(false);
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('labwired.startSimulator', async () => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) return;

        const activeSession = vscode.debug.activeDebugSession;
        const baseConfig = activeSession?.type === 'labwired' ? activeSession.configuration : undefined;
        const debugConfig: vscode.DebugConfiguration = baseConfig
            ? { ...baseConfig, type: 'labwired', request: 'launch', stopOnEntry: false }
            : {
                name: 'LabWired: Launch',
                type: 'labwired',
                request: 'launch',
                stopOnEntry: false
            };

        const started = await vscode.debug.startDebugging(workspaceFolders[0], debugConfig);
        if (!started) {
            vscode.window.showErrorMessage('LabWired: Failed to start debug session.');
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('labwired.stopSimulator', async () => {
        const activeSession = vscode.debug.activeDebugSession;
        if (activeSession && activeSession.type === 'labwired') {
            await vscode.debug.stopDebugging(activeSession);
        }
        simulatorManager.stop();
    }));

    context.subscriptions.push(vscode.commands.registerCommand('labwired.restartSimulator', async () => {
        const activeSession = vscode.debug.activeDebugSession;
        if (activeSession && activeSession.type === 'labwired') {
            await vscode.commands.executeCommand('workbench.action.debug.restart');
            return;
        }

        await vscode.commands.executeCommand('labwired.startSimulator');
    }));

    context.subscriptions.push(vscode.commands.registerCommand('labwired.configureProject', async () => {
        await showConfigWizard();
    }));

    context.subscriptions.push(vscode.commands.registerCommand('labwired.importSvd', async () => {
        // Dynamic import to avoid circular dependencies if any, though explicit import is better
        const { importSvdWizard } = require('./configWizard');
        await importSvdWizard();
    }));

    const uiConfig = vscode.workspace.getConfiguration('labwired');
    const demoUiMode = (uiConfig.get<string>('demoUi.mode') || 'auto').toLowerCase();
    const demoUiEnabled = demoUiMode === 'on'
        || (demoUiMode === 'auto' && context.extensionMode === vscode.ExtensionMode.Development);

    const commandCenterProvider = new LabwiredCommandCenterProvider(context.extensionUri, demoUiEnabled);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(LabwiredCommandCenterProvider.viewType, commandCenterProvider)
    );
    context.subscriptions.push(
        simulatorManager.onStatusChanged((status) => {
            commandCenterProvider.updateStatus(status);
        })
    );

    // Timeline Panel
    const timelinePanel = new TimelinePanel(context);
    context.subscriptions.push(
        vscode.commands.registerCommand('labwired.showTimeline', () => {
            timelinePanel.show();
        }),
        vscode.commands.registerCommand('labwired.showTopology', () => {
            SystemTopologyPanel.createOrShow(context.extensionUri);
        })
    );

    // Peripheral Tree View
    const peripheralProvider = new PeripheralProvider();
    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('labwired.peripherals', peripheralProvider),
        vscode.commands.registerCommand('labwired.refreshPeripherals', () => peripheralProvider.refresh())
    );

    // RTOS Task View
    const rtosProvider = new RTOSProvider();
    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('labwired.rtos_tasks', rtosProvider),
        vscode.commands.registerCommand('labwired.refreshRTOS', () => rtosProvider.refresh())
    );

    // Graphing Panel
    const graphingPanel = new GraphingPanel(context);
    context.subscriptions.push(
        vscode.commands.registerCommand('labwired.showGraphing', () => {
            graphingPanel.show();
        })
    );

    // Memory Inspector Panel
    const memoryInspectorPanel = new MemoryInspectorPanel(context);
    context.subscriptions.push(
        vscode.commands.registerCommand('labwired.showMemoryInspector', () => {
            memoryInspectorPanel.show();
        })
    );

    // Trace List Panel
    const traceListPanel = new TraceListPanel(context);
    context.subscriptions.push(
        vscode.commands.registerCommand('labwired.showTraceList', () => {
            traceListPanel.show();
        })
    );

    // Registers Panel — CPU core registers + decoded peripheral registers.
    const registersPanel = new RegistersPanel(context);
    context.subscriptions.push(
        vscode.commands.registerCommand('labwired.showRegisters', () => {
            void registersPanel.show();
        })
    );

    // Profiling Panel
    const profilingPanel = new ProfilingPanel(context);
    context.subscriptions.push(
        vscode.commands.registerCommand('labwired.showProfiling', () => {
            profilingPanel.show();
        })
    );

    const factory = new LabwiredConfigurationProvider(outputChannel);
    context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('labwired', factory));

    const adapterFactory = new LabwiredDebugAdapterDescriptorFactory(context, outputChannel);
    context.subscriptions.push(vscode.debug.registerDebugAdapterDescriptorFactory('labwired', adapterFactory));

    // Handle Telemetry and UI Sync
    const handleEvent = (e: DebugEventLike) => handleLabwiredDebugEvent(e, {
        simulatorManager,
        commandCenterProvider,
        graphingPanel,
        peripheralProvider,
        rtosProvider,
        memoryInspectorPanel,
        registersPanel,
        traceListPanel,
        profilingPanel,
        outputChannel,
        sendTopologyTelemetry: (telemetry: any) => {
            if (SystemTopologyPanel.currentPanel) {
                SystemTopologyPanel.currentPanel.sendTelemetry(telemetry);
            }
        }
    });

    context.subscriptions.push(vscode.debug.onDidReceiveDebugSessionCustomEvent(e => {
        if (e.event === 'output') {
            return;
        }
        handleEvent(e);
    }));

    // Handle standard output events for high-fidelity logging
    context.subscriptions.push(vscode.debug.onDidReceiveDebugSessionCustomEvent(e => {
        if (e.event !== 'output') {
            return;
        }
        handleEvent(e);
    }));

    // Register Compile and Run command
    context.subscriptions.push(vscode.commands.registerCommand('labwired.compileAndRun', async () => {
        try {
            commandCenterProvider.clearUartOutput();
            await compileAndRun(context, outputChannel, simulatorManager);
        } catch (e) {
            vscode.window.showErrorMessage(`LabWired: Compile and Run failed: ${e}`);
            outputChannel.appendLine(`ERROR: ${e}`);
        }
    }));



    // Check Docker Image on Startup if needed
    const config = vscode.workspace.getConfiguration('labwired');
    if (config.get<string>('executionMode') === 'docker' && config.get<boolean>('docker.autoPull')) {
        const image = config.get<string>('docker.image') || 'w1ne/labwired-dev:latest';
        const dockerManager = new DockerManager(outputChannel);
        dockerManager.imageExists(image).then(exists => {
            if (!exists) {
                vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: `LabWired: Pulling Docker image ${image}...`,
                    cancellable: false
                }, async () => {
                    try {
                        await dockerManager.pullImage(image);
                        vscode.window.showInformationMessage(`LabWired: Docker image ${image} ready.`);
                    } catch (e) {
                        vscode.window.showErrorMessage(`LabWired: Failed to pull Docker image: ${e}`);
                    }
                });
            }
        });
    }

    context.subscriptions.push(vscode.commands.registerCommand('labwired.showDashboard', () => {
        vscode.commands.executeCommand('labwired.commandCenter.focus');
    }));

    // Status Bar Items
    const runBtn = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    runBtn.command = 'labwired.compileAndRun';
    runBtn.text = '$(play) Run in LabWired';
    runBtn.tooltip = 'Build firmware and launch LabWired simulation';
    runBtn.show();
    context.subscriptions.push(runBtn);

    const dashboardBtn = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
    dashboardBtn.command = 'labwired.showDashboard';
    dashboardBtn.text = '$(dashboard) Command Center';
    dashboardBtn.tooltip = 'Show LabWired Command Center';
    dashboardBtn.show();
    context.subscriptions.push(dashboardBtn);
}

async function compileAndRun(context: vscode.ExtensionContext, outputChannel: vscode.OutputChannel, simulatorManager: SimulatorManager) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        throw new Error("No workspace folder open");
    }

    const rootPath = workspaceFolders[0].uri.fsPath;

    // 0. Stop simulator if running
    simulatorManager.stop();

    // 1. Detect project type. The build target triple comes from the project's own
    //    .cargo/config.toml (embedded default target) / Makefile — never hardcoded here.
    const hasCargo = await fileExists(path.join(rootPath, 'Cargo.toml'));
    const hasMakefile = await fileExists(path.join(rootPath, 'Makefile'));

    let buildCommand: string;
    let projectType: string;

    if (hasCargo) {
        projectType = 'Cargo';
        buildCommand = 'cargo build --release';
    } else if (hasMakefile) {
        projectType = 'Makefile';
        buildCommand = 'make';
    } else {
        throw new Error("Could not detect a supported project type (Cargo.toml or Makefile not found)");
    }

    // 2. Build
    outputChannel.show();

    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `LabWired: Building ${projectType} project...`,
        cancellable: false
    }, async (progress) => {
        progress.report({ message: "Running build command..." });
        return new Promise<void>((resolve, reject) => {
            const cp = require('child_process');
            cp.exec(buildCommand, { cwd: rootPath }, (err: any, stdout: string, stderr: string) => {
                outputChannel.append(stdout);
                outputChannel.append(stderr);
                if (err) {
                    reject(new Error(`Build failed. See LabWired output for details.`));
                } else {
                    resolve();
                }
            });
        });
    });

    // 3. Ensure the one-file contract exists (.labwired/lab.yaml).
    const migration = migrateLabConfig(rootPath);
    if (migration === 'none') {
        const choice = await vscode.window.showErrorMessage(
            'LabWired: No .labwired/lab.yaml found and nothing to migrate. Configure the project?',
            'Configure Project'
        );
        if (choice === 'Configure Project') {
            await vscode.commands.executeCommand('labwired.configureProject');
        }
        return;
    }

    const labConfigPath = path.join(rootPath, '.labwired', 'lab.yaml');
    const labDir = path.join(rootPath, '.labwired');
    const outputDir = path.join(labDir, 'out');

    // The freshly built binary is whatever lab.yaml names as inputs.firmware.
    // Pass it explicitly as --firmware so a rebuild is always what runs.
    let firmware: string | undefined;
    try {
        const lab = readLabConfig(labConfigPath);
        if (lab.inputs?.firmware) {
            firmware = path.resolve(labDir, lab.inputs.firmware);
        }
    } catch (e) {
        outputChannel.appendLine(`LabWired: Failed to read lab.yaml: ${e}`);
    }

    // 4. Run the SAME command CI runs: labwired test --script <lab.yaml> ...
    const cli = await resolveCli(context, outputChannel);
    const { exitCode, result } = await runTest(cli, {
        script: labConfigPath,
        cwd: rootPath,
        outputDir,
        firmware,
        apiKey: undefined,
    }, outputChannel);

    outputChannel.show();

    const status = result?.status;
    const passed = status ? status === 'pass' || status === 'passed' : exitCode === 0;
    if (passed) {
        vscode.window.showInformationMessage(`LabWired: Test passed (${status ?? `exit ${exitCode}`}).`);
    } else {
        vscode.window.showErrorMessage(`LabWired: Test failed (${status ?? `exit ${exitCode}`}). See LabWired output.`);
    }
}



async function fileExists(filePath: string): Promise<boolean> {
    try {
        await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
        return true;
    } catch {
        return false;
    }
}

function resolveDebugPath(template: string, workspaceRoot?: string): string {
    let resolved = template;
    const root = workspaceRoot || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';

    if (root) {
        resolved = resolved
            .replace(/\$\{workspaceFolder\}/g, root)
            .replace(/\$\{workspaceRoot\}/g, root)
            .replace(/\$\{workspaceFolderBasename\}/g, path.basename(root));
    }

    resolved = resolved.replace(/\$\{env:([^}]+)\}/g, (_m, name: string) => process.env[name] ?? '');
    resolved = resolved.replace(/\$\{pathSeparator\}/g, path.sep);

    if (root && !path.isAbsolute(resolved)) {
        resolved = path.resolve(root, resolved);
    }
    return resolved;
}

export function deactivate() {
}
