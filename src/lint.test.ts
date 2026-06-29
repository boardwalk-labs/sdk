// SPDX-License-Identifier: MIT

import { describe, it, expect } from "vitest";
import { lintDeterminism } from "./lint.js";

describe("lintDeterminism", () => {
  it("returns no warnings for a clean program", () => {
    const src = `
      import { agent, output } from "@boardwalk-labs/workflow";
      const haiku = await agent("write a haiku");
      output(haiku);
    `;
    expect(lintDeterminism(src)).toEqual([]);
  });

  it("flags bare Date.now / Math.random / new Date() / performance.now / fetch", () => {
    const src = `
      const a = Date.now();
      const b = Math.random();
      const c = new Date();
      const d = performance.now();
      const e = await fetch("https://example.com");
    `;
    const symbols = lintDeterminism(src)
      .map((w) => w.symbol)
      .sort();
    expect(symbols).toEqual(["Date.now", "Math.random", "fetch", "new Date()", "performance.now"]);
  });

  it("flags crypto randomness: crypto.randomUUID / crypto.getRandomValues / bare randomUUID", () => {
    const src = `
      import { randomUUID } from "node:crypto";
      const a = crypto.randomUUID();
      const b = crypto.getRandomValues(new Uint8Array(16));
      const c = randomUUID();
    `;
    const symbols = lintDeterminism(src)
      .map((w) => w.symbol)
      .sort();
    expect(symbols).toEqual(["crypto.getRandomValues", "crypto.randomUUID", "randomUUID"]);
  });

  it("points each clock/random/uuid symbol at its durable primitive", () => {
    const byMessage = (sym: string): string => {
      const w = lintDeterminism(`const x = ${sym};`);
      return w[0]?.message ?? "";
    };
    expect(byMessage("Date.now()")).toContain("use now()");
    expect(byMessage("Math.random()")).toContain("use random()");
    expect(byMessage("crypto.randomUUID()")).toContain("use uuid()");
    // A non-substitutable source falls back to the step.run / agent escape hatch.
    expect(byMessage('fetch("x")')).toContain("step.run");
  });

  it("does NOT flag the durable primitives themselves (now / random / uuid)", () => {
    const src = `
      import { now, random, uuid, output } from "@boardwalk-labs/workflow";
      output({ t: await now(), r: await random(), id: await uuid() });
    `;
    expect(lintDeterminism(src)).toEqual([]);
  });

  it("does NOT flag nondeterminism inside step.run (its result is memoized)", () => {
    const src = `
      import { step, output } from "@boardwalk-labs/workflow";
      const t = await step.run("stamp", () => Date.now());
      const r = await step.run("roll", async () => {
        const x = Math.random();
        return await fetch("https://api.example.com/" + x);
      });
      output({ t, r });
    `;
    expect(lintDeterminism(src)).toEqual([]);
  });

  it("does NOT flag nondeterminism inside an agent() call (a journaled seam)", () => {
    const src = `
      import { agent } from "@boardwalk-labs/workflow";
      await agent("the time is " + Date.now());
    `;
    expect(lintDeterminism(src)).toEqual([]);
  });

  it("flags a clock read OUTSIDE the seam even when another is safely inside it", () => {
    const src = `
      import { step } from "@boardwalk-labs/workflow";
      const safe = await step.run("a", () => Date.now());
      const unsafe = Math.random();
    `;
    const w = lintDeterminism(src);
    expect(w).toHaveLength(1);
    expect(w[0]?.symbol).toBe("Math.random");
  });

  it("does NOT flag new Date(timestamp) — only the zero-arg clock read", () => {
    const src = `const d = new Date(1700000000000);`;
    expect(lintDeterminism(src)).toEqual([]);
  });

  it("reports 1-based line + column", () => {
    const src = `const a = 1;\nconst b = Date.now();`;
    const w = lintDeterminism(src);
    expect(w).toHaveLength(1);
    expect(w[0]?.line).toBe(2);
    expect(w[0]?.column).toBe(11);
  });

  it("returns no warnings (never throws) on a syntax error", () => {
    expect(lintDeterminism("const x = (")).toEqual([]);
  });
});
