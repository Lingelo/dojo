# Démo 30 s — 3D + voix off + sous-titres

Scène Three.js (cristal, coques filaires, égaliseur 3D piloté par la musique, ondes de choc sur les impacts),
voix off française et sous-titres karaoké. La timeline est calée sur les phrases mesurées par `voice.mjs`.

```bash
cd plugins/motion-studio/examples/demo-3d-voix
node ../../scripts/voice-setup.mjs install piper --lang fr          # une fois (voix neuronale locale, ~60 Mo)
node ../../scripts/voice.mjs narration.json -o voice                 # narration.wav, voice.json, subs.srt
node ../../scripts/sfx.mjs bed --bpm 120 --duration 31 --start 2.45 -o bed.wav > bed.json
node ../../scripts/render.mjs demo-3d-voix.html --voice voice/voice.json --captions karaoke \
     --audio bed.wav --beats bed.json --embed-subs -o demo.mp4
```
1920×1080, 30 fps, 31 s, ≈ 930 captures WebGL (CPU) : compter ~7–8 min.
Si la voix change (autre moteur, autre texte), les durées changent : recaler `HIT`, `PHASES` et `SHOCKS` dans le HTML.
