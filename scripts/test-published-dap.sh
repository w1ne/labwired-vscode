#!/usr/bin/env bash
# Exercise real released firmware in a real VS Code extension host. A missing
# asset, failed first-run download, or broken debugger must fail the release.
set -euo pipefail

cd "$(dirname "$0")/.."
DIR="$(mktemp -d "${RUNNER_TEMP:-/tmp}/labwired-vscode-release-e2e.XXXXXX")"
trap 'rm -rf "$DIR"' EXIT
mkdir -p "$DIR/runtime" "$DIR/fw"

CORE_TAG=v0.26.0
FW_TAG=firmware-demos-v17
ARCHIVE="labwired-${CORE_TAG}-linux-x86_64.tar.gz"

gh release download "$CORE_TAG" -R w1ne/labwired-core -p "$ARCHIVE" -D "$DIR/runtime"
tar -xzf "$DIR/runtime/$ARCHIVE" -C "$DIR/runtime"
gh release download "$FW_TAG" -R w1ne/labwired-core -p demo-blinky.elf -D "$DIR/fw"
test -x "$DIR/runtime/labwired"
test -x "$DIR/runtime/labwired-dap"
test -s "$DIR/fw/demo-blinky.elf"
"$DIR/runtime/labwired" --version

# Test the same release on the same chip model as the VS Code F5 session.
"$DIR/runtime/labwired" --firmware "$DIR/fw/demo-blinky.elf" \
    --system test/fixtures/stm32f103-system.yaml \
    --max-steps 1500 --json > "$DIR/cli-smoke.log" 2>&1
cat "$DIR/cli-smoke.log"
tail -n 1 "$DIR/cli-smoke.log" | jq -e \
    '.status == "finished" and .total_instructions == 1500'

export LABWIRED_DAP_BIN="$DIR/runtime/labwired-dap"
export LABWIRED_DEMO_ELF="$DIR/fw/demo-blinky.elf"
export LABWIRED_SYSTEM_YAML="$(pwd)/test/fixtures/stm32f103-system.yaml"
export LABWIRED_REQUIRE_DAP_E2E=1
export LABWIRED_TEST_AUTO_DOWNLOAD=1

# This covers explicit DAP startup, stack, registers, RAM, forward/reverse
# instruction stepping, and genuine first-run download of the default DAP.
xvfb-run -a npm test
