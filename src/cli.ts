#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import os from 'node:os';
import { parseArgs } from 'node:util';
import { convertAll, DEFAULT_EFFORT, DEFAULT_QUALITY } from './index.js';
import { createReporter, isColorSupported } from './reporter.js';

const USAGE = `webpify <location> [options]

  -o, --out <dir>          Write under this directory, mirroring the source tree
  -q, --quality <1-100>    WebP quality (default: ${DEFAULT_QUALITY})
      --lossless           Lossless WebP instead of lossy
      --effort <0-6>       Encoder effort (default: ${DEFAULT_EFFORT})
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
  -v, --version            Show the version`;

const PARSE_OPTIONS = {
  out: { type: 'string', short: 'o' },
  quality: { type: 'string', short: 'q' },
  lossless: { type: 'boolean' },
  effort: { type: 'string' },
  'max-width': { type: 'string' },
  'max-height': { type: 'string' },
  'no-recursive': { type: 'boolean' },
  overwrite: { type: 'boolean' },
  'keep-metadata': { type: 'boolean' },
  'remove-original': { type: 'boolean' },
  'dry-run': { type: 'boolean' },
  json: { type: 'boolean' },
  concurrency: { type: 'string', short: 'c' },
  quiet: { type: 'boolean', short: 'Q' },
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean', short: 'v' },
} as const;

interface ParsedValues {
  out?: string;
  quality?: string;
  lossless?: boolean;
  effort?: string;
  'max-width'?: string;
  'max-height'?: string;
  'no-recursive'?: boolean;
  overwrite?: boolean;
  'keep-metadata'?: boolean;
  'remove-original'?: boolean;
  'dry-run'?: boolean;
  json?: boolean;
  concurrency?: string;
  quiet?: boolean;
  help?: boolean;
  version?: boolean;
}

interface CliConfig {
  location: string;
  outDir: string | null;
  quality: number;
  effort: number;
  lossless: boolean;
  maxWidth?: number;
  maxHeight?: number;
  recursive: boolean;
  overwrite: boolean;
  keepMetadata: boolean;
  removeOriginal: boolean;
  dryRun: boolean;
  json: boolean;
  quiet: boolean;
  concurrency: number;
}

class UsageError extends Error {}

/** Parse, validate, run, and return the process exit code. */
export async function run(argv: string[]): Promise<number> {
  let parsed: { values: ParsedValues; positionals: string[] };
  try {
    parsed = parseArgs({
      args: argv,
      strict: true,
      allowPositionals: true,
      options: PARSE_OPTIONS,
    });
  } catch (error) {
    return usageFailure(describeError(error));
  }

  const { values, positionals } = parsed;
  if (values.help) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }
  if (values.version) {
    process.stdout.write(`${readVersion()}\n`);
    return 0;
  }

  let config: CliConfig;
  try {
    config = await validate(values, positionals);
  } catch (error) {
    if (error instanceof UsageError) return usageFailure(error.message);
    throw error;
  }

  const progressStream: NodeJS.WriteStream = config.json ? process.stderr : process.stdout;
  const reporter = createReporter({
    stream: progressStream,
    color: isColorSupported(progressStream),
    quiet: config.quiet,
    cwd: process.cwd(),
  });

  const startedAt = Date.now();
  const summary = await convertAll({
    location: config.location,
    outDir: config.outDir,
    quality: config.quality,
    effort: config.effort,
    lossless: config.lossless,
    maxWidth: config.maxWidth,
    maxHeight: config.maxHeight,
    recursive: config.recursive,
    overwrite: config.overwrite,
    keepMetadata: config.keepMetadata,
    removeOriginal: config.removeOriginal,
    dryRun: config.dryRun,
    concurrency: config.concurrency,
    onResult: (result) => reporter.progress(result),
  });
  reporter.summary(summary, Date.now() - startedAt);

  if (config.json) {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  }

  return summary.totals.failed > 0 ? 1 : 0;
}

async function validate(values: ParsedValues, positionals: string[]): Promise<CliConfig> {
  if (positionals.length === 0) {
    throw new UsageError('missing required <location> argument');
  }
  if (positionals.length > 1) {
    throw new UsageError(`expected exactly one <location>, received ${positionals.length}`);
  }

  const location = positionals[0];
  if (location === undefined) {
    throw new UsageError('missing required <location> argument');
  }

  let isDirectory = false;
  try {
    isDirectory = (await stat(location)).isDirectory();
  } catch {
    isDirectory = false;
  }
  if (!isDirectory) {
    throw new UsageError(`<location> is not a directory: ${location}`);
  }

  return {
    location,
    outDir: values.out ?? null,
    quality: integerOption('quality', values.quality ?? String(DEFAULT_QUALITY), 1, 100),
    effort: integerOption('effort', values.effort ?? String(DEFAULT_EFFORT), 0, 6),
    lossless: values.lossless ?? false,
    maxWidth: optionalInteger('max-width', values['max-width'], 1),
    maxHeight: optionalInteger('max-height', values['max-height'], 1),
    recursive: !(values['no-recursive'] ?? false),
    overwrite: values.overwrite ?? false,
    keepMetadata: values['keep-metadata'] ?? false,
    removeOriginal: values['remove-original'] ?? false,
    dryRun: values['dry-run'] ?? false,
    json: values.json ?? false,
    quiet: values.quiet ?? false,
    concurrency: integerOption(
      'concurrency',
      values.concurrency ?? String(os.availableParallelism()),
      1,
      Number.MAX_SAFE_INTEGER,
    ),
  };
}

function optionalInteger(name: string, raw: string | undefined, min: number): number | undefined {
  if (raw === undefined) return undefined;
  return integerOption(name, raw, min, Number.MAX_SAFE_INTEGER);
}

function integerOption(name: string, raw: string, min: number, max: number): number {
  const value = Number(raw);
  if (!Number.isInteger(value)) {
    throw new UsageError(`--${name} must be an integer, received "${raw}"`);
  }
  if (value < min || value > max) {
    throw new UsageError(`--${name} must be between ${min} and ${max}, received ${value}`);
  }
  return value;
}

function usageFailure(message: string): 2 {
  process.stderr.write(`webpify: ${message}\n\n${USAGE}\n`);
  return 2;
}

function readVersion(): string {
  const raw = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed === 'object' && parsed !== null && 'version' in parsed) {
    const version = (parsed as { version?: unknown }).version;
    if (typeof version === 'string') return version;
  }
  return '0.0.0';
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

run(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    process.stderr.write(`webpify: ${describeError(error)}\n`);
    process.exitCode = 1;
  });
