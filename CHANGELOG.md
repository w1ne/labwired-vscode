# Changelog

## 0.14.0

### Agent tools without the forked Editor

- **LabWired: Configure Agent Tools (MCP)** writes `.vscode/mcp.json` pointing
  at the shared hosted surface (`https://api.labwired.com/mcp`) — the same
  `labwired_*` tools as playground and CLI.
- **LabWired: Copy Claude MCP Install Line** for one-liner install outside VS Code.
- Sign-in token can be embedded (with a git warning) or prompted via
  `${input:labwired-token}`.
- README positions this MIT extension as the **first ship vehicle**; the full
  LabWired Editor remains a separate licensed product.

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
