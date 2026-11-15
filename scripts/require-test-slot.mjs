#!/usr/bin/env node
// Exits 2 with a message unless this heavy command may run here (inside the
// test-slot queue, under CI, or with ALLOW_OUTSIDE_SLOT=1). Chain it in front:
//
//   "build": "node ../../scripts/require-test-slot.mjs web-build && next build"
//
// The rules are in scripts/lib/test-slot.mjs (slotRefusal).
import { requireSlot } from './lib/test-slot.mjs';

requireSlot(process.argv[2] || 'this command');
