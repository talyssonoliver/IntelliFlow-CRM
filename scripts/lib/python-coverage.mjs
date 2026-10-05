/**
 * Python tooling coverage, shared by pre-ship and CI's SonarCloud job.
 *
 * Runs the repo's two pytest suites under coverage.py and writes ONE Cobertura
 * report (artifacts/coverage/python-coverage.xml) with repo-relative paths —
 * the report sonar.python.coverage.reportPaths names and the one
 * scripts/check-diff-coverage.mjs reads for changed .py lines, so the laptop and
 * Sonar judge Python the same way (#755).
 *
 * Measurement settings (which files, branch coverage, relative paths) live in
 * the root .coveragerc so a plain `coverage report` agrees with this script.
 */

export const PYTHON_REPORT = 'artifacts/coverage/python-coverage.xml';
export const COVERAGE_DATA = 'artifacts/coverage/.coverage-python';

/**
 * The suites, as CI already runs them: tools/audit from the repo root, and
 * tools/plan as a package rooted at tools/plan (its tests import `src.…`).
 */
export const PYTHON_SUITES = [
  { name: 'tools/audit', tests: 'tools/audit/tests', pythonPath: null },
  { name: 'tools/plan', tests: 'tools/plan/tests', pythonPath: 'tools/plan' },
];

/**
 * The commands to run, in order. Each suite appends to one coverage data file;
 * the last step turns it into the Cobertura report.
 *
 * @param {{ python: string, env: Record<string, string | undefined>, pathSep: string }} o
 * @returns {{ label: string, args: string[], env: Record<string, string | undefined> }[]}
 */
export function buildSteps({ python, env, pathSep }) {
  const base = { ...env, COVERAGE_FILE: COVERAGE_DATA, COVERAGE_RCFILE: '.coveragerc' };
  const steps = PYTHON_SUITES.map((suite, i) => ({
    label: `pytest ${suite.name}`,
    args: [
      '-m',
      'pytest',
      suite.tests,
      '-q',
      '-p',
      'no:cacheprovider',
      '--cov',
      '--cov-config=.coveragerc',
      '--cov-report=',
      ...(i > 0 ? ['--cov-append'] : []),
    ],
    env: suite.pythonPath
      ? {
          ...base,
          PYTHONPATH: env.PYTHONPATH
            ? `${suite.pythonPath}${pathSep}${env.PYTHONPATH}`
            : suite.pythonPath,
        }
      : base,
  }));
  steps.push({
    label: 'coverage xml',
    args: ['-m', 'coverage', 'xml', '-o', PYTHON_REPORT],
    env: base,
  });
  return steps;
}

/**
 * Rewrite a coverage.py Cobertura report so every `filename` is repo-relative.
 *
 * coverage.py writes each filename relative to whichever `<source>` folder it
 * came from (`affected.py` under `tools/audit`), and with several sources the
 * report alone cannot say which. Resolve each against the sources in order,
 * keep the first that exists, and collapse `<sources>` to the repo root, so
 * Sonar and the diff gate need no knowledge of the source list.
 *
 * @param {string} xml
 * @param {(relPath: string) => boolean} exists repo-relative existence check
 * @returns {{ xml: string, unresolved: string[] }}
 */
export function rebaseCobertura(xml, exists) {
  const sources = [...xml.matchAll(/<source>([^<]*)<\/source>/g)].map((m) =>
    m[1].trim().replaceAll('\\', '/').replace(/\/$/, '')
  );
  const unresolved = [];
  const out = xml
    .replace(/filename="([^"]*)"/g, (whole, name) => {
      const rel = name.replaceAll('\\', '/');
      const hits = sources.map((s) => (s && s !== '.' ? `${s}/${rel}` : rel)).filter(exists);
      // None: the file is gone. Several: the same relative path exists under two
      // source folders, and the report cannot say which one it measured.
      if (hits.length !== 1) {
        unresolved.push(hits.length === 0 ? rel : `${rel} (ambiguous: ${hits.join(', ')})`);
        return whole;
      }
      return `filename="${hits[0]}"`;
    })
    .replace(/<sources>[\s\S]*?<\/sources>/, '<sources>\n\t\t<source>.</source>\n\t</sources>');
  return { xml: out, unresolved };
}

export const REQUIRED_MODULES = ['pytest', 'pytest_cov', 'coverage', 'yaml', 'click'];

/**
 * The first interpreter that has every module the suites need. `python3` and
 * `python` can be different installs (on Windows `python3` is often a bare
 * store shim), so the first one that merely exists is not good enough.
 * PYTHON in the environment pins the choice.
 *
 * @returns {{ cmd: string, error?: undefined } | { error: string }}
 */
export function pickPython({ run, env }) {
  const candidates = env.PYTHON ? [env.PYTHON] : ['python3', 'python'];
  const found = [];
  for (const cmd of candidates) {
    if (run(cmd, ['--version']).status !== 0) continue;
    const missing = REQUIRED_MODULES.filter(
      (mod) => run(cmd, ['-c', `import ${mod}`]).status !== 0
    );
    if (missing.length === 0) return { cmd };
    found.push(`${cmd} (missing ${missing.join(', ')})`);
  }
  if (found.length === 0) {
    return { error: `no ${candidates.join('/')} on PATH — install Python 3.10+.` };
  }
  return {
    error: `no Python with the suites' modules: ${found.join('; ')}. Install: pip install pyyaml click pytest pytest-cov`,
  };
}

/**
 * The whole run. Returns the process exit code.
 *
 * @param {object} io
 * @param {(cmd: string, args: string[], env?: object) => { status: number | null }} io.run
 * @param {Record<string, string | undefined>} io.env
 * @param {string} io.pathSep path.delimiter of the platform
 * @param {(p: string) => void} io.removeFile deletes a file if present
 * @param {(p: string) => string} io.readFile
 * @param {(p: string, text: string) => void} io.writeFile
 * @param {(p: string) => boolean} io.exists
 * @param {(msg: string) => void} io.log
 * @param {(msg: string) => void} io.error
 * @returns {number}
 */
export function runPythonCoverage({
  run,
  env,
  pathSep,
  removeFile,
  readFile,
  writeFile,
  exists,
  log,
  error,
}) {
  const python = pickPython({ run, env });
  if (python.error) {
    error(`::error::python-coverage: ${python.error}`);
    return 1;
  }

  // A stale data file from an earlier run would be appended to, not replaced.
  removeFile(COVERAGE_DATA);
  for (const step of buildSteps({ python: python.cmd, env, pathSep })) {
    log(`▶ ${step.label}`);
    const r = run(python.cmd, step.args, step.env);
    if (r.status !== 0) {
      error(`::error::python-coverage: ${step.label} failed (exit ${r.status}).`);
      return 1;
    }
  }
  const { xml, unresolved } = rebaseCobertura(readFile(PYTHON_REPORT), exists);
  if (unresolved.length > 0) {
    error(
      `::error::python-coverage: cannot place ${unresolved.length} report path(s) under any <source>: ${unresolved.slice(0, 5).join(', ')}`
    );
    return 1;
  }
  writeFile(PYTHON_REPORT, xml);
  log(`✅ Python coverage written to ${PYTHON_REPORT}`);
  return 0;
}
