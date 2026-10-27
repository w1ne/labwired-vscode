"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveCurrentModelWorkspaceFolder = exports.resolveModelWorkspaceFolder = void 0;
const path = require("path");
const vscode = require("vscode");
/** Resolve the workspace for the current model profile, honoring explicit and active context first. */
function resolveModelWorkspaceFolder(target) {
    return resolveWorkspaceFolder(target, false);
}
exports.resolveModelWorkspaceFolder = resolveModelWorkspaceFolder;
/** Resolve a workspace for an explicit target or the editor's current file. */
function resolveCurrentModelWorkspaceFolder(target) {
    return resolveWorkspaceFolder(target, true);
}
exports.resolveCurrentModelWorkspaceFolder = resolveCurrentModelWorkspaceFolder;
function resolveWorkspaceFolder(target, preferCurrentEditor) {
    var _a;
    const folders = vscode.workspace.workspaceFolders || [];
    const explicitPath = targetPath(target);
    if (explicitPath) {
        const exact = folders.find((folder) => samePath(folder.uri.fsPath, explicitPath));
        if (exact)
            return exact;
        const containing = containingWorkspace(folders, explicitPath);
        if (containing)
            return containing;
        if (isWorkspaceFolder(target))
            return target;
        const resolved = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(explicitPath));
        if (resolved)
            return resolved;
    }
    const activeEditor = vscode.window.activeTextEditor;
    if (preferCurrentEditor && activeEditor) {
        const editorFolder = vscode.workspace.getWorkspaceFolder(activeEditor.document.uri);
        if (editorFolder)
            return editorFolder;
    }
    const activeSessionFolder = (_a = vscode.debug.activeDebugSession) === null || _a === void 0 ? void 0 : _a.workspaceFolder;
    if (activeSessionFolder)
        return activeSessionFolder;
    if (!preferCurrentEditor && activeEditor) {
        const editorFolder = vscode.workspace.getWorkspaceFolder(activeEditor.document.uri);
        if (editorFolder)
            return editorFolder;
    }
    return folders[0];
}
function targetPath(target) {
    if (typeof target === 'string')
        return target.length > 0 ? path.resolve(target) : undefined;
    if (!target)
        return undefined;
    if ('fsPath' in target && typeof target.fsPath === 'string')
        return path.resolve(target.fsPath);
    if ('uri' in target && target.uri && typeof target.uri.fsPath === 'string') {
        return path.resolve(target.uri.fsPath);
    }
    return undefined;
}
function isWorkspaceFolder(target) {
    return !!target && typeof target === 'object' && 'uri' in target && 'name' in target;
}
function samePath(left, right) {
    return path.resolve(left) === path.resolve(right);
}
function containingWorkspace(folders, location) {
    return folders
        .filter((folder) => {
        const relative = path.relative(path.resolve(folder.uri.fsPath), location);
        return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
    })
        .sort((left, right) => right.uri.fsPath.length - left.uri.fsPath.length)[0];
}
//# sourceMappingURL=workspaceSelection.js.map