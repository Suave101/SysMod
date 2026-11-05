#!/usr/bin/env node
/**
 * Builds everything SysMod needs to run contract proofs without Java on the user's computer:
 *
 *   1. Compiles JKind from source at a pinned tag (skipped when resources/jkind/jkind.jar exists,
 *      unless --rebuild is passed).
 *   2. Uses jlink to make a trimmed Java runtime containing only the modules JKind needs.
 *   3. Proves a small Lustre file with that runtime to check the result works.
 *
 * Output goes to resources/jkind/, which electron-builder ships unpacked next to the app.
 * The runtime is platform specific, so run this on each OS you build installers for.
 *
 * Needs a JDK 11 (JKind's Gradle 7.2 build does not run on newer JDKs) in JAVA_HOME, plus git.
 * Without --rebuild, any JDK 11 or newer works for the jlink step.
 *
 * Usage: node scripts/build-jkind.mjs [--rebuild]
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const JKIND_REPO = 'https://github.com/loonwerks/jkind.git';
const JKIND_TAG = 'v4.5.2';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = join(projectRoot, 'resources', 'jkind');
const jarPath = join(outputDir, 'jkind.jar');
const runtimeDir = join(outputDir, 'runtime');
const isWindows = process.platform === 'win32';
const exe = (name) => (isWindows ? `${name}.exe` : name);

function fail(message) {
  console.error(`build-jkind: ${message}`);
  process.exit(1);
}

function run(command, args, options = {}) {
  console.log(`> ${command} ${args.join(' ')}`);
  return execFileSync(command, args, { stdio: options.capture ? 'pipe' : 'inherit', encoding: 'utf-8', ...options });
}

const javaHome = process.env.JAVA_HOME;
if (!javaHome || !existsSync(join(javaHome, 'bin', exe('jlink')))) {
  fail('Set JAVA_HOME to a JDK (11 or newer) that includes jlink.');
}
const jdkTool = (name) => join(javaHome, 'bin', exe(name));
// java -version prints to stderr
const versionOutput = spawnSync(jdkTool('java'), ['-version'], { encoding: 'utf-8' }).stderr;
const jdkMajor = Number(/version "(\d+)/.exec(versionOutput)?.[1]);
if (!jdkMajor || jdkMajor < 11) fail(`JAVA_HOME must be JDK 11 or newer, but it reports: ${versionOutput.split('\n')[0]}`);

// ── 1. JKind ──
mkdirSync(outputDir, { recursive: true });
if (process.argv.includes('--rebuild') || !existsSync(jarPath)) {
  const workDir = mkdtempSync(join(tmpdir(), 'jkind-src-'));
  try {
    run('git', ['clone', '--depth', '1', '--branch', JKIND_TAG, JKIND_REPO, workDir]);
    run(isWindows ? join(workDir, 'gradlew.bat') : join(workDir, 'gradlew'), ['--no-daemon', ':jkind:jar'], {
      cwd: workDir,
      shell: isWindows,
    });
    cpSync(join(workDir, 'jkind', 'build', 'libs', 'jkind.jar'), jarPath);
    cpSync(join(workDir, 'LICENSE'), join(outputDir, 'LICENSE'));
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
} else {
  console.log(`Using existing ${jarPath} (pass --rebuild to compile ${JKIND_TAG} from source)`);
}

// ── 2. Trimmed Java runtime ──
const modules = run(jdkTool('jdeps'), ['--ignore-missing-deps', '--print-module-deps', '--multi-release', String(jdkMajor), jarPath], { capture: true })
  .trim()
  .split(/\r?\n/)
  .pop();
if (!modules) fail('jdeps did not report any modules for jkind.jar');

rmSync(runtimeDir, { recursive: true, force: true });
run(jdkTool('jlink'), [
  '--add-modules', modules,
  '--strip-debug',
  '--no-man-pages',
  '--no-header-files',
  `--compress=${jdkMajor >= 21 ? 'zip-6' : '2'}`,
  '--output', runtimeDir,
]);

// ── 3. Smoke test ──
const testDir = mkdtempSync(join(tmpdir(), 'jkind-smoke-'));
try {
  const lustreFile = join(testDir, 'smoke.lus');
  writeFileSync(lustreFile, `node main(x : int) returns ();
var
  counter : int;
  ok : bool;
let
  --%MAIN;
  counter = 0 -> pre counter + 1;
  ok = counter >= 0;
  --%PROPERTY ok;
tel;
`);
  const output = run(join(runtimeDir, 'bin', exe('java')), ['-jar', jarPath, '-jkind', '-xml_to_stdout', '-timeout', '60', lustreFile], { capture: true });
  if (!/<Answer[^>]*>valid<\/Answer>/.test(output)) fail(`Smoke test did not prove the property:\n${output}`);
} finally {
  rmSync(testDir, { recursive: true, force: true });
}

console.log(`JKind ${JKIND_TAG} and a ${modules} runtime are ready in ${outputDir}`);
