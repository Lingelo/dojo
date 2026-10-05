"""motion-studio — one line of narration with Kokoro (kokoro-onnx), written as 16-bit mono WAV.

    <kokoro-venv>/bin/python kokoro_tts.py --model kokoro.onnx --voices voices.bin \
        --voice af_heart --lang en-us --speed 1 --out line.wav  < text

Called by voice.mjs (engine "kokoro"), installed by `voice-setup.mjs install kokoro`.
Only the standard library besides kokoro-onnx: no soundfile dependency.
"""
import argparse
import sys
import wave

import numpy as np
import onnxruntime as ort
from kokoro_onnx import Kokoro

ort.set_default_logger_severity(3)  # onnxruntime warnings would bury our errors on stderr


def main():
    p = argparse.ArgumentParser()
    for a in ('--model', '--voices', '--voice', '--lang', '--out'):
        p.add_argument(a, required=True)
    p.add_argument('--speed', type=float, default=1.0)
    a = p.parse_args()

    text = sys.stdin.read().strip()
    if not text:
        sys.exit('kokoro_tts: empty text')
    kokoro = Kokoro(a.model, a.voices)
    if a.voice not in kokoro.get_voices():
        sys.exit(f'kokoro_tts: unknown voice "{a.voice}" (available: {", ".join(sorted(kokoro.get_voices()))})')
    # kokoro-onnx refuses speeds outside [0.5, 2]
    samples, sr = kokoro.create(text, voice=a.voice, speed=min(2.0, max(0.5, a.speed)), lang=a.lang)
    pcm = (np.clip(samples, -1.0, 1.0) * 32767).astype('<i2')
    with wave.open(a.out, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(pcm.tobytes())


if __name__ == '__main__':
    main()
