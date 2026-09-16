/** Deterministic pseudo-random generator (same LCG used throughout the source design) so charts/waveforms render identically every time for a given seed. */
export function makeRand(seed: number) {
  let x = seed || 3;
  return () => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return Math.abs(x) / 2147483648;
  };
}
