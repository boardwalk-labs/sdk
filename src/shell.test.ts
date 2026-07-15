// SPDX-License-Identifier: MIT

import { realpathSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { shell } from "./shell.js";
import { installHost, resetRuntime, type WorkflowHost } from "./runtime.js";

// macOS symlinks /tmp -> /private/tmp, so `pwd` resolves the physical path.
const TMP = realpathSync("/tmp");

function hostWithWorkspace(workspaceDir: string): WorkflowHost {
  return {
    agent: () => Promise.resolve(""),
    callWorkflow: () => Promise.resolve(null),
    sleep: () => Promise.resolve(),
    getSecret: () => Promise.resolve(""),
    runtime: {
      runId: "run_1",
      workflowId: "wf_1",
      orgId: "org_1",
      apiUrl: "https://api.boardwalk.sh",
      apiToken: () => Promise.resolve("t"),
      idToken: () => Promise.resolve("j"),
      workspaceDir,
    },
  };
}

beforeEach(() => resetRuntime());
afterEach(() => resetRuntime());

describe("shell", () => {
  it("returns stdout with the trailing newline trimmed", () => {
    expect(shell("printf 'hello\\n'")).toBe("hello");
  });

  it("folds stderr and the exit code into the thrown error, naming the command", () => {
    try {
      shell("echo boom 1>&2; exit 3");
      expect.unreachable("should have thrown");
    } catch (err) {
      const msg = (err as Error).message;
      expect(msg).toContain("shell command failed");
      expect(msg).toContain("exit 3");
      expect(msg).toContain("echo boom");
      expect(msg).toContain("boom");
    }
  });

  it("runs in an explicit cwd", () => {
    expect(shell("pwd", { cwd: TMP })).toBe(TMP);
  });

  it("defaults cwd to the host's workspace root", () => {
    installHost(hostWithWorkspace(TMP));
    expect(shell("pwd")).toBe(TMP);
  });

  it("merges env over process.env", () => {
    expect(shell('printf %s "$BWK_SHELL_TEST"', { env: { BWK_SHELL_TEST: "xyz" } })).toBe("xyz");
  });

  it("kills a command that exceeds the timeout", () => {
    expect(() => shell("sleep 5", { timeoutMs: 100 })).toThrow(/shell command failed/);
  });

  it("works with no host installed, falling back without throwing", () => {
    expect(shell("printf ok")).toBe("ok");
  });
});
