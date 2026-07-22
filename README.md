# LabWired VS Code Extension

Official VS Code extension for the **LabWired Firmware Simulation Platform**.

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

## Features
*   **Command Center**: Live telemetry + board overview from `system.yaml`.
*   **Topology View**: Expanded system topology rendering for MCU and peripherals.
*   **Timeline View**: Visualize execution history (PC, Interrupts) over time.
*   **Register Inspector**: View and modify peripheral registers with bit-field expansion.
*   **Memory View**: Inspect and edit memory in Hex/ASCII.
*   **Debug Adapter**: Connects to the `labwired` GDB/DAP server (F5 debugging).

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
