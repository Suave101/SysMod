/**
 * Renders build/logo.svg into every icon the app and docs need, using Electron's own Chromium,
 * so no image tools need to be installed. Run after changing the logo:
 *
 *   npm run build:icons
 *
 * Writes:
 *   build/icon.png               1024 px, used for Linux and as the source for electron-builder
 *   build/icon.ico               Windows installer and app icon (16 to 256 px)
 *   build/icon.icns              macOS app icon (16 to 1024 px)
 *   resources/icon.png           512 px window icon
 *   src/renderer/src/assets/logo.svg, ../docs/img/logo.svg   copies of the logo
 *   ../docs/img/favicon.ico      docs site favicon
 */
import { app, BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const at = (...parts) => path.join(root, ...parts);
const svg = fs.readFileSync(at('build', 'logo.svg'));
const MASTER = 1024;

// Windows display scaling would otherwise render the page larger than the capture area
app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.commandLine.appendSwitch('high-dpi-support', '1');

async function renderMaster() {
  const win = new BrowserWindow({
    width: MASTER,
    height: MASTER,
    show: false,
    frame: false,
    transparent: true,
    useContentSize: true,
    webPreferences: { offscreen: true },
  });
  const html = `<!doctype html><html><body style="margin:0;background:transparent;overflow:hidden">
    <img src="data:image/svg+xml;base64,${svg.toString('base64')}" width="${MASTER}" height="${MASTER}" style="display:block"></body></html>`;
  await win.loadURL(`data:text/html;base64,${Buffer.from(html).toString('base64')}`);
  await new Promise((resolve) => setTimeout(resolve, 300));
  const image = await win.webContents.capturePage({ x: 0, y: 0, width: MASTER, height: MASTER });
  win.destroy();
  return image;
}

const pngAt = (image, size) => image.resize({ width: size, height: size, quality: 'best' }).toPNG();

/** An .ico whose entries are PNGs, which Windows Vista and later read */
function buildIco(entries) {
  const header = Buffer.alloc(6 + 16 * entries.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  let offset = header.length;
  entries.forEach(({ size, png }, i) => {
    const at16 = 6 + 16 * i;
    header.writeUInt8(size >= 256 ? 0 : size, at16);
    header.writeUInt8(size >= 256 ? 0 : size, at16 + 1);
    header.writeUInt8(0, at16 + 2);
    header.writeUInt8(0, at16 + 3);
    header.writeUInt16LE(1, at16 + 4);
    header.writeUInt16LE(32, at16 + 6);
    header.writeUInt32LE(png.length, at16 + 8);
    header.writeUInt32LE(offset, at16 + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...entries.map((e) => e.png)]);
}

/** An .icns whose entries are PNGs, keyed by Apple's type codes */
function buildIcns(entries) {
  const chunks = entries.map(({ type, png }) => {
    const head = Buffer.alloc(8);
    head.write(type, 0, 'ascii');
    head.writeUInt32BE(png.length + 8, 4);
    return Buffer.concat([head, png]);
  });
  const body = Buffer.concat(chunks);
  const head = Buffer.alloc(8);
  head.write('icns', 0, 'ascii');
  head.writeUInt32BE(body.length + 8, 4);
  return Buffer.concat([head, body]);
}

function write(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
  console.log(`  ${path.relative(path.dirname(root), file)}  ${(data.length / 1024).toFixed(1)} KB`);
}

app.whenReady().then(async () => {
  try {
    const master = await renderMaster();
    const size = master.getSize();
    if (size.width !== MASTER || size.height !== MASTER) throw new Error(`Rendered at ${size.width}x${size.height}px, expected ${MASTER}x${MASTER}px`);

    console.log('Writing icons from build/logo.svg:');
    write(at('build', 'icon.png'), pngAt(master, 1024));
    write(at('resources', 'icon.png'), pngAt(master, 512));
    write(at('build', 'icon.ico'), buildIco([16, 24, 32, 48, 64, 128, 256].map((s) => ({ size: s, png: pngAt(master, s) }))));
    write(
      at('build', 'icon.icns'),
      buildIcns([
        ['icp4', 16], ['icp5', 32], ['icp6', 64], ['ic07', 128], ['ic08', 256], ['ic09', 512], ['ic10', 1024],
      ].map(([type, s]) => ({ type, png: pngAt(master, s) }))),
    );
    write(at('src', 'renderer', 'src', 'assets', 'logo.svg'), svg);
    write(at('..', 'docs', 'img', 'logo.svg'), svg);
    write(at('..', 'docs', 'img', 'favicon.ico'), buildIco([16, 32, 48].map((s) => ({ size: s, png: pngAt(master, s) }))));
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
