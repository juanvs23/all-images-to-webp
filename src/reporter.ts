import path from 'node:path';
import type { FileResult, RunSummary } from './types.js';

interface Ansi {
  green: string;
  red: string;
  yellow: string;
  cyan: string;
  dim: string;
  reset: string;
}

const ANSI: Ansi = {
  green: '\u001b[32m',
  red: '\u001b[31m',
  yellow: '\u001b[33m',
  cyan: '\u001b[36m',
  dim: '\u001b[2m',
  reset: '\u001b[0m',
};

export interface ReporterOptions {
  /** Destination for progress and summary lines. */
  stream: NodeJS.WritableStream;
  /** Emit ANSI colors. */
  color: boolean;
  /** Suppress every line. */
  quiet: boolean;
  /** Base directory used to shorten displayed paths. */
  cwd: string;
}

export interface Reporter {
  progress(result: FileResult): void;
  summary(summary: RunSummary, elapsedMs: number): void;
}

/** Colors are welcome only on a TTY and when `NO_COLOR` is unset. */
export function isColorSupported(stream: NodeJS.WriteStream = process.stdout): boolean {
  return Boolean(stream.isTTY) && !process.env.NO_COLOR;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }

  const label = units[unit] ?? 'B';
  if (unit === 0) return `${Math.round(value)} ${label}`;
  return `${value.toFixed(1).replace(/\.0$/, '')} ${label}`;
}

export function createReporter(options: ReporterOptions): Reporter {
  const write = (line: string): void => {
    if (options.quiet) return;
    options.stream.write(`${line}\n`);
  };
  const paint = (code: string, text: string): string =>
    options.color ? `${code}${text}${ANSI.reset}` : text;

  return {
    progress(result: FileResult): void {
      const source = displayPath(result.input, options.cwd);
      const target = displayPath(result.output, options.cwd);

      switch (result.status) {
        case 'converted': {
          const delta = formatDelta(result);
          const sizes = `${formatBytes(result.inputBytes)} -> ${formatBytes(result.outputBytes)}`;
          write(`${paint(ANSI.green, '✓')} ${source} -> ${target}  ${sizes}${delta}`);
          return;
        }
        case 'skipped': {
          write(`${paint(ANSI.yellow, '-')} ${source} -> ${target}  ${paint(ANSI.dim, result.reason)}`);
          return;
        }
        case 'planned': {
          write(`${paint(ANSI.cyan, '·')} ${source} -> ${target}  ${paint(ANSI.dim, 'planned')}`);
          return;
        }
        case 'failed': {
          write(`${paint(ANSI.red, '✗')} ${source}  ${paint(ANSI.red, result.error)}`);
          return;
        }
      }
    },

    summary(summary: RunSummary, elapsedMs: number): void {
      const { totals } = summary;
      const counts = [
        `converted ${totals.converted}`,
        `skipped ${totals.skipped}`,
        `failed ${totals.failed}`,
        `planned ${totals.planned}`,
      ].join('  ');

      write('');
      write(`${counts}  (${totals.discovered} discovered)`);
      if (totals.converted > 0) {
        const percent = Math.abs(totals.savedPercent).toFixed(1);
        const direction = totals.savedBytes >= 0 ? 'saved' : 'grew by';
        write(
          `${formatBytes(totals.inputBytes)} -> ${formatBytes(totals.outputBytes)}  ` +
            `${direction} ${formatBytes(Math.abs(totals.savedBytes))} (${percent}%)`,
        );
      }
      write(`finished in ${(elapsedMs / 1000).toFixed(2)}s`);
    },
  };
}

function displayPath(filePath: string, cwd: string): string {
  const relative = path.relative(cwd, filePath);
  if (relative === '') return filePath;
  if (relative.startsWith('..') || path.isAbsolute(relative)) return filePath;
  return relative;
}

function formatDelta(result: FileResult): string {
  if (result.inputBytes <= 0 || result.outputBytes <= 0) return '';
  const change = ((result.outputBytes - result.inputBytes) / result.inputBytes) * 100;
  const rounded = Math.round(change * 10) / 10;
  const sign = rounded > 0 ? '+' : '';
  return `  (${sign}${rounded.toFixed(1)}%)`;
}
