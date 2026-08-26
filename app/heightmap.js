// ProEssentialsJS -- Copyright 1994-2026 Gigasoft, Inc. All rights reserved.
// Commercial product, free for commercial use under USD 250,000 annual
// revenue. See PEJS-LICENSE.md -- https://www.gigasoft.com

const HEADER_BYTES = 16;

function resolutionOf(nMax) {
  return Math.fround(Math.fround(0.007) *
                     Math.fround(Math.fround(2000.0) / Math.fround(nMax)));
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

  static async load(path) {
    const hm = new HeightMap();
    hm.IsValid = true;
    hm.Path = path;

    const fExt = path.substring(path.length - 3, path.length);

    if (fExt === 'bhm') return hm._loadBhm(path);
    if (fExt === 'png') return hm._loadPng(path);

    hm.IsValid = false;
    hm.Path = '';
    console.warn('HeightMap: unknown file type: ' + path);
    return hm;
  }

  async _loadBhm(path) {
    let buf;
    try {
      const res = await fetch(path);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      buf = await res.arrayBuffer();
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
      const res = await fetch(path);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      bmp = await createImageBitmap(await res.blob(),
                                    { colorSpaceConversion: 'none',
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
