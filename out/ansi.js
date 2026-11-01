"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stripAnsi = void 0;
// The simulator logs through tracing with colour on; VS Code output channels
// print the escape codes as text. NO_COLOR stops most of it at the source,
// this removes whatever a runner prints anyway.
const ANSI_ESCAPE = /\x1b\[[0-9;?]*[A-Za-z]/g;
function stripAnsi(text) {
    return text.replace(ANSI_ESCAPE, '');
}
exports.stripAnsi = stripAnsi;
//# sourceMappingURL=ansi.js.map