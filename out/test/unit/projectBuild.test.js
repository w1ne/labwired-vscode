"use strict";
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
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const projectBuild_1 = require("../../projectBuild");
/**
 * Run Test builds the firmware first when the workspace has a build file. A
 * workspace that is only a `.labwired/lab.yaml` over committed ELFs (a model
 * delivery, a multi-node env demo) has nothing to build and must still run.
 */
describe('project build detection', () => {
    let root;
    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'labwired-build-'));
    });
    afterEach(() => {
        fs.rmSync(root, { recursive: true, force: true });
    });
    const exists = (p) => __awaiter(void 0, void 0, void 0, function* () { return fs.existsSync(p); });
    it('builds a Cargo project in release mode', () => __awaiter(void 0, void 0, void 0, function* () {
        fs.writeFileSync(path.join(root, 'Cargo.toml'), '');
        assert.deepStrictEqual(yield (0, projectBuild_1.detectProjectBuild)(root, exists), { projectType: 'Cargo', command: 'cargo build --release' });
    }));
    it('prefers Cargo when a Makefile is also present', () => __awaiter(void 0, void 0, void 0, function* () {
        var _a;
        fs.writeFileSync(path.join(root, 'Cargo.toml'), '');
        fs.writeFileSync(path.join(root, 'Makefile'), '');
        assert.strictEqual((_a = (yield (0, projectBuild_1.detectProjectBuild)(root, exists))) === null || _a === void 0 ? void 0 : _a.projectType, 'Cargo');
    }));
    it('builds a Makefile project with make', () => __awaiter(void 0, void 0, void 0, function* () {
        fs.writeFileSync(path.join(root, 'Makefile'), '');
        assert.deepStrictEqual(yield (0, projectBuild_1.detectProjectBuild)(root, exists), { projectType: 'Makefile', command: 'make' });
    }));
    it('has no build step for a lab.yaml-only workspace', () => __awaiter(void 0, void 0, void 0, function* () {
        fs.mkdirSync(path.join(root, '.labwired'));
        fs.writeFileSync(path.join(root, '.labwired', 'lab.yaml'), 'schema_version: "1.0"\n');
        assert.strictEqual(yield (0, projectBuild_1.detectProjectBuild)(root, exists), null);
    }));
});
//# sourceMappingURL=projectBuild.test.js.map