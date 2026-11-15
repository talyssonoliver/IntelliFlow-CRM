#!/usr/bin/env node
// post-merge hook body: regenerate generated files from the merged code and
// fold the change into the merge commit. See scripts/lib/merge-regenerate.mjs.
// A post-merge hook cannot undo the merge, so this always exits 0.
import { hookIo, regenerateAfterMerge } from './lib/merge-regenerate.mjs';

regenerateAfterMerge(hookIo());
