# VS Code release QA and Renode parity — 2026-11-17

## Result and evidence

**No broad superiority claim.** LabWired has a tested local debugger workflow; Renode also
has web-editor/remote-session support that this extension does not offer.

- LabWired extension source: v0.15.3 release candidate; published runtime: core v0.26.0;
  fixture: `firmware-demos-v17/demo-blinky.elf` (ARM Cortex-M / STM32F103);
  Linux x86_64, VS Code 1.146, Node 22 used for local verification.
- 91 unit tests passed. 47 VS Code extension-host tests passed with the two **live**
  debugger tests required; zero skips in that run. The live test checks DAP
  attach/launch, source/stack PC, CPU registers, RAM, instruction step and undo.
- Published CLI ran 1,500 real firmware instructions on the same chip model.
- The first-run test verifies the extension actually downloads the published
  debug adapter after a configured adapter path is cleared. It checks binary
  provenance: a stale configured executable is a failure.
- `scripts/test-published-dap.sh` is the release gate in both pull-request CI
  and tag-publish CI. Missing artifacts are fatal (not Mocha skips).

These checks **do not** establish broad platform support, relative execution
speed, debug fidelity across MCUs, or active-user counts.

## Competitive workflow checklist

| Capability | LabWired evidence | Renode reference | Status |
| --- | --- | --- | --- |
| Debug ARM firmware from VS Code | Live DAP + ARM ELF: PASS on Linux | Supported | Local parity verified |
| First-run simulator acquisition | Real download after resetting configured binary: PASS | Windows/Linux auto-acquire | Local Linux pass |
| Stack/register/SRAM inspect | Live DAP requests: PASS | Supported | Basic parity verified |
| Instruction step and reverse | Real PC moved forward and reversed: PASS | Supported | Basic parity verified |
| Source breakpoints, UART and peripheral panels | Present in LabWired code; not all tested in the live gate | Supported | Further live tests needed |
| Web VS Code / Theia remote debugging | No `browser` entry point; Node workspace extension only | Official extension supports vscode.dev and remote WebSocket simulator | **Gap** |
| Agent/compile/run/verify integration | MCP commands integrated; needs real workflow gate | Not an equivalent advertised feature of Renode VS Code extension | Differentiation to verify |
| Supported chips and peripherals | No audited cross-product coverage comparison | Renode advertises broad validated model/board coverage | **No superiority evidence** |

## Required next benchmarks

1. Extend the live regression suite to source breakpoints, watch expressions,
   register writes, UART capture, RTOS tasks, and multi-node firmware tests.
2. Add native published-binary smoke on Windows x64 and macOS (both architectures);
   desktop mock tests do not substitute for real DAP launch.
3. Deliver a browser-compatible extension that uses **the existing LabWired
   simulator** through an authenticated remote DAP/WebSocket session. Do not
   reimplement the engine. Test in vscode.dev and Theia with no local binary.
4. Measure per-step error rate and first-debug latency against the *same*
   STM32/nRF/ESP32 firmware workloads in Renode; report fixtures, revisions,
   cold/warm starts, host hardware, and pass/fail outcomes.
5. Add consent-respecting aggregate usage events, measured separately from
   Marketplace/Open VSX downloads. Do not call downloads or sessions "users."

References: [Renode VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=Antmicro.renode),
[Renode extension source](https://github.com/antmicro/renode-vscode-extension),
[Renode VS Code documentation](https://renode.readthedocs.io/en/latest/debugging/vscode.html),
[Antmicro platform coverage](https://antmicro.com/platforms/renode/).
