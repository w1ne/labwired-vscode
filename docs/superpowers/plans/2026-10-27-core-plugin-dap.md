# Core plugin-aware DAP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a custom DAP binary build and debug model plugins through public LabWired core without adding private model code to core.

**Architecture:** Keep `build_machine` backward compatible and add a plugin-aware variant that passes the plugin registry to each family builder. Add `DapServer::with_plugins`, resolve plugin chip YAML during load, and use the plugin-aware machine builder. Let a GPIO peripheral declare input/output register offsets in its generic config so DAP board I/O can describe GPIO models with nonstandard type names.

**Tech Stack:** Rust, Cargo, `labwired-core`, `labwired-dap`, `labwired-config`.

---

## File map

- `crates/core/src/plugin.rs`: version and thread-safe plugin contract.
- `crates/core/src/system/builder.rs`: preserve `build_machine`; add `build_machine_with_plugins`.
- `crates/core/src/system/builder/{arm,cortex_a,riscv,xtensa,avr,pic24}.rs`: pass plugins to configured bus construction.
- `crates/dap/src/adapter.rs`: store plugin registry, resolve plugin chip YAML, use plugin-aware builder, and resolve configured GPIO offsets.
- `crates/dap/src/server.rs`: provide `DapServer::with_plugins` while keeping `new()` unchanged.
- `crates/core/tests/plugin_machine.rs`: prove a plugin chip and peripheral can build a machine.
- `crates/dap/tests/plugin_launch.rs`: prove a plugin-backed firmware launch and board-I/O mapping.

## Tasks

### Task 1: Pin plugin-aware machine construction with a failing core test

**Files:** Create `crates/core/tests/plugin_machine.rs`.

- [ ] Add a test plugin that supplies one minimal Cortex-M descriptor and one custom GPIO peripheral through `ChipPlugin`.
- [ ] Build a minimal ELF and `SystemManifest` whose chip is the plugin name; assert `build_machine_with_plugins` succeeds and reports the configured board-I/O binding.
- [ ] Run `cargo test -p labwired-core --test plugin_machine plugin_chip_builds_with_plugin_registry` and confirm it fails because the function does not exist.

Use this function contract in the test:

```rust
pub fn build_machine_with_plugins(
    req: BuildRequest<'_>,
    plugins: &[&dyn ChipPlugin],
) -> anyhow::Result<BuiltMachine>;
```

### Task 2: Add the plugin-aware builder without changing existing callers

**Files:** Modify `crates/core/src/system/builder.rs` and all six family builder modules.

- [ ] Make `build_machine(req)` delegate to `build_machine_with_plugins(req, &[])`.
- [ ] Dispatch the plugin list through `arm`, `cortex_a`, `riscv`, `xtensa`, `avr`, and `pic24` builders.
- [ ] Replace each `SystemBus::from_config(chip, manifest)` call with `SystemBus::from_config_with_plugins(chip, manifest, plugins)`; pass `plugins` from the dispatch function.
- [ ] In the plugin-aware test's chip construction, resolve the descriptor with `ChipDescriptor::resolve_with` and `plugins.iter().find_map(|plugin| plugin.chip_yaml(name))`.
- [ ] Re-run `cargo test -p labwired-core --test plugin_machine` and expect the named test to pass.

The old public entry point must retain this behavior:

```rust
pub fn build_machine(req: BuildRequest<'_>) -> anyhow::Result<BuiltMachine> {
    build_machine_with_plugins(req, &[])
}
```

### Task 3: Test configurable GPIO offsets for custom peripheral types

**Files:** Modify `crates/dap/src/adapter.rs` tests and `gpio_offsets_for_peripheral`.

- [ ] Add a test using `type: k32w041_gpio` and `config.gpio_offsets.input = 0x2100`, `config.gpio_offsets.output = 0x2200`; assert DAP resolves input/output addresses as base plus those offsets.
- [ ] Run `cargo test -p labwired-dap test_resolve_board_io_bindings_accepts_custom_gpio_offsets` and confirm it fails before implementation.
- [ ] Parse explicit numeric offsets before checking a built-in `gpio` register layout. Keep all existing register-layout behavior unchanged.
- [ ] Run `cargo test -p labwired-dap test_resolve_board_io_bindings` and expect all current and new mapping tests to pass.

The generic descriptor shape is:

```yaml
type: k32w041_gpio
config:
  gpio_offsets:
    input: 0x2100
    output: 0x2200
```

### Task 4: Add a plugin registry to the DAP server and launch path

**Files:** Modify `crates/core/src/plugin.rs`, `crates/dap/src/{adapter,server,lib}.rs`; create `crates/dap/tests/plugin_launch.rs`.

- [ ] Add a DAP integration test that starts a server with a test plugin, sends the existing initialize/launch requests, and asserts the session starts on the plugin chip.
- [ ] Run `cargo test -p labwired-dap --test plugin_launch dap_launch_uses_registered_chip_plugin` and confirm it fails before implementation.
- [ ] Make `ChipPlugin` require `Send + Sync`, bump `PLUGIN_API_VERSION` to `2`, and update compile errors in plugin implementations to satisfy the thread-safe contract.
- [ ] Store `Arc<[Arc<dyn ChipPlugin>]>` in `LabwiredAdapter`; add `LabwiredAdapter::with_plugins` and `DapServer::with_plugins(Vec<Arc<dyn ChipPlugin>>)`. Keep `new()` using an empty registry.
- [ ] Resolve the manifest chip with the registry, then call `build_machine_with_plugins` using references to the stored `Arc` values.
- [ ] Run `cargo test -p labwired-dap --test plugin_launch dap_launch_uses_registered_chip_plugin` and expect the test to pass.

The server constructor contract is:

```rust
pub fn with_plugins(plugins: Vec<Arc<dyn ChipPlugin>>) -> Self;
```

### Task 5: Verify core and DAP regression coverage

**Files:** Core and DAP crates only.

- [ ] Run `cargo test -p labwired-core` and expect exit code 0.
- [ ] Run `cargo test -p labwired-dap` and expect exit code 0.
- [ ] Run `cargo build -p labwired-dap --release` and expect the release DAP executable to build.
- [ ] Commit as `feat(dap): support registered model plugins`.
