# CLI end-to-end harness

`tests/cli.e2e.test.ts` spawns the built binary (`dist/cli.js`) with
`spawnSync`, so it exercises argument parsing, exit codes, stdout/stderr routing,
and the filesystem exactly as a user would.

## Prerequisites

`npm test` runs the `pretest` script, which builds `dist/`. Running `vitest` directly
requires a prior `npm run build`.

## Fixtures and evidence

Every test creates a unique fixture directory under:

```
tests/e2e/cli/evidence/<label>-<timestamp>-<pid>-<n>/
```

Images are generated with `sharp` at runtime; nothing binary is committed.
`evidence/` is gitignored, but it is intentionally kept on disk as the run product
for inspection. Delete it freely:

```bash
rm -rf tests/e2e/cli/evidence
```

The fixtures are minimal on purpose:

- Solid-colour JPEG/PNG/WebP images for conversion, skip, dry-run, and `--out` cases.
- A text file named `bad.jpg` to simulate a corrupt image and prove failure
  isolation (exit `1`, other files still convert, no `.part` left behind).

## Coverage

| Test | What it proves |
| --- | --- |
| success | Exit `0`, documented JSON keys, non-empty outputs, no `.part` files |
| existing target | Second run reports `skipped: exists` |
| missing positional | Exit `2`, message on stderr, empty stdout |
| unknown flag | Exit `2` via `parseArgs` strict mode |
| non-directory location | Exit `2` |
| out-of-range flags | Exit `2` for quality, effort, concurrency, max-width |
| `--help` / `--version` | Exit `0`, output on stdout |
| corrupt file | Exit `1`, `failed` entry with an error, sibling still `converted` |
| `--dry-run` | Zero `.webp` files written, all entries `planned` |
| `--out` | Target tree mirrors the source tree |
| `--remove-original` | Source deleted only after a successful, non-empty write |
| `.webp` input | Reported `skipped: already-webp` |
