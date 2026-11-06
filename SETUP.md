# Setup notes (cartoon-3d-short)
- Skill: ~/.claude/skills/cartoon-3d-short/ (re-install in a fresh container).
- Project: Remotion 4.0.250 + three 0.169 + @remotion/three. Template bridge short in src/videos/bridge/, comp `BridgeShort`.
- New short: copy src/videos/bridge -> src/videos/<name>, register in src/Root.tsx.
- Assets: public/bridge/kenney/*.glb (26 CC0 Kenney models + Textures/).
- Audio tools: audio_work/<name>/ (needs voice/voice.wav + voice/words.json).
- Stills: `REMOTION_TMP=/tmp/claude-remo node scripts/bridge-stills.mjs out/x_ 100,1000 0.5`
  (no GPU here -> software GL "swangle"; ~65 s per still. Override with GL=angle on a GPU machine.)
- Final render is slow in software GL; a 67 s short at 2K would take hours here.
- Blocked in this container: kenney.nl, huggingface.co (no Whisper / neural TTS models).
