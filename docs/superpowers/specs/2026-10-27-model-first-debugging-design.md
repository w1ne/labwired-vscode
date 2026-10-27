# Model-first LabWired debugging design

## Goal

Make the LabWired VS Code extension straightforward to configure for any model
project. A user selects a model/system YAML and firmware image, saves them as a
reusable profile with the project, and starts debugging with F5. CowManager's
K32W041Z M1 is the end-to-end example, including its optional custom DAP.

The setup must not depend on a CowManager directory layout or a root-level file
named `system.yaml`. The extension remains usable with the public LabWired DAP
for models it supports. Models requiring private or custom plugins can specify
their own adapter build and executable in the saved profile.

## Approaches considered

1. **Model profile file (recommended):** a setup command selects the model YAML
   and firmware and writes their paths to `.labwired/lab.yaml`. Optional custom
   DAP build and executable settings live in the same file. The profile travels
   with the project and works the same after reopening it on Windows, Linux, or
   WSL.
2. **VS Code settings only:** save paths and custom DAP settings in editor
   settings. This is quick for one machine but is harder to share with Joost and
   can silently vary between machines.
3. **Prompt on every run:** ask for model YAML, firmware, and DAP on each F5.
   This avoids a config file but repeats setup and makes a stable, testable
   delivery harder.

The model profile is the simplest option that stays portable and repeatable.

## User flow

1. Open the folder containing the model project in VS Code. This is simply the
   project folder used to store its profile; no special CowManager workspace or
   layout is required.
2. Run **LabWired: Configure Model**. The wizard lets the user browse for a
   system/model YAML and a firmware ELF (and optionally enter paths manually).
   It can find files nested anywhere under the project, while browsing can
   select files outside the project when needed.
3. The wizard writes `.labwired/lab.yaml` with project-relative paths and asks
   before replacing an existing profile. The user can optionally set a custom
   DAP executable and a build command with arguments and working directory.
4. Press F5. The extension reads the saved profile, builds a configured custom
   DAP on each debug start, launches it, and passes the selected firmware and
   model YAML. If no custom DAP is configured, it uses the standard downloaded
   LabWired DAP.
5. The topology and device views use the same selected model YAML as F5. They do
   not independently guess a root-level `system.yaml`.

## Configuration shape

Keep existing `inputs.firmware` and `inputs.system` fields in
`.labwired/lab.yaml`. Paths are relative to the configuration file directory
so the profile remains portable. Add an optional adapter section, for example:

```yaml
schema_version: "1.0"
inputs:
  firmware: ../target/thumbv7em-none-eabi/release/demo-m1
  system: ../crates/labwired-ip-chips/chips/k32w041z-system.yaml
debug:
  adapter:
    executable: ../target/release/labwired-pro-dap
    build:
      command: cargo
      args: [build, -p, labwired-pro-dap, --release]
      cwd: ..
```

The adapter section is optional. `executable` without `build` launches a
prebuilt custom DAP. `build` requires an explicit executable path. When both are
present, the extension runs the configured build before launching the
executable. Commands are invoked as a program plus argument array, with the
configured working directory; no shell string interpolation is required.

## Components and data flow

- **Configure Model command:** replace the wizard's root-only `system.yaml`
  detection with model/system YAML selection. Persist firmware, system, and
  optional adapter settings in the existing `.labwired/lab.yaml` contract.
- **Lab config parser:** validate the optional adapter fields, resolve relative
  paths from the config file location, and report missing files or malformed
  commands with actionable errors.
- **Debug launch:** read firmware and system from the same profile. If an
  adapter build is configured, execute it before launching the adapter; on
  failure, show build output and do not start a stale binary. Otherwise use the
  selected custom executable or the standard released DAP.
- **Core DAP plugin boundary:** add a generic plugin-registration path to the
  public DAP so model integrations can supply plugins without putting private
  model code into core. CowManager builds a small private DAP executable that
  registers only the allowlisted K32 model plugin.
- **Device/topology views:** use the active debug configuration's system path,
  then the `.labwired/lab.yaml` input, so inspection describes the running
  model.
- **Generic board I/O:** allow the system config to describe GPIO register
  offsets and board pins for live LEDs/buttons. CowManager maps DS2, DS3, and
  BP1 through this generic contract; core contains no K32-specific mapping.
- **CowManager example:** add a checked-in profile or equivalent documented
  setup that builds the private K32 plugin adapter and maps DS2, DS3, and BP1
  into the live device view. Do not copy unrelated private IP into the delivery
  repository.
- **Runtime default:** align the extension's downloaded runtime version with a
  published core release and keep platform assets for Windows x64, Linux x64,
  Linux ARM64, and WSL's Linux-side extension host.

## Error handling

- A cancelled file picker leaves existing configuration untouched.
- Invalid or missing model/firmware files are shown before debug launch.
- A build failure shows the command output and stops launch; it never falls
  through to an older custom DAP binary.
- A custom executable that is missing or not runnable gets an error that names
  the configured path and setup command.
- If the project has no profile, the extension offers **Configure Model**
  instead of assuming a particular source tree.

## Verification

- Unit tests cover portable relative path resolution, optional adapter
  validation, cancellation, and custom build success/failure behavior.
- Extension-host tests launch the standard DAP and a test custom DAP, confirm
  the selected model YAML is passed to both F5 and device views, and confirm a
  failed custom build prevents launch.
- CowManager verification builds and launches the K32 M1 adapter and checks
  DS2/DS3 output and BP1 input visibility.
- Core tests verify both the default DAP path and a plugin-enabled DAP path;
  model-plugin code remains outside the public core repository.
- Package the VSIX and verify it contains runtime extension code.
- Run the debugger smoke matrix on Windows x64, Linux x64, Linux ARM64, and WSL.

## Scope boundaries

This change does not publish or bundle private model sources in the public
extension. CowManager's private model remains in the private delivery path; the
extension profile only identifies the selected files and configured adapter.
No email is sent as part of implementation or delivery preparation.
