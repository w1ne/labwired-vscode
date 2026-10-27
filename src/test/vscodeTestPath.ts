import * as fs from 'fs';
import * as path from 'path';

export function resolveVSCodeTestExecutable(
    executablePath: string,
    platform = process.platform,
    exists: (filePath: string) => boolean = fs.existsSync
): string {
    const pathApi = platform === 'darwin' ? path.posix : path;
    if (platform !== 'darwin' || exists(executablePath) || pathApi.basename(executablePath) !== 'Electron') {
        return executablePath;
    }

    const currentLauncher = pathApi.join(pathApi.dirname(executablePath), 'Code');
    return exists(currentLauncher) ? currentLauncher : executablePath;
}
