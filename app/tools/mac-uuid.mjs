// macOS: Jede Electron-App erbt die Programm-Kennung (LC_UUID) des Original-Electron. Die Freigabe fürs
// lokale Netzwerk hängt auch an dieser Kennung – so kann eine Sperre für „Electron“ unsere App mit treffen.
// Darum bekommen Hauptprogramm und Helfer eine eigene, stabile Kennung. Danach muss neu signiert werden.
// Aufruf: node tools/mac-uuid.mjs <Pfad zur .app> (läuft sonst automatisch in tools/zip.mjs)
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MH_MAGIC_64 = 0xfeedfacf;
const LC_UUID = 0x1b;
const HEADER_64 = 32;

// Stelle der 16 UUID-Bytes in einer 64-Bit-Mach-O-Datei (little endian)
export function findUuidOffset(buf) {
  if (buf.length < HEADER_64 || buf.readUInt32LE(0) !== MH_MAGIC_64) throw new Error('Keine 64-Bit-Mach-O-Datei');
  const count = buf.readUInt32LE(16);
  let at = HEADER_64;
  for (let i = 0; i < count; i++) {
    if (at + 8 > buf.length) break;
    const cmd = buf.readUInt32LE(at);
    const size = buf.readUInt32LE(at + 4);
    if (size < 8) break;
    if (cmd === LC_UUID && size >= 24) return at + 8;
    at += size;
  }
  throw new Error('Keine LC_UUID gefunden');
}

// Gleiche Eingabe = gleiche Kennung: Updates mit demselben Electron behalten die Freigabe
export function deriveUuid(bundleId, name, original) {
  const id = crypto.createHash('sha256').update(`${bundleId}\0${name}\0`).update(original).digest().subarray(0, 16);
  id[6] = (id[6] & 0x0f) | 0x50; // Version 5
  id[8] = (id[8] & 0x3f) | 0x80; // Variante RFC 4122
  return id;
}

export function patchExecutable(file, bundleId) {
  const buf = fs.readFileSync(file);
  const at = findUuidOffset(buf);
  const next = deriveUuid(bundleId, path.basename(file), buf.subarray(at, at + 16));
  next.copy(buf, at);
  fs.writeFileSync(file, buf);
}

export function appExecutables(app) {
  const out = [];
  const main = path.join(app, 'Contents', 'MacOS');
  for (const n of fs.readdirSync(main)) out.push(path.join(main, n));
  const fw = path.join(app, 'Contents', 'Frameworks');
  for (const h of fs.readdirSync(fw)) {
    if (!h.endsWith('.app')) continue;
    const dir = path.join(fw, h, 'Contents', 'MacOS');
    for (const n of fs.readdirSync(dir)) out.push(path.join(dir, n));
  }
  return out;
}

export function patchApp(app, bundleId = 'local.s3cure.sshclient') {
  const files = appExecutables(app);
  for (const f of files) patchExecutable(f, bundleId);
  return files.length;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const app = process.argv[2];
  if (!app || !app.endsWith('.app')) { console.error('Aufruf: node tools/mac-uuid.mjs <Pfad zur .app>'); process.exit(2); }
  console.log('Eigene Programm-Kennung:', patchApp(path.resolve(app)), 'Programme');
}
