const test = require('node:test');
const assert = require('node:assert');

// Kleine 64-Bit-Mach-O-Datei: Kopf, ein anderer Befehl, dann LC_UUID
function macho(uuid) {
  const b = Buffer.alloc(32 + 16 + 24);
  b.writeUInt32LE(0xfeedfacf, 0);
  b.writeUInt32LE(2, 16);
  b.writeUInt32LE(0x19, 32); b.writeUInt32LE(16, 36);
  b.writeUInt32LE(0x1b, 48); b.writeUInt32LE(24, 52);
  uuid.copy(b, 56);
  return b;
}

test('mac-uuid: findet die Kennung und lehnt andere Dateien ab', async () => {
  const { findUuidOffset } = await import('../../tools/mac-uuid.mjs');
  assert.equal(findUuidOffset(macho(Buffer.alloc(16, 7))), 56);
  assert.throws(() => findUuidOffset(Buffer.alloc(64)), /Mach-O/);
});

test('mac-uuid: eigene Kennung ist stabil und je Programm verschieden', async () => {
  const { deriveUuid } = await import('../../tools/mac-uuid.mjs');
  const original = Buffer.alloc(16, 9);
  const a = deriveUuid('local.s3cure.sshclient', 'S3cure SSH Client', original);
  assert.deepEqual(a, deriveUuid('local.s3cure.sshclient', 'S3cure SSH Client', original));
  assert.notDeepEqual(a, original);
  assert.notDeepEqual(a, deriveUuid('local.s3cure.sshclient', 'S3cure SSH Client Helper', original));
  assert.equal(a[6] >> 4, 5);
  assert.equal(a[8] >> 6, 2);
});
