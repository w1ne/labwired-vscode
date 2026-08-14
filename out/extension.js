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
exports.deactivate = exports.activate = exports.LabwiredDebugAdapterDescriptorFactory = exports.LabwiredConfigurationProvider = exports.handleLabwiredDebugEvent = void 0;
const vscode = require("vscode");
const path = require("path");
const commandCenter_1 = require("./commandCenter");
const timeline_1 = require("./timeline");
const peripheralProvider_1 = require("./peripheralProvider");
const rtosProvider_1 = require("./rtosProvider");
const graphing_panel_1 = require("./graphing_panel");
const docker_1 = require("./docker");
const memoryInspector_1 = require("./memoryInspector");
const traceList_1 = require("./traceList");
const profilingPanel_1 = require("./profilingPanel");
const simulatorManager_1 = require("./simulatorManager");
const topologyPanel_1 = require("./topologyPanel");
const simulatorView_1 = require("./simulatorView");
const configWizard_1 = require("./configWizard");
const cli_1 = require("./cli");
const crashReport_1 = require("./crashReport");
const labConfig_1 = require("./labConfig");
const firmware_1 = require("./firmware");
const registersPanel_1 = require("./registersPanel");
const auth_1 = require("./auth");
const mcpSetup_1 = require("./mcpSetup");
const openCodeAgent_1 = require("./openCodeAgent");
function handleLabwiredDebugEvent(e, deps) {
    var _a, _b, _c;
    if (e.session.type !== 'labwired') {
        return;
    }
    if (e.event === 'telemetry') {
        const telemetry = Object.assign(Object.assign({}, (e.body || {})), { status: deps.simulatorManager.status });
        deps.commandCenterProvider.updateTelemetry(telemetry);
        deps.sendTopologyTelemetry(telemetry);
        if ((_a = e.body) === null || _a === void 0 ? void 0 : _a.signals) {
            deps.graphingPanel.updateSignals(e.body.signals);
        }
        return;
    }
    if (e.event === 'uart') {
        const payload = e.body;
        const output = typeof (payload === null || payload === void 0 ? void 0 : payload.output) === 'string'
            ? payload.output
            : String((_b = payload === null || payload === void 0 ? void 0 : payload.output) !== null && _b !== void 0 ? _b : '');
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
            const output = typeof body.output === 'string' ? body.output : String((_c = body.output) !== null && _c !== void 0 ? _c : '');
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
exports.handleLabwiredDebugEvent = handleLabwiredDebugEvent;
class LabwiredConfigurationProvider {
    constructor(output, cpModule = require('child_process'), checkFile = fileExists) {
        this.output = output;
        this.cpModule = cpModule;
        this.checkFile = checkFile;
    }
    /**
     * What F5 launches when the workspace has no `launch.json`.
     *
     * Without this, VS Code drops the user into the "select a debug
     * configuration" picker and then writes a launch.json they have to fill in
     * by hand. Everything here is resolved for real in
     * `resolveDebugConfiguration`, so the config can stay empty of paths.
     */
    provideDebugConfigurations(_folder) {
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
    resolveDebugConfiguration(folder, config, token) {
        var _a, _b;
        return __awaiter(this, void 0, void 0, function* () {
            this.output.appendLine(`LabWired: Resolving debug configuration...`);
            if (!config.type && !config.request && !config.name) {
                // This is a "stub" config from an empty launch.json or no launch.json
                config.type = 'labwired';
                config.name = 'LabWired: Launch';
                config.request = 'launch';
                config.stopOnEntry = false;
            }
            // Default program + systemConfig from the one-file contract (.labwired/lab.yaml).
            const labRoot = folder === null || folder === void 0 ? void 0 : folder.uri.fsPath;
            if (labRoot) {
                const labConfigPath = (0, labConfig_1.findLabConfig)(labRoot);
                if (labConfigPath) {
                    const labDir = path.join(labRoot, '.labwired');
                    try {
                        const lab = (0, labConfig_1.readLabConfig)(labConfigPath);
                        if (!config.program && ((_a = lab.inputs) === null || _a === void 0 ? void 0 : _a.firmware)) {
                            config.program = path.resolve(labDir, lab.inputs.firmware);
                            this.output.appendLine(`LabWired: Program from lab.yaml: ${config.program}`);
                        }
                        if (!config.systemConfig && ((_b = lab.inputs) === null || _b === void 0 ? void 0 : _b.system)) {
                            config.systemConfig = path.resolve(labDir, lab.inputs.system);
                            this.output.appendLine(`LabWired: System config from lab.yaml: ${config.systemConfig}`);
                        }
                    }
                    catch (e) {
                        this.output.appendLine(`LabWired: Failed to read lab.yaml: ${e}`);
                    }
                }
            }
            const rootPath = folder === null || folder === void 0 ? void 0 : folder.uri.fsPath;
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
                const found = (0, firmware_1.bestFirmware)(rootPath);
                if (found) {
                    config.program = found.path;
                    this.output.appendLine(`LabWired: Using firmware from ${found.origin}: ${found.path}`);
                }
            }
            if (!config.program || !(yield this.checkFile(config.program))) {
                this.output.appendLine('LabWired: no firmware found to debug.');
                // Deliberately NOT awaited. Awaiting would hold the launch open until
                // the user clicks something — the session should abort now, and the
                // offer to fix it is an aside, not a gate.
                void vscode.window
                    .showErrorMessage('LabWired: no built firmware found. Build the project first, or set it up so LabWired knows which ELF to run.', 'Set up LabWired', 'Open Output')
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
            }
            catch (e) {
                // Silent catch to ensure debugger still starts even if rustc isn't in path
                this.output.appendLine(`LabWired: Could not auto-map Rust source: ${e}`);
            }
            this.output.appendLine(`LabWired: Launching ${config.program}`);
            return config;
        });
    }
}
exports.LabwiredConfigurationProvider = LabwiredConfigurationProvider;
class LabwiredDebugAdapterDescriptorFactory {
    constructor(context, output) {
        this.context = context;
        this.output = output;
    }
    createDebugAdapterDescriptor(session, executable) {
        return __awaiter(this, void 0, void 0, function* () {
            this.output.appendLine("LabWired: Creating Debug Adapter Descriptor...");
            // 1. Check User Config
            const config = vscode.workspace.getConfiguration('labwired');
            const executionMode = config.get('executionMode') || 'local';
            if (executionMode === 'docker') {
                const dockerImage = config.get('docker.image') || 'w1ne/labwired-dev:latest';
                const dockerArgs = config.get('docker.runArgs') || [];
                const dockerManager = new docker_1.DockerManager(this.output);
                const workspaceFolder = session.workspaceFolder;
                if (!workspaceFolder) {
                    throw new Error("Debugging in Docker requires an open workspace.");
                }
                // Ensure image exists
                if (!(yield dockerManager.imageExists(dockerImage))) {
                    const selection = yield vscode.window.showErrorMessage(`Docker image '${dockerImage}' not found. Pull it now?`, 'Yes', 'No');
                    if (selection === 'Yes') {
                        yield dockerManager.pullImage(dockerImage);
                    }
                    else {
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
            let dapPath;
            try {
                dapPath = yield (0, cli_1.resolveDap)(this.context, this.output);
            }
            catch (e) {
                const message = e instanceof Error ? e.message : String(e);
                // The failure a user is least able to describe: F5 did nothing.
                (0, crashReport_1.reportCrash)(e, { stage: 'download', extensionVersion: extensionVersion(this.context) });
                vscode.window.showErrorMessage(`LabWired: could not find the debug adapter. ${message}`);
                throw e;
            }
            this.output.appendLine(`LabWired: Using DAP binary at ${dapPath}`);
            return new vscode.DebugAdapterExecutable(dapPath, []);
        });
    }
}
exports.LabwiredDebugAdapterDescriptorFactory = LabwiredDebugAdapterDescriptorFactory;
/** The version a report is attributed to; `unknown` rather than a guess. */
function extensionVersion(context) {
    var _a, _b;
    const version = (_b = (_a = context.extension) === null || _a === void 0 ? void 0 : _a.packageJSON) === null || _b === void 0 ? void 0 : _b.version;
    return typeof version === 'string' ? version : 'unknown';
}
function activate(context) {
    const outputChannel = vscode.window.createOutputChannel("LabWired");
    context.subscriptions.push(outputChannel);
    outputChannel.appendLine("LabWired Activated.");
    // Optional LabWired sign-in (OAuth). Purely for HOSTED extras — running the
    // simulator locally is free and never requires this. Note: OAuth tokens here
    // are Clerk JWTs, NOT `lwk_live_` CLI keys, so they are deliberately never
    // wired into the local run path below.
    const authProvider = new auth_1.LabwiredAuthProvider(context, outputChannel);
    context.subscriptions.push(authProvider);
    context.subscriptions.push(authProvider.uriHandlerRegistration);
    context.subscriptions.push(vscode.authentication.registerAuthenticationProvider(auth_1.AUTH_ID, auth_1.AUTH_LABEL, authProvider, {
        supportsMultipleAccounts: false,
    }));
    const authStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    context.subscriptions.push(authStatusBar);
    const renderAuthStatus = (session) => {
        if (session) {
            authStatusBar.text = `$(account) LabWired · ${session.account.label}`;
            authStatusBar.tooltip = 'Signed in — click to sign out. Use “Configure Agent Tools” for MCP.';
            authStatusBar.command = 'labwired.signOut';
        }
        else {
            authStatusBar.text = '$(account) LabWired';
            authStatusBar.tooltip = 'Sign in for hosted agent tools (optional — local debug stays free)';
            authStatusBar.command = 'labwired.signIn';
        }
        authStatusBar.show();
    };
    const refreshAuthStatus = () => __awaiter(this, void 0, void 0, function* () {
        const session = yield vscode.authentication.getSession(auth_1.AUTH_ID, auth_1.SCOPES, { createIfNone: false });
        renderAuthStatus(session);
    });
    context.subscriptions.push(authProvider.onDidChangeSessions(() => { void refreshAuthStatus(); }));
    void refreshAuthStatus();
    context.subscriptions.push(vscode.commands.registerCommand('labwired.signIn', () => __awaiter(this, void 0, void 0, function* () {
        try {
            const session = yield vscode.authentication.getSession(auth_1.AUTH_ID, auth_1.SCOPES, { createIfNone: true });
            if (session) {
                const next = yield vscode.window.showInformationMessage(`Signed in to LabWired as ${session.account.label}`, 'Configure Agent Tools');
                if (next === 'Configure Agent Tools') {
                    yield (0, mcpSetup_1.configureAgentTools)(outputChannel);
                }
            }
        }
        catch (e) {
            vscode.window.showErrorMessage(`LabWired: Sign-in failed: ${e instanceof Error ? e.message : e}`);
        }
    })));
    context.subscriptions.push(vscode.commands.registerCommand('labwired.signOut', () => __awaiter(this, void 0, void 0, function* () {
        const session = yield vscode.authentication.getSession(auth_1.AUTH_ID, auth_1.SCOPES, { createIfNone: false });
        if (!session) {
            vscode.window.showInformationMessage('LabWired: Not signed in.');
            return;
        }
        yield authProvider.removeSession(session.id);
        vscode.window.showInformationMessage('Signed out of LabWired');
    })));
    context.subscriptions.push(vscode.commands.registerCommand('labwired.configureAgentTools', () => __awaiter(this, void 0, void 0, function* () {
        try {
            yield (0, mcpSetup_1.configureAgentTools)(outputChannel);
        }
        catch (e) {
            vscode.window.showErrorMessage(`LabWired: Configure agent tools failed: ${e instanceof Error ? e.message : e}`);
        }
    })));
    context.subscriptions.push(vscode.commands.registerCommand('labwired.copyClaudeMcpInstall', () => __awaiter(this, void 0, void 0, function* () {
        yield (0, mcpSetup_1.copyClaudeMcpLine)();
    })));
    context.subscriptions.push(vscode.commands.registerCommand('labwired.startOpenCodeAgent', () => __awaiter(this, void 0, void 0, function* () {
        try {
            yield (0, openCodeAgent_1.startOpenCodeAgent)(outputChannel);
        }
        catch (e) {
            vscode.window.showErrorMessage(`LabWired: Start OpenCode Agent failed: ${e instanceof Error ? e.message : e}`);
        }
    })));
    context.subscriptions.push(vscode.commands.registerCommand('labwired.copyAgentInstall', () => __awaiter(this, void 0, void 0, function* () {
        yield (0, openCodeAgent_1.copyAgentInstallCommand)();
    })));
    // Simulator Management
    const simulatorManager = new simulatorManager_1.SimulatorManager(outputChannel);
    const simulatorViewProvider = new simulatorView_1.SimulatorViewProvider(simulatorManager);
    context.subscriptions.push(vscode.window.registerTreeDataProvider('labwired.simulator', simulatorViewProvider));
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
    context.subscriptions.push(vscode.commands.registerCommand('labwired.startSimulator', () => __awaiter(this, void 0, void 0, function* () {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0)
            return;
        const activeSession = vscode.debug.activeDebugSession;
        const baseConfig = (activeSession === null || activeSession === void 0 ? void 0 : activeSession.type) === 'labwired' ? activeSession.configuration : undefined;
        const debugConfig = baseConfig
            ? Object.assign(Object.assign({}, baseConfig), { type: 'labwired', request: 'launch', stopOnEntry: false }) : {
            name: 'LabWired: Launch',
            type: 'labwired',
            request: 'launch',
            stopOnEntry: false
        };
        const started = yield vscode.debug.startDebugging(workspaceFolders[0], debugConfig);
        if (!started) {
            vscode.window.showErrorMessage('LabWired: Failed to start debug session.');
        }
    })));
    context.subscriptions.push(vscode.commands.registerCommand('labwired.stopSimulator', () => __awaiter(this, void 0, void 0, function* () {
        const activeSession = vscode.debug.activeDebugSession;
        if (activeSession && activeSession.type === 'labwired') {
            yield vscode.debug.stopDebugging(activeSession);
        }
        simulatorManager.stop();
    })));
    context.subscriptions.push(vscode.commands.registerCommand('labwired.restartSimulator', () => __awaiter(this, void 0, void 0, function* () {
        const activeSession = vscode.debug.activeDebugSession;
        if (activeSession && activeSession.type === 'labwired') {
            yield vscode.commands.executeCommand('workbench.action.debug.restart');
            return;
        }
        yield vscode.commands.executeCommand('labwired.startSimulator');
    })));
    context.subscriptions.push(vscode.commands.registerCommand('labwired.configureProject', () => __awaiter(this, void 0, void 0, function* () {
        yield (0, configWizard_1.showConfigWizard)();
    })));
    context.subscriptions.push(vscode.commands.registerCommand('labwired.importSvd', () => __awaiter(this, void 0, void 0, function* () {
        // Dynamic import to avoid circular dependencies if any, though explicit import is better
        const { importSvdWizard } = require('./configWizard');
        yield importSvdWizard();
    })));
    const uiConfig = vscode.workspace.getConfiguration('labwired');
    const demoUiMode = (uiConfig.get('demoUi.mode') || 'auto').toLowerCase();
    const demoUiEnabled = demoUiMode === 'on'
        || (demoUiMode === 'auto' && context.extensionMode === vscode.ExtensionMode.Development);
    const commandCenterProvider = new commandCenter_1.LabwiredCommandCenterProvider(context.extensionUri, demoUiEnabled);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(commandCenter_1.LabwiredCommandCenterProvider.viewType, commandCenterProvider));
    context.subscriptions.push(simulatorManager.onStatusChanged((status) => {
        commandCenterProvider.updateStatus(status);
    }));
    // Timeline Panel
    const timelinePanel = new timeline_1.TimelinePanel(context);
    context.subscriptions.push(vscode.commands.registerCommand('labwired.showTimeline', () => {
        timelinePanel.show();
    }), vscode.commands.registerCommand('labwired.showTopology', () => {
        topologyPanel_1.SystemTopologyPanel.createOrShow(context.extensionUri);
    }));
    // Peripheral Tree View
    const peripheralProvider = new peripheralProvider_1.PeripheralProvider();
    context.subscriptions.push(vscode.window.registerTreeDataProvider('labwired.peripherals', peripheralProvider), vscode.commands.registerCommand('labwired.refreshPeripherals', () => peripheralProvider.refresh()));
    // RTOS Task View
    const rtosProvider = new rtosProvider_1.RTOSProvider();
    context.subscriptions.push(vscode.window.registerTreeDataProvider('labwired.rtos_tasks', rtosProvider), vscode.commands.registerCommand('labwired.refreshRTOS', () => rtosProvider.refresh()));
    // Graphing Panel
    const graphingPanel = new graphing_panel_1.GraphingPanel(context);
    context.subscriptions.push(vscode.commands.registerCommand('labwired.showGraphing', () => {
        graphingPanel.show();
    }));
    // Memory Inspector Panel
    const memoryInspectorPanel = new memoryInspector_1.MemoryInspectorPanel(context);
    context.subscriptions.push(vscode.commands.registerCommand('labwired.showMemoryInspector', () => {
        memoryInspectorPanel.show();
    }));
    // Trace List Panel
    const traceListPanel = new traceList_1.TraceListPanel(context);
    context.subscriptions.push(vscode.commands.registerCommand('labwired.showTraceList', () => {
        traceListPanel.show();
    }));
    // Registers Panel — CPU core registers + decoded peripheral registers.
    const registersPanel = new registersPanel_1.RegistersPanel(context);
    context.subscriptions.push(vscode.commands.registerCommand('labwired.showRegisters', () => {
        void registersPanel.show();
    }));
    // Profiling Panel
    const profilingPanel = new profilingPanel_1.ProfilingPanel(context);
    context.subscriptions.push(vscode.commands.registerCommand('labwired.showProfiling', () => {
        profilingPanel.show();
    }));
    const factory = new LabwiredConfigurationProvider(outputChannel);
    context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('labwired', factory));
    const adapterFactory = new LabwiredDebugAdapterDescriptorFactory(context, outputChannel);
    context.subscriptions.push(vscode.debug.registerDebugAdapterDescriptorFactory('labwired', adapterFactory));
    // Handle Telemetry and UI Sync
    const handleEvent = (e) => handleLabwiredDebugEvent(e, {
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
        sendTopologyTelemetry: (telemetry) => {
            if (topologyPanel_1.SystemTopologyPanel.currentPanel) {
                topologyPanel_1.SystemTopologyPanel.currentPanel.sendTelemetry(telemetry);
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
    context.subscriptions.push(vscode.commands.registerCommand('labwired.compileAndRun', () => __awaiter(this, void 0, void 0, function* () {
        try {
            commandCenterProvider.clearUartOutput();
            yield compileAndRun(context, outputChannel, simulatorManager);
        }
        catch (e) {
            vscode.window.showErrorMessage(`LabWired: Compile and Run failed: ${e}`);
            outputChannel.appendLine(`ERROR: ${e}`);
        }
    })));
    // Check Docker Image on Startup if needed
    const config = vscode.workspace.getConfiguration('labwired');
    if (config.get('executionMode') === 'docker' && config.get('docker.autoPull')) {
        const image = config.get('docker.image') || 'w1ne/labwired-dev:latest';
        const dockerManager = new docker_1.DockerManager(outputChannel);
        dockerManager.imageExists(image).then(exists => {
            if (!exists) {
                vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: `LabWired: Pulling Docker image ${image}...`,
                    cancellable: false
                }, () => __awaiter(this, void 0, void 0, function* () {
                    try {
                        yield dockerManager.pullImage(image);
                        vscode.window.showInformationMessage(`LabWired: Docker image ${image} ready.`);
                    }
                    catch (e) {
                        vscode.window.showErrorMessage(`LabWired: Failed to pull Docker image: ${e}`);
                    }
                }));
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
exports.activate = activate;
function compileAndRun(context, outputChannel, simulatorManager) {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            throw new Error("No workspace folder open");
        }
        const rootPath = workspaceFolders[0].uri.fsPath;
        // 0. Stop simulator if running
        simulatorManager.stop();
        // 1. Detect project type. The build target triple comes from the project's own
        //    .cargo/config.toml (embedded default target) / Makefile — never hardcoded here.
        const hasCargo = yield fileExists(path.join(rootPath, 'Cargo.toml'));
        const hasMakefile = yield fileExists(path.join(rootPath, 'Makefile'));
        let buildCommand;
        let projectType;
        if (hasCargo) {
            projectType = 'Cargo';
            buildCommand = 'cargo build --release';
        }
        else if (hasMakefile) {
            projectType = 'Makefile';
            buildCommand = 'make';
        }
        else {
            throw new Error("Could not detect a supported project type (Cargo.toml or Makefile not found)");
        }
        // 2. Build
        outputChannel.show();
        yield vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `LabWired: Building ${projectType} project...`,
            cancellable: false
        }, (progress) => __awaiter(this, void 0, void 0, function* () {
            progress.report({ message: "Running build command..." });
            return new Promise((resolve, reject) => {
                const cp = require('child_process');
                cp.exec(buildCommand, { cwd: rootPath }, (err, stdout, stderr) => {
                    outputChannel.append(stdout);
                    outputChannel.append(stderr);
                    if (err) {
                        reject(new Error(`Build failed. See LabWired output for details.`));
                    }
                    else {
                        resolve();
                    }
                });
            });
        }));
        // 3. Ensure the one-file contract exists (.labwired/lab.yaml).
        const migration = (0, labConfig_1.migrateLabConfig)(rootPath);
        if (migration === 'none') {
            const choice = yield vscode.window.showErrorMessage('LabWired: No .labwired/lab.yaml found and nothing to migrate. Configure the project?', 'Configure Project');
            if (choice === 'Configure Project') {
                yield vscode.commands.executeCommand('labwired.configureProject');
            }
            return;
        }
        const labConfigPath = path.join(rootPath, '.labwired', 'lab.yaml');
        const labDir = path.join(rootPath, '.labwired');
        const outputDir = path.join(labDir, 'out');
        // The freshly built binary is whatever lab.yaml names as inputs.firmware.
        // Pass it explicitly as --firmware so a rebuild is always what runs.
        let firmware;
        try {
            const lab = (0, labConfig_1.readLabConfig)(labConfigPath);
            if ((_a = lab.inputs) === null || _a === void 0 ? void 0 : _a.firmware) {
                firmware = path.resolve(labDir, lab.inputs.firmware);
            }
        }
        catch (e) {
            outputChannel.appendLine(`LabWired: Failed to read lab.yaml: ${e}`);
        }
        // 4. Run the SAME command CI runs: labwired test --script <lab.yaml> ...
        let cli;
        try {
            cli = yield (0, cli_1.resolveCli)(context, outputChannel);
        }
        catch (e) {
            (0, crashReport_1.reportCrash)(e, { stage: 'download', extensionVersion: extensionVersion(context) });
            throw e;
        }
        const { exitCode, result } = yield (0, cli_1.runTest)(cli, {
            script: labConfigPath,
            cwd: rootPath,
            outputDir,
            firmware,
            apiKey: undefined,
        }, outputChannel);
        outputChannel.show();
        const status = result === null || result === void 0 ? void 0 : result.status;
        const passed = status ? status === 'pass' || status === 'passed' : exitCode === 0;
        if (passed) {
            vscode.window.showInformationMessage(`LabWired: Test passed (${status !== null && status !== void 0 ? status : `exit ${exitCode}`}).`);
        }
        else {
            vscode.window.showErrorMessage(`LabWired: Test failed (${status !== null && status !== void 0 ? status : `exit ${exitCode}`}). See LabWired output.`);
        }
    });
}
function fileExists(filePath) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            yield vscode.workspace.fs.stat(vscode.Uri.file(filePath));
            return true;
        }
        catch (_a) {
            return false;
        }
    });
}
function resolveDebugPath(template, workspaceRoot) {
    var _a, _b;
    let resolved = template;
    const root = workspaceRoot || ((_b = (_a = vscode.workspace.workspaceFolders) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.uri.fsPath) || '';
    if (root) {
        resolved = resolved
            .replace(/\$\{workspaceFolder\}/g, root)
            .replace(/\$\{workspaceRoot\}/g, root)
            .replace(/\$\{workspaceFolderBasename\}/g, path.basename(root));
    }
    resolved = resolved.replace(/\$\{env:([^}]+)\}/g, (_m, name) => { var _a; return (_a = process.env[name]) !== null && _a !== void 0 ? _a : ''; });
    resolved = resolved.replace(/\$\{pathSeparator\}/g, path.sep);
    if (root && !path.isAbsolute(resolved)) {
        resolved = path.resolve(root, resolved);
    }
    return resolved;
}
function deactivate() {
}
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map