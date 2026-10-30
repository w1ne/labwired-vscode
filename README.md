# LabWired for VS Code

Debug firmware on a **virtual chip** — breakpoints, stepping (including reverse), registers, memory — with no hardware attached.

Optionally connect **agent tools** (the same `labwired_*` MCP surface as the Playground and CLI) so Copilot, Claude Code, or Cursor can compile, run, and verify firmware on the twin.

## Install

**Preferred today:** download the `.vsix` from the
[latest GitHub release](https://github.com/w1ne/labwired-vscode/releases/latest)
and run **Extensions: Install from VSIX…** (or
`code --install-extension ./labwired-vscode-<version>.vsix`). Use a release
whose notes include multi-node `inputs.env` (0.15.0+) when your project profile
uses `inputs.env`.

- **VS Code Marketplace** / **Open VSX** — search *LabWired*
  (`w1ne.labwired-vscode`) when the listing is present and at least as new as
  this tip. Registries only update when a `vX.Y.Z` tag is pushed with
  `VSCE_PAT` / `OVSX_PAT` configured; if search finds nothing, use the GitHub
  `.vsix` above.
- **Windows x64** — PowerShell:
  `code --install-extension .\labwired-vscode-<version>.vsix`.
- **Linux x64 or ARM64** —
  `code --install-extension ./labwired-vscode-<version>.vsix`.
- **WSL** — open the project folder through **Remote - WSL**, then install the
  extension in the WSL extension group (for example **Install in WSL:
  Ubuntu**). The debugger runs on Linux beside the project files.

The runtime also supports macOS x64 and ARM64. Without a custom adapter it
downloads the matching stock simulator and DAP on first use; a Rust toolchain
is not needed for that path. Profiles that set `runner.executable` or
`debug.adapter` still need those binaries built (see below).

## Get started

1. Install the extension.
2. Open a firmware project and build it.
3. Run **LabWired: Configure Model**, choose a model from the LabWired catalog
   or select a local system YAML, then select the firmware ELF. The catalog
   download contains only public core config files; firmware is selected
   separately. The saved paths are relative to `.labwired/lab.yaml`.
4. Press **F5**.

No `launch.json` is required. F5 uses the selected firmware and system YAML
from `.labwired/lab.yaml`. Without a custom adapter, the extension downloads
the standard LabWired DAP runtime on first use.

## Agent tools (optional)

Same tools everywhere: `labwired_list`, `labwired_describe`, `labwired_compile`, `labwired_run`, `labwired_verify`, part knowledge, …

1. **LabWired: Sign In** (optional; unlocks authenticated hosted tools).
2. **LabWired: Configure Agent Tools** → writes `.vscode/mcp.json` pointing at `https://api.labwired.com/mcp`.
3. Use your editor’s agent chat; it can call those tools.

**OpenCode agent** (same tools — like Embedder’s CLI, driven from the extension):

- **LabWired: Start OpenCode Agent** — opens a terminal with `labwired` (installs if missing).
- Or manually:

```bash
curl -fsSL https://labwired.com/install | bash
labwired login    # optional hosted MCP + model
labwired          # OpenCode + skills + labwired_* tools
```

**Claude Code** (same MCP URL):

```bash
claude mcp add labwired --transport http https://api.labwired.com/mcp
```

Palette: **Copy Claude MCP Install Command** / **Copy Agent Install Command**.

Local debug and **Run Test (lab.yaml)** stay free and do not require sign-in.

## What you get

| | |
|---|---|
| **Breakpoints and stepping** | Including *step back* — the simulator can run in reverse. |
| **Registers** | CPU and decoded peripherals, searchable, changes since last stop highlighted. |
| **Memory** | Hex/ASCII inspect and edit. Unmapped space is unreadable, not zeros. |
| **Peripherals** | Names and bit-fields where modeled; honest empty state when not. |
| **Timeline, trace, profiler** | Execution history and where cycles went. |
| **Agent MCP** | Shared hosted tools for AI agents (configure once). |

Inspecting is passive: reading a peripheral does not perturb the firmware under debug.

## Run contract (`.labwired/lab.yaml`)

```yaml
schema_version: "1.0"
inputs:
  firmware: "../../target/thumbv7em-none-eabi/release/firmware-foo"
  system: "../system.yaml"
limits:
  max_steps: 100000
assertions:
  - uart_contains: "OK"
  - expected_stop_reason: max_steps
```

**LabWired: Run Test (lab.yaml)** runs the same `labwired test …` path CI uses, so the editor and CI cannot disagree.

**LabWired: Configure Model** selects the model YAML and firmware ELF and
stores both paths relative to `.labwired/lab.yaml`. The topology and device
views use the same model YAML as F5.

If the selected model is only available through a project-linked core build,
set an optional `runner.executable` path in `.labwired/lab.yaml`:

```yaml
runner:
  executable: ../target/release/labwired-pro
```

The path is relative to `lab.yaml`; on Windows, an existing `.exe` is selected
when the configured path has no extension. **Run Test** uses this executable
instead of the stock CLI. Omitting `runner` keeps the standard CLI behavior.

Add a `build` block and **Run Test** builds the runner before every run, the
same way F5 builds `debug.adapter`. The program gets its arguments as an array
(no shell), `cwd` is relative to `lab.yaml`, and the output streams into the
LabWired output channel:

```yaml
runner:
  executable: ../target/release/labwired-pro
  build:
    command: cargo
    args: ["build", "-p", "labwired-pro", "--release"]
    cwd: ..
```

If the workspace root has a `Cargo.toml` or `Makefile` that is not the
firmware build (for example a host-side model crate whose firmware ELF is
committed), set `build: false` at the top level of `lab.yaml` so Run Test skips
that build.

Without `build`, the runner must exist before the first Run Test; if it is
missing, Run Test fails with an error naming the configured path.

Models that need a custom DAP can configure its executable and build command in
the same profile. The build runs before every F5 launch, with arguments passed
as an array (without a shell):

```yaml
debug:
  adapter:
    executable: ../target/release/labwired-pro-dap
    build:
      command: cargo
      args: [build, -p, labwired-pro-dap, --release]
      cwd: ..
```

The executable and working directory paths are also relative to `.labwired/`.
Omit `debug.adapter` to use the standard LabWired DAP. **LabWired: Configure
Project…** remains as an alias for the model setup flow.

### Multi-node (YAML chip + plugin CPU)

Core environment scripts use `inputs.env` instead of `inputs.firmware` /
`inputs.system`. Point `runner.executable` at a plugin-linked binary such as
`labwired-pro` (from a private delivery repo or release artifact — never put
private chip IP in a public tree). **Run Test** forwards the environment
manifest to that runner and does not pass `--firmware` / `--system` overrides.

```yaml
schema_version: "1.0"
inputs:
  env: ../demo/yaml-plus-plugin-env.yaml
limits:
  max_steps: 80000
assertions:
  - expected_stop_reason: max_steps
runner:
  executable: ../target/release/labwired-pro
debug:
  adapter:
    executable: ../target/debug/labwired-pro-dap
```

F5 debug remains single-machine DAP today; multi-node proof for the demo is
**Run Test** with the env profile above.

Open the folder that contains `.labwired/lab.yaml` as the workspace root (the
extension only reads that one path). Stock auto-download is still `v0.25.0`;
if your env script needs a newer public `labwired`, point `runner.executable`
or `labwired.cliPath` at a tip build until a newer core CLI tag exists.

## Sign in (optional)

Local simulation needs no account. Sign-in uses LabWired’s OAuth (Clerk-backed) at `api.labwired.com` for hosted features only.

- Tokens live in VS Code **SecretStorage**.
- Override the API with `labwired.apiUrl`.

## Settings

| Setting | Purpose |
|---------|---------|
| `labwired.apiUrl` | API base (default `https://api.labwired.com`) |
| `labwired.cliPath` | Use your own `labwired` binary |
| `labwired.dapPath` | Use your own `labwired-dap` |
| `labwired.cliVersion` | Release tag for auto-download (default `v0.25.0`) |
| `labwired.executionMode` | `local` or `docker` |

## Development

```bash
npm install
npm run compile
npm run test:unit
```

Press **F5** in this folder to launch an Extension Development Host.

```bash
npm run package   # → labwired-vscode-*.vsix
```

## License

MIT.
