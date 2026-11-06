# Rendering "The Day Everyone Got a Flying Car" on your PC

Everything is built and committed: picture (`src/videos/flying/`, composition `FlyingShort`, 1080x1920, 30 fps,
2569 frames = 85.6 s), voice (`shorts/flying-cars/voice/`), and the finished sound mix
(`audio_work/flying-cars/out/mix.wav`). The cloud machine has no GPU, so the final render runs on your PC.

## 1. One-time setup
```bash
git clone https://github.com/4btg2t9k4v-cmd/Claude-videos
cd Claude-videos
npm install
```
You need Node 18+ and ffmpeg. Python 3 (numpy, scipy) is only needed if you want to rebuild the sound.

Each Remotion bundle copies `public/` into the temp folder. Point the temp folder at a drive with space:
- Windows (PowerShell): `$env:TEMP="D:\remotion-tmp"; $env:TMP="D:\remotion-tmp"`
- macOS / Linux: `export TMPDIR=~/remotion-tmp`

## 2. Preview (optional)
```bash
npx remotion studio src/index.ts
```
Pick `FlyingShort` in the sidebar and scrub through it.

## 3. Final render (2K vertical, 1440x2560)
```bash
npx remotion render src/index.ts FlyingShort out/flying/video.mp4 --codec h264 --crf 16 --scale 1.3333 --gl=angle
```
With a GPU this runs at roughly 3-4 frames per second, so about 12-15 minutes. If the render fails with a WebGL error,
try `--gl=angle-egl` (Linux) or `--gl=vulkan`.

## 4. Add the sound
Remotion writes a silent audio track, so map the video from the render and the audio from the mix:
```bash
ffmpeg -i out/flying/video.mp4 -i audio_work/flying-cars/out/mix.wav -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -b:a 320k -shortest out/flying/final.mp4
```
`out/flying/final.mp4` is the finished short.

## 5. Optional frame-by-frame QA
```bash
python scripts/short_qa.py out/flying/final.mp4 out/flying/qa shorts/flying-cars/shots_qa.json
```
It checks for black, white, frozen and popping frames, and measures loudness.

## Rebuilding the sound after a timing change
The sound reads the picture's timing from `story.ts`, so after any change to shots or word timings run:
```bash
node scripts/fly_events.mjs audio_work/flying-cars/events.json
cd audio_work/flying-cars && python flying_sound.py
```

## Stills for a quick look
```bash
COMP=FlyingShort node scripts/bridge-stills.mjs out/fly/x_ 30,420,1110,2125 0.5
```
On a GPU machine set `GL=angle` first. The script defaults to software GL so it also works on cloud machines.
