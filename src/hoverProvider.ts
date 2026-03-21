import * as vscode from "vscode";

/**
 * Provides evaluatable expressions for hover-over-variable support
 * during debug sessions. Recognizes ARM register names (R0-R15, SP, LR, PC)
 * and hex memory addresses (0x...) in source code.
 */
export class LabwiredEvaluatableExpressionProvider
  implements vscode.EvaluatableExpressionProvider
{
  private static readonly REGISTER_PATTERN =
    /\b(R[0-9]|R1[0-5]|SP|LR|PC|MSP|PSP|XPSR|PRIMASK|BASEPRI|FAULTMASK|CONTROL)\b/i;

  private static readonly HEX_ADDRESS_PATTERN = /\b0x[0-9A-Fa-f]{4,8}\b/;

  private static readonly DEREF_PATTERN = /\*\(\s*0x[0-9A-Fa-f]+\s*\)/;

  provideEvaluatableExpression(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.EvaluatableExpression> {
    const line = document.lineAt(position.line).text;

    // Check for memory dereference pattern *(0xADDR)
    const derefMatch = this.findMatchAtPosition(
      line,
      LabwiredEvaluatableExpressionProvider.DEREF_PATTERN,
      position.character
    );
    if (derefMatch) {
      return new vscode.EvaluatableExpression(derefMatch.range);
    }

    // Check for register names
    const regMatch = this.findMatchAtPosition(
      line,
      LabwiredEvaluatableExpressionProvider.REGISTER_PATTERN,
      position.character
    );
    if (regMatch) {
      return new vscode.EvaluatableExpression(
        regMatch.range,
        regMatch.text.toUpperCase()
      );
    }

    // Check for hex addresses (show as memory dereference)
    const hexMatch = this.findMatchAtPosition(
      line,
      LabwiredEvaluatableExpressionProvider.HEX_ADDRESS_PATTERN,
      position.character
    );
    if (hexMatch) {
      return new vscode.EvaluatableExpression(
        hexMatch.range,
        `*(${hexMatch.text})`
      );
    }

    return undefined;
  }

  private findMatchAtPosition(
    line: string,
    pattern: RegExp,
    charPos: number
  ): { range: vscode.Range; text: string } | undefined {
    const globalPattern = new RegExp(pattern.source, pattern.flags + "g");
    let match: RegExpExecArray | null;

    while ((match = globalPattern.exec(line)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      if (charPos >= start && charPos <= end) {
        return {
          range: new vscode.Range(0, start, 0, end),
          text: match[0],
        };
      }
    }

    return undefined;
  }
}
