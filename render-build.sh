#!/usr/bin/env bash
set -euo pipefail
mkdir -p .tools/bin
export PATH="$PWD/.tools/bin:$PATH"

if ! command -v yt-dlp >/dev/null 2>&1; then
  curl -L --fail --retry 3 https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o .tools/bin/yt-dlp
  chmod +x .tools/bin/yt-dlp
fi

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg was not found on PATH."
  echo "Install ffmpeg in the Render image/environment before starting Rimuru."
  exit 1
fi

npm install
yt-dlp --version
ffmpeg -version | head -n 1
