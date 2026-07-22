// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { reviveBySchema } from "./revive.js";

describe("reviveBySchema — the rich-type golden set", () => {
  it("revives an ISO date-time string to a Date", () => {
    const out = reviveBySchema("2026-07-01T12:30:00.000Z", {
      type: "string",
      format: "date-time",
    });
    expect(out).toBeInstanceOf(Date);
    expect((out as Date).toISOString()).toBe("2026-07-01T12:30:00.000Z");
  });

  it("revives the bigint integer-pattern string to a bigint", () => {
    const out = reviveBySchema("9007199254740993", { type: "string", pattern: "^-?\\d+$" });
    expect(out).toBe(9007199254740993n);
    expect(reviveBySchema("-42", { type: "string", pattern: "^-?\\d+$" })).toBe(-42n);
  });

  it("leaves the Python-only Decimal pattern as a string (TS has no native decimal)", () => {
    const out = reviveBySchema("1.50", { type: "string", pattern: "^-?\\d+(\\.\\d+)?$" });
    expect(out).toBe("1.50");
  });

  it("revives a base64 contentEncoding string to a Uint8Array", () => {
    const out = reviveBySchema(Buffer.from([1, 2, 255]).toString("base64"), {
      type: "string",
      contentEncoding: "base64",
    });
    expect(out).toBeInstanceOf(Uint8Array);
    expect([...(out as Uint8Array)]).toEqual([1, 2, 255]);
  });

  it("revives a uniqueItems array to a Set (items revived too)", () => {
    const out = reviveBySchema(["2026-01-01T00:00:00Z", "2026-01-02T00:00:00Z"], {
      type: "array",
      items: { type: "string", format: "date-time" },
      uniqueItems: true,
    });
    expect(out).toBeInstanceOf(Set);
    const values = [...(out as Set<Date>)];
    expect(values).toHaveLength(2);
    expect(values.every((v) => v instanceof Date)).toBe(true);
  });
});

describe("reviveBySchema — structure", () => {
  it("revives nested objects and arrays per their subschemas", () => {
    const schema = {
      type: "object",
      properties: {
        createdAt: { type: "string", format: "date-time" },
        total: { type: "string", pattern: "^-?\\d+$" },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: { at: { type: "string", format: "date-time" }, sku: { type: "string" } },
          },
        },
        note: { type: "string" },
      },
    };
    const out = reviveBySchema(
      {
        createdAt: "2026-07-01T00:00:00Z",
        total: "123",
        items: [{ at: "2026-07-02T00:00:00Z", sku: "a" }],
        note: "plain",
        extra: "untouched",
      },
      schema,
    ) as Record<string, unknown>;
    expect(out["createdAt"]).toBeInstanceOf(Date);
    expect(out["total"]).toBe(123n);
    const items = out["items"] as { at: Date; sku: string }[];
    expect(items[0]?.at).toBeInstanceOf(Date);
    expect(items[0]?.sku).toBe("a");
    expect(out["note"]).toBe("plain");
    expect(out["extra"]).toBe("untouched"); // no subschema — passes through
  });

  it("revives tuple positions per prefixItems and the overflow per items", () => {
    const out = reviveBySchema(["2026-07-01T00:00:00Z", "1", "2"], {
      type: "array",
      prefixItems: [{ type: "string", format: "date-time" }],
      items: { type: "string", pattern: "^-?\\d+$" },
    }) as unknown[];
    expect(out[0]).toBeInstanceOf(Date);
    expect(out[1]).toBe(1n);
    expect(out[2]).toBe(2n);
  });

  it("revives map values via additionalProperties", () => {
    const out = reviveBySchema(
      { a: "2026-07-01T00:00:00Z" },
      { type: "object", additionalProperties: { type: "string", format: "date-time" } },
    ) as Record<string, unknown>;
    expect(out["a"]).toBeInstanceOf(Date);
  });

  it("handles nullable anyOf: null stays null, the value revives via the non-null branch", () => {
    const schema = { anyOf: [{ type: "string", format: "date-time" }, { type: "null" }] };
    expect(reviveBySchema(null, schema)).toBeNull();
    expect(reviveBySchema("2026-07-01T00:00:00Z", schema)).toBeInstanceOf(Date);
  });

  it("passes an ambiguous multi-branch anyOf through unchanged", () => {
    const schema = { anyOf: [{ type: "string", format: "date-time" }, { type: "number" }] };
    expect(reviveBySchema("2026-07-01T00:00:00Z", schema)).toBe("2026-07-01T00:00:00Z");
  });

  it("resolves local $refs ($defs) including self-recursion", () => {
    const schema = {
      $ref: "#/$defs/node",
      $defs: {
        node: {
          type: "object",
          properties: {
            at: { type: "string", format: "date-time" },
            kids: { type: "array", items: { $ref: "#/$defs/node" } },
          },
        },
      },
    };
    const out = reviveBySchema(
      { at: "2026-07-01T00:00:00Z", kids: [{ at: "2026-07-02T00:00:00Z", kids: [] }] },
      schema,
    ) as { at: Date; kids: { at: Date }[] };
    expect(out.at).toBeInstanceOf(Date);
    expect(out.kids[0]?.at).toBeInstanceOf(Date);
  });

  it("survives a degenerate $ref cycle without hanging (passes through)", () => {
    const schema = { $ref: "#/$defs/a", $defs: { a: { $ref: "#/$defs/a" } } };
    expect(reviveBySchema("x", schema)).toBe("x");
  });
});

describe("reviveBySchema — passthrough (untyped / best-effort)", () => {
  it("passes everything through for a null, undefined, or empty schema", () => {
    const value = { d: "2026-07-01T00:00:00Z", n: 1 };
    expect(reviveBySchema(value, null)).toBe(value);
    expect(reviveBySchema(value, undefined)).toBe(value);
    expect(reviveBySchema(value, {})).toEqual(value);
  });

  it("never throws on mismatched values — they pass through unchanged", () => {
    expect(reviveBySchema(42, { type: "string", format: "date-time" })).toBe(42);
    expect(reviveBySchema("not-a-date", { type: "string", format: "date-time" })).toBe(
      "not-a-date",
    );
    expect(reviveBySchema("1.5", { type: "string", pattern: "^-?\\d+$" })).toBe("1.5");
    expect(reviveBySchema("scalar", { type: "object", properties: {} })).toBe("scalar");
    expect(reviveBySchema({ a: 1 }, { type: "array", items: { type: "number" } })).toEqual({
      a: 1,
    });
  });

  it("does not treat an ordinary pattern as the bigint encoding", () => {
    expect(reviveBySchema("123", { type: "string", pattern: "^[0-9]+$" })).toBe("123");
  });
});
