import { spawnSync } from 'node:child_process';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

const CLI = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
const EVIDENCE_ROOT = fileURLToPath(new URL('./e2e/cli/evidence', import.meta.url));
const PACKAGE_JSON = fileURLToPath(new URL('../package.json', import.meta.url));

let fixtureCounter = 0;

interface CliRun {
  code: number | null;
  stdout: string;
  stderr: string;
}

function runCli(args: string[]): CliRun {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
  });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

async function newFixture(label: string): Promise<string> {
  fixtureCounter += 1;
  const directory = path.join(
    EVIDENCE_ROOT,
    `${label}-${Date.now()}-${process.pid}-${fixtureCounter}`,
  );
  await mkdir(directory, { recursive: true });
  return directory;
}

async function writeJpeg(filePath: string, width = 320, height = 240): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await sharp({
    create: { width, height, channels: 3, background: { r: 10, g: 120, b: 200 } },
  })
    .jpeg({ quality: 90 })
    .toFile(filePath);
}

async function writePng(filePath: string, width = 200, height = 120): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await sharp({
    create: { width, height, channels: 4, background: { r: 220, g: 20, b: 90, alpha: 1 } },
  })
    .png()
    .toFile(filePath);
}

async function listWebp(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.webp'))
    .map((entry) => path.join(entry.parentPath, entry.name));
}

async function listPartFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.part'))
    .map((entry) => path.join(entry.parentPath, entry.name));
}

describe('webpify CLI', () => {
  it('converts a tree and emits the documented JSON payload', async () => {
    const root = await newFixture('success');
    await writeJpeg(path.join(root, 'a.jpg'));
    await writePng(path.join(root, 'nested', 'b.png'));
    await writeFile(path.join(root, 'notes.txt'), 'ignored');

    const run = runCli([root, '--json']);
    expect(run.code).toBe(0);

    const payload = JSON.parse(run.stdout) as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual([
      'concurrency',
      'dryRun',
      'files',
      'outDir',
      'root',
      'totals',
    ]);
    expect(payload.root).toBe(root);
    expect(payload.outDir).toBeNull();
    expect(payload.dryRun).toBe(false);
    expect(typeof payload.concurrency).toBe('number');

    const files = payload.files as Array<Record<string, unknown>>;
    expect(files).toHaveLength(2);
    for (const file of files) {
      expect(Object.keys(file).sort()).toEqual([
        'error',
        'input',
        'inputBytes',
        'output',
        'outputBytes',
        'reason',
        'status',
      ]);
      expect(file.status).toBe('converted');
      expect(file.reason).toBe('');
      expect(file.error).toBe('');
      expect(Number(file.outputBytes)).toBeGreaterThan(0);
    }

    const totals = payload.totals as Record<string, number>;
    expect(totals.discovered).toBe(2);
    expect(totals.converted).toBe(2);
    expect(totals.skipped).toBe(0);
    expect(totals.failed).toBe(0);
    expect(totals.planned).toBe(0);
    expect(totals.savedBytes).toBe(totals.inputBytes - totals.outputBytes);
    expect(typeof totals.savedPercent).toBe('number');

    expect((await stat(path.join(root, 'a.webp'))).size).toBeGreaterThan(0);
    expect((await stat(path.join(root, 'nested', 'b.webp'))).size).toBeGreaterThan(0);
    expect(await listWebp(root)).toHaveLength(2);
    expect(await listPartFiles(root)).toEqual([]);

    expect(run.stderr).toContain('converted 2');
    expect(run.stderr).toContain('finished in');
  });

  it('skips an existing target on a second run', async () => {
    const root = await newFixture('exists');
    await writeJpeg(path.join(root, 'a.jpg'));

    expect(runCli([root, '--json']).code).toBe(0);

    const second = runCli([root, '--json']);
    expect(second.code).toBe(0);
    const payload = JSON.parse(second.stdout) as {
      files: Array<{ status: string; reason: string }>;
      totals: { skipped: number };
    };
    const skipped = payload.files.find((file) => file.reason === 'exists');
    expect(skipped?.status).toBe('skipped');
    // The generated a.webp is discovered on the second pass and reported too.
    expect(payload.totals.skipped).toBe(2);
    expect(payload.files.map((file) => file.reason).sort()).toEqual(['already-webp', 'exists']);
  });

  it('exits 2 when the positional argument is missing', async () => {
    const run = runCli([]);
    expect(run.code).toBe(2);
    expect(run.stderr).toContain('missing required <location>');
    expect(run.stdout).toBe('');
  });

  it('exits 2 on an unknown flag', async () => {
    const root = await newFixture('unknown-flag');
    const run = runCli([root, '--nope']);
    expect(run.code).toBe(2);
    expect(run.stderr.toLowerCase()).toContain('unknown option');
  });

  it('exits 2 when the location is not a directory', async () => {
    const root = await newFixture('not-a-dir');
    const filePath = path.join(root, 'file.txt');
    await writeFile(filePath, 'x');

    const run = runCli([filePath]);
    expect(run.code).toBe(2);
    expect(run.stderr).toContain('not a directory');
  });

  it('exits 2 for out-of-range values', async () => {
    const root = await newFixture('ranges');

    for (const args of [
      [root, '--quality', '0'],
      [root, '--quality', '101'],
      [root, '--effort', '7'],
      [root, '--concurrency', '0'],
      [root, '--max-width', '0'],
    ]) {
      const run = runCli(args);
      expect(run.code).toBe(2);
      expect(run.stderr).toContain('must be');
    }
  });

  it('prints usage on --help and the version on --version', async () => {
    const help = runCli(['--help']);
    expect(help.code).toBe(0);
    expect(help.stdout).toContain('webpify <location> [options]');
    expect(help.stderr).toBe('');

    const version = runCli(['--version']);
    const pkg = JSON.parse(await readFile(PACKAGE_JSON, 'utf8')) as { version: string };
    expect(version.code).toBe(0);
    expect(version.stdout.trim()).toBe(pkg.version);
  });

  it('exits 1 when one file is corrupt and still converts the rest', async () => {
    const root = await newFixture('corrupt');
    await writeJpeg(path.join(root, 'good.jpg'));
    await writeFile(path.join(root, 'bad.jpg'), 'not an image');

    const run = runCli([root, '--json']);
    expect(run.code).toBe(1);

    const payload = JSON.parse(run.stdout) as {
      files: Array<{ input: string; status: string; error: string }>;
      totals: { converted: number; failed: number };
    };
    const failed = payload.files.find((file) => file.input.endsWith('bad.jpg'));
    const converted = payload.files.find((file) => file.input.endsWith('good.jpg'));
    expect(failed?.status).toBe('failed');
    expect((failed?.error ?? '').length).toBeGreaterThan(0);
    expect(converted?.status).toBe('converted');
    expect(payload.totals.failed).toBe(1);
    expect(payload.totals.converted).toBe(1);
    expect(await listPartFiles(root)).toEqual([]);
  });

  it('writes nothing with --dry-run and reports planned', async () => {
    const root = await newFixture('dry-run');
    await writeJpeg(path.join(root, 'a.jpg'));
    await writePng(path.join(root, 'nested', 'b.png'));

    const run = runCli([root, '--dry-run', '--json']);
    expect(run.code).toBe(0);

    const payload = JSON.parse(run.stdout) as {
      dryRun: boolean;
      files: Array<{ status: string }>;
      totals: { planned: number };
    };
    expect(payload.dryRun).toBe(true);
    expect(payload.files.every((file) => file.status === 'planned')).toBe(true);
    expect(payload.totals.planned).toBe(2);
    expect(await listWebp(root)).toEqual([]);
  });

  it('mirrors the source tree under --out', async () => {
    const root = await newFixture('out');
    const outDir = path.join(root, 'generated');
    await writeJpeg(path.join(root, 'one.jpg'));
    await writePng(path.join(root, 'nested', 'two.png'));

    const run = runCli([root, '--out', outDir, '--json']);
    expect(run.code).toBe(0);

    const payload = JSON.parse(run.stdout) as {
      outDir: string;
      files: Array<{ output: string }>;
    };
    expect(payload.outDir).toBe(outDir);
    expect(payload.files.every((file) => file.output.startsWith(outDir))).toBe(true);
    expect((await stat(path.join(outDir, 'one.webp'))).size).toBeGreaterThan(0);
    expect((await stat(path.join(outDir, 'nested', 'two.webp'))).size).toBeGreaterThan(0);
    expect(await listWebp(root)).toHaveLength(2);
  });

  it('deletes sources with --remove-original only after success', async () => {
    const root = await newFixture('remove-original');
    await writeJpeg(path.join(root, 'good.jpg'));
    await writeFile(path.join(root, 'bad.jpg'), 'not an image');

    const run = runCli([root, '--remove-original', '--json']);
    expect(run.code).toBe(1);

    expect((await stat(path.join(root, 'good.webp'))).size).toBeGreaterThan(0);
    await expect(stat(path.join(root, 'good.jpg'))).rejects.toThrow();
    expect((await stat(path.join(root, 'bad.jpg'))).size).toBeGreaterThan(0);
  });

  it('reports .webp inputs as already-webp instead of re-encoding', async () => {
    const root = await newFixture('already-webp');
    await sharp({
      create: { width: 32, height: 32, channels: 3, background: { r: 5, g: 6, b: 7 } },
    })
      .webp()
      .toFile(path.join(root, 'existing.webp'));

    const run = runCli([root, '--json']);
    expect(run.code).toBe(0);

    const payload = JSON.parse(run.stdout) as {
      files: Array<{ status: string; reason: string }>;
    };
    expect(payload.files).toHaveLength(1);
    expect(payload.files[0]?.status).toBe('skipped');
    expect(payload.files[0]?.reason).toBe('already-webp');
  });
});
