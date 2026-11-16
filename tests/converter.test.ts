import { mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { convertFile } from '../src/converter.js';
import { convertAll } from '../src/index.js';
import type { ConvertFileOptions } from '../src/types.js';

let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'webpify-convert-'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const BASE_OPTIONS: ConvertFileOptions = {
  outputPath: '',
  quality: 80,
  effort: 4,
  lossless: false,
  keepMetadata: false,
  overwrite: false,
  dryRun: false,
  removeOriginal: false,
};

function webpPathFor(input: string): string {
  return input.replace(/\.[^./\\]+$/, '.webp');
}

function run(input: string, overrides: Partial<ConvertFileOptions> = {}) {
  return convertFile(input, { ...BASE_OPTIONS, outputPath: webpPathFor(input), ...overrides });
}

async function makeJpeg(filePath: string, width = 120, height = 80): Promise<void> {
  await sharp({
    create: { width, height, channels: 3, background: { r: 51, g: 102, b: 255 } },
  })
    .jpeg()
    .toFile(filePath);
}

async function makePng(filePath: string, width = 120, height = 60): Promise<void> {
  await sharp({
    create: { width, height, channels: 4, background: { r: 0, g: 255, b: 136, alpha: 1 } },
  })
    .png()
    .toFile(filePath);
}

async function partFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory);
  return entries.filter((entry) => entry.endsWith('.part'));
}

describe('convertFile', () => {
  it('writes a real WebP file and reports both sizes', async () => {
    const input = path.join(root, 'photo.jpg');
    await makeJpeg(input);

    const result = await run(input);
    expect(result.status).toBe('converted');
    expect(result.reason).toBe('');
    expect(result.error).toBe('');
    expect(result.inputBytes).toBe((await stat(input)).size);
    expect(result.outputBytes).toBeGreaterThan(0);

    const metadata = await sharp(result.output).metadata();
    expect(metadata.format).toBe('webp');
    expect(await partFiles(root)).toEqual([]);
  });

  it('downscales to --max-width but never enlarges', async () => {
    const input = path.join(root, 'small.png');
    await makePng(input, 120, 60);

    const capped = await run(input, { maxWidth: 60, outputPath: path.join(root, 'capped.webp') });
    expect(capped.status).toBe('converted');
    const cappedMeta = await sharp(capped.output).metadata();
    expect(cappedMeta.width).toBe(60);
    expect(cappedMeta.height).toBe(30);

    const roomy = await run(input, { maxWidth: 400, outputPath: path.join(root, 'roomy.webp') });
    const roomyMeta = await sharp(roomy.output).metadata();
    expect(roomyMeta.width).toBe(120);
  });

  it('downscales to --max-height but never enlarges', async () => {
    const input = path.join(root, 'tall.png');
    await makePng(input, 120, 60);

    const capped = await run(input, { maxHeight: 30, outputPath: path.join(root, 'capped.webp') });
    const cappedMeta = await sharp(capped.output).metadata();
    expect(cappedMeta.width).toBe(60);
    expect(cappedMeta.height).toBe(30);

    const roomy = await run(input, { maxHeight: 400, outputPath: path.join(root, 'roomy.webp') });
    const roomyMeta = await sharp(roomy.output).metadata();
    expect(roomyMeta.height).toBe(60);
  });

  it('strips EXIF and ICC by default', async () => {
    const input = path.join(root, 'tagged.jpg');
    await sharp({
      create: { width: 120, height: 80, channels: 3, background: { r: 200, g: 100, b: 50 } },
    })
      .jpeg()
      .withMetadata({ exif: { IFD0: { Copyright: 'webpify-test' } } })
      .toFile(input);

    const sourceMeta = await sharp(input).metadata();
    expect(sourceMeta.exif).toBeDefined();

    const result = await run(input);
    const metadata = await sharp(result.output).metadata();
    expect(metadata.exif).toBeUndefined();
    expect(metadata.icc).toBeUndefined();
  });

  it('keeps EXIF and ICC with keepMetadata', async () => {
    const input = path.join(root, 'tagged.jpg');
    await sharp({
      create: { width: 120, height: 80, channels: 3, background: { r: 200, g: 100, b: 50 } },
    })
      .jpeg()
      .withMetadata({ exif: { IFD0: { Copyright: 'webpify-test' } } })
      .toFile(input);

    const result = await run(input, { keepMetadata: true });
    expect(result.status).toBe('converted');
    const metadata = await sharp(result.output).metadata();
    expect(metadata.exif).toBeDefined();
    expect(metadata.icc).toBeDefined();
  });

  it('reports a corrupt input as failed and removes the .part file', async () => {
    const input = path.join(root, 'broken.jpg');
    await writeFile(input, 'this is not an image');

    const result = await run(input);
    expect(result.status).toBe('failed');
    expect(result.error.length).toBeGreaterThan(0);
    expect(result.outputBytes).toBe(0);
    expect(await partFiles(root)).toEqual([]);
    await expect(stat(result.output)).rejects.toThrow();
  });

  it('keeps converting the batch after one corrupt file', async () => {
    const good = path.join(root, 'good.jpg');
    const bad = path.join(root, 'bad.jpg');
    await makeJpeg(good);
    await writeFile(bad, 'not an image either');

    const summary = await convertAll({ location: root, concurrency: 2 });
    const byStatus = summary.files.map((file) => file.status).sort();

    expect(byStatus).toEqual(['converted', 'failed']);
    expect(summary.totals.failed).toBe(1);
    expect(summary.totals.converted).toBe(1);
    expect(summary.totals.inputBytes).toBeGreaterThan(0);
    expect(await partFiles(root)).toEqual([]);
  });

  it('skips an existing target unless overwrite is set', async () => {
    const input = path.join(root, 'photo.jpg');
    const target = webpPathFor(input);
    await makeJpeg(input);
    await writeFile(target, 'sentinel');

    const skipped = await run(input);
    expect(skipped.status).toBe('skipped');
    expect(skipped.reason).toBe('exists');
    expect(await readFile(target, 'utf8')).toBe('sentinel');

    const overwritten = await run(input, { overwrite: true });
    expect(overwritten.status).toBe('converted');
    expect(await readFile(target, 'utf8')).not.toBe('sentinel');
  });

  it('skips .webp inputs with the already-webp reason', async () => {
    const input = path.join(root, 'already.webp');
    await sharp({
      create: { width: 40, height: 40, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .webp()
      .toFile(input);

    const result = await run(input);
    expect(result.status).toBe('skipped');
    expect(result.reason).toBe('already-webp');
    expect(result.outputBytes).toBe(0);
  });

  it('writes nothing during a dry run and still reports skips', async () => {
    const input = path.join(root, 'photo.jpg');
    await makeJpeg(input);

    const planned = await run(input, { dryRun: true });
    expect(planned.status).toBe('planned');
    await expect(stat(planned.output)).rejects.toThrow();

    await writeFile(webpPathFor(input), 'sentinel');
    const skipped = await run(input, { dryRun: true });
    expect(skipped.status).toBe('skipped');
    expect(skipped.reason).toBe('exists');
  });

  it('deletes the source only after the target exists and is non-empty', async () => {
    const input = path.join(root, 'photo.jpg');
    await makeJpeg(input);

    const result = await run(input, { removeOriginal: true });
    expect(result.status).toBe('converted');
    expect((await stat(result.output)).size).toBeGreaterThan(0);
    await expect(stat(input)).rejects.toThrow();
  });

  it('does not delete the source when conversion fails', async () => {
    const input = path.join(root, 'broken.jpg');
    await writeFile(input, 'still broken');

    const result = await run(input, { removeOriginal: true });
    expect(result.status).toBe('failed');
    expect((await stat(input)).size).toBeGreaterThan(0);
  });
});
