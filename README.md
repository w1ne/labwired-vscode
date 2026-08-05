# LabWired for VS Code

Debug firmware on a **simulated chip** — breakpoints, stepping, and every register — with no
hardware attached. Wire the **same agent tools** every LabWired surface uses (`labwired_*` MCP
at `api.labwired.com`) into VS Code / Copilot / Claude Code.

> **Ship this first.** This extension is MIT and installs into stock VS Code. The full LabWired
> Editor (forked workbench) is a separate product with its own licensing — not required for
> agent tools, twin debug, or hosted MCP.

## Get started

1. Install the extension (Marketplace or `.vsix`).
2. Open a firmware project and build it.
3. Press **F5** to debug on the twin.

Optional — agent tools (shared with playground & CLI):

1. **LabWired: Sign in** (hosted features).
2. **LabWired: Configure Agent Tools (MCP)** → writes `.vscode/mcp.json`.
3. Chat with Copilot / your agent; it gets `labwired_list` / `compile` / `run` / `verify` / part knowledge.

Or install the same tools in Claude Code (no VS Code):

```bash
claude mcp add labwired --transport http https://api.labwired.com/mcp
```

(Command palette: **LabWired: Copy Claude MCP Install Line**.)

## What you get

| | |
|---|---|
| **Breakpoints and stepping** | Including *step back* — the simulator can run in reverse. |
| **Every register** | CPU core registers and decoded peripheral registers, searchable, with **changes since the last stop highlighted**. `LabWired: Show Registers`. |
| **Memory** | Hex/ASCII inspect and edit. Unmapped address space is reported as unreadable rather than shown as zeros. |
| **Peripherals** | Register names and bit-fields for the chips that can decode them; peripherals with no schema say so rather than appearing empty. |
| **Timeline, trace, profiler** | Execution history, instruction trace, and where the cycles went. |

Inspecting is passive: reading a peripheral cannot perturb the firmware you are debugging.

## Run in LabWired — the one-file contract

Each project describes its simulation in a single file, `.labwired/lab.yaml`:

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

Paths inside `inputs.*` resolve relative to the `.labwired/` directory. When you click
**Run in LabWired**, the extension builds your firmware and then executes the exact same
command CI runs over that exact same file:

```
labwired test --script .labwired/lab.yaml --output-dir .labwired/out --firmware <built elf>
```

so the editor can never disagree with CI. It emits `result.json` / `uart.log` / `junit.xml`
and an exit code. Running is free — no login required. The `labwired` CLI is auto-downloaded
on first use (set `labwired.cliPath` to use your own build; on Windows set it explicitly —
auto-download is not yet available there).

Use **LabWired: Configure Project...** to generate `.labwired/lab.yaml`.

## Sign in (optional)

Running the simulator is **free and needs no login** — everything above works signed out.

Signing in is entirely optional and only unlocks **hosted** features. It uses **LabWired's
own account** (Clerk-backed OAuth 2.1, `api.labwired.com`), not a third party. The flow is
standard OAuth with PKCE: your browser opens, you approve, and VS Code receives the callback.

- **LabWired: Sign in** / **LabWired: Sign out** (also available from the status bar item).
- Your access/refresh tokens are stored in VS Code **SecretStorage** — never in plain settings
  or logs.
- Point at a different backend with the `labwired.apiUrl` setting (default
  `https://api.labwired.com`).

Sign-in tokens are LabWired account tokens and are **not** used for local runs, which stay free.

## Development

1.  **Install Dependencies**:
    ```bash
    npm install
    ```

2.  **Compile**:
    ```bash
    npm run compile
    ```

3.  **Run**:
    Open this folder in VS Code and press `F5`.

## Requirements
*   **Local Mode**: The `labwired` CLI/DAP must be installed (included in the extension or available in PATH).
*   **Docker Mode**: Docker must be installed and running.

## Docker Support

LabWired supports running simulations, builds, and tests inside a Docker container. This ensures a consistent development environment and eliminates the need for manual toolchain setup.

### Configuration

To enable Docker mode, add the following to your VS Code settings:

```json
{
    "labwired.executionMode": "docker",
    "labwired.docker.image": "w1ne/labwired-dev:latest",
    "labwired.docker.autoPull": true
}
```

### Features

-   **Simulation in Docker**: The extensions runs the `labwired-dap` inside a container.
-   **Local Builds**: The extension uses your *local* toolchain (`cargo`, `make`) to build the firmware.
-   **Mirror Mounts**: The workspace is mounted to the exact same path inside the container, ensuring debug symbols match.
-   **Dashboard Access**: Port 9999 is automatically forwarded for the Live Dashboard.
