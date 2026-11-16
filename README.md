# webpify

Batch-convert a folder of images to WebP with one command. Recursive by default,
safe by default, and honest about before/after sizes.

```console
$ webpify ./photos
✓ photos/hero.jpg -> photos/hero.webp  2.4 MB -> 610 KB  (-75.4%)
✓ photos/team/ana.png -> photos/team/ana.webp  840 KB -> 190 KB  (-77.4%)

converted 2  skipped 0  failed 0  planned 0  (2 discovered)
3.2 MB -> 784 KB  saved 2.4 MB (76.4%)
finished in 1.42s
```

---

## 1. Requirements

| Requirement | Detail |
| --- | --- |
| Node.js | `>= 20`. Declared in `package.json` under `engines`. |
| Operating system | Linux, macOS, or Windows. No system image libraries are needed on the platforms `sharp` ships prebuilt binaries for (Linux x64/arm64, macOS x64/arm64, Windows x64). |
| Disk space | A default run keeps the originals, so plan for roughly the source tree size plus the converted output. |
| Permissions | Read access to the scanned tree. Write access to each target directory (the source directory, or `--out`). Delete permission only if you pass `--remove-original`. |

### About `sharp`

`sharp` bundles libvips as a prebuilt binary; it is installed automatically as the
single runtime dependency. On an unsupported platform or libc (for example Alpine
musl, or an unusual architecture) npm falls back to building libvips from source,
which requires a C/C++ toolchain and `vips` development headers on the machine. If
installation fails, that is the cause, not the CLI.

---

## 2. Configuration

`webpify` is **configured entirely through command-line flags and their defaults.
There is no config file, and none is planned** — a tool that reads a hidden
`.webpifyrc` is a tool whose behaviour you cannot verify from the command you ran.

### Installation

```bash
# From a local checkout — the route that works today
npm install
npm run build
npm link

# From the npm registry — available once the package is published
npm install --global all-images-to-webp
npx all-images-to-webp ./photos
```

All forms expose the same binary name: **`webpify`**. The package is not published to
the npm registry yet, so until it is, use the checkout route above.

> **Rebuild after changing the source.** `npm link` (and any local install) points at
> the compiled `dist/cli.js`, never at `src/`. After editing TypeScript you must run
> `npm run build`, otherwise the global `webpify` command keeps running the previous
> build. Nothing rebuilds automatically.

### Verify the install

The documentation never records where the binary landed on a particular machine — that
path is machine-specific and would be wrong on the next clone. Ask the system instead:

```bash
which webpify                    # the binary your shell will run
readlink -f "$(which webpify)"   # the code that binary actually executes
webpify --version                # confirm it responds
```

- Empty output from `which` means the command is not on `PATH` for the current shell.
- `readlink -f` should point at `<checkout>/dist/cli.js`. If it points somewhere else,
  an older install is shadowing this checkout.
- On Windows use `where webpify`; `readlink` does not exist there.

> **Node version managers.** Under nvm, fnm, or Volta, every Node version has its own
> global bin directory. `npm link` registers the command only for the version that was
> active when you ran it, so `nvm use <other>` can make `webpify` disappear from `PATH`
> even though nothing is broken. Re-run `npm link` under the version you want to use, or
> point every version at one shared prefix with `npm config set prefix <dir>`.

To remove a linked install:

```bash
npm unlink --global all-images-to-webp
```

### Defaults

Every flag has a default, so `webpify <location>` alone is a valid, complete run.

| Setting | Flag | Default |
| --- | --- | --- |
| Target format | — | WebP, always |
| Quality | `-q, --quality <1-100>` | `80` (lossy) |
| Encoder effort | `--effort <0-6>` | `4` |
| Lossless mode | `--lossless` | off |
| Maximum width | `--max-width <px>` | unlimited, never enlarges |
| Maximum height | `--max-height <px>` | unlimited, never enlarges |
| Recursion | `--no-recursive` to disable | recursive |
| Existing `.webp` target | `--overwrite` to replace | skipped |
| Metadata (EXIF/ICC) | `--keep-metadata` to retain | stripped, after orientation |
| Original files | `--remove-original` to delete | kept |
| Output location | `-o, --out <dir>` | next to each source |
| Parallel conversions | `-c, --concurrency <n>` | `os.availableParallelism()` |
| Progress output | `-Q, --quiet` to silence | one line per file |
| Machine output | `--json` | human report |

### Environment variables

| Variable | Effect |
| --- | --- |
| `NO_COLOR` | Disables ANSI colors. Any non-empty value disables them. Colors are already off whenever the stream is not a TTY, so this only matters in an interactive terminal. |

Nothing else is read from the environment. There is no telemetry, no network access,
and no remote service.

### Which files are in scope

The allow-list is fixed and case-insensitive:
`.jpg .jpeg .png .gif .tif .tiff .avif .heif .svg`.

`.webp` inputs are discovered and reported, but never re-encoded (reason
`already-webp`) — re-encoding a WebP onto itself gains nothing and would collide with
its own path. Symlinks are never followed, for files or directories.

---

## 3. Usage

```
webpify <location> [options]

  -o, --out <dir>          Write under this directory, mirroring the source tree
  -q, --quality <1-100>    WebP quality (default: 80)
      --lossless           Lossless WebP instead of lossy
      --effort <0-6>       Encoder effort (default: 4)
      --max-width <px>     Downscale only if wider than this
      --max-height <px>    Downscale only if taller than this
      --no-recursive       Do not descend into subdirectories
      --overwrite          Re-encode even if the target .webp already exists
      --keep-metadata      Preserve EXIF/ICC (default: strip, after applying orientation)
      --remove-original    Delete the source image after a successful conversion
      --dry-run            Report what would happen; write nothing
      --json               Only JSON on stdout; progress goes to stderr
  -c, --concurrency <n>    Parallel conversions (default: os.availableParallelism())
  -Q, --quiet              Suppress per-file progress lines
  -h, --help               Show this help
  -v, --version            Show the version
```

The current directory can be used as the location:

```bash
cd ~/photos && webpify .
```

### Common recipes

Convert in place, next to the originals:

```bash
webpify ./photos
```

Write a mirrored copy and leave the originals untouched:

```bash
webpify ./photos --out ./photos-webp --quality 82 --effort 5
```

Cap large images without ever enlarging small ones:

```bash
webpify ./photos --max-width 1920 --max-height 1080
```

Preview a run without touching the disk, then feed the totals to `jq`:

```bash
webpify ./photos --dry-run --json | jq .totals
```

Replace originals after a verified conversion (**irreversible**):

```bash
webpify ./photos --dry-run     # look first
webpify ./photos --remove-original
```

### Output paths

- Default target: the same directory as the source, same basename, `.webp` extension.
- With `--out`: the path relative to the scanned root is mirrored, so
  `photos/team/ana.png` becomes `<out>/team/ana.webp`.
- An existing target is left alone unless `--overwrite` is passed.

### Safety behaviour

- Encoding always applies EXIF orientation via `sharp(...).rotate()`. Photos taken in
  portrait keep their visible orientation even though EXIF is stripped.
- Writes are atomic: the encoder writes `<target>.part`, which is then renamed into
  place. A failed or interrupted conversion never leaves a truncated `.webp`.
- `--remove-original` deletes a source only after its target exists with a non-zero
  size. There is no undo.
- One corrupt file never aborts the batch. It is reported as `failed`, everything else
  still converts, and the process exits `1`.

### Per-file statuses

| Status | Meaning |
| --- | --- |
| `converted` | A new `.webp` was written. |
| `skipped` | Nothing was written; `reason` is `exists` or `already-webp`. |
| `failed` | Encoding failed; `error` explains why. |
| `planned` | `--dry-run` outcome: the file would have been converted. |

### Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Every discovered file was converted, skipped, or planned. |
| `1` | At least one file failed. Other files still converted. |
| `2` | Usage or validation error (missing or extra `<location>`, unknown flag, non-directory path, out-of-range value). The message and usage go to stderr. |

`--help` and `--version` print to stdout and exit `0`.

### JSON output

`--json` prints a single JSON document to stdout; progress and the summary move to
stderr, so stdout can be piped directly into another tool.

```json
{
  "root": "/abs/path/photos",
  "outDir": null,
  "dryRun": false,
  "concurrency": 8,
  "files": [
    {
      "input": "/abs/path/photos/hero.jpg",
      "output": "/abs/path/photos/hero.webp",
      "status": "converted",
      "reason": "",
      "inputBytes": 2400000,
      "outputBytes": 624640,
      "error": ""
    }
  ],
  "totals": {
    "discovered": 1,
    "converted": 1,
    "skipped": 0,
    "failed": 0,
    "planned": 0,
    "inputBytes": 2400000,
    "outputBytes": 624640,
    "savedBytes": 1775360,
    "savedPercent": 74
  }
}
```

`totals.inputBytes`, `outputBytes`, `savedBytes`, and `savedPercent` cover converted
files only, so skipped and failed files cannot distort the saving.

> A negative `savedPercent` is possible and reported as-is: a small, low-colour PNG can
> produce a *larger* WebP. The tool tells you the truth rather than hiding it.

---

## Programmatic API

```ts
import { convertAll, type RunSummary } from 'all-images-to-webp';

const summary: RunSummary = await convertAll({
  location: './photos',
  outDir: './photos-webp',
  quality: 82,
  effort: 5,
  maxWidth: 1920,
  keepMetadata: false,
  overwrite: false,
  dryRun: false,
  removeOriginal: false,
  concurrency: 8,
  onResult: (file) => console.log(file.status, file.input),
});

process.exitCode = summary.totals.failed > 0 ? 1 : 0;
```

`convertAll` never prints. `scanner.ts` and `converter.ts` are importable and testable
without spawning a process.

---

## Development

```bash
npm install
npm run typecheck   # tsc --noEmit
npm test            # build + vitest (unit and CLI e2e)
npm run build       # tsc -> dist/
```

Architecture, vocabulary, and environment notes live in `docs/context.md`. The
authoritative feature contract is `odd/tasks/all-images-to-webp.md`.

## License

[MIT](./LICENSE) © 2026 Juan Carlos Avila
