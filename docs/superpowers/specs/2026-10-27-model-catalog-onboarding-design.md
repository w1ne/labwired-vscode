# Model catalog onboarding design

## Goal

Make first-time LabWired setup a short native VS Code flow. Users can choose a
public model from the existing `labwired-core` catalog or select a local model
YAML, then select the firmware ELF. The extension saves both inputs in the
project's `.labwired/lab.yaml` so F5 and the Run command use the same model.

## Approaches considered

1. **Read only a local core checkout:** simple and offline, but users without a
   core source checkout cannot browse the model list or download model data.
2. **Generate a public config bundle from the core catalog:** uses the existing
   core YAML tree as the only source, updates as core changes, and does not
   require a hand-maintained second model list. The published `chips` array is
   generated directly from `Catalog::chip_names()`, so the extension does not
   maintain a second list or duplicate the core discovery rules. This is the
   recommended path.
3. **Bundle a separate model list with the extension:** easy to host, but the
   list and model files can drift from core and only update with an extension
   release.

## User flow

1. Run **LabWired: Configure Model**.
2. A native Quick Pick offers **Choose from LabWired catalog** and **Select
   model YAML**.
3. Catalog selection downloads or reuses the public core config bundle. The
   Quick Pick lists the `chips` names from the generated catalog manifest; a
   matching `configs/systems/<chip>.yaml` is used when present. Otherwise the
   extension writes a minimal system manifest that points at the selected chip
   descriptor.
4. The extension stores the downloaded `configs` tree under
   `.labwired/models/<catalog-commit>/configs`, preserving relative paths used
   by chip and peripheral YAMLs. It then asks for the firmware ELF.
5. The local YAML path opens VS Code's file picker for the system YAML and then
   asks for the firmware ELF.
6. Both paths save portable project-relative inputs to `.labwired/lab.yaml`.
   The existing optional custom DAP settings remain available. A user who
   already has a profile can press F5 without opening the wizard.

## Optional project-linked test runner

Projects whose model is available only through a plugin-linked core build can
set a top-level `runner.executable` in `.labwired/lab.yaml`. Its path is
resolved relative to that file, with an existing `.exe` selected on Windows
when the configured path has no extension. **Run Test** prefers this runner
when set and otherwise uses the stock LabWired CLI. The extension removes both
extension-only top-level keys (`debug` and `runner`) from the temporary script
copy passed to core, preserving all other script text and relative paths.

## Catalog source and updates

`labwired-core` already has a local `Catalog` that reads
`$LABWIRED_CONFIG_DIR` or the repository's `configs` directory. It does not
serve or download that catalog. A small core workflow will publish
`configs.tar.gz` and `catalog.json` to a dedicated public `model-catalog`
artifact branch whenever `main` changes under `configs/`. The JSON contains
the core commit SHA, the sorted chip names produced by `Catalog::chip_names()`,
and the SHA-256 checksum for the archive. This makes the existing YAML files
and catalog implementation the single source of truth and lets the extension
cache the downloaded bundle by commit SHA.

The extension uses VS Code's built-in progress and notification APIs during
download and extraction. A failed or cancelled download leaves the project
profile untouched and offers the local YAML path.

## Privacy boundary

The public catalog contains only `labwired-core`'s public `configs` tree. A
project-specific or private model stays in its own repository and can use the
local YAML path. No private model entry is added to the public bundle.

## Error handling

- Cancelling either file picker leaves an existing `.labwired/lab.yaml`
  unchanged.
- A network failure or invalid archive reports the failing action and leaves
  the project unchanged; the user can select a local YAML instead.
- The downloaded YAML tree is stored in the project so its relative profile
  paths continue to work on Windows, Linux, and WSL after sharing the project.
- If no matching system YAML exists, the generated manifest points to the
  selected chip YAML using a relative path.

## Verification

- Core workflow test or check verifies that the published archive contains the
  current `configs` tree and commit SHA.
- Extension tests cover catalog list construction, archive download/cache,
  extraction path safety, selected-model installation, synthesized manifests,
  local YAML selection, firmware selection, and cancellation without profile
  mutation.
- Package and extension-host checks run on Windows x64 and Linux; the WSL job
  uses the Linux-side VS Code extension host.
- The CowManager K32 profile continues to use its private YAML and firmware
  paths from its own repository.
