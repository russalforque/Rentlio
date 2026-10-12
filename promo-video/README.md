# Rentlio promo video

A ~47-second 1080p motion graphic for Rentlio, built with [Remotion](https://remotion.dev). Every screen in it is the real Rentlio app, captured with demo data. It has eight scenes (intro, dashboard, rooms, billing, tenant portal, payment verification, reports, outro), a narrated voiceover and an original background track that ducks under the voice.

## Commands

```bash
npm i
npm run dev                                          # Remotion Studio preview
npx remotion render RentlioPromo out/rentlio-promo.mp4
```

Each scene is also its own composition (under `RentlioPromo-Scenes` in the Studio). Camera moves and cursor clicks are keyframes in `src/scenes/*.tsx`, in the screenshot's CSS pixels (1600×1000 desktop, 390×844 phone).

## Recapturing the app screens

`public/screens/*.png` come from the real app. `capture/` builds nothing itself; it opens a production build in headless Chromium, answers every Supabase request from an in-memory demo property (`capture/data.mjs`, "Maple Court Residences", 28 rooms), and clicks through the flows (verify a payment, submit a proof) so before/after states are real too.

```bash
# from the repo root: build the app against the mock backend
VITE_SUPABASE_URL=http://mock.supabase.test VITE_SUPABASE_PUBLISHABLE_KEY=demo npx vite build --outDir /tmp/rentlio-demo

# from promo-video/
node capture/capture.mjs /tmp/rentlio-demo /tmp/rentlio-shots
```

Set `CHROMIUM_PATH` if Chrome is not installed. Copy the screenshots you want into `public/screens/`. If a page's layout changes, update that scene's camera keyframes.

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

Geist, Rentlio's own typeface, is bundled in `public/fonts` (SIL Open Font License, `public/fonts/OFL.txt`) so renders work offline.
