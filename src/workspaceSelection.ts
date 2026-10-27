import * as path from 'path';
import * as vscode from 'vscode';

export type ModelWorkspaceTarget = vscode.WorkspaceFolder | vscode.Uri | string | undefined;

/** Resolve the workspace for the current model profile, honoring explicit and active context first. */
export function resolveModelWorkspaceFolder(target?: ModelWorkspaceTarget): vscode.WorkspaceFolder | undefined {
    return resolveWorkspaceFolder(target, false);
}

/** Resolve a workspace for an explicit target or the editor's current file. */
export function resolveCurrentModelWorkspaceFolder(target?: ModelWorkspaceTarget): vscode.WorkspaceFolder | undefined {
    return resolveWorkspaceFolder(target, true);
}

function resolveWorkspaceFolder(
    target: ModelWorkspaceTarget,
    preferCurrentEditor: boolean,
): vscode.WorkspaceFolder | undefined {
    const folders = vscode.workspace.workspaceFolders || [];
    const explicitPath = targetPath(target);
    if (explicitPath) {
        const exact = folders.find((folder) => samePath(folder.uri.fsPath, explicitPath));
        if (exact) return exact;
        const containing = containingWorkspace(folders, explicitPath);
        if (containing) return containing;
        if (isWorkspaceFolder(target)) return target;
        const resolved = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(explicitPath));
        if (resolved) return resolved;
    }

    const activeEditor = vscode.window.activeTextEditor;
    if (preferCurrentEditor && activeEditor) {
        const editorFolder = vscode.workspace.getWorkspaceFolder(activeEditor.document.uri);
        if (editorFolder) return editorFolder;
    }

    const activeSessionFolder = vscode.debug.activeDebugSession?.workspaceFolder;
    if (activeSessionFolder) return activeSessionFolder;

    if (!preferCurrentEditor && activeEditor) {
        const editorFolder = vscode.workspace.getWorkspaceFolder(activeEditor.document.uri);
        if (editorFolder) return editorFolder;
    }

    return folders[0];
}

function targetPath(target: ModelWorkspaceTarget): string | undefined {
    if (typeof target === 'string') return target.length > 0 ? path.resolve(target) : undefined;
    if (!target) return undefined;
    if ('fsPath' in target && typeof target.fsPath === 'string') return path.resolve(target.fsPath);
    if ('uri' in target && target.uri && typeof target.uri.fsPath === 'string') {
        return path.resolve(target.uri.fsPath);
    }
    return undefined;
}

function isWorkspaceFolder(target: ModelWorkspaceTarget): target is vscode.WorkspaceFolder {
    return !!target && typeof target === 'object' && 'uri' in target && 'name' in target;
}

function samePath(left: string, right: string): boolean {
    return path.resolve(left) === path.resolve(right);
}

function containingWorkspace(
    folders: readonly vscode.WorkspaceFolder[],
    location: string,
): vscode.WorkspaceFolder | undefined {
    return folders
        .filter((folder) => {
            const relative = path.relative(path.resolve(folder.uri.fsPath), location);
            return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
        })
        .sort((left, right) => right.uri.fsPath.length - left.uri.fsPath.length)[0];
}
