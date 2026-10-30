# Changelog

## 0.15.1

- **Run Test** no longer requires a `Cargo.toml` or `Makefile`. A workspace
  that is only a `.labwired/lab.yaml` over prebuilt ELFs (for example a
  multi-node `inputs.env` demo) now runs without a build step instead of
  failing with "Could not detect a supported project type".
- **`runner.build`**: a lab.yaml runner can carry a build block like
  `debug.adapter.build`; Run Test builds the runner before it runs, so a fresh
  clone works without a manual `cargo build`.
- Runner and debug-adapter builds stream their output to the LabWired channel
  with a progress notification, instead of printing it only when they finish.

## 0.15.0

### Multi-node env profiles + install honesty

- **`inputs.env`** profiles (merged as #16): Run Test drives a multi-node
  environment YAML without `--firmware` / `--system` overrides. Pair with
  `runner.executable` when a plugin-linked binary is required.
- **Install**: prefer the GitHub Release `.vsix` when the Marketplace / Open VSX
  listing is missing or older than this tip. Registries publish only when a
  `vX.Y.Z` tag runs with `VSCE_PAT` / `OVSX_PAT` set.
- **Run Test** does not build `runner.executable`. If that path is missing, the
  error now says to build the binary first (F5 still builds `debug.adapter`
  when a build block is present).
- Stock auto-download remains **`v0.25.0`**. Environment scripts that need
  newer core behaviour must set `runner.executable` (or `labwired.cliPath`) to
  a tip build until a newer core CLI release is tagged.

## 0.14.0


### Polish + agent tools on the existing extension

- **Configure Agent Tools** writes `.vscode/mcp.json` for the shared hosted MCP
  (`api.labwired.com/mcp`) — same `labwired_*` tools as playground, CLI, and OpenCode.
- **Start OpenCode Agent** — same pattern as Embedder: extension launches the
  `labwired` OpenCode runtime in a terminal (install prompt if missing).
- **Copy Claude MCP Install** / **Copy Agent Install** one-liners.
- Sign-in offers Configure Agent Tools; configure offers Start OpenCode Agent.
- Command palette titles normalized under the **LabWired** category.
- README: debug first; agent tools + OpenCode as shared-tool paths.

## 0.13.0

The first release where debugging works on a machine that has not built
LabWired from source.

### Debugging works out of the box

- **The debug adapter now ships.** `labwired-dap` had never been included in a
  release tarball, and the extension located it by walking parent directories
  looking for `target/release/labwired-dap`. It is now downloaded with the CLI
  on first use — one download serves both.
- **F5 needs no `launch.json`.** Press it in a firmware project and the
  extension resolves the ELF from `.labwired/lab.yaml`, or by finding your build
  (checking ELF magic, so build scripts and `.d` files are not mistaken for
  firmware). If there is nothing to debug it offers to set the project up
  instead of failing.

### See all registers

- **New Registers view** (`LabWired: Show Registers`): CPU core registers plus
  decoded peripheral registers, searchable, with values that **changed since the
  last stop highlighted**.
- **Peripheral registers now decode on natively-modeled chips.** nRF52840 went
  from 0 of 52 peripherals showing register names to 49 of 52. Peripherals with
  no register schema say so rather than appearing to have no registers.
- **The memory view no longer invents data.** Reads of unmapped address space
  used to return convincing zeros; unreadable bytes are now reported as such.
- **Looking no longer changes what you are looking at.** Peripheral and memory
  reads go through a side-effect-free path, so inspecting a peripheral cannot
  perturb the running firmware.

### Fixed

- A read of the nRF52 SAADC between `0x158` and `0x184` crashed the simulator.
- The extension activated on every window (`activationEvents: ["*"]`); it now
  activates only when it is actually needed.
- `docs/`, `.github/`, and a stray `test_output.txt` were being shipped inside
  the extension package.

### Internal

- The repository had no CI. It now compiles, runs unit tests, packages a
  `.vsix`, and verifies the compiled extension is inside it on every push.
