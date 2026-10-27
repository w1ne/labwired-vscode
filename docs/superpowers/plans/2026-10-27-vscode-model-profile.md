# VS Code Model Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make any model project easy to configure and debug from VS Code using its system YAML, firmware, and optional custom DAP build.

**Architecture:** Keep `.labwired/lab.yaml` as the portable run profile. Extract profile parsing and custom DAP build execution into testable helpers. Have the wizard pick files and save relative paths, while F5 and device views consume that same profile. Align the default downloaded runtime to a published release and retain the selected Windows/Linux targets.

**Tech Stack:** TypeScript, VS Code Extension API, Mocha, Node.js.

---

## File map

- `src/labConfig.ts`: profile types, validation, and path resolution.
- `src/configWizard.ts`: model/system YAML + firmware + optional adapter prompts.
- `src/customDap.ts`: safe program-and-argument build invocation and executable validation.
- `src/extension.ts`: F5 resolves profile adapter and system paths.
- `src/commandCenter.ts`, `src/topologyPanel.ts`: read the same selected system path and watch the profile.
- `src/test/unit/labConfig.test.ts`, `src/test/unit/customDap.test.ts`: profile and process tests.
- `src/test/suite/configProvider.test.ts`, `src/test/suite/dap.test.ts`: extension-host launch tests.
- `package.json`, `src/cli.ts`, `README.md`: runtime version, command, schema, and install instructions.

## Tasks

### Task 1: Define and test optional adapter settings in the profile

**Files:** Modify `src/labConfig.ts`; create `src/test/unit/labConfig.test.ts`.

- [ ] Add tests for a project-relative firmware/system pair, an optional custom executable, and an optional build command/args/cwd.
- [ ] Run `npm run test:unit -- --grep "model profile"` and confirm the new tests fail because adapter fields are not parsed or resolved.
- [ ] Add this typed profile shape and resolve every path from the directory containing `.labwired/lab.yaml`:

```ts
export interface LabDebugAdapter {
    executable: string;
    build?: { command: string; args: string[]; cwd?: string };
}
```

- [ ] Reject non-string command/executable, non-array args, and a build section without an executable; return errors with the field path.
- [ ] Re-run `npm run test:unit -- --grep "model profile"` and expect all new cases to pass.

### Task 2: Make Configure Model select the actual files

**Files:** Modify `src/configWizard.ts`; extend `src/test/suite/extension.test.ts` or add `src/test/suite/configWizard.test.ts`.

- [ ] Add a test for writing a selected nested system YAML and firmware as paths relative to `.labwired/`.
- [ ] Run the focused extension-host test and confirm the wizard currently writes only a root `system.yaml` when present.
- [ ] Add the **LabWired: Configure Model** command with file pickers for YAML and ELF files; preserve paths outside the project as relative paths containing `..`.
- [ ] Ask before replacing `.labwired/lab.yaml`; cancelling any picker or confirmation leaves the old file byte-for-byte unchanged.
- [ ] Offer a custom adapter branch that prompts for executable, build program, JSON argument array, and working directory; skipping it omits `debug.adapter`.
- [ ] Re-run the focused extension-host wizard test and expect the nested-file profile and cancellation assertions to pass.

Use an argument array in saved YAML rather than a shell string:

```yaml
debug:
  adapter:
    executable: ../target/debug/labwired-pro-dap
    build:
      command: cargo
      args: [build, -p, labwired-pro-dap]
      cwd: ..
```

### Task 3: Build custom DAP before F5 when configured

**Files:** Create `src/customDap.ts`, `src/test/unit/customDap.test.ts`; modify `src/extension.ts`.

- [ ] Add a unit test that launches a Node child process using `process.execPath` and separate args, then assert stdout/stderr are captured and a nonzero exit is returned as a build error.
- [ ] Run `npm run test:unit -- --grep "custom DAP build"` and confirm the helper is missing.
- [ ] Implement the helper with `child_process.spawn(command, args, { cwd, shell: false })`; buffer output and resolve only on exit code zero.
- [ ] In the debug adapter factory, build when `debug.adapter.build` exists, then check the configured executable; if build fails, show output and stop instead of using a stale binary.
- [ ] If only `debug.adapter.executable` exists, launch it directly. If the profile has no custom adapter, keep `resolveDap()` on the standard release path.
- [ ] On Windows, resolve the configured executable with an `.exe` suffix only when the configured path has no extension and the suffixed file exists.
- [ ] Re-run the focused unit and DAP extension-host tests; expect custom-build success/failure and standard DAP launch to pass.

### Task 4: Use one model path for F5 and device views

**Files:** Modify `src/extension.ts`, `src/commandCenter.ts`, `src/topologyPanel.ts`; extend their extension-host tests.

- [ ] Add an extension-host test where `inputs.system` points to a nested `k32w041z-system.yaml`; assert both F5 and the topology/device command use that exact path.
- [ ] Run the focused extension-host test and confirm the views search only for root or `**/system.yaml` files.
- [ ] Resolve system path from the active debug config first, then from `.labwired/lab.yaml`; remove independent root-only guessing.
- [ ] Watch `.labwired/lab.yaml` changes and reload the selected model config in the relevant views.
- [ ] Re-run the focused extension-host test and expect the nested model path to drive launch and device views.

### Task 5: Align runtime metadata and document generic install

**Files:** Modify `package.json`, `src/cli.ts`, `README.md`, and `src/test/unit/platformAssets.test.ts` if a version assertion is added.

- [ ] Add a unit assertion that the package default and CLI runtime version are the same published version.
- [ ] Run `npm run test:unit -- --grep "runtime version"` and confirm the assertion catches the current `v0.19.3` manifest default.
- [ ] Set the default to `v0.25.0`; keep Windows x64, Linux x64/ARM64, macOS mappings, and WSL's Linux host behavior.
- [ ] Document Configure Model, F5, the optional custom DAP section, and VSIX installation for Windows, Linux, and WSL.
- [ ] Run `npm run test:unit`, `npm run compile`, and `npm run package`; expect all unit tests to pass and the VSIX to include `out/extension.js`.
- [ ] Commit as `feat(vscode): configure and launch model profiles`.
