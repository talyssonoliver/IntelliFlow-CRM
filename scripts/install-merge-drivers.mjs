#!/usr/bin/env node
// Installs the `ifc-regenerated` merge driver in this clone's git config
// (pre-commit hook and postinstall). Never fails: outside a git checkout (a
// Docker build) there is nothing to install. See scripts/lib/merge-regenerate.mjs.
import { hookIo, installMergeDrivers } from './lib/merge-regenerate.mjs';

try {
  installMergeDrivers(hookIo().git);
} catch {
  // nothing to install here
}
