/**
 * How a post's photos and videos sit in its card, like a chat album: one
 * fills the width at its own shape; two side by side; three as one tall and
 * two stacked; four or more as a 2×2 grid whose last tile says how many more
 * there are. Every tile is a fixed cell (the picture covers it), so the card
 * never changes height while pictures arrive.
 */
export interface Tile {
  /** Index into the visual items. */
  index: number;
  /** CSS grid placement. */
  column: string;
  row: string;
  /** "+N" on the last visible tile when there are more than shown. */
  more: number;
}

export interface Mosaic {
  columns: string;
  rows: string;
  /** Width / height of the whole mosaic. */
  aspectRatio: number;
  tiles: Tile[];
}

export function mosaicLayout(count: number, singleAspect = 4 / 3): Mosaic | null {
  if (count <= 0) return null;
  if (count === 1) return { columns: '1fr', rows: '1fr', aspectRatio: singleAspect, tiles: [{ index: 0, column: '1', row: '1', more: 0 }] };
  if (count === 2) return {
    columns: '1fr 1fr', rows: '1fr', aspectRatio: 2,
    tiles: [{ index: 0, column: '1', row: '1', more: 0 }, { index: 1, column: '2', row: '1', more: 0 }],
  };
  if (count === 3) return {
    columns: '1fr 1fr', rows: '1fr 1fr', aspectRatio: 1,
    tiles: [{ index: 0, column: '1', row: '1 / span 2', more: 0 }, { index: 1, column: '2', row: '1', more: 0 }, { index: 2, column: '2', row: '2', more: 0 }],
  };
  return {
    columns: '1fr 1fr', rows: '1fr 1fr', aspectRatio: 1,
    tiles: [0, 1, 2, 3].map(index => ({
      index, column: String((index % 2) + 1), row: String(Math.floor(index / 2) + 1), more: index === 3 ? count - 4 : 0,
    })),
  };
}
