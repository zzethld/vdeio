#!/usr/bin/env node
/**
 * generate-verification-report.mjs
 *
 * Regenerates VERIFICATION_REPORT.md at the repo root by running each package's
 * `npm test` (vitest) plus a TypeScript typecheck, then aggregating the results
 * into a markdown report.
 *
 * Design goals:
 *   - Node-only (no runtime deps). Uses only Node built-ins.
 *   - Cross-platform: runs on Windows (PowerShell/cmd) and Ubuntu (CI).
 *   - Robust: a failing package is recorded, not fatal. Exit non-zero at the end
 *     if any package failed, so CI can gate on the result.
 *
 * Usage:
 *   node scripts/generate-verification-report.mjs
 *
 * Env (optional):
 *   REPORT_PATH   - override output path (default: ./VERIFICATION_REPORT.md)
 *   SKIP_TYPECHECK- set to "1" to skip typechecks (debug only)
 */

import { execSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');
const REPORT_PATH = process.env.REPORT_PATH
  ? resolve(REPO_ROOT, process.env.REPORT_PATH)
  : join(REPO_ROOT, 'VERIFICATION_REPORT.md');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Run a command in `cwd`, capturing combined stdout+stderr as a string.
 * Returns { ok, output }. Never throws — caller decides what to do.
 *
 * stderr is merged into stdout via shell redirection so vitest's summary
 * (which vitest writes to stderr) is always captured regardless of exit code.
 */
function run(cmd, cwd, env = {}, timeoutMs = 10 * 60 * 1000) {
  const fullCmd = cmd + ' 2>&1';
  try {
    const out = execSync(fullCmd, {
      cwd,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
      timeout: timeoutMs,
      maxBuffer: 64 * 1024 * 1024,
      shell: process.platform === 'win32' ? process.env.ComSpec || 'cmd.exe' : '/bin/sh',
    });
    return { ok: true, output: String(out ?? '') };
  } catch (err) {
    // err.stdout/stderr may be populated even on non-zero exit. Because we
    // redirected stderr to stdout in the command, err.stdout already has both.
    const stdout = err && typeof err.stdout === 'string' ? err.stdout : '';
    const stderr = err && typeof err.stderr === 'string' ? err.stderr : '';
    const msg = err && err.message ? err.message : String(err);
    return { ok: false, output: stdout + stderr + '\n[run error] ' + msg + '\n' };
  }
}

/** Strip ANSI escape sequences (color, cursor, etc.) from a string. */
function stripAnsi(s) {
  // Covers CSI sequences (colors, cursor): ESC [ ... letter
  // and a few common two-byte OSC sequences. Good enough for vitest/pytest.
  return s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/\x1b\][^\x07]*\x07/g, '').replace(/\x1b[()][0B]/g, '');
}

/**
 * Parse vitest's summary line(s) out of a chunk of test output.
 *
 * Looks for lines like:
 *     Tests  404 passed (404)
 *     Tests  3 failed | 401 passed (404)
 *     Tests  2 skipped | 402 passed (404)
 *     Test Files  30 passed (30)
 *
 * ANSI color codes are stripped before matching. Returns
 * { total, passed, failed, skipped, filesTotal, filesPassed, filesFailed }.
 * Missing fields are null when not present in the output.
 */
function parseVitestSummary(output) {
  const clean = stripAnsi(output);
  const r = {
    total: null,
    passed: null,
    failed: null,
    skipped: null,
    filesTotal: null,
    filesPassed: null,
    filesFailed: null,
  };

  // "Tests" summary line. Word "Tests" (not "Test Files"). Anchored at line start.
  const testsLine = clean.match(/(?:^|\n)[ \t]*Tests[ \t]+(.+?)[ \t]*(?:\r?\n|$)/i);
  if (testsLine) {
    const body = testsLine[1];
    const totalMatch = body.match(/\((\d+)\)/);
    if (totalMatch) r.total = parseInt(totalMatch[1], 10);
    for (const seg of body.split('|')) {
      const m = seg.match(/(\d+)\s+(passed|failed|skipped|todo)/i);
      if (!m) continue;
      const n = parseInt(m[1], 10);
      const kind = m[2].toLowerCase();
      if (kind === 'passed') r.passed = (r.passed ?? 0) + n;
      else if (kind === 'failed') r.failed = (r.failed ?? 0) + n;
      else if (kind === 'skipped' || kind === 'todo') r.skipped = (r.skipped ?? 0) + n;
    }
  }

  // "Test Files" summary line. Must match the two-word form to avoid the tests
  // line above; require literal "Files" after "Test".
  const filesLine = clean.match(/(?:^|\n)[ \t]*Test[ \t]+Files[ \t]+(.+?)[ \t]*(?:\r?\n|$)/i);
  if (filesLine) {
    const body = filesLine[1];
    const totalMatch = body.match(/\((\d+)\)/);
    if (totalMatch) r.filesTotal = parseInt(totalMatch[1], 10);
    for (const seg of body.split('|')) {
      const m = seg.match(/(\d+)\s+(passed|failed|skipped)/i);
      if (!m) continue;
      const n = parseInt(m[1], 10);
      const kind = m[2].toLowerCase();
      if (kind === 'passed') r.filesPassed = (r.filesPassed ?? 0) + n;
      else if (kind === 'failed') r.filesFailed = (r.filesFailed ?? 0) + n;
    }
  }

  return r;
}

function gitInfo() {
  const sha = run('git rev-parse --short HEAD', REPO_ROOT).output.trim() || 'unknown';
  const longSha = run('git rev-parse HEAD', REPO_ROOT).output.trim() || 'unknown';
  const branch = run('git rev-parse --abbrev-ref HEAD', REPO_ROOT).output.trim() || 'unknown';
  const iso = run('git show -s --format=%cI HEAD', REPO_ROOT).output.trim();
  return { sha, longSha, branch, commitDate: iso };
}

function isoNow() {
  // YYYY-MM-DD HH:MM:SS UTC, plus ISO 8601
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return {
    date: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
    iso: d.toISOString(),
  };
}

function statusBadge(ok) {
  return ok ? 'PASS' : 'FAIL';
}

// ---------------------------------------------------------------------------
// Package runner
// ---------------------------------------------------------------------------

/**
 * Define each package's test + typecheck commands.
 */
function packagePlan(name, dir) {
  const absDir = resolve(REPO_ROOT, dir);
  const plans = {
    server: {
      testCmd: 'npm test --silent',
      testEnv: {
        DB_DIALECT: 'sqlite',
        JWT_SECRET: 'verify-report-secret-key-at-least-32-characters-long',
        JWT_REFRESH_SECRET: 'verify-report-refresh-secret-key-at-least-32-characters-long',
        MASTER_KEY: '0123456789abcdef0123456789abcdef',
      },
      typecheckCmd: 'npx tsc --noEmit',
      typecheckEnv: {},
    },
    admin: {
      testCmd: 'npm test --silent',
      testEnv: {},
      typecheckCmd: 'npx vue-tsc --noEmit',
      typecheckEnv: {},
    },
    client: {
      testCmd: 'npm test --silent',
      testEnv: {},
      typecheckCmd: 'npx tsc -p tsconfig.electron.json --noEmit',
      typecheckEnv: {},
    },
  };
  const p = plans[name];
  if (!p) throw new Error('Unknown package: ' + name);
  return { name, dir: absDir, ...p };
}

function runPackage(plan) {
  const result = {
    name: plan.name,
    dir: plan.dir,
    testCmd: plan.testCmd,
    typecheckCmd: plan.typecheckCmd,
    test: { ok: false, output: '', summary: null, durationMs: null },
    typecheck: { ok: false, output: '' },
    error: null,
  };

  // ---- tests ----
  const t0 = Date.now();
  const t = run(plan.testCmd, plan.dir, plan.testEnv);
  result.test.ok = t.ok;
  result.test.output = t.output;
  result.test.durationMs = Date.now() - t0;
  result.test.summary = parseVitestSummary(t.output);

  // ---- typecheck ----
  if (process.env.SKIP_TYPECHECK === '1') {
    result.typecheck.ok = true;
    result.typecheck.output = '[skipped via SKIP_TYPECHECK=1]';
  } else {
    const tc = run(plan.typecheckCmd, plan.dir, plan.typecheckEnv);
    result.typecheck.ok = tc.ok;
    result.typecheck.output = tc.output;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Report rendering
// ---------------------------------------------------------------------------

function fmtTests(s) {
  if (!s) return 'n/a';
  const parts = [];
  if (s.passed != null) parts.push(`${s.passed} passed`);
  if (s.failed != null && s.failed > 0) parts.push(`${s.failed} failed`);
  if (s.skipped != null && s.skipped > 0) parts.push(`${s.skipped} skipped`);
  const total = s.total != null ? ` / ${s.total}` : '';
  return parts.length ? `${parts.join(', ')}${total}` : 'n/a';
}

function fmtFiles(s) {
  if (!s || s.filesTotal == null) return '';
  const parts = [];
  if (s.filesPassed != null) parts.push(`${s.filesPassed} passed`);
  if (s.filesFailed != null && s.filesFailed > 0) parts.push(`${s.filesFailed} failed`);
  return parts.length ? `(${parts.join(', ')} of ${s.filesTotal} files)` : '';
}

function fmtDuration(ms) {
  if (ms == null) return '';
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(2)}s`;
  const m = Math.floor(s / 60);
  const r = (s - m * 60).toFixed(0);
  return `${m}m${r}s`;
}

function renderReport(results, git, generated) {
  const allTestOk = results.every((r) => r.test.ok);
  const allTypeOk = results.every((r) => r.typecheck.ok);
  const overallOk = allTestOk && allTypeOk;

  // Aggregate counts (skip nulls gracefully).
  let totalPassed = 0,
    totalFailed = 0,
    totalSkipped = 0,
    totalTests = 0;
  for (const r of results) {
    const s = r.test.summary;
    if (!s) continue;
    if (s.passed) totalPassed += s.passed;
    if (s.failed) totalFailed += s.failed;
    if (s.skipped) totalSkipped += s.skipped;
    if (s.total) totalTests += s.total;
  }

  const lines = [];
  lines.push('# VDEIO Verification Report');
  lines.push('');
  lines.push(`**Generated:** ${generated.date} (UTC) — ${generated.iso}`);
  lines.push(`**Git SHA:** \`${git.sha}\` (${git.branch})`);
  lines.push(`**Commit date:** ${git.commitDate || 'n/a'}`);
  lines.push(`**Status:** ${overallOk ? 'ALL CHECKS PASSED' : 'FAILURES DETECTED'}`);
  lines.push('');
  lines.push('> Auto-generated by `scripts/generate-verification-report.mjs`. Do not edit by hand;');
  lines.push('> re-run the script to refresh.');
  lines.push('');
  lines.push('---');
  lines.push('');

  // ---- Summary table ----
  lines.push('## 1. Summary');
  lines.push('');
  lines.push('| Package | Tests | Test files | Typecheck | Tests status |');
  lines.push('|---------|-------|------------|-----------|--------------|');
  for (const r of results) {
    const s = r.test.summary;
    const testStr = s && s.total != null ? `${(s.passed ?? 0)} / ${s.total}` : 'n/a';
    const filesStr = s && s.filesTotal != null ? `${(s.filesPassed ?? 0)} / ${s.filesTotal}` : 'n/a';
    const tcStr = r.typecheck.ok ? 'PASS' : 'FAIL';
    const statusStr = r.test.ok ? 'PASS' : 'FAIL';
    lines.push(`| ${r.name} | ${testStr} | ${filesStr} | ${tcStr} | ${statusStr} |`);
  }
  const aggTest = totalTests > 0 ? `${totalPassed} / ${totalTests}` : 'n/a';
  lines.push(`| **TOTAL** | **${aggTest}** | — | ${allTypeOk ? 'PASS' : 'FAIL'} | ${allTestOk ? 'PASS' : 'FAIL'} |`);
  lines.push('');

  if (totalFailed > 0 || !allTypeOk) {
    lines.push(`> **${totalFailed}** failing test(s) and/or typecheck error(s) detected. See package sections below.`);
    lines.push('');
  }
  lines.push('---');
  lines.push('');

  // ---- Per-package sections ----
  lines.push('## 2. Per-Package Results');
  lines.push('');

  for (const r of results) {
    const s = r.test.summary;
    lines.push(`### 2.${results.indexOf(r) + 1} ${r.name}`);
    lines.push('');
    lines.push(`- **Directory:** \`${r.dir.replace(/\\/g, '/').replace(REPO_ROOT.replace(/\\/g, '/'), '.').replace(/^\.\//, '')}\``);
    lines.push(`- **Test command:** \`${r.testCmd}\` (run from \`${r.name}/\`)`);
    lines.push(`- **Typecheck command:** \`${r.typecheckCmd}\``);
    lines.push(`- **Tests:** ${fmtTests(s)}${s && s.filesTotal != null ? '  ' + fmtFiles(s) : ''}`);
    lines.push(`- **Test duration:** ${fmtDuration(r.test.durationMs)}`);
    lines.push(`- **Typecheck:** ${r.typecheck.ok ? 'PASS' : 'FAIL'}`);
    lines.push(`- **Overall:** ${r.test.ok && r.typecheck.ok ? 'PASS' : 'FAIL'}`);
    lines.push('');

    if (!r.test.ok) {
      lines.push('<details><summary>Test output (tail)</summary>');
      lines.push('');
      lines.push('```');
      const tail = stripAnsi(r.test.output).split('\n').slice(-80).join('\n');
      lines.push(tail);
      lines.push('```');
      lines.push('');
      lines.push('</details>');
      lines.push('');
    }
    if (!r.typecheck.ok) {
      lines.push('<details><summary>Typecheck output (tail)</summary>');
      lines.push('');
      lines.push('```');
      const tail = stripAnsi(r.typecheck.output).split('\n').slice(-80).join('\n');
      lines.push(tail);
      lines.push('```');
      lines.push('');
      lines.push('</details>');
      lines.push('');
    }
  }

  lines.push('---');
  lines.push('');

  // ---- Method / notes ----
  lines.push('## 3. Method');
  lines.push('');
  lines.push('- Tests are run with each package\'s `npm test` (vitest in run mode).');
  lines.push('- Server tests run with `DB_DIALECT=sqlite` (in-memory SQLite, no infra required).');
  lines.push('- Typechecks: server `npx tsc --noEmit`, admin `npx vue-tsc --noEmit`,');
  lines.push('  client `npx tsc -p tsconfig.electron.json --noEmit`.');
  lines.push('- A failing package does not abort the script; failures are recorded and the');
  lines.push('  script exits non-zero so CI can gate on the result.');
  lines.push('- Regenerate locally:');
  lines.push('');
  lines.push('  ```bash');
  lines.push('  node scripts/generate-verification-report.mjs');
  lines.push('  ```');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push(`**Verdict:** ${overallOk ? 'ALL VERIFICATION CHECKS PASSED' : 'FAILURES DETECTED — SEE ABOVE'}`);
  lines.push('');

  return { text: lines.join('\n'), overallOk, totalTests, totalPassed, totalFailed };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const planNames = ['server', 'admin', 'client'];
  const results = planNames.map((n) => runPackage(packagePlan(n, n)));

  const git = gitInfo();
  const generated = isoNow();
  const { text, overallOk } = renderReport(results, git, generated);

  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, text, 'utf8');

  // Human-readable summary to stdout.
  console.log('---');
  for (const r of results) {
    const s = r.test.summary;
    const tStr = s && s.total != null ? `${s.passed ?? 0}/${s.total}` : 'n/a';
    console.log(
      `${r.name.padEnd(8)} tests=${(r.test.ok ? 'PASS' : 'FAIL').padEnd(4)} (${tStr})  ` +
      `typecheck=${r.typecheck.ok ? 'PASS' : 'FAIL'}  ${fmtDuration(r.test.durationMs)}`,
    );
  }
  console.log('---');
  console.log(`Report written to: ${REPORT_PATH}`);
  console.log(`Overall: ${overallOk ? 'PASS' : 'FAIL'}`);

  process.exit(overallOk ? 0 : 1);
}

main();
