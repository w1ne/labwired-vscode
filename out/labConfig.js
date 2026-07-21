"use strict";
// LabWired - Firmware Simulation Platform
// Copyright (C) 2026 Andrii Shylenko
//
// This software is released under the MIT License.
// See the LICENSE file in the project root for full license information.
Object.defineProperty(exports, "__esModule", { value: true });
exports.migrateLabConfig = exports.writeLabConfig = exports.readLabConfig = exports.findLabConfig = exports.LAB_CONFIG_REL = void 0;
const path = require("path");
const fs = require("fs");
const yaml = require("js-yaml");
exports.LAB_CONFIG_REL = path.join('.labwired', 'lab.yaml');
// Returns the canonical lab.yaml path if it exists, else undefined. No search, no scoring.
function findLabConfig(root) {
    const canonical = path.join(root, exports.LAB_CONFIG_REL);
    return fs.existsSync(canonical) ? canonical : undefined;
}
exports.findLabConfig = findLabConfig;
function readLabConfig(file) {
    const raw = fs.readFileSync(file, 'utf8');
    return yaml.load(raw);
}
exports.readLabConfig = readLabConfig;
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