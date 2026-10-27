import * as path from 'path';

/**
 * Normalize paths for assertions that cross the VS Code URI / Node boundary.
 * Windows drive letters are case-insensitive and VS Code may change their case.
 */
export function normalizePathForComparison(
    value: string | undefined,
    platform: NodeJS.Platform = process.platform,
): string | undefined {
    if (value === undefined) return undefined;
    const normalized = platform === 'win32' ? path.win32.normalize(value) : path.normalize(value);
    return platform === 'win32'
        ? normalized.replace(/^([A-Z]):/, (_match, drive: string) => `${drive.toLowerCase()}:`)
        : normalized;
}
