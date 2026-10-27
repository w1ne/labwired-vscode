import * as fs from 'fs';
import * as path from 'path';

export function resolveVSCodeTestExecutable(
    executablePath: string,
    platform = process.platform,
    exists: (filePath: string) => boolean = fs.existsSync
): string {
    if (platform !== 'darwin' || exists(executablePath) || path.basename(executablePath) !== 'Electron') {
        return executablePath;
    }

    const currentLauncher = path.join(path.dirname(executablePath), 'Code');
    return exists(currentLauncher) ? currentLauncher : executablePath;
}
