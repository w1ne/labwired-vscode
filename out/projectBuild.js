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
exports.detectProjectBuild = void 0;
const path = require("path");
/**
 * The build Run Test runs before the simulator, or null when the workspace has
 * no build file. The target triple comes from the project's own
 * .cargo/config.toml / Makefile, never from here. A null result is a
 * `.labwired/lab.yaml` over prebuilt ELFs, which runs as it is. `build: false`
 * in lab.yaml skips the build even when a Cargo.toml is present (for example a
 * host-side model crate whose firmware is committed).
 */
function detectProjectBuild(rootPath, exists, lab) {
    return __awaiter(this, void 0, void 0, function* () {
        if ((lab === null || lab === void 0 ? void 0 : lab.build) === false) {
            return null;
        }
        if (yield exists(path.join(rootPath, 'Cargo.toml'))) {
            return { projectType: 'Cargo', command: 'cargo build --release' };
        }
        if (yield exists(path.join(rootPath, 'Makefile'))) {
            return { projectType: 'Makefile', command: 'make' };
        }
        return null;
    });
}
exports.detectProjectBuild = detectProjectBuild;
//# sourceMappingURL=projectBuild.js.map