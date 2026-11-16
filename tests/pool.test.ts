import { describe, expect, it } from 'vitest';
import { mapPool } from '../src/pool.js';

describe('mapPool', () => {
  it('keeps at most `concurrency` tasks in flight and runs every task', async () => {
    const items = Array.from({ length: 20 }, (_, index) => index);
    const visited: number[] = [];
    let inFlight = 0;
    let peak = 0;

    const results = await mapPool(items, 4, async (item) => {
      visited.push(item);
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return item * 2;
    });

    expect(peak).toBeLessThanOrEqual(4);
    expect(peak).toBe(4);
    expect(visited.sort((a, b) => a - b)).toEqual(items);
    expect(results).toEqual(items.map((item) => item * 2));
  });

  it('never exceeds the number of items when concurrency is larger', async () => {
    let inFlight = 0;
    let peak = 0;

    const results = await mapPool([1, 2, 3], 50, async (item) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight -= 1;
      return item;
    });

    expect(peak).toBe(3);
    expect(results).toEqual([1, 2, 3]);
  });

  it('resolves an empty input without calling the worker', async () => {
    let calls = 0;
    const results = await mapPool([], 4, async () => {
      calls += 1;
      return 'never';
    });

    expect(results).toEqual([]);
    expect(calls).toBe(0);
  });

  it('preserves input order even when completion order differs', async () => {
    const results = await mapPool([30, 10, 20], 3, async (delay) => {
      await new Promise((resolve) => setTimeout(resolve, delay));
      return delay;
    });

    expect(results).toEqual([30, 10, 20]);
  });
});
