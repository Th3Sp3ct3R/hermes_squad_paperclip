/** Deterministic mock waveform - same seed produces same shape. Shared between seed script and component. */
export function generateMockPeaks(seed: string, n: number): number[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const rand = () => {
    h ^= h << 13; h ^= h >>> 17; h ^= h << 5;
    return ((h >>> 0) / 4294967295);
  };
  const peaks: number[] = [];
  for (let i = 0; i < n; i++) {
    const env = Math.sin((i / n) * Math.PI) * 0.7 + 0.3;
    const noise = rand() * 0.6 + 0.2;
    const detail = Math.sin(i * 0.4) * 0.15 + Math.sin(i * 1.3) * 0.1;
    peaks.push(Math.max(0.05, Math.min(1, env * noise + detail)));
  }
  return peaks;
}
