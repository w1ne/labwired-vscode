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
exports.migrateLabConfig = exports.writeLabConfig = exports.resolveProfileExecutablePath = exports.resolveSystemConfigPath = exports.createCoreCompatibleTestScript = exports.readLabConfig = exports.findLabConfig = exports.LAB_CONFIG_REL = void 0;
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const yaml = require("js-yaml");
const YAML = require("yaml");
exports.LAB_CONFIG_REL = path.join('.labwired', 'lab.yaml');
const LAB_PROFILE_SCHEMA = yaml.DEFAULT_SCHEMA.extend([
    new yaml.Type('!after_cycles', { kind: 'mapping', construct: (value) => value }),
    new yaml.Type('!at_start', { kind: 'scalar', construct: (value) => value }),
    new yaml.Type('!on_write', { kind: 'mapping', construct: (value) => value }),
    new yaml.Type('!on_read', { kind: 'mapping', construct: (value) => value }),
]);
// Returns the canonical lab.yaml path if it exists, else undefined. No search, no scoring.
function findLabConfig(root) {
    const canonical = path.join(root, exports.LAB_CONFIG_REL);
    return fs.existsSync(canonical) ? canonical : undefined;
}
exports.findLabConfig = findLabConfig;
function readLabConfig(file) {
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = yaml.load(raw, { schema: LAB_PROFILE_SCHEMA });
    if (!isRecord(parsed)) {
        throw new Error('lab.yaml must contain a YAML mapping.');
    }
    const config = parsed;
    if (config.inputs !== undefined && !isRecord(config.inputs)) {
        throw new Error('lab.yaml inputs must be a mapping.');
    }
    const inputs = (config.inputs || {});
    for (const field of ['firmware', 'system']) {
        const value = inputs[field];
        if (value !== undefined && (typeof value !== 'string' || value.length === 0)) {
            throw new Error(`lab.yaml inputs.${field} must be a non-empty path string.`);
        }
    }
    if (config.debug !== undefined && !isRecord(config.debug)) {
        throw new Error('lab.yaml debug must be a mapping.');
    }
    if (config.runner !== undefined && !isRecord(config.runner)) {
        throw new Error('lab.yaml runner must be a mapping.');
    }
    const debug = config.debug;
    const runner = config.runner;
    if ((debug === null || debug === void 0 ? void 0 : debug.adapter) !== undefined && !isRecord(debug.adapter)) {
        throw new Error('lab.yaml debug.adapter must be a mapping.');
    }
    const adapter = debug === null || debug === void 0 ? void 0 : debug.adapter;
    let resolvedAdapter;
    if (adapter) {
        if (adapter.build !== undefined && (typeof adapter.executable !== 'string' || adapter.executable.length === 0)) {
            throw new Error('lab.yaml debug.adapter.executable is required when debug.adapter.build is configured.');
        }
        if (typeof adapter.executable !== 'string' || adapter.executable.length === 0) {
            throw new Error('lab.yaml debug.adapter.executable must be a non-empty path string.');
        }
        let build;
        if (adapter.build !== undefined) {
            if (!isRecord(adapter.build)) {
                throw new Error('lab.yaml debug.adapter.build must be a mapping.');
            }
            const rawBuild = adapter.build;
            if (typeof rawBuild.command !== 'string' || rawBuild.command.length === 0) {
                throw new Error('lab.yaml debug.adapter.build.command must be a non-empty program string.');
            }
            if (!Array.isArray(rawBuild.args) || !rawBuild.args.every((arg) => typeof arg === 'string')) {
                throw new Error('lab.yaml debug.adapter.build.args must be an array of strings.');
            }
            if (rawBuild.cwd !== undefined && (typeof rawBuild.cwd !== 'string' || rawBuild.cwd.length === 0)) {
                throw new Error('lab.yaml debug.adapter.build.cwd must be a non-empty path string.');
            }
            build = Object.assign({ command: rawBuild.command, args: rawBuild.args }, (typeof rawBuild.cwd === 'string' ? { cwd: resolveProfilePath(file, rawBuild.cwd) } : {}));
        }
        resolvedAdapter = Object.assign({ executable: resolveProfilePath(file, adapter.executable) }, (build ? { build } : {}));
    }
    let resolvedRunner;
    if (runner) {
        const executable = runner.executable;
        if (typeof executable !== 'string' || executable.trim().length === 0) {
            throw new Error('lab.yaml runner.executable must be a non-empty path string.');
        }
        resolvedRunner = { executable: resolveProfileExecutablePath(file, executable) };
    }
    return Object.assign(Object.assign(Object.assign(Object.assign({}, config), { inputs: Object.assign(Object.assign({}, (typeof inputs.firmware === 'string' ? { firmware: resolveProfilePath(file, inputs.firmware) } : {})), (typeof inputs.system === 'string' ? { system: resolveProfilePath(file, inputs.system) } : {})) }), (debug ? { debug: Object.assign({}, (resolvedAdapter ? { adapter: resolvedAdapter } : {})) } : {})), (runner ? { runner: resolvedRunner } : {}));
}
exports.readLabConfig = readLabConfig;
/** Create a disposable core TestScript copy without extension-only debugger settings. */
function createCoreCompatibleTestScript(labConfigPath) {
    return __awaiter(this, void 0, void 0, function* () {
        const raw = yield fs.promises.readFile(labConfigPath, 'utf8');
        const coreScript = removeTopLevelYamlEntries(raw, ['debug', 'runner']);
        const parent = path.dirname(labConfigPath);
        const tempPath = path.join(parent, `.labwired-test-${process.pid}-${crypto.randomBytes(12).toString('hex')}.yaml`);
        yield fs.promises.writeFile(tempPath, coreScript, { flag: 'wx', mode: 0o600 });
        return tempPath;
    });
}
exports.createCoreCompatibleTestScript = createCoreCompatibleTestScript;
function removeTopLevelYamlEntries(source, keys) {
    const document = YAML.parseDocument(source, { intAsBigInt: true });
    if (document.errors.length > 0) {
        throw new Error(`Cannot create a core-compatible test script: ${document.errors[0].message}`);
    }
    if (document.contents instanceof YAML.YAMLMap) {
        for (const key of keys)
            document.delete(key);
    }
    rewriteBareAtStartTags(document);
    return document.toString();
}
/** `!at_start` is a unit tag. Emitting it as an empty string makes serde_yaml reject the script. */
function rewriteBareAtStartTags(document) {
    YAML.visit(document, {
        Scalar(_key, node) {
            if (node.tag !== '!at_start')
                return;
            node.value = null;
            node.source = undefined;
        },
    });
}
/** The active debug session wins; otherwise use the system selected in lab.yaml. */
function resolveSystemConfigPath(root, activeDebugPath) {
    var _a;
    if (typeof activeDebugPath === 'string' && activeDebugPath.trim().length > 0) {
        return path.isAbsolute(activeDebugPath)
            ? activeDebugPath
            : path.resolve(root, activeDebugPath);
    }
    const labConfigPath = findLabConfig(root);
    if (!labConfigPath)
        return undefined;
    return (_a = readLabConfig(labConfigPath).inputs) === null || _a === void 0 ? void 0 : _a.system;
}
exports.resolveSystemConfigPath = resolveSystemConfigPath;
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function resolveProfileExecutablePath(configFile, value, platform = process.platform) {
    const resolvedPath = resolveProfilePath(configFile, value);
    if (platform === 'win32' && path.extname(resolvedPath).length === 0 && fs.existsSync(`${resolvedPath}.exe`)) {
        return `${resolvedPath}.exe`;
    }
    return resolvedPath;
}
exports.resolveProfileExecutablePath = resolveProfileExecutablePath;
function resolveProfilePath(configFile, value) {
    return path.isAbsolute(value) ? value : path.resolve(path.dirname(configFile), value);
}
function writeLabConfig(root, cfg) {
    const dir = path.join(root, '.labwired');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'lab.yaml');
    fs.writeFileSync(file, yaml.dump(cfg));
    return file;
}
exports.writeLabConfig = writeLabConfig;
// Re-relativize an inputs path from the old script's directory to the new .labwired/ directory.
function rebaseInput(root, oldScriptDir, value) {
    const abs = path.resolve(oldScriptDir, value);
    return path.relative(path.join(root, '.labwired'), abs);
}
function isTestScript(parsed) {
    return !!parsed
        && typeof parsed === 'object'
        && parsed.schema_version !== undefined
        && parsed.assertions !== undefined;
}
// Rank an existing script filename: smoke > test > alphabetical.
function scriptPriority(name) {
    const lower = name.toLowerCase();
    if (lower.includes('smoke')) {
        return 0;
    }
    if (lower.includes('test')) {
        return 1;
    }
    return 2;
}
function migrateLabConfig(root) {
    var _a;
    if (findLabConfig(root)) {
        return 'exists';
    }
    // Scan top-level for an existing test script.
    let entries = [];
    try {
        entries = fs.readdirSync(root, { withFileTypes: true });
    }
    catch (_b) {
        entries = [];
    }
    const scripts = entries
        .filter((e) => e.isFile() && /\.ya?ml$/i.test(e.name))
        .map((e) => path.join(root, e.name))
        .map((file) => {
        try {
            const parsed = yaml.load(fs.readFileSync(file, 'utf8'));
            return isTestScript(parsed) ? { file, parsed } : undefined;
        }
        catch (_a) {
            return undefined;
        }
    })
        .filter((s) => s !== undefined)
        .sort((a, b) => {
        const pa = scriptPriority(path.basename(a.file));
        const pb = scriptPriority(path.basename(b.file));
        if (pa !== pb) {
            return pa - pb;
        }
        // Prefer the bare/canonical name over suffixed variants:
        // `test.yaml` beats `test-fresh.yaml`. Shortest wins, then alphabetical.
        const na = path.basename(a.file);
        const nb = path.basename(b.file);
        return na.length - nb.length || na.localeCompare(nb);
    });
    if (scripts.length > 0) {
        const { file, parsed } = scripts[0];
        const oldScriptDir = path.dirname(file);
        const cfg = {
            schema_version: (_a = parsed.schema_version) !== null && _a !== void 0 ? _a : '1.0',
            inputs: Object.assign({}, (parsed.inputs || {})),
            limits: parsed.limits,
            assertions: parsed.assertions,
        };
        if (cfg.inputs.firmware) {
            cfg.inputs.firmware = rebaseInput(root, oldScriptDir, cfg.inputs.firmware);
        }
        if (cfg.inputs.system) {
            cfg.inputs.system = rebaseInput(root, oldScriptDir, cfg.inputs.system);
        }
        writeLabConfig(root, cfg);
        return 'migrated';
    }
    // Synthesize from a top-level system.yaml.
    if (fs.existsSync(path.join(root, 'system.yaml'))) {
        writeLabConfig(root, {
            schema_version: '1.0',
            inputs: { system: '../system.yaml' },
            limits: { max_steps: 100000 },
            assertions: [{ expected_stop_reason: 'max_steps' }],
        });
        return 'created';
    }
    return 'none';
}
exports.migrateLabConfig = migrateLabConfig;
//# sourceMappingURL=labConfig.js.map