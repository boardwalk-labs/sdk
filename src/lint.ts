// SPDX-License-Identifier: MIT

// @boardwalk-labs/workflow/lint — static determinism lint for a workflow program.
//
// Boardwalk runs are restart-from-the-top on crash (hold-and-pay) and replay-from-the-top on
// resume (durable suspension). Either way, any code OUTSIDE a journaled seam re-executes — so a
// bare nondeterministic call (Date.now / new Date() / Math.random / crypto.randomUUID / fetch / …)
// can silently produce a DIFFERENT value the second time, corrupting the run's logic. The fix is
// the durable primitives `now()` / `random()` / `uuid()` (each memoizes its value through a step),
// or for arbitrary I/O `step.run(name, fn)` / `agent()` (journaled seams). This lint flags such
// calls anywhere in the program — determinism matters everywhere, not just on a path to a suspend.
// It returns warnings; whether they BLOCK is the caller's policy (the CLI fails `deploy` on them
// unless `--allow-nondeterminism` is passed).
//
// Pure AST analysis via the TypeScript compiler API; it executes none of the program. A subpath
// export (`@boardwalk-labs/workflow/lint`) shared by the CLI, the engines, and the hosted deploy
// so the warning is identical everywhere.

import ts from "typescript";

export interface DeterminismWarning {
  /** The flagged symbol, e.g. "Date.now", "Math.random", "new Date()", "fetch". */
  symbol: string;
  /** 1-based line + column of the flagged call. */
  line: number;
  column: number;
  /** A one-line explanation + fix suggestion. */
  message: string;
}

export interface LintOptions {
  /** Logical file name (drives TS-vs-JS parsing + appears in messages). Defaults to "index.ts". */
  fileName?: string;
}

const DEFAULT_FILE_NAME = "index.ts";

const STEP_FIX = "wrap it in step.run(name, fn) (its result is memoized) or move it behind agent()";

/**
 * Call expressions (by callee name) + `new X()` forms whose value is nondeterministic — they read the
 * clock, randomness, or the network, so a replay produces a different value. Property-access callees
 * appear dotted ("Date.now"); bare-identifier callees appear plain ("fetch"). `new Date()` is handled
 * separately ({@link isBareNewDate}) since only the zero-arg form is a clock read.
 */
const NONDETERMINISTIC = new Set([
  "Date.now",
  "Math.random",
  "performance.now",
  "crypto.randomUUID",
  "crypto.getRandomValues",
  "fetch",
  "randomUUID", // `import { randomUUID } from "node:crypto"` called bare
]);

/** The most ergonomic durable replacement for a flagged symbol — the durable primitive when one fits,
 *  else the general step/agent escape hatch. */
function fixFor(symbol: string): string {
  switch (symbol) {
    case "Date.now":
    case "new Date()":
    case "performance.now":
      return `use now() (durable epoch ms — \`new Date(await now())\` for a Date), or ${STEP_FIX}`;
    case "Math.random":
      return `use random() (durable float in [0,1)), or ${STEP_FIX}`;
    case "crypto.randomUUID":
    case "randomUUID":
      return `use uuid() (durable v4 id), or ${STEP_FIX}`;
    default:
      return STEP_FIX;
  }
}

/**
 * Flag bare nondeterministic calls that sit OUTSIDE a journaled seam (`step.run` / `agent`), where
 * a restart/resume would re-run them with a different value. Advisory — returns warnings (sorted by
 * position); it is the caller's choice to print or ignore them. Never throws on a syntax error (a
 * malformed program returns no warnings — the manifest extractor reports syntax errors).
 */
export function lintDeterminism(source: string, options: LintOptions = {}): DeterminismWarning[] {
  const fileName = options.fileName ?? DEFAULT_FILE_NAME;
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, /*setParentNodes*/ true);
  const warnings: DeterminismWarning[] = [];
  // Depth of enclosing journaled-seam calls (step.run / agent). Inside one, nondeterminism is fine
  // (step.run memoizes its callback's result; agent is itself a journaled seam).
  let seamDepth = 0;

  const flag = (node: ts.Node, symbol: string): void => {
    if (seamDepth > 0) return;
    const { line, character } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    warnings.push({
      symbol,
      line: line + 1,
      column: character + 1,
      message: `${symbol} is nondeterministic and re-runs on a restart/resume — ${fixFor(symbol)}.`,
    });
  };

  const visit = (node: ts.Node): void => {
    const isSeam = ts.isCallExpression(node) && isSeamCallee(node.expression);
    if (isSeam) seamDepth += 1;

    if (ts.isCallExpression(node)) {
      const name = calleeName(node.expression);
      if (name !== null && NONDETERMINISTIC.has(name)) {
        flag(node, name);
      }
    } else if (ts.isNewExpression(node) && isBareNewDate(node)) {
      flag(node, "new Date()");
    }

    ts.forEachChild(node, visit);
    if (isSeam) seamDepth -= 1;
  };
  visit(sf);
  return warnings;
}

/** A bare identifier ("fetch", "randomUUID") or a single-level property access ("Date.now",
 *  "crypto.randomUUID"); null for anything deeper (e.g. `globalThis.crypto.randomUUID`). */
function calleeName(expr: ts.Expression): string | null {
  if (ts.isIdentifier(expr)) return expr.text; // fetch(...), randomUUID(...)
  if (ts.isPropertyAccessExpression(expr) && ts.isIdentifier(expr.expression)) {
    return `${expr.expression.text}.${expr.name.text}`; // Date.now, crypto.randomUUID, …
  }
  return null;
}

/** True for `agent(...)` or `step.run(...)` — the journaled seams that make nondeterminism safe. */
function isSeamCallee(expr: ts.Expression): boolean {
  if (ts.isIdentifier(expr)) return expr.text === "agent";
  if (ts.isPropertyAccessExpression(expr) && ts.isIdentifier(expr.expression)) {
    return expr.expression.text === "step" && expr.name.text === "run";
  }
  return false;
}

/** True for `new Date()` with no arguments (a clock read). `new Date(ts)` is deterministic. */
function isBareNewDate(node: ts.NewExpression): boolean {
  return (
    ts.isIdentifier(node.expression) &&
    node.expression.text === "Date" &&
    (node.arguments === undefined || node.arguments.length === 0)
  );
}
