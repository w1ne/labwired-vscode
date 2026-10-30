import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export interface CustomDapBuild {
    command: string;
    args: string[];
    cwd?: string;
}

export interface CustomDapBuildResult {
    stdout: string;
    stderr: string;
}

export function customDapExecutablePath(configuredPath: string, platform = process.platform): string {
    if (platform !== 'win32' || path.extname(configuredPath).length > 0) {
        return configuredPath;
    }
    const windowsPath = `${configuredPath}.exe`;
    return fs.existsSync(windowsPath) ? windowsPath : configuredPath;
}

/** `onOutput` receives stdout and stderr as they arrive, for long first builds. */
export function runCustomDapBuild(build: CustomDapBuild, onOutput?: (chunk: string) => void): Promise<CustomDapBuildResult> {
    return new Promise((resolve, reject) => {
        const child = spawn(build.command, build.args, { cwd: build.cwd, shell: false });
        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (data: Buffer | string) => {
            stdout += data.toString();
            onOutput?.(data.toString());
        });
        child.stderr.on('data', (data: Buffer | string) => {
            stderr += data.toString();
            onOutput?.(data.toString());
        });
        child.on('error', (error) => {
            reject(new Error(`Could not run custom DAP build program '${build.command}': ${error.message}`));
        });
        child.on('close', (code) => {
            const exitCode = code ?? -1;
            if (exitCode !== 0) {
                reject(new Error(
                    `Custom DAP build failed with exit code ${exitCode}.\n` +
                    `${stdout}${stderr}`
                ));
                return;
            }
            resolve({ stdout, stderr });
        });
    });
}
