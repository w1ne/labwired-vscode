// The simulator logs through tracing with colour on; VS Code output channels
// print the escape codes as text. NO_COLOR stops most of it at the source,
// this removes whatever a runner prints anyway.
const ANSI_ESCAPE = /\x1b\[[0-9;?]*[A-Za-z]/g;

export function stripAnsi(text: string): string {
    return text.replace(ANSI_ESCAPE, '');
}
