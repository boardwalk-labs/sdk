// SPDX-License-Identifier: MIT

// shell() — a blessed synchronous command runner for the trusted PROGRAM layer.
//
// A workflow program routinely shells out (clone a repo, run a build, git push). `execSync`
// works, but three papercuts bite every author: the default cwd is the program's bundle dir
// (NOT the run workspace — so `git clone x` lands in the wrong place), a failure throws an
// error whose message hides the captured stderr, and it's easy to leak a secret into a log.
// shell() defaults cwd to the workspace root, folds stderr into the thrown error, and documents
// the redaction caveat.

import { execSync } from "node:child_process";

import { peekHost } from "./host.js";

/** Options for {@link shell}. */
export interface ShellOptions {
  /**
   * Working directory. Defaults to the run's workspace root ({@link RuntimeContext.workspaceDir},
   * matching `runtime.workspaceDir`) — the same directory `agent({ cwd })` resolves against.
   */
  cwd?: string;
  /**
   * Extra environment variables merged over the process env. NEVER put a secret here that the
   * command echoes to stdout: shell() returns stdout to your program, and anything you then
   * `console.log` lands in the (persisted, un-redacted) run log.
   */
  env?: Record<string, string>;
  /** Kill the command after this many milliseconds (maps to `execSync`'s `timeout`). */
  timeoutMs?: number;
  /** Max bytes captured on stdout/stderr before the command is killed. Defaults to 16 MiB. */
  maxBuffer?: number;
}

/** The run's workspace root, matching `runtime.workspaceDir` and without throwing when no host. */
function defaultCwd(): string {
  return peekHost()?.runtime?.workspaceDir ?? process.env.WORKSPACE_ROOT ?? process.cwd();
}

/**
 * Run a shell command synchronously and return its stdout (trailing newline trimmed).
 *
 * Runs in the trusted PROGRAM layer — it may see secret values, and its output is NOT redacted
 * from anything you print. On a non-zero exit it throws an Error whose message includes the
 * command and the captured stderr (truncated), so a failure is debuggable from the run log
 * without re-running. cwd defaults to the workspace root, so `shell("git clone <url> repo")`
 * then `agent(prompt, { cwd: "repo" })` line up.
 *
 *   const head = shell("git rev-parse --short HEAD", { cwd: `${runtime.workspaceDir}/repo` });
 */
export function shell(cmd: string, opts?: ShellOptions): string {
  try {
    const out = execSync(cmd, {
      cwd: opts?.cwd ?? defaultCwd(),
      env: opts?.env === undefined ? process.env : { ...process.env, ...opts.env },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: opts?.timeoutMs,
      maxBuffer: opts?.maxBuffer ?? 16 * 1024 * 1024,
    });
    return out.replace(/\n+$/, "");
  } catch (err: unknown) {
    const e = err as { stderr?: Buffer | string; message?: string; status?: number | null };
    const stderr = (typeof e.stderr === "string" ? e.stderr : e.stderr?.toString("utf8"))?.trim();
    const detail =
      stderr !== undefined && stderr !== "" ? stderr.slice(0, 2000) : (e.message ?? "");
    const code = e.status === undefined || e.status === null ? "" : ` (exit ${e.status})`;
    throw new Error(`shell command failed${code}: ${cmd}\n${detail}`);
  }
}
