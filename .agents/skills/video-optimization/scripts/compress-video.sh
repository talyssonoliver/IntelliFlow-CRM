#!/usr/bin/env bash
# compress-video.sh — Compress a video for web background use
#
# Usage: compress-video.sh <input> <output> [resolution] [bitrate] [crf] [fps]
#
# Defaults: 1280x720, 1M bitrate, CRF 35, 30fps, VP9 WebM, no audio
#
# Examples:
#   compress-video.sh raw.mp4 bg.webm
#   compress-video.sh raw.mp4 bg.webm 1920x1080 2M 28 24

set -euo pipefail

INPUT="${1:?Usage: compress-video.sh <input> <output> [resolution] [bitrate] [crf] [fps]}"
OUTPUT="${2:?Usage: compress-video.sh <input> <output> [resolution] [bitrate] [crf] [fps]}"
RESOLUTION="${3:-1280:720}"
BITRATE="${4:-1M}"
CRF="${5:-35}"
FPS="${6:-30}"

# Convert resolution format (1280x720 -> 1280:720)
RESOLUTION="${RESOLUTION//x/:}"

echo "=== Video Compression ==="
echo "Input:      $INPUT"
echo "Output:     $OUTPUT"
echo "Resolution: $RESOLUTION"
echo "Bitrate:    $BITRATE"
echo "CRF:        $CRF"
echo "FPS:        $FPS"
echo ""

# Show source info
echo "--- Source info ---"
ffprobe -v quiet -show_entries format=size,duration,bit_rate -show_entries stream=width,height,r_frame_rate,codec_name -print_format flat "$INPUT" 2>/dev/null || echo "(ffprobe not available)"
echo ""

# Determine codec from output extension
EXT="${OUTPUT##*.}"
if [[ "$EXT" == "webm" ]]; then
  echo "--- Encoding VP9 WebM ---"
  ffmpeg -y -i "$INPUT" \
    -vf "scale=${RESOLUTION}" \
    -c:v libvpx-vp9 \
    -b:v "$BITRATE" -crf "$CRF" \
    -r "$FPS" -an \
    -pix_fmt yuv420p \
    -deadline good -cpu-used 2 -row-mt 1 \
    "$OUTPUT"
elif [[ "$EXT" == "mp4" ]]; then
  echo "--- Encoding H.264 MP4 ---"
  ffmpeg -y -i "$INPUT" \
    -vf "scale=${RESOLUTION}" \
    -c:v libx264 \
    -preset slow -crf "$CRF" \
    -r "$FPS" -an \
    -pix_fmt yuv420p \
    -movflags +faststart \
    "$OUTPUT"
else
  echo "Error: Unsupported output format '.$EXT'. Use .webm or .mp4"
  exit 1
fi

echo ""
echo "--- Result ---"
INPUT_SIZE=$(stat -c%s "$INPUT" 2>/dev/null || stat -f%z "$INPUT" 2>/dev/null || echo "?")
OUTPUT_SIZE=$(stat -c%s "$OUTPUT" 2>/dev/null || stat -f%z "$OUTPUT" 2>/dev/null || echo "?")

if [[ "$INPUT_SIZE" != "?" && "$OUTPUT_SIZE" != "?" ]]; then
  REDUCTION=$(( 100 - (OUTPUT_SIZE * 100 / INPUT_SIZE) ))
  echo "Input:     $(numfmt --to=iec "$INPUT_SIZE" 2>/dev/null || echo "${INPUT_SIZE} bytes")"
  echo "Output:    $(numfmt --to=iec "$OUTPUT_SIZE" 2>/dev/null || echo "${OUTPUT_SIZE} bytes")"
  echo "Reduction: ${REDUCTION}%"
else
  ls -lh "$INPUT" "$OUTPUT"
fi
