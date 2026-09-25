#!/usr/bin/env bash
# Full pipeline: synthesise the soundtrack, render 900 motion-blurred frames, encode the MP4.
#   tools/build.sh                 (needs node + playwright, python3 + numpy/scipy, ffmpeg)
#   FRAMES=/tmp/frames WORKERS=4 FFMPEG=/path/to/ffmpeg tools/build.sh
set -euo pipefail
cd "$(dirname "$0")/.."
FRAMES=${FRAMES:-/tmp/showreel-frames}
WORKERS=${WORKERS:-4}
FFMPEG=${FFMPEG:-ffmpeg}

python3 tools/soundtrack.py audio/soundtrack.wav
"$FFMPEG" -y -loglevel error -i audio/soundtrack.wav -c:a aac -b:a 192k audio/soundtrack.m4a
"$FFMPEG" -y -loglevel error -i audio/soundtrack.wav -c:a libopus -b:a 160k audio/soundtrack.ogg

node tools/render.mjs --frames=0-899 --sub=8 --shutter=0.5 --workers="$WORKERS" --out="$FRAMES"

# RGB -> BT.709 limited-range YUV explicitly, so colours match the canvas on every player.
"$FFMPEG" -y -loglevel error -framerate 60 -i "$FRAMES/f%04d.png" -i audio/soundtrack.wav \
  -vf "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p" \
  -c:v libx264 -preset slow -crf 17 -profile:v high -level 4.2 -g 120 \
  -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv \
  -c:a aac -b:a 256k -ar 48000 -movflags +faststart -shortest showreel.mp4
echo "wrote showreel.mp4"
