import { describe, expect, it } from 'bun:test';
import { mosaicLayout } from './gallery-layout';

describe('album layout in a post card', () => {
  it('one picture keeps its own shape', () => {
    expect(mosaicLayout(1, 0.8)).toMatchObject({ aspectRatio: 0.8, tiles: [{ index: 0 }] });
  });
  it('two side by side, three as one tall and two stacked', () => {
    expect(mosaicLayout(2)!.tiles.map(t => [t.column, t.row])).toEqual([['1', '1'], ['2', '1']]);
    expect(mosaicLayout(3)!.tiles.map(t => [t.column, t.row])).toEqual([['1', '1 / span 2'], ['2', '1'], ['2', '2']]);
  });
  it('four or more as a 2×2 grid; the last tile counts the rest', () => {
    expect(mosaicLayout(4)!.tiles.map(t => t.more)).toEqual([0, 0, 0, 0]);
    const seven = mosaicLayout(7)!;
    expect(seven.tiles).toHaveLength(4);
    expect(seven.tiles[3].more).toBe(3);
  });
  it('nothing to show is no mosaic', () => {
    expect(mosaicLayout(0)).toBeNull();
  });
});
