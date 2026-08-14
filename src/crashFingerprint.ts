/**
 * The parts of failure reporting that do not need an editor.
 *
 * Split out of crashReport.ts so they can be unit-tested without a VS Code
 * host: `import * as vscode` cannot load in plain mocha, and a fingerprint
 * function nobody can test is a fingerprint function nobody should trust with
 * "never put a path in this".
 */

/** node's process.platform/arch in the vocabulary the release archives use. */
export function platformSlug(platform: string, arch: string): string {
    const map: Record<string, string> = {
        'darwin/arm64': 'darwin-aarch64',
        'darwin/x64': 'darwin-x86_64',
        'linux/x64': 'linux-x86_64',
        'linux/arm64': 'linux-aarch64',
        'win32/x64': 'windows-x86_64',
    };
    return map[`${platform}/${arch}`] ?? 'unknown';
}

/**
 * A stable, non-reversible id for "this failure": FNV-1a over the error's type
 * and its first stack frame's function name. File paths never enter — in an
 * editor extension they are the user's project.
 */
export function fingerprint(error: unknown): string {
    const name = error instanceof Error ? error.name : typeof error;
    const frame = error instanceof Error && typeof error.stack === 'string'
        ? (/at ([A-Za-z0-9_$.]+)/.exec(error.stack)?.[1] ?? '')
        : '';
    let hash = 0x811c9dc5;
    for (const char of `${name}|${frame}`) {
        hash ^= char.charCodeAt(0);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
}

export function errorClass(error: unknown): string {
    if (error instanceof SyntaxError) return 'parse_error';
    const message = error instanceof Error ? error.message : String(error);
    if (/ENOENT|not found|no such file/i.test(message)) return 'missing_binary';
    if (/GLIBC|libc\.so/i.test(message)) return 'glibc_missing';
    if (/timed? ?out/i.test(message)) return 'timeout';
    if (/404|ENOTFOUND|ECONNREFUSED|network/i.test(message)) return 'network';
    return 'other';
}
