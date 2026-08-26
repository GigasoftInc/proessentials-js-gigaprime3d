// ProEssentialsJS -- Copyright 1994-2026 Gigasoft, Inc. All rights reserved.
// Commercial product, free for commercial use under USD 250,000 annual
// revenue. See PEJS-LICENSE.md -- https://www.gigasoft.com

// The Height Map combo's nine entries, in the C#'s order. The .bhm files were
// resampled to web size by tools\make-web-bhm.py, so the label carries the
// desktop's original dimensions alongside.
export const DATA_FILES = Object.freeze([
  { file: 'MaterialSurfaceScan1-1232x1028.bhm',
    label: 'MaterialSurfaceScan1  1232x1028  (2464x2056 on the desktop)' },
  { file: 'MaterialSurfaceScan2-1256x684.bhm',
    label: 'MaterialSurfaceScan2  1256x684  (5024x2736 on the desktop)' },
  { file: 'MaterialSurfaceScan3-1256x684.bhm',
    label: 'MaterialSurfaceScan3  1256x684  (5024x2736 on the desktop)' },
  { file: 'GrandCanyon-1345x1345.bhm',
    label: 'GrandCanyon  1345x1345  (4033x4033 on the desktop)' },
  { file: 'NoisyTerrain-1451x1451.bhm',
    label: 'NoisyTerrain  1451x1451  (4352x4352 on the desktop)' },
  { file: 'Grandcanyon-grayscale-rawpng-512x512.png',
    label: 'GrandCanyon grayscale PNG  512x512' },
  { file: 'Terrain-rgb-rawpng-1000x1000.png',
    label: 'Terrain RGB PNG  1000x1000' },
  { file: 'Cat-grayscale-rawpng-2047x1531.png',
    label: 'Cat grayscale PNG  2047x1531' },
  { file: 'Leaf-grayscale-rawpng-1096x2048.png',
    label: 'Leaf grayscale PNG  1096x2048' },
]);

// The shared arrays, allocated once and handed to both charts by address. The
// C# sizes them for a 6000x6000 map; these are sized to the largest file this
// app actually ships, which is all a wasm heap needs to carry.
export const MAX_EDGE = 2048;          // largest WidthPx or HeightPx
export const MAX_CELLS = 3200000;      // largest WidthPx * HeightPx, 12.8 MB as float32
