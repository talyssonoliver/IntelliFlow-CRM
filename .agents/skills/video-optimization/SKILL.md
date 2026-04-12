---
name: video-optimization
description:
  Compress and optimize video files for web use as background elements, hero
  sections, or decorative visuals. Use when adding video backgrounds to pages,
  compressing heavy video files, converting video formats (MP4/WebM/MOV), or
  integrating video into Next.js components. Covers ffmpeg compression, format
  selection, responsive video markup, and performance-aware video backgrounds
  with gradient overlays.
---

# Video Optimization for Web

Compress and prepare video files for performant web delivery, especially as
background elements on Next.js pages.

## Quick Reference

Target specs for background/decorative video:

| Property    | Target                     | Why                                       |
| ----------- | -------------------------- | ----------------------------------------- |
| Resolution  | 720p (1280x720)            | Sufficient for dimmed/blurred backgrounds |
| Frame rate  | 30fps (or 24fps cinematic) | Halves file size vs 60fps                 |
| Codec       | VP9 (WebM) or H.265 (MP4)  | Best compression-to-quality ratio         |
| Bitrate     | 800K-1.5M                  | Sweet spot for background video           |
| Audio       | Strip entirely (`-an`)     | Background video is always muted          |
| Target size | Under 2MB for 10-15s loop  | Keeps LCP and total page weight healthy   |

## Compression Workflow

### Step 1: Analyze the source

```bash
ffprobe -v quiet -print_format json -show_streams -show_format <input>
```

Check: resolution, fps, codec, bitrate, duration, file size. Identify what needs
to change.

### Step 2: Compress with ffmpeg

**WebM (VP9) -- preferred for modern browsers:**

```bash
ffmpeg -i <input> \
  -vf "scale=1280:720" \
  -c:v libvpx-vp9 \
  -b:v 1M -crf 35 \
  -r 30 -an \
  -pix_fmt yuv420p \
  -deadline good -cpu-used 2 -row-mt 1 \
  <output>.webm
```

**MP4 (H.264) -- fallback for older browsers:**

```bash
ffmpeg -i <input> \
  -vf "scale=1280:720" \
  -c:v libx264 \
  -preset slow -crf 28 \
  -r 30 -an \
  -pix_fmt yuv420p \
  -movflags +faststart \
  <output>.mp4
```

Key flags:

- `-crf`: Quality (lower = better). 28-35 is good for backgrounds
- `-deadline good -cpu-used 2`: VP9 encoding speed/quality tradeoff
- `-movflags +faststart`: MP4 progressive download (start playing before fully
  loaded)
- `-row-mt 1`: Multi-threaded VP9 encoding

### Step 3: Verify output

```bash
ls -lh <output>          # Check file size (target: <2MB)
ffprobe <output>         # Verify specs match targets
```

### Step 4: Clean up

Remove the original heavy source file after confirming the compressed version
works.

## Integration Patterns

### Background video component (Next.js / React)

For a full-viewport decorative video behind page content. See
[component-patterns.md](references/component-patterns.md) for complete examples.

Key principles:

- Use `autoPlay muted loop playsInline preload="auto"` attributes
- Position with `absolute inset-0` + `object-cover` for full-bleed
- Set opacity (30-50%) so text remains legible
- Add a gradient overlay div on top:
  `bg-gradient-to-t from-dark via-dark/80 to-dark/40`
- Mark container as `pointer-events-none` and `aria-hidden="true"`
- Provide `<source>` with correct `type` attribute for codec detection
- Server component when possible (no `"use client"` needed for a plain `<video>`
  tag)

### Responsive considerations

- Background video is decorative: no `<track>` captions needed
- Use `prefers-reduced-motion` media query to pause or hide video for
  accessibility
- On mobile, consider hiding video entirely to save bandwidth (CSS
  `hidden md:block`)

## When NOT to Optimize

- **Hero showreel** meant to be watched in full quality: keep higher bitrate
  (2-4M), offer multiple resolutions
- **Product demo videos**: prioritize clarity over file size
- **Short loops (<3s)**: consider animated WebP or AVIF instead of video

## ffmpeg Installation

If ffmpeg is not installed:

```bash
# Windows (winget)
winget install --id Gyan.FFmpeg -e --accept-source-agreements --accept-package-agreements

# macOS (Homebrew)
brew install ffmpeg

# Linux (apt)
sudo apt install ffmpeg
```

After install on Windows, add to PATH:
`export PATH="$PATH:/c/Users/$USER/AppData/Local/Microsoft/WinGet/Links"`
