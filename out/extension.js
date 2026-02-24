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
const fs = require("fs");
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
const CONFIG_SEARCH_EXCLUDES = '**/{node_modules,target,.git,dist,out}/**';
const STOP_WORD_HINTS = new Set([
    'andrii',
    'build',
    'core',
    'crates',
    'debug',
    'demo',
    'firmware',
    'home',
    'labwired',
    'main',
    'none',
    'projects',
    'release',
    'src',
    'target',
    'thumbv7m',
    'workspace',
    'yaml',
]);
function tokenizeHints(...hints) {
    const tokens = new Set();
    for (const hint of hints) {
        if (!hint)
            continue;
        const normalized = hint.toLowerCase();
        const parts = normalized.split(/[^a-z0-9]+/).filter(Boolean);
        for (const part of parts) {
            if (STOP_WORD_HINTS.has(part))
                continue;
            if (part.length < 3 && !/\d/.test(part))
                continue;
            tokens.add(part);
        }
    }
    return Array.from(tokens);
}
function scoreConfigPath(candidatePath, rootPath, fileName, tokens) {
    const resolved = path.resolve(candidatePath);
    const lower = resolved.toLowerCase();
    let score = 0;
    if (resolved === path.join(rootPath, fileName)) {
        score += 80;
    }
    if (resolved === path.join(rootPath, 'core', fileName)) {
        score += 60;
    }
    if (lower.includes(`${path.sep}examples${path.sep}`)) {
        score += 30;
    }
    if (lower.includes(`${path.sep}core${path.sep}examples${path.sep}`)) {
        score += 10;
    }
    for (const token of tokens) {
        if (lower.includes(token)) {
            score += 50;
        }
    }
    return score;
}
function listExampleConfigCandidates(anchor, fileName) {
    const roots = [
        path.join(anchor, 'examples'),
        path.join(anchor, 'core', 'examples'),
    ];
    const candidates = [];
    for (const root of roots) {
        if (!fs.existsSync(root)) {
            continue;
        }
        let entries = [];
        try {
            entries = fs.readdirSync(root, { withFileTypes: true });
        }
        catch (_a) {
            continue;
        }
        for (const entry of entries) {
            if (!entry.isDirectory()) {
                continue;
            }
            const p = path.join(root, entry.name, fileName);
            if (fs.existsSync(p)) {
                candidates.push(p);
            }
        }
    }
    return candidates;
}
function detectBestConfigPathFromAnchors(rootPath, fileName, hintInputs) {
    const tokens = tokenizeHints(...hintInputs);
    const anchors = new Set();
    anchors.add(path.resolve(rootPath));
    for (const hint of hintInputs) {
        if (!hint)
            continue;
        const normalized = path.resolve(hint);
        let current = fs.existsSync(normalized) && fs.statSync(normalized).isDirectory()
            ? normalized
            : path.dirname(normalized);
        for (let i = 0; i < 6; i++) {
            anchors.add(current);
            const parent = path.dirname(current);
            if (parent === current) {
                break;
            }
            current = parent;
        }
    }
    const candidates = new Set();
    for (const anchor of anchors) {
        const direct = path.join(anchor, fileName);
        if (fs.existsSync(direct)) {
            candidates.add(direct);
        }
        for (const p of listExampleConfigCandidates(anchor, fileName)) {
            candidates.add(p);
        }
    }
    const scored = Array.from(candidates)
        .map((p) => ({
        path: path.resolve(p),
        score: scoreConfigPath(p, rootPath, fileName, tokens),
    }))
        .sort((a, b) => {
        if (b.score !== a.score) {
            return b.score - a.score;
        }
        return a.path.length - b.path.length;
    });
    return scored.length > 0 ? scored[0].path : undefined;
}
function detectBestConfigPath(rootPath, fileName, hintInputs) {
    return __awaiter(this, void 0, void 0, function* () {
        const direct = path.join(rootPath, fileName);
        if (fs.existsSync(direct)) {
            return direct;
        }
        const tokens = tokenizeHints(...hintInputs);
        const candidates = yield vscode.workspace.findFiles(`**/${fileName}`, CONFIG_SEARCH_EXCLUDES, 200);
        if (candidates.length === 0) {
            return detectBestConfigPathFromAnchors(rootPath, fileName, hintInputs);
        }
        const rootNorm = path.resolve(rootPath);
        const scored = candidates
            .map((uri) => uri.fsPath)
            .filter((p) => path.resolve(p).startsWith(rootNorm))
            .map((p) => {
            const resolved = path.resolve(p);
            return { path: resolved, score: scoreConfigPath(resolved, rootPath, fileName, tokens) };
        })
            .sort((a, b) => {
            if (b.score !== a.score) {
                return b.score - a.score;
            }
            return a.path.length - b.path.length;
        });
        if (scored.length > 0) {
            return scored[0].path;
        }
        return detectBestConfigPathFromAnchors(rootPath, fileName, hintInputs);
    });
}
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
        deps.traceListPanel.refresh();
        deps.profilingPanel.refresh();
        return;
    }
    if (e.event === 'stopped') {
        deps.simulatorManager.syncDebugSessionStatus(false);
        deps.peripheralProvider.refresh();
        deps.rtosProvider.refresh();
        deps.memoryInspectorPanel.refresh();
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
    resolveDebugConfiguration(folder, config, token) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            this.output.appendLine(`LabWired: Resolving debug configuration...`);
            if (!config.type && !config.request && !config.name) {
                // This is a "stub" config from an empty launch.json or no launch.json
                config.type = 'labwired';
                config.name = 'LabWired: Launch';
                config.request = 'launch';
                config.stopOnEntry = false;
            }
            if (!config.program) {
                this.output.appendLine("LabWired: Program not specified, attempting auto-detection...");
                const rootPath = folder === null || folder === void 0 ? void 0 : folder.uri.fsPath;
                if (rootPath) {
                    const hasCargo = yield this.checkFile(path.join(rootPath, 'Cargo.toml'));
                    const hasMakefile = yield this.checkFile(path.join(rootPath, 'Makefile'));
                    if (hasCargo) {
                        config.program = path.join(rootPath, 'target', 'thumbv7m-none-eabi', 'debug', 'firmware');
                    }
                    else if (hasMakefile) {
                        config.program = path.join(rootPath, 'target', 'firmware');
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
            if (!config.program || !(yield this.checkFile(config.program))) {
                this.output.appendLine("LabWired: ERROR - No program found to debug.");
                vscode.window.showErrorMessage("Cannot find a program to debug. Please ensure you have a Cargo.toml or Makefile and have built the project.");
                return undefined; // abort launch
            }
            // Auto-detect config files if they exist in root
            if (folder) {
                const rootPath = folder.uri.fsPath;
                const activePath = (_a = vscode.window.activeTextEditor) === null || _a === void 0 ? void 0 : _a.document.uri.fsPath;
                const hintInputs = [config.program, activePath];
                if (!config.systemConfig) {
                    const detectedSystem = yield detectBestConfigPath(rootPath, 'system.yaml', hintInputs);
                    if (detectedSystem) {
                        config.systemConfig = detectedSystem;
                        this.output.appendLine(`LabWired: Auto-detected system config: ${detectedSystem}`);
                    }
                }
                if (!config.mcuConfig) {
                    const detectedMcu = yield detectBestConfigPath(rootPath, 'mcu.yaml', hintInputs);
                    if (detectedMcu) {
                        config.mcuConfig = detectedMcu;
                        this.output.appendLine(`LabWired: Auto-detected MCU config: ${detectedMcu}`);
                    }
                }
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
            let dapPath = config.get('dapPath');
            if (!dapPath) {
                dapPath = yield findDapPath(this.context.extensionUri, this.output);
            }
            this.output.appendLine(`LabWired: Using DAP binary at ${dapPath}`);
            if (!(yield fileExists(dapPath))) {
                vscode.window.showErrorMessage(`LabWired: DAP binary not found at ${dapPath}. Please check your settings or reinstall the extension.`);
                throw new Error(`DAP binary not found at ${dapPath}`);
            }
            return new vscode.DebugAdapterExecutable(dapPath, []);
        });
    }
}
exports.LabwiredDebugAdapterDescriptorFactory = LabwiredDebugAdapterDescriptorFactory;
function activate(context) {
    const outputChannel = vscode.window.createOutputChannel("LabWired");
    context.subscriptions.push(outputChannel);
    outputChannel.appendLine("LabWired Activated.");
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
        // 1. Detection
        const hasCargo = yield fileExists(path.join(rootPath, 'Cargo.toml'));
        const hasMakefile = yield fileExists(path.join(rootPath, 'Makefile'));
        let binaryPath;
        let buildCommand;
        let projectType;
        if (hasCargo) {
            projectType = 'Cargo';
            buildCommand = 'cargo build --target thumbv7m-none-eabi';
            // Dynamic detection of binary name
            let binName = 'firmware'; // Default
            try {
                const cargoContent = yield vscode.workspace.fs.readFile(vscode.Uri.file(path.join(rootPath, 'Cargo.toml')));
                const cargoStr = Buffer.from(cargoContent).toString();
                // Simple regex to find [[bin]] name or [package] name
                const binMatch = cargoStr.match(/\[\[bin\]\]\s+name\s*=\s*"([^"]+)"/);
                const pkgMatch = cargoStr.match(/\[package\]\s+name\s*=\s*"([^"]+)"/);
                if (binMatch) {
                    binName = binMatch[1];
                }
                else if (pkgMatch) {
                    binName = pkgMatch[1];
                }
                else {
                    // Fallback to folder name
                    binName = path.basename(rootPath);
                }
            }
            catch (e) {
                binName = path.basename(rootPath);
            }
            // Detect target directory (workspace vs local)
            let targetDir = path.join(rootPath, 'target');
            const localTargetExists = yield fileExists(path.join(targetDir, 'thumbv7m-none-eabi', 'debug', binName));
            if (!localTargetExists) {
                // Check one and two levels up for workspace target
                const parentTarget = path.join(rootPath, '..', 'target');
                const grandParentTarget = path.join(rootPath, '..', '..', 'target');
                if (yield fileExists(path.join(parentTarget, 'thumbv7m-none-eabi', 'debug', binName))) {
                    targetDir = parentTarget;
                }
                else if (yield fileExists(path.join(grandParentTarget, 'thumbv7m-none-eabi', 'debug', binName))) {
                    targetDir = grandParentTarget;
                }
            }
            binaryPath = path.join(targetDir, 'thumbv7m-none-eabi', 'debug', binName);
        }
        else if (hasMakefile) {
            projectType = 'Makefile';
            // Force debug profile so source line breakpoints remain reliable.
            buildCommand = 'make PROFILE=debug';
            binaryPath = path.join(rootPath, 'target', 'firmware');
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
        // 3. Start Simulator & Debugging
        if (!(yield fileExists(binaryPath))) {
            // Fallback for workspace-level target directories
            const binName = path.basename(binaryPath);
            const parentTarget = path.join(rootPath, '..', 'target', 'thumbv7m-none-eabi', 'debug', binName);
            const grandParentTarget = path.join(rootPath, '..', '..', 'target', 'thumbv7m-none-eabi', 'debug', binName);
            if (yield fileExists(parentTarget)) {
                binaryPath = parentTarget;
            }
            else if (yield fileExists(grandParentTarget)) {
                binaryPath = grandParentTarget;
            }
            else {
                throw new Error(`Could not find build artifact at ${binaryPath}. Checked local and workspace target directories.`);
            }
        }
        vscode.window.showInformationMessage(`LabWired: Launching ${path.basename(binaryPath)}...`);
        const debugConfig = {
            name: 'LabWired: Hot-Reload',
            type: 'labwired',
            request: 'launch',
            program: binaryPath,
            stopOnEntry: false
        };
        // Auto-detect config files
        const hintInputs = [binaryPath, (_a = vscode.window.activeTextEditor) === null || _a === void 0 ? void 0 : _a.document.uri.fsPath];
        const systemYaml = yield detectBestConfigPath(rootPath, 'system.yaml', hintInputs);
        if (systemYaml) {
            debugConfig.systemConfig = systemYaml;
            outputChannel.appendLine(`LabWired: Using system config ${systemYaml}`);
        }
        const mcuYaml = yield detectBestConfigPath(rootPath, 'mcu.yaml', hintInputs);
        if (mcuYaml) {
            debugConfig.mcuConfig = mcuYaml;
            outputChannel.appendLine(`LabWired: Using MCU config ${mcuYaml}`);
        }
        const started = yield vscode.debug.startDebugging(workspaceFolders[0], debugConfig);
        if (!started) {
            throw new Error('Debugger session failed to start.');
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
function findDapPath(extensionUri, output) {
    return __awaiter(this, void 0, void 0, function* () {
        const extPath = extensionUri.fsPath;
        const isWin = process.platform === 'win32';
        const binName = isWin ? 'labwired-dap.exe' : 'labwired-dap';
        const log = (msg) => {
            if (output)
                output.appendLine(`LabWired [PathDiscovery]: ${msg}`);
            console.log(`LabWired [PathDiscovery]: ${msg}`);
        };
        log(`Searching for DAP binary (binName: ${binName})`);
        log(`Extension path: ${extPath}`);
        // 1. Check Bundled/Dev Path in extension
        const extensionPossible = [
            path.join(extPath, 'dist', 'bin', binName),
            path.join(extPath, 'bin', binName)
        ];
        for (const p of extensionPossible) {
            log(`Checking extension folder: ${p}`);
            if (fs.existsSync(p)) {
                log(`Found at: ${p}`);
                return p;
            }
        }
        // 2. Search in all workspace folders and their PARENTS
        const workspaces = vscode.workspace.workspaceFolders || [];
        log(`Checking ${workspaces.length} workspace folders and parents...`);
        for (const folder of workspaces) {
            let current = folder.uri.fsPath;
            log(`Walking up from workspace folder: ${current}`);
            // Search up to 5 levels up for the workspace/project root
            for (let i = 0; i < 5; i++) {
                const searchRoots = [
                    current,
                    path.join(current, 'core'),
                ];
                for (const searchRoot of searchRoots) {
                    const searchPaths = [
                        path.join(searchRoot, 'target', 'release', binName),
                        path.join(searchRoot, 'target', 'debug', binName),
                    ];
                    for (const p of searchPaths) {
                        log(`[Level ${i}] Checking path: ${p}`);
                        if (fs.existsSync(p)) {
                            log(`Found at: ${p}`);
                            return p;
                        }
                    }
                }
                const parent = path.dirname(current);
                if (parent === current)
                    break; // root reached
                current = parent;
            }
        }
        // 3. Last ditch effort: Try hardcoded path based on common dev setup if workspace root is derived
        const workspaceRoot = path.dirname(extPath);
        const fallback = path.join(workspaceRoot, 'core', 'target', 'release', binName);
        log(`Not found in any workspace or parent. Using fallback: ${fallback}`);
        return fallback;
    });
}
function deactivate() {
}
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map