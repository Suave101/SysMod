import { app, ipcMain } from 'electron';
import { execFile } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export interface JKindRunResponse {
  success: boolean;
  xml?: string;
  error?: string;
}

const DEFAULT_TIMEOUT_SEC = 60;

// scripts/build-jkind.mjs puts jkind.jar and a trimmed Java runtime here
function jkindResources(): string {
  const resources = app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked', 'resources')
    : path.join(__dirname, '../../resources');
  return path.join(resources, 'jkind');
}

/** SYSMOD_JKIND_JAR overrides the bundled jar for development */
function findJKindJar(): string | undefined {
  return [process.env.SYSMOD_JKIND_JAR, path.join(jkindResources(), 'jkind.jar')].find((p) => p && fs.existsSync(p));
}

// The bundled runtime means users never install Java. Without it (an unbuilt dev checkout),
// fall back to JAVA_HOME and then the PATH; JKind needs Java 11 or newer.
function findJava(): string {
  const javaName = process.platform === 'win32' ? 'java.exe' : 'java';
  const candidates = [
    path.join(jkindResources(), 'runtime', 'bin', javaName),
    process.env.JAVA_HOME && path.join(process.env.JAVA_HOME, 'bin', javaName),
  ];
  return candidates.find((p) => p && fs.existsSync(p)) || 'java';
}

export function runJKind(lustre: string, timeoutSec = DEFAULT_TIMEOUT_SEC): Promise<JKindRunResponse> {
  const jar = findJKindJar();
  if (!jar) {
    return Promise.resolve({ success: false, error: 'JKind was not found. Run "npm run build:jkind", or set SYSMOD_JKIND_JAR.' });
  }

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sysmod-jkind-'));
  const lustreFile = path.join(workDir, 'model.lus');
  fs.writeFileSync(lustreFile, lustre, 'utf-8');
  // -ivc reports the smallest set of --%IVC facts each valid property needs, which is what
  // turns a "valid" answer into a proof a person can read
  const ivc = lustre.includes('--%IVC') ? ['-ivc'] : [];
  const args = ['-jar', jar, '-jkind', '-xml_to_stdout', ...ivc, '-timeout', String(timeoutSec), lustreFile];

  return new Promise((resolve) => {
    execFile(findJava(), args, { timeout: (timeoutSec + 30) * 1000, maxBuffer: 64 * 1024 * 1024 }, (error, stdout, stderr) => {
      fs.rmSync(workDir, { recursive: true, force: true });
      const output = `${stdout}\n${stderr}`;

      if (/UnsupportedClassVersionError/.test(output)) {
        resolve({ success: false, error: 'JKind needs Java 11 or newer. Install it or set JAVA_HOME.' });
      } else if (error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
        resolve({ success: false, error: 'Java was not found. Install Java 11 or newer, or set JAVA_HOME.' });
      } else if (stdout.includes('<Results')) {
        resolve({ success: true, xml: stdout.slice(stdout.indexOf('<?xml') >= 0 ? stdout.indexOf('<?xml') : stdout.indexOf('<Results')) });
      } else {
        // Lustre parse and type errors are printed as plain text instead of XML
        resolve({ success: false, error: output.trim() || error?.message || 'JKind produced no results' });
      }
    });
  });
}

export function registerJKindHandlers(): void {
  ipcMain.handle('run-jkind', (_event, lustre: string, timeoutSec?: number) => runJKind(lustre, timeoutSec));
}
