# Roadmap

## 0.1.0 — initial release (done)

- [x] Recursive scan with a fixed, case-insensitive extension allow-list.
- [x] sharp WebP encoding with quality, effort, lossless, and max-dimension caps.
- [x] EXIF orientation always applied; metadata stripped by default.
- [x] Bounded-concurrency pool sized by `os.availableParallelism()`.
- [x] Atomic writes via `<target>.part` + rename.
- [x] Per-file statuses, human progress, `--json` summary, exit codes 0/1/2.
- [x] `--dry-run`, `--overwrite`, `--remove-original`, `--out`, `--quiet`.
- [x] Unit and CLI e2e coverage.

## Next

- [ ] Decide whether skipped files should contribute source bytes to some
      secondary total; today `RunSummary.totals` is conversion-only by design.
- [ ] Evaluate preserving source timestamps on the generated `.webp`.
- [ ] Evaluate an optional progress bar for very large trees (still no new
      runtime dependency).

## Deliberately out of scope

Other output formats, watch mode, config files, flattening into `--out`,
re-encoding `.webp` inputs, undo for `--remove-original`.

## Debt

No outstanding `[DEBT]` markers.
