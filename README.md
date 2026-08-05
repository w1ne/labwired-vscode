# LabWired for VS Code

Debug firmware on a **virtual chip** — breakpoints, stepping (including reverse), registers, memory — with no hardware attached.

Optionally connect **agent tools** (the same `labwired_*` MCP surface as the Playground and CLI) so Copilot, Claude Code, or Cursor can compile, run, and verify firmware on the twin.

## Get started

1. Install the extension.
2. Open a firmware project and build it.
3. Press **F5**.

No `launch.json` required: the extension resolves the ELF from `.labwired/lab.yaml` or discovers your build. The simulator and debug adapter download themselves on first use.

## Agent tools (optional)

Same tools everywhere: `labwired_list`, `labwired_describe`, `labwired_compile`, `labwired_run`, `labwired_verify`, part knowledge, …

1. **LabWired: Sign In** (optional; unlocks authenticated hosted tools).
2. **LabWired: Configure Agent Tools** → writes `.vscode/mcp.json` pointing at `https://api.labwired.com/mcp`.
3. Use your editor’s agent chat; it can call those tools.

Claude Code (outside VS Code):

```bash
claude mcp add labwired --transport http https://api.labwired.com/mcp
```

**LabWired: Copy Claude MCP Install Command** copies that line.

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

**LabWired: Configure Project…** generates `.labwired/lab.yaml`.

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
| `labwired.cliVersion` | Release tag for auto-download |
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
