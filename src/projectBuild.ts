import * as path from 'path';

export interface ProjectBuild {
    projectType: 'Cargo' | 'Makefile';
    command: string;
}

/**
 * The build Run Test runs before the simulator, or null when the workspace has
 * no build file. The target triple comes from the project's own
 * .cargo/config.toml / Makefile, never from here. A null result is a
 * `.labwired/lab.yaml` over prebuilt ELFs, which runs as it is. `build: false`
 * in lab.yaml skips the build even when a Cargo.toml is present (for example a
 * host-side model crate whose firmware is committed).
 */
export async function detectProjectBuild(
    rootPath: string,
    exists: (filePath: string) => Promise<boolean>,
    lab?: { build?: false },
): Promise<ProjectBuild | null> {
    if (lab?.build === false) {
        return null;
    }
    if (await exists(path.join(rootPath, 'Cargo.toml'))) {
        return { projectType: 'Cargo', command: 'cargo build --release' };
    }
    if (await exists(path.join(rootPath, 'Makefile'))) {
        return { projectType: 'Makefile', command: 'make' };
    }
    return null;
}
