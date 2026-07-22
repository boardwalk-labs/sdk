// SPDX-License-Identifier: MIT

// shell() — run a command on the host, protocol-backed like every other capability.
//
// A workflow program routinely shells out (clone a repo, run a build, git push). shell()
// resolves to the COMPLETED command — exit code included, never thrown — so a failing
// command is data to branch on, not an exception to unwrap:
//
//   const { exitCode, stdout, stderr } = await shell("git push");
//   if (exitCode !== 0) { ... stderr ... }
//
// It runs in the trusted PROGRAM layer: it may see secret values, and its output is NOT
// redacted from anything you print — never `console.log` a secret-bearing stdout (the run
// log is persisted un-redacted). cwd defaults to the run's workspace root, so
// `await shell("git clone <url> repo")` then `agent(prompt, { cwd: "repo" })` line up.

import { getHost } from "./host_client.js";
import type { ShellResult } from "./protocol.js";

export type { ShellResult } from "./protocol.js";

/** Options for {@link shell}. */
export interface ShellOptions {
  /**
   * Working directory. Defaults to the run's workspace root (`context.workspaceDir`) — the
   * same directory `agent({ cwd })` resolves against.
   */
  cwd?: string;
  /**
   * Extra environment variables merged over the command's environment. NEVER put a secret
   * here that the command echoes to stdout: shell() returns stdout to your program, and
   * anything you then `console.log` lands in the (persisted, un-redacted) run log.
   */
  env?: Record<string, string>;
  /** Kill the command after this many milliseconds. */
  timeoutMs?: number;
  /** Max bytes captured on stdout/stderr before the command is killed. Host default 16 MiB. */
  maxBuffer?: number;
}

/**
 * Run a shell command to completion and resolve to its {@link ShellResult}
 * (`{ exitCode, stdout, stderr }`). A non-zero exit RESOLVES (check `exitCode`); only a
 * command that could not run at all (or a cancelled run) rejects.
 */
export async function shell(cmd: string, opts?: ShellOptions): Promise<ShellResult> {
  return await (await getHost()).shell(cmd, opts);
}
