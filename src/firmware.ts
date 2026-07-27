// LabWired - Firmware Simulation Platform
// Copyright (C) 2026 Andrii Shylenko
//
// This software is released under the MIT License.
// See the LICENSE file in the project root for full license information.

import * as path from 'path';
import * as fs from 'fs';

/**
 * Finding the ELF to debug, without asking the user to write a launch.json.
 *
 * Pressing F5 in a freshly cloned firmware project should just work. `lab.yaml`
 * names the firmware when a project has one, and that always wins — it is the
 * same file CI runs. This module is the fallback for everything else: a Cargo or
 * Make project that has been built but never configured for LabWired.
 *
 * Deliberately no `vscode` import, so the discovery rules are unit-testable
 * without an extension host.
 */

/** Cross-compiled firmware lives under `target/<triple>/{debug,release}/`. */
const CARGO_PROFILES = ['release', 'debug'] as const;

/** Files that live beside a firmware binary but are never the firmware. */
const NON_FIRMWARE_EXT = new Set([
    '.d', '.rlib', '.rmeta', '.o', '.a', '.so', '.dylib', '.dll',
    '.bin', '.hex', '.map', '.txt', '.json', '.lock', '.timestamp',
]);

export interface FirmwareCandidate {
    /** Absolute path to the ELF. */
    path: string;
    /** Modification time, newest first when ranked. */
    mtimeMs: number;
    /** Where it came from, for the output channel. */
    origin: string;
}

function isProbablyFirmware(file: string): boolean {
    const ext = path.extname(file);
    if (NON_FIRMWARE_EXT.has(ext)) {
        return false;
    }
    // A cross-compiled ELF has no extension (`firmware`) or `.elf`. Anything
    // with another extension is a build artifact, not the image.
    return ext === '' || ext === '.elf';
}

/** True when the file starts with the ELF magic `\x7fELF`. */
export function isElf(file: string): boolean {
    let fd: number | undefined;
    try {
        fd = fs.openSync(file, 'r');
        const magic = Buffer.alloc(4);
        // A short read means the file is too small to be an ELF.
        if (fs.readSync(fd, magic, 0, 4, 0) < 4) {
            return false;
        }
        return magic[0] === 0x7f && magic[1] === 0x45 && magic[2] === 0x4c && magic[3] === 0x46;
    } catch {
        return false;
    } finally {
        if (fd !== undefined) {
            try {
                fs.closeSync(fd);
            } catch {
                /* already closed */
            }
        }
    }
}

function candidatesIn(dir: string, origin: string): FirmwareCandidate[] {
    let entries: fs.Dirent[];
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
        return [];
    }

    const out: FirmwareCandidate[] = [];
    for (const entry of entries) {
        if (!entry.isFile() || !isProbablyFirmware(entry.name)) {
            continue;
        }
        const full = path.join(dir, entry.name);
        // Check ELF magic rather than trusting the name: `target/release/` also
        // holds build-script executables and other host binaries.
        if (!isElf(full)) {
            continue;
        }
        try {
            out.push({ path: full, mtimeMs: fs.statSync(full).mtimeMs, origin });
        } catch {
            /* raced with a rebuild */
        }
    }
    return out;
}

/**
 * Every plausible firmware ELF in a project, newest first.
 *
 * Searches `target/<triple>/{release,debug}` (cross-compiled — the normal case
 * for embedded) and then `target/{release,debug}` and `build/`. Host-target
 * builds rank last: on an embedded project a binary under `target/release`
 * without a triple is usually a build script or an xtask, not the firmware.
 */
export function discoverFirmware(root: string): FirmwareCandidate[] {
    const found: FirmwareCandidate[] = [];
    const targetDir = path.join(root, 'target');

    let triples: string[] = [];
    try {
        triples = fs
            .readdirSync(targetDir, { withFileTypes: true })
            .filter((e) => e.isDirectory() && e.name.includes('-'))
            .map((e) => e.name);
    } catch {
        /* no target dir */
    }

    for (const triple of triples) {
        for (const profile of CARGO_PROFILES) {
            found.push(...candidatesIn(path.join(targetDir, triple, profile), `target/${triple}/${profile}`));
        }
    }

    const hostBuilds: FirmwareCandidate[] = [];
    for (const profile of CARGO_PROFILES) {
        hostBuilds.push(...candidatesIn(path.join(targetDir, profile), `target/${profile}`));
    }
    hostBuilds.push(...candidatesIn(path.join(root, 'build'), 'build'));

    // Newest first within each tier; cross-compiled always outranks host.
    const byNewest = (a: FirmwareCandidate, b: FirmwareCandidate) => b.mtimeMs - a.mtimeMs;
    return [...found.sort(byNewest), ...hostBuilds.sort(byNewest)];
}

/** The single best firmware guess for a project, or undefined if there is none. */
export function bestFirmware(root: string): FirmwareCandidate | undefined {
    return discoverFirmware(root)[0];
}
