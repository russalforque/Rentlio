"""Generate the per-scene voiceover with Kokoro (open-source TTS, runs locally).

Setup:
  pip install kokoro-onnx soundfile
  curl -LO https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.int8.onnx
  curl -LO https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin

Run from the promo-video folder:
  python scripts/generate-voiceover.py --models <folder with the two files above>

Writes public/voiceover/<scene>.mp3 and src/voiceover.json (durations in seconds).
"""

import argparse
import json
import subprocess
from pathlib import Path

import soundfile as sf
from kokoro_onnx import Kokoro

VOICE = "af_heart"
SPEED = 1.0

SCRIPT = {
    "intro": "Meet Rentlio. Every room, every bill, in one calm place.",
    "dashboard": "Your dashboard shows what's collected, what's outstanding, and exactly what needs your attention today.",
    "rooms": "See every room at a glance: who's in, what's free, and who still owes.",
    "billing": "Bills generate themselves on billing day. Type in the meter readings, and electricity is added for you.",
    "tenant": "Tenants pay from their phone, and upload a screenshot as proof.",
    "verify": "You check the receipt, and verify it in one tap. The bill updates instantly.",
    "reports": "Reports track twelve months of billed versus collected, ready to export.",
    "outro": "Rentlio. Less chasing. More collecting.",
}

parser = argparse.ArgumentParser()
parser.add_argument("--models", default=".")
args = parser.parse_args()
models = Path(args.models)

root = Path(__file__).resolve().parent.parent
out_dir = root / "public" / "voiceover"
out_dir.mkdir(parents=True, exist_ok=True)

kokoro = Kokoro(str(models / "kokoro-v1.0.int8.onnx"), str(models / "voices-v1.0.bin"))
durations = {}
for scene, text in SCRIPT.items():
    samples, rate = kokoro.create(text, voice=VOICE, speed=SPEED, lang="en-us")
    wav = out_dir / f"{scene}.wav"
    sf.write(wav, samples, rate)
    mp3 = out_dir / f"{scene}.mp3"
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav), "-b:a", "192k", str(mp3)],
        check=True,
    )
    wav.unlink()
    durations[scene] = round(len(samples) / rate, 3)
    print(f"{scene}: {durations[scene]}s")

(root / "src" / "voiceover.json").write_text(json.dumps(durations, indent=2) + "\n")
