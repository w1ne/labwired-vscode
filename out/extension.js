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
exports.deactivate = exports.activate = exports.LabwiredDebugAdapterDescriptorFactory = exports.LabwiredConfigurationProvider = void 0;
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
class LabwiredConfigurationProvider {
    constructor(output, cpModule = require('child_process'), checkFile = fileExists) {
        this.output = output;
        this.cpModule = cpModule;
        this.checkFile = checkFile;
    }
    resolveDebugConfiguration(folder, config, token) {
        return __awaiter(this, void 0, void 0, function* () {
            this.output.appendLine(`LabWired: Resolving debug configuration...`);
            if (!config.type && !config.request && !config.name) {
                // This is a "stub" config from an empty launch.json or no launch.json
                config.type = 'labwired';
                config.name = 'LabWired: Launch';
                config.request = 'launch';
                config.stopOnEntry = true;
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
            if (!config.program || !(yield this.checkFile(config.program))) {
                this.output.appendLine("LabWired: ERROR - No program found to debug.");
                vscode.window.showErrorMessage("Cannot find a program to debug. Please ensure you have a Cargo.toml or Makefile and have built the project.");
                return undefined; // abort launch
            }
            // Auto-detect config files if they exist in root
            if (folder) {
                const rootPath = folder.uri.fsPath;
                if (!config.systemConfig) {
                    const systemYaml = path.join(rootPath, 'system.yaml');
                    if (yield this.checkFile(systemYaml)) {
                        config.systemConfig = systemYaml;
                    }
                }
                if (!config.mcuConfig) {
                    const mcuYaml = path.join(rootPath, 'mcu.yaml');
                    if (yield this.checkFile(mcuYaml)) {
                        config.mcuConfig = mcuYaml;
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
            ? Object.assign(Object.assign({}, baseConfig), { type: 'labwired', request: 'launch' }) : {
            name: 'LabWired: Launch',
            type: 'labwired',
            request: 'launch',
            stopOnEntry: true
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
    const commandCenterProvider = new commandCenter_1.LabwiredCommandCenterProvider(context.extensionUri);
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
    context.subscriptions.push(vscode.debug.onDidReceiveDebugSessionCustomEvent(e => {
        if (e.session.type === 'labwired') {
            if (e.event === 'telemetry') {
                const telemetry = Object.assign(Object.assign({}, e.body), { status: simulatorManager.status });
                commandCenterProvider.updateTelemetry(telemetry);
                if (topologyPanel_1.SystemTopologyPanel.currentPanel) {
                    topologyPanel_1.SystemTopologyPanel.currentPanel.sendTelemetry(telemetry);
                }
                if (e.body.signals) {
                    graphingPanel.updateSignals(e.body.signals);
                }
            }
            else if (e.event === 'stopped' || e.event === 'continued') {
                peripheralProvider.refresh();
                rtosProvider.refresh();
                memoryInspectorPanel.refresh();
                traceListPanel.refresh();
                profilingPanel.refresh();
                // Optionally refresh timeline too if it's visible
            }
        }
    }));
    // Handle standard output events for high-fidelity logging
    context.subscriptions.push(vscode.debug.onDidReceiveDebugSessionCustomEvent(e => {
        if (e.session.type === 'labwired' && e.event === 'output') {
            const body = e.body;
            if (body.category === 'stdout' || body.category === 'stderr') {
                outputChannel.appendLine(body.output);
            }
        }
    }));
    // Register Compile and Run command
    context.subscriptions.push(vscode.commands.registerCommand('labwired.compileAndRun', () => __awaiter(this, void 0, void 0, function* () {
        try {
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
            buildCommand = 'make';
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
        // Start simulator in background via manager
        const config = vscode.workspace.getConfiguration('labwired');
        let dapPath = config.get('dapPath');
        if (!dapPath) {
            dapPath = yield findDapPath(context.extensionUri, outputChannel);
        }
        yield simulatorManager.start(dapPath, ["--gdb", "3333", "--firmware", binaryPath]);
        const debugConfig = {
            name: 'LabWired: Hot-Reload',
            type: 'labwired',
            request: 'launch',
            program: binaryPath,
            stopOnEntry: true
        };
        // Auto-detect config files
        const systemYaml = path.join(rootPath, 'system.yaml');
        if (yield fileExists(systemYaml))
            debugConfig.systemConfig = systemYaml;
        const mcuYaml = path.join(rootPath, 'mcu.yaml');
        if (yield fileExists(mcuYaml))
            debugConfig.mcuConfig = mcuYaml;
        yield vscode.debug.startDebugging(workspaceFolders[0], debugConfig);
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