# CowManager K32 DAP Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Joost a runnable K32W041Z M1 model project that builds its own plugin-aware DAP and exposes DS2, DS3, and BP1 in the LabWired device view.

**Architecture:** Keep the allowlisted chip plugin in CowManager's private delivery repo. Add a separate DAP executable that registers that plugin with public `labwired-dap`, record the firmware/model/DAP build in `.labwired/lab.yaml`, and map board pins in the system manifest. Build against a sibling public `labwired-core` checkout as the existing workspace already expects.

**Tech Stack:** Rust, Cargo, YAML, LabWired VS Code extension.

---

## File map

- `Cargo.toml`: add `crates/labwired-pro-dap` as a workspace member.
- `crates/labwired-pro-dap/Cargo.toml`, `src/main.rs`: create a DAP binary with the K32 plugin.
- `crates/labwired-ip-chips/chips/k32w041z-system.yaml`: declare GPIO offsets and DS2/DS3/BP1 pins.
- `crates/labwired-ip-chips/tests/k32w041z_system_manifest.rs`: pin board-I/O manifest values.
- `.labwired/lab.yaml`: add a portable firmware/system pair and explicit DAP build command.
- `README.md`, `HANDOVER.md`: add install/build/debug steps and identify the public core sibling requirement.
- `fixtures/k32w041z-m1-demo`: keep the existing testable firmware as the example target.

## Tasks

### Task 1: Declare the K32 model's board I/O

**Files:** Modify `crates/labwired-ip-chips/chips/k32w041z-system.yaml` and `crates/labwired-ip-chips/chips/k32w041z.yaml`; create `crates/labwired-ip-chips/tests/k32w041z_system_manifest.rs`.

- [ ] Add a manifest test asserting DS2 uses GPIO pin 0 output, DS3 uses pin 3 output, BP1 uses pin 1 input, and the GPIO peripheral declares offsets 0x2100/0x2200.
- [ ] Run `cargo test -p labwired-ip-chips --test k32w041z_system_manifest` and confirm it fails because `board_io` is empty.
- [ ] Add:

```yaml
board_io:
  - id: DS2
    kind: led
    peripheral: gpio
    pin: 0
    signal: output
  - id: DS3
    kind: led
    peripheral: gpio
    pin: 3
    signal: output
  - id: BP1
    kind: button
    peripheral: gpio
    pin: 1
    signal: input
    active_high: false
```

- [ ] Add `config.gpio_offsets.input/output` values to the `gpio` peripheral in the K32 chip YAML; run `cargo test -p labwired-ip-chips --test k32w041z_system_manifest` and expect it to pass.

### Task 2: Add a CowManager-specific DAP executable

**Files:** Modify `Cargo.toml`; create `crates/labwired-pro-dap/Cargo.toml` and `src/main.rs`.

- [ ] Add a build test command that invokes `cargo build -p labwired-pro-dap` and confirm Cargo reports the package does not exist.
- [ ] Add the workspace member and a binary package with path dependencies on `../../../labwired-core/crates/dap` and `../labwired-ip-chips`.
- [ ] Implement `main` to initialize tracing, register `Arc::new(LabwiredIpPlugin)` with `DapServer::with_plugins`, and run the DAP protocol over stdin/stdout.
- [ ] Run `cargo build -p labwired-pro-dap`; expect the binary to build against the sibling public core checkout.

The binary's registration should follow this shape:

```rust
let plugins: Vec<Arc<dyn ChipPlugin>> = vec![Arc::new(LabwiredIpPlugin)];
DapServer::with_plugins(plugins).run(io::stdin(), io::stdout())?;
```

### Task 3: Add the portable model run profile

**Files:** Create `.labwired/lab.yaml`.

- [ ] Add `.labwired/lab.yaml` with `inputs.firmware: ../fixtures/k32w041z-m1-demo/k32w041z-m1-demo.elf` and `inputs.system: ../crates/labwired-ip-chips/chips/k32w041z-system.yaml`.
- [ ] Set `debug.adapter.executable` to `../target/debug/labwired-pro-dap`, and its build command to `cargo build -p labwired-pro-dap` with `cwd: ..`.
- [ ] In the VS Code extension test harness, load this profile and assert all relative paths resolve; expect a failing test until the extension custom-DAP profile code is implemented.

### Task 4: Verify a Joost-ready debug flow and instructions

**Files:** Modify `README.md`, `HANDOVER.md`; test the profile and DAP executable.

- [ ] Document installing the LabWired VS Code extension, cloning `labwired-core` beside CowManager, opening the CowManager folder, and pressing F5. Explain **Configure Model** only if the user moves or replaces either input file.
- [ ] Run `cargo test --workspace`; expect all model/runner tests to pass.
- [ ] Run `cargo build -p labwired-pro`; expect the CLI delivery binary to build.
- [ ] Run `target/debug/labwired-pro test --script fixtures/k32w041z-m1-demo/m1-demo.yaml --output-dir fixtures/k32w041z-m1-demo/out`; expect all 9/9 checks to pass.
- [ ] Run an extension-host DAP session using `labwired-pro-dap`; verify stop-at-entry, firmware path, system path, DS2/DS3 telemetry, and BP1 input binding.
- [ ] Package the VSIX and execute the smoke matrix: Windows x64, Linux x64, Linux ARM64, and WSL Linux host.
- [ ] Commit as `feat(cowmanager): add K32 model DAP delivery`.
