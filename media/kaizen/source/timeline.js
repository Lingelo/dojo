// Story time / real time of the Kaizen video, shared by the composition (classic <script>, works over
// file://) and by bed-ma.mjs (evaluated in a Node vm), so the music can never drift from the picture.
//
// The whole composition is written in story time (0 → 61 s). Real time plays through it more slowly
// while a card is readable (SLOW), at normal speed during transitions: reading time is gained
// without touching the movements. Sounds, voice (narration.json, "at") and music follow the same table.
(function (root) {
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const sstep = (x) => x * x * (3 - 2 * x);
  const lerp = (a, b, k) => a + (b - a) * k;

  const STORY = 61, SLOW = 0.68, RAMP = 0.5;
  const READ = [[3.6, 8.3], [13.5, 17.5], [18.5, 21.7], [22.7, 27.8], [28.9, 32.7], [33.7, 38.0], [39.1, 46.9], [48.0, 56.0], [57.4, 61]];
  const speedAt = (s) => 1 - (1 - SLOW) * Math.max(0, ...READ.map(([a, b]) => sstep(clamp((s - a) / RAMP)) * sstep(clamp((b - s) / RAMP))));
  const STEP = 0.002, REAL = [0];
  for (let s = STEP; s <= STORY + 1e-9; s += STEP) REAL.push(REAL.at(-1) + STEP / speedAt(s - STEP / 2));
  const DUR = REAL.at(-1);

  function realAt(s) { const i = clamp(s / STEP, 0, REAL.length - 1), j = Math.floor(i); return lerp(REAL[j], REAL[Math.min(j + 1, REAL.length - 1)], i - j); }
  function storyAt(t) {
    let lo = 0, hi = REAL.length - 1;
    if (t >= REAL[hi]) return STORY;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (REAL[m] <= t) lo = m; else hi = m; }
    return (lo + (t - REAL[lo]) / (REAL[hi] - REAL[lo])) * STEP;
  }

  root.__timeline = { realAt, storyAt, DUR, STORY };
})(typeof window !== 'undefined' ? window : globalThis);
