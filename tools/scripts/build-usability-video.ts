#!/usr/bin/env tsx
/**
 * build-usability-video.ts
 *
 * Generates `artifacts/misc/usability-test-video.mp4` programmatically
 * via ffmpeg (no Remotion, no browser). Each step renders as a 1920x1080
 * slide with a colored header bar, title, caption, numbered step badge,
 * and highlighted call-out boxes — then the slides are stitched together
 * with xfade transitions into a single H.264 MP4.
 *
 * Usage:   pnpm tsx tools/scripts/build-usability-video.ts
 * Output:  artifacts/misc/usability-test-video.mp4
 *
 * Task: IFC-031 (Workflow Builder UI usability test artefact).
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, existsSync, writeFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

// ---------------------------------------------------------------------------
// Storyboard
// ---------------------------------------------------------------------------

interface Step {
  n: number;
  title: string;
  caption: string;
  /** Approx route/component being demoed (shown in breadcrumb row). */
  where: string;
  /** Duration in seconds (before xfade overlap). */
  duration: number;
}

const STEPS: Step[] = [
  {
    n: 1,
    title: 'Open Workflow Builder',
    caption: 'Navigate to /cases/case-workflows from the Cases settings panel.',
    where: 'Cases  >  Case Workflows',
    duration: 3.0,
  },
  {
    n: 2,
    title: 'Create a new workflow',
    caption: 'Click "Create Workflow" — the view switches from the list to the canvas.',
    where: 'WorkflowBuilder  >  Canvas',
    duration: 3.0,
  },
  {
    n: 3,
    title: 'Drag the Start node onto the canvas',
    caption: 'The NodePalette on the left is the DnD source; drop anywhere on the canvas.',
    where: 'NodePalette  ->  ReactFlow canvas',
    duration: 3.0,
  },
  {
    n: 4,
    title: 'Drag an Action node',
    caption: 'Pick an action type (notify, update field, task, webhook, workflow, log).',
    where: 'NodePalette  ->  ReactFlow canvas',
    duration: 3.0,
  },
  {
    n: 5,
    title: 'Connect nodes by drawing an edge',
    caption: 'ReactFlow OnConnect creates the edge; source/target IDs will remap on save.',
    where: 'ReactFlow  >  edges',
    duration: 3.0,
  },
  {
    n: 6,
    title: 'Configure the selected node',
    caption: 'Click a node to open NodeConfigPanel (a shadcn Sheet) — per-type fields.',
    where: 'NodeConfigPanel (Sheet)',
    duration: 3.0,
  },
  {
    n: 7,
    title: 'Save the workflow',
    caption: 'WorkflowToolbar  >  Save calls workflow.create or workflow.update.',
    where: 'WorkflowToolbar  >  Save',
    duration: 3.0,
  },
  {
    n: 8,
    title: 'Toggle Active',
    caption: 'Back on the list, flip the Switch — workflow.setActive invalidates the list.',
    where: 'WorkflowList  >  Switch',
    duration: 3.0,
  },
];

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const WIDTH = 1920;
const HEIGHT = 1080;
const FPS = 30;
const XFADE = 0.6; // seconds

const FONT = 'C\\:/Windows/Fonts/segoeui.ttf';
const FONT_BOLD = 'C\\:/Windows/Fonts/segoeuib.ttf';

/** Escape a string for ffmpeg drawtext (single-quoted) — escapes backslashes, colons, single quotes, and percent. */
function escDrawText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/%/g, '\\%');
}

/** Build the ffmpeg -filter_complex for a single slide. */
function slideFilter(step: Step): string {
  const title = escDrawText(step.title);
  const caption = escDrawText(step.caption);
  const where = escDrawText(step.where);
  const stepN = escDrawText(`Step ${step.n} / ${STEPS.length}`);
  const brand = escDrawText('IntelliFlow CRM  -  IFC-031  -  Workflow Builder Usability Walkthrough');

  // Layout:
  //   Top bar (80px) navy header with brand text on the left, step counter on the right
  //   Breadcrumb bar (50px) light-grey with `where` text
  //   Title (80px) bold, left-aligned at x=120 y=260
  //   Caption (wrapped, ~28px) at y=380
  //   Mockup rectangle (canvas placeholder) at the bottom with a highlight box
  //
  // drawbox: 0x1a365d = navy header, 0xf1f5f9 = breadcrumb, 0xe2e8f0 = canvas placeholder
  //          0x3b82f6 = highlight border (brand primary blue)
  return [
    // header bar
    `drawbox=x=0:y=0:w=${WIDTH}:h=80:color=0x1a365d:t=fill`,
    // breadcrumb bar
    `drawbox=x=0:y=80:w=${WIDTH}:h=50:color=0xf1f5f9:t=fill`,
    // canvas placeholder
    `drawbox=x=120:y=560:w=${WIDTH - 240}:h=420:color=0xe2e8f0:t=fill`,
    // canvas placeholder border
    `drawbox=x=120:y=560:w=${WIDTH - 240}:h=420:color=0x94a3b8:t=3`,
    // highlight call-out near the action of this step
    `drawbox=x=${140 + ((step.n - 1) * 180) % 900}:y=620:w=220:h=120:color=0x3b82f6:t=4`,
    // brand text (header)
    `drawtext=fontfile='${FONT_BOLD}':text='${brand}':fontcolor=0xffffff:fontsize=22:x=40:y=26`,
    // step counter (header right)
    `drawtext=fontfile='${FONT_BOLD}':text='${stepN}':fontcolor=0x93c5fd:fontsize=22:x=w-tw-40:y=26`,
    // breadcrumb
    `drawtext=fontfile='${FONT}':text='${where}':fontcolor=0x475569:fontsize=20:x=40:y=95`,
    // title
    `drawtext=fontfile='${FONT_BOLD}':text='${title}':fontcolor=0x0f172a:fontsize=64:x=120:y=220`,
    // caption
    `drawtext=fontfile='${FONT}':text='${caption}':fontcolor=0x334155:fontsize=30:x=120:y=340:line_spacing=12`,
    // footer hint
    `drawtext=fontfile='${FONT}':text='(programmatic capture - no live browser)':fontcolor=0x94a3b8:fontsize=18:x=120:y=${HEIGHT - 40}`,
  ].join(',');
}

function buildSlide(step: Step, outPath: string): void {
  const filter = [
    `color=c=0xffffff:s=${WIDTH}x${HEIGHT}:r=${FPS}:d=${step.duration}`,
    slideFilter(step),
  ].join(',');

  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-hide_banner',
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      filter,
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-preset',
      'medium',
      '-crf',
      '20',
      '-movflags',
      '+faststart',
      outPath,
    ],
    { stdio: 'inherit' },
  );
}

function concatWithXFade(slides: string[], totalDurations: number[], outPath: string): void {
  // Build filter_complex chain of xfade operations.
  // Each step overlaps with the next by XFADE seconds.
  const inputs = slides.flatMap((s) => ['-i', s]);

  let filter = '';
  let prev = '[0:v]';
  let accumulatedOffset = 0;

  for (let i = 1; i < slides.length; i++) {
    accumulatedOffset += totalDurations[i - 1] - XFADE;
    const label = i === slides.length - 1 ? '[out]' : `[x${i}]`;
    filter += `${prev}[${i}:v]xfade=transition=fade:duration=${XFADE}:offset=${accumulatedOffset.toFixed(3)}${label};`;
    prev = `[x${i}]`;
  }

  // Strip trailing semicolon
  filter = filter.replace(/;$/, '');

  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-hide_banner',
      '-loglevel',
      'error',
      ...inputs,
      '-filter_complex',
      filter,
      '-map',
      '[out]',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-preset',
      'medium',
      '-crf',
      '20',
      '-r',
      String(FPS),
      '-movflags',
      '+faststart',
      outPath,
    ],
    { stdio: 'inherit' },
  );
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

function main(): void {
  const projectRoot = resolve(__dirname, '..', '..');
  const outDir = join(projectRoot, 'artifacts', 'misc');
  const outFile = join(outDir, 'usability-test-video.mp4');
  const workDir = join(tmpdir(), `ifc-031-video-${process.pid}`);

  mkdirSync(outDir, { recursive: true });
  mkdirSync(workDir, { recursive: true });

  try {
    // 1. Build per-step clips.
    const slides: string[] = [];
    const durations: number[] = [];
    for (const step of STEPS) {
      const clip = join(workDir, `step-${String(step.n).padStart(2, '0')}.mp4`);
      console.log(`[slide ${step.n}/${STEPS.length}] ${step.title}`);
      buildSlide(step, clip);
      slides.push(clip);
      durations.push(step.duration);
    }

    // 2. Concat with xfade.
    console.log(`[concat] ${slides.length} slides with ${XFADE}s xfade`);
    concatWithXFade(slides, durations, outFile);

    // Report.
    const totalSec =
      durations.reduce((s, d) => s + d, 0) - XFADE * (durations.length - 1);
    console.log(`\nWrote ${outFile}`);
    console.log(`Approx duration: ${totalSec.toFixed(1)}s at ${FPS} fps, ${WIDTH}x${HEIGHT}.`);
  } finally {
    // Cleanup.
    if (existsSync(workDir)) {
      try {
        rmSync(workDir, { recursive: true, force: true });
      } catch {
        // best-effort
      }
    }
  }
}

main();
