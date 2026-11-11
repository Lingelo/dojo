# Kaizen presentation video — sources

The 79.6 s presentation video (`../kaizen-presentation.mp4`, poster `.jpg`, subtitles `.srt`/`.vtt`),
made with [motion-studio](../../../plugins/motion-studio/README.md): a Three.js scene
(`kaizen-presentation.html` and its modules), a narration (`narration.json`) and a music bed
(`bed-ma.mjs`).

## Rendering

The scene is WebGL: render it on a machine with a GPU. Without one (a cloud container), Chromium falls
back to software rendering at about 10 s per frame, which is 6 to 7 hours for the 2,388 frames.

From this folder, with `W` a work folder outside the repository:

```bash
M=../../../plugins/motion-studio/scripts
node fetch-assets.mjs                                        # the 2k scans, md5-verified (once)
node $M/voice.mjs narration.json -o $W/voice                 # Kokoro narration + real line timings
node bed-ma.mjs --bpm 84 -o $W/bed.wav > $W/bed.json         # the music bed and its beat grid
node $M/render.mjs kaizen-presentation.html --quality standard \
  --voice $W/voice/voice.json --audio $W/bed.wav --beats $W/bed.json -o $W/kaizen-presentation.mp4
```

`--quality high` (finer shadows, more polygons) costs about 2.5× more. To iterate on one scene:
`--quality draft --from 30 --to 36`, or stills: `--stills 12.6,32.4 --sheet 3`.

## Publishing

```bash
ffmpeg -i $W/kaizen-presentation.mp4 -c:v libx264 -preset slow -crf 26 -tune animation -pix_fmt yuv420p \
  -movflags +faststart -c:a aac -b:a 160k ../kaizen-presentation.mp4
node $M/render.mjs kaizen-presentation.html --quality standard --stills 12.6 -o $W/poster   # → $W/poster/still-12.60s.png
ffmpeg -i $W/poster/still-12.60s.png -vf scale=1280:-1 -q:v 3 ../kaizen-presentation.jpg
cp $W/kaizen-presentation.srt $W/kaizen-presentation.vtt ..
```

Then check the result: 79.6 s, a sound track, the captions in sync with the voice.
