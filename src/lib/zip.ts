// Pure client-side ZIP writer — "store" method (no compression), so it needs
// no deflate implementation or dependency. Every unzip tool reads a
// store-method archive fine; it's just larger than a compressed one, an
// acceptable tradeoff for the AI Builder's typical project sizes, in
// exchange for zero added dependencies.

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date: Date): { time: number; date: number } {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, date: day };
}

function u16(n: number): Uint8Array {
  return new Uint8Array([n & 0xff, (n >>> 8) & 0xff]);
}
function u32(n: number): Uint8Array {
  return new Uint8Array([n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]);
}
function concat(...arrs: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(arrs.reduce((s, a) => s + a.length, 0));
  let p = 0;
  for (const a of arrs) {
    out.set(a, p);
    p += a.length;
  }
  return out;
}

/** Builds a downloadable .zip Blob from a flat path -> text-content map (the
 *  AI Builder's/Scaffolder's file model). */
export function buildZip(files: Record<string, string>): Blob {
  const encoder = new TextEncoder();
  const { time, date } = dosDateTime(new Date());
  const chunks: Uint8Array[] = [];
  const central: { name: Uint8Array; data: Uint8Array; crc: number; offset: number }[] = [];
  let offset = 0;

  for (const [path, content] of Object.entries(files)) {
    const name = encoder.encode(path);
    const data = encoder.encode(content);
    const crc = crc32(data);
    const localHeader = concat(
      u32(0x04034b50),
      u16(20), // version needed to extract
      u16(0), // general purpose flag
      u16(0), // compression method: store
      u16(time),
      u16(date),
      u32(crc),
      u32(data.length), // compressed size == uncompressed (store)
      u32(data.length),
      u16(name.length),
      u16(0), // extra field length
    );
    chunks.push(localHeader, name, data);
    central.push({ name, data, crc, offset });
    offset += localHeader.length + name.length + data.length;
  }

  const centralStart = offset;
  for (const e of central) {
    const centralHeader = concat(
      u32(0x02014b50),
      u16(20), // version made by
      u16(20), // version needed
      u16(0), // flags
      u16(0), // method
      u16(time),
      u16(date),
      u32(e.crc),
      u32(e.data.length),
      u32(e.data.length),
      u16(e.name.length),
      u16(0), // extra
      u16(0), // comment
      u16(0), // disk number start
      u16(0), // internal attrs
      u32(0), // external attrs
      u32(e.offset),
    );
    chunks.push(centralHeader, e.name);
    offset += centralHeader.length + e.name.length;
  }
  const centralSize = offset - centralStart;

  chunks.push(
    concat(
      u32(0x06054b50),
      u16(0), // disk number
      u16(0), // disk with central dir start
      u16(central.length),
      u16(central.length),
      u32(centralSize),
      u32(centralStart),
      u16(0), // comment length
    ),
  );

  return new Blob(chunks as BlobPart[], { type: "application/zip" });
}

/** Triggers a browser download of `files` as `<name>.zip`. */
export function downloadZip(files: Record<string, string>, name: string): void {
  const blob = buildZip(files);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name || "cruz-app"}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}
