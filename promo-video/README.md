# Rentlio promo video

A ~38-second 1080p motion graphic for Rentlio, built with [Remotion](https://remotion.dev). It has six scenes (intro, rooms, billing, payments, dashboard, outro), a narrated voiceover and an original background track that ducks under the voice.

## Commands

```bash
npm i
npm run dev                                          # Remotion Studio preview
npx remotion render RentlioPromo out/rentlio-promo.mp4
```

Each scene is also its own composition (under `RentlioPromo-Scenes` in the Studio), so you can edit them one at a time.

## Changing the narration

The voiceover is generated locally with [Kokoro](https://github.com/thewh1teagle/kokoro-onnx), an open-source TTS model. Edit the lines in `scripts/generate-voiceover.py`, then:

```bash
pip install kokoro-onnx soundfile
curl -LO https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.int8.onnx
curl -LO https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin
python scripts/generate-voiceover.py --models .
```

It rewrites `public/voiceover/*.mp3` and `src/voiceover.json`. Scene lengths follow the narration automatically (`src/timeline.ts`). Change `VOICE` in the script for a different voice (for example `am_michael` or `bf_emma`).

## Music

`public/music.mp3` is synthesized from scratch by `scripts/generate-music.py` (numpy + ffmpeg), so there is no licensing to worry about. Swap in any track you own by replacing the file; the volume curve is in `src/RentlioPromo.tsx`.

## Fonts

Plus Jakarta Sans is bundled in `public/fonts` (SIL Open Font License, `public/fonts/OFL.txt`) so renders work offline.
