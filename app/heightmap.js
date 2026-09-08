// ProEssentialsJS -- Copyright 1994-2026 Gigasoft, Inc. All rights reserved.
// Commercial product, free for commercial use under USD 250,000 annual
// revenue. See PEJS-LICENSE.md -- https://www.gigasoft.com

const HEADER_BYTES = 16;

// *** THE CACHE NAME CARRIES A VERSION AND THAT VERSION IS LOAD BEARING. ***
// The .bhm filenames are stable across deployments, so once a file is in here
// it is served forever without ever asking the server again. IF THE CONTENT OF
// ANY HEIGHT MAP EVER CHANGES, BUMP THIS TO -v2 OR NOBODY WILL SEE THE NEW
// DATA. Old versions are deleted on startup, so a bump costs nothing but the
// one re-download.
const CACHE_NAME = 'pe3d-heightmaps-v1';
const CACHE_PREFIX = 'pe3d-heightmaps-';

function resolutionOf(nMax) {
  return Math.fround(Math.fround(0.007) *
                     Math.fround(Math.fround(2000.0) / Math.fround(nMax)));
}

// Caching is a COURTESY. Every entry point below returns null rather than
// throwing: `caches` is absent in a non-secure context and throws outright in
// some private-browsing modes, and a demo must never fail to load because
// storing a copy failed.
async function openCache() {
  try {
    if (typeof caches === 'undefined' || !self.isSecureContext) return null;
    return await caches.open(CACHE_NAME);
  } catch (e) {
    return null;
  }
}

// A version bump would otherwise leave the previous copies holding quota for
// good. Called once at startup by main.js.
export async function pruneOldHeightMapCaches() {
  try {
    if (typeof caches === 'undefined') return;
    for (const key of await caches.keys()) {
      if (key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME) await caches.delete(key);
    }
  } catch (e) { /* nothing to do and nothing worth saying */ }
}

// Asks the browser to exempt this origin from eviction. Chrome decides silently
// from the user's own interaction history -- there is no prompt either way, so
// this is a request, not a guarantee, and nothing depends on the answer.
export async function requestPersistentStorage() {
  try {
    if (navigator.storage && navigator.storage.persist) await navigator.storage.persist();
  } catch (e) { /* ignore */ }
}

export class HeightMap {
  constructor() {
    this.IsValid = false;
    this.Path = '';
    this.WidthPx = 0;
    this.HeightPx = 0;
    this.MinZMm = 0;
    this.MaxZMm = 0;
    this.Resolution = 0;
    this.WidthMm = 0;
    this.HeightMm = 0;
    this.ImageData = null;     // Float32Array, exactly C#'s float[]
  }

  // `onProgress(received, total)` is optional. HeightMap.cs opens a FileStream
  // and the bytes are simply there; here the same load is a 3.4 to 8.4 MB
  // download over someone's connection, so the caller is given a way to say so.
  // `total` is 0 when the server sends no Content-Length.
  static async load(path, onProgress) {
    const hm = new HeightMap();
    hm.IsValid = true;
    hm.Path = path;

    const fExt = path.substring(path.length - 3, path.length);

    if (fExt === 'bhm') return hm._loadBhm(path, onProgress);
    if (fExt === 'png') return hm._loadPng(path);

    hm.IsValid = false;
    hm.Path = '';
    console.warn('HeightMap: unknown file type: ' + path);
    return hm;
  }

  async _loadBhm(path, onProgress) {
    let buf;
    try {
      // CACHE FIRST. The server already sends max-age=31536000 and that is the
      // strongest signal it can send, but Chrome's HTTP cache is one modest
      // pool shared by every site the user visits, with heuristics that
      // discriminate against large single entries -- so these files are
      // evicted and re-downloaded when the browser restarts. The Cache API is
      // a per-origin store measured against a share of total disk instead, so
      // a visitor who returns tomorrow pays nothing.
      const cache = await openCache();

      let res = null;
      if (cache) {
        try { res = await cache.match(path); } catch (e) { res = null; }
      }
      const servedFromCache = !!res;

      if (!res) {
        res = await fetch(path);
        if (!res.ok) throw new Error('HTTP ' + res.status);
      }

      const total = Number(res.headers.get('content-length') || 0);

      if (onProgress && res.body && res.body.getReader) {
        // Streamed so the caller can show what is happening. A cache hit
        // arrives in one chunk and reports done almost immediately, which is
        // why the spinner that consumes this waits before showing itself.
        const reader = res.body.getReader();
        const parts = [];
        let got = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          parts.push(value);
          got += value.length;
          onProgress(got, total);
        }
        const bytes = new Uint8Array(got);
        let at = 0;
        for (const part of parts) { bytes.set(part, at); at += part.length; }
        buf = bytes.buffer;
      } else {
        // No reader, or nobody watching: progress is a courtesy, the bytes are
        // the job.
        buf = await res.arrayBuffer();
        if (onProgress) onProgress(buf.byteLength, total || buf.byteLength);
      }

      // Stored AFTER the bytes are in hand, from the buffer rather than a
      // cloned stream: there is no clone-versus-reader interaction to reason
      // about, and a put that fails cannot cost data already in hand.
      if (cache && !servedFromCache) {
        try { await cache.put(path, new Response(buf)); } catch (e) { /* quota, etc */ }
      }
    } catch (e) {
      this.IsValid = false;
      this.Path = '';
      console.warn('HeightMap: unable to open demo file: ' + path + ' -- ' + e);
      return this;
    }

    if (buf.byteLength < HEADER_BYTES) {
      this.IsValid = false;
      this.Path = '';
      console.warn('HeightMap: short file: ' + path);
      return this;
    }

    const dv = new DataView(buf);
    this.WidthPx = dv.getInt32(0, true);
    this.HeightPx = dv.getInt32(4, true);
    this.MinZMm = dv.getFloat32(8, true);
    this.MaxZMm = dv.getFloat32(12, true);

    const nMax = this.WidthPx;
    if (this.HeightPx > nMax) this.HeightPx = nMax;

    this.Resolution = resolutionOf(nMax);
    this.WidthMm = this.Resolution * this.WidthPx;
    this.HeightMm = this.Resolution * this.HeightPx;

    const count = this.WidthPx * this.HeightPx;
    if (buf.byteLength < HEADER_BYTES + count * 4) {
      this.IsValid = false;
      this.Path = '';
      console.warn('HeightMap: truncated data in ' + path);
      return this;
    }

    // Little-endian on every platform that runs a browser, but a subarray of
    // the fetched buffer is only safe if the offset is 4-aligned. 16 is.
    this.ImageData = new Float32Array(buf, HEADER_BYTES, count);

    let minVal = Infinity, maxVal = -Infinity;
    for (let ix = 0; ix < count; ++ix) {
      const pel = this.ImageData[ix];
      if (pel < minVal) minVal = pel;
      if (pel > maxVal) maxVal = pel;
    }
    this.MinZMm = minVal;
    this.MaxZMm = maxVal;

    return this;
  }

  async _loadPng(path) {
    let bmp;
    try {
      // Cache first, exactly as _loadBhm does and for the same reason. These
      // four files are far smaller than the .bhm set -- 2.95 MB against 26.3 --
      // so the win is smaller, but a returning visitor should not re-fetch a
      // file that can never change either.
      const cache = await openCache();

      let res = null;
      if (cache) {
        try { res = await cache.match(path); } catch (e) { res = null; }
      }
      const servedFromCache = !!res;

      if (!res) {
        res = await fetch(path);
        if (!res.ok) throw new Error('HTTP ' + res.status);
      }

      // Read to a blob once, then store THAT, rather than caching a cloned
      // stream: the blob carries its own Content-Type, so a cached entry comes
      // back decodable, and createImageBitmap gets the same object either way.
      const blob = await res.blob();
      if (cache && !servedFromCache) {
        try { await cache.put(path, new Response(blob)); } catch (e) { /* quota, etc */ }
      }

      bmp = await createImageBitmap(blob, { colorSpaceConversion: 'none',
                                            premultiplyAlpha: 'none' });
    } catch (e) {
      this.IsValid = false;
      this.Path = '';
      console.warn('HeightMap: unable to open demo file: ' + path + ' -- ' + e);
      return this;
    }

    this.WidthPx = bmp.width;
    this.HeightPx = bmp.height;
    this.ImageData = new Float32Array(this.WidthPx * this.HeightPx);

    const cv = document.createElement('canvas');
    cv.width = this.WidthPx;
    cv.height = this.HeightPx;
    const ctx = cv.getContext('2d', { willReadFrequently: true,
                                      colorSpace: 'srgb' });
    ctx.drawImage(bmp, 0, 0);
    const px = ctx.getImageData(0, 0, this.WidthPx, this.HeightPx,
                                { colorSpace: 'srgb' }).data;
    bmp.close();

    let minVal = Infinity, maxVal = -Infinity;
    for (let i = 0; i < this.WidthPx; i++) {
      for (let j = 0; j < this.HeightPx; j++) {
        const o = (j * this.WidthPx + i) * 4;
        const argb = ((px[o + 3] << 24) | (px[o] << 16) |
                      (px[o + 1] << 8) | px[o + 2]) | 0;
        const ix = j * this.WidthPx + i;
        this.ImageData[ix] = argb;          // int -> float32, C# does the same
        const v = this.ImageData[ix];
        if (v < minVal) minVal = v;
        if (v > maxVal) maxVal = v;
      }
    }

    this.MinZMm = minVal;
    this.MaxZMm = maxVal;

    let nMax = this.WidthPx;
    if (this.HeightPx > nMax) nMax = this.HeightPx;

    this.Resolution = resolutionOf(nMax);
    this.WidthMm = this.Resolution * this.WidthPx;
    this.HeightMm = this.Resolution * this.HeightPx;

    this.IsValid = true;
    return this;
  }

  // --- the C# accessors, unchanged ---------------------------------------

  at(x, y) { return this.ImageData[y * this.WidthPx + x]; }   // C# this[x,y]

  GetPel(y, x) { return this.ImageData[y * this.WidthPx + x]; }

  GetColMm(col) { return Math.fround(col * this.Resolution); }

  GetRowMm(row) {
    const yBase = row * this.Resolution;
    return Math.fround(this.HeightMm - yBase);
  }

  get IsEmpty() { return this.WidthPx === 0 || this.HeightPx === 0; }
}
