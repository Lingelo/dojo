# 30-second demo — 3D + voice-over + subtitles

Three.js scene (crystal, wireframe shells, music-driven 3D equalizer, shock waves on the impacts), English
voice-over and karaoke subtitles. Each narration line is pinned to its scene with `"at"`, so the timeline
holds whatever the voice engine.

```bash
cd plugins/motion-studio/examples/demo-3d-voice
node ../../scripts/voice-setup.mjs install piper --lang en          # once (local neural voice, ~60 MB)
node ../../scripts/voice.mjs narration.json -o voice                 # narration.wav, voice.json, subs.srt
node ../../scripts/sfx.mjs bed --bpm 120 --duration 31 --start 2.45 -o bed.wav > bed.json
node ../../scripts/render.mjs demo-3d-voice.html --voice voice/voice.json --captions karaoke \
     --audio bed.wav --beats bed.json --embed-subs -o demo.mp4
```
1920×1080, 30 fps, 31 s, ≈ 930 WebGL captures (CPU): count ~7–8 min.
If a line becomes longer (another text, a slower voice), `voice.mjs` warns about the overlap: shorten it,
or move `HIT`, `PHASES` and `SHOCKS` in the HTML together with the `"at"` values.
