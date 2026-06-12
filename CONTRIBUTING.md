# Contributing to @boardwalk-labs/workflow

Thanks for helping build the authoring contract. This package defines what every Boardwalk
engine agrees on — the primitives, the manifest schema, the run-event wire format — so changes
here carry more weight than their line count suggests.

## Ground rules

- **Spec before code.** [`SPEC.md`](./SPEC.md) is the contract; a behavior change PRs the spec
  change alongside the code. If the spec and the code disagree, that's a bug in one of them.
- **The schema is the source of truth.** TS types derive from the Zod schema (`z.infer`), never
  hand-written. Unknown manifest fields are validation errors — nothing lands "silently allowed".
- **No I/O in this package.** Everything async goes through the `WorkflowHost` seam. If your
  change needs the network or the filesystem, it belongs in an engine, not here.
- **Zero new dependencies** without a justification in the PR (current: `zod`, `typescript`).
- **Compatibility:** this package versions semver-strictly; anything that changes what an
  existing program means is a major.

## Workflow

```sh
pnpm install
pnpm test          # vitest
pnpm lint          # eslint, zero warnings
pnpm typecheck
pnpm format        # prettier
pnpm build
```

All five must pass; CI runs exactly these. Every behavior change ships with tests in the same
PR — schema changes need valid + invalid fixtures and a `toEqual` round-trip (never just
`toBeDefined`; Zod unions are first-match-wins and can silently strip fields).

## Reporting

Bugs and proposals via GitHub issues (templates provided). Security reports: see
[SECURITY.md](./SECURITY.md) — never a public issue.
