# Context

## Purpose

`webpify` converts a directory of images to WebP in one command. It exists because
the alternatives are a GUI tool per file, a fragile shell loop around `cwebp`, or an
online upload service. Those fail one of the three things this tool guarantees:
recursion, per-file error isolation, and an honest before/after size report.

The authoritative feature contract lives in `odd/tasks/all-images-to-webp.md`.

## Structure

```
src/
  types.ts      Domain types shared by the API, converter, and reporter
  scanner.ts    Filesystem walk: allow-list, symlink skip, deterministic order
  converter.ts  sharp pipeline, skip rules, atomic write, failure capture
  pool.ts       Bounded-concurrency runner used by convertAll
  index.ts      convertAll(): the programmatic API, no printing
  reporter.ts   Human-readable progress and summary formatting
  cli.ts        parseArgs, validation, exit codes, wiring
tests/          scanner/pool/converter unit tests, CLI e2e suite
tests/e2e/cli/  E2E harness; evidence/ is gitignored
```

Data flow: `cli.ts` validates flags, calls `convertAll` in `index.ts`, which scans
with `scanner.ts`, maps `converter.convertFile` over the results through `pool.ts`,
and returns a `RunSummary`. `reporter.ts` formats each `FileResult` and the final
totals; with `--json` the summary is serialized to stdout after progress has already
gone to stderr.

## Domain vocabulary

| Term | Meaning |
| --- | --- |
| **discovered** | A file the scanner returned, including `.webp` inputs. |
| **converted** | A non-empty `.webp` was written atomically. |
| **skipped** | No write happened; `reason` is `exists` or `already-webp`. |
| **failed** | The encoder or write step threw; the batch continues. |
| **planned** | Dry-run outcome: the file would be converted. |
| **target** | The `.webp` path derived from the source path and `--out`. |
| **savedPercent** | `(inputBytes - outputBytes) / inputBytes * 100`, one decimal. |

## Known environment notes

- `sharp` installs prebuilt libvips binaries; no system packages are required on
  Linux x64, macOS, and Windows.
- The scanner deliberately does not follow symlinks, so a fixture tree containing
  links will not produce entries for them.
- Byte totals in `RunSummary` intentionally include converted files only; see
  `docs/roadmap.md` if that ever needs to change.
