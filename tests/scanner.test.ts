import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { scanDirectory } from '../src/scanner.js';

let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'webpify-scan-'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function touch(...segments: string[]): Promise<void> {
  const target = path.join(root, ...segments);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, 'fixture');
}

describe('scanDirectory', () => {
  it('filters by the extension allow-list, case-insensitively', async () => {
    await touch('photo.JPG');
    await touch('scan.jpeg');
    await touch('pic.PnG');
    await touch('anim.gif');
    await touch('print.tif');
    await touch('print.TIFF');
    await touch('modern.avif');
    await touch('modern.heif');
    await touch('vector.svg');
    await touch('notes.txt');
    await touch('raw.cr2');
    await touch('archive.zip');
    await touch('.DS_Store');

    const files = await scanDirectory(root);
    expect(files.map((file) => file.relativePath)).toEqual([
      'anim.gif',
      'modern.avif',
      'modern.heif',
      'photo.JPG',
      'pic.PnG',
      'print.TIFF',
      'print.tif',
      'scan.jpeg',
      'vector.svg',
    ]);
  });

  it('reports .webp inputs separately instead of treating them as convertible', async () => {
    await touch('already.webp');

    const files = await scanDirectory(root);
    expect(files).toHaveLength(1);
    expect(files[0]?.alreadyWebp).toBe(true);
    expect(files[0]?.relativePath).toBe('already.webp');
    expect(path.isAbsolute(files[0]?.path ?? '')).toBe(true);
  });

  it('recurses by default and stops with recursive: false', async () => {
    await touch('top.png');
    await touch('nested/inner.jpg');
    await touch('nested/deeper/leaf.tiff');

    const recursive = await scanDirectory(root);
    expect(recursive.map((file) => file.relativePath)).toEqual([
      'nested/deeper/leaf.tiff',
      'nested/inner.jpg',
      'top.png',
    ]);

    const flat = await scanDirectory(root, { recursive: false });
    expect(flat.map((file) => file.relativePath)).toEqual(['top.png']);
  });

  it('does not follow symlinked files or symlinked directories', async () => {
    await touch('real.jpg');
    await touch('nested/hidden.png');
    await symlink(path.join(root, 'real.jpg'), path.join(root, 'link.jpg'));
    await symlink(path.join(root, 'nested'), path.join(root, 'linked-dir'));

    const files = await scanDirectory(root);
    expect(files.map((file) => file.relativePath)).toEqual(['nested/hidden.png', 'real.jpg']);
  });

  it('returns a deterministic order across repeated scans', async () => {
    await touch('b.jpg');
    await touch('a.png');
    await touch('nested/c.gif');

    const first = await scanDirectory(root);
    const second = await scanDirectory(root);
    expect(second).toEqual(first);
  });
});
