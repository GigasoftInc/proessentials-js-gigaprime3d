// ProEssentialsJS -- Copyright 1994-2026 Gigasoft, Inc. All rights reserved.
// Commercial product, free for commercial use under USD 250,000 annual
// revenue. See PEJS-LICENSE.md -- https://www.gigasoft.com

export const DEVICE_STATE = ['NONE', 'PENDING', 'READY', 'FAILED'];

export function makeGpu(m) {
  return {
    request:  m.cwrap('pegpu_js_request', null, ['string']),
    state:    m.cwrap('pegpu_js_state', 'number', []),
    fail:     m.cwrap('pegpu_js_fail', 'string', []),
    setSize:  m.cwrap('pegpu_set_canvas_size', null, ['number', 'number']),

    // --- the 3D surface ---
    construct:        m.cwrap('pegpu_construct_surface', 'number', ['number']),
    constructCompute: m.cwrap('pegpu_construct_surface_compute', 'number', ['number']),
    setSource:        m.cwrap('pegpu_surface_set_source', null, ['number']),
    source:           m.cwrap('pegpu_surface_source', 'number', []),
    computeNote:      m.cwrap('pegpu_surface_compute_note', 'string', []),
    note:             m.cwrap('pegpu_surface_note', 'string', []),
    verts:            m.cwrap('pegpu_surface_vertices', 'number', []),
    realVerts:        m.cwrap('pegpu_surface_real_vertices', 'number', []),
    idxs:             m.cwrap('pegpu_surface_indices', 'number', []),
    sentinel:         m.cwrap('pegpu_surface_sentinel_ok', 'number', []),
    render:           m.cwrap('pegpu_render_surface', 'number', ['number', 'number']),

    // --- chrome ---
    axis:      m.cwrap('pegpu_construct_axis', 'number', ['number']),
    axisNote:  m.cwrap('pegpu_axis_note', 'string', []),
    axisProbe: m.cwrap('pegpu_axis_probe', 'string', []),
    text:      m.cwrap('pegpu_render_text', 'number', ['number']),
    legend:    m.cwrap('pegpu_render_legend', 'number', ['number']),
    legendNote: m.cwrap('pegpu_legend_note', 'string', []),

    textCount:      m.cwrap('pegpu_text_count', 'number', []),
    textRecords:    m.cwrap('pegpu_text_records', 'number', []),
    textArena:      m.cwrap('pegpu_text_arena', 'number', []),
    textArenaBytes: m.cwrap('pegpu_text_arena_bytes', 'number', []),
    textRecBytes:   m.cwrap('pegpu_text_rec_bytes', 'number', []),
    textProbe:      m.cwrap('pegpu_text_probe', 'string', []),

    // --- annotations: the X plane and its outline ---
    constructAnnot: m.cwrap('pegpu_construct_annot', 'number', ['number']),
    annotNote:      m.cwrap('pegpu_annot_note', 'string', []),
    annotVertices:  m.cwrap('pegpu_annot_vertices', 'number', []),
    annotDraws:     m.cwrap('pegpu_annot_draws', 'number', []),
    apAlloc:        m.cwrap('pegpu_annotpoly_alloc', 'number', ['number', 'number']),
    apBuild:        m.cwrap('pegpu_construct_annotpoly', 'number', ['number']),
    apNote:         m.cwrap('pegpu_annotpoly_note', 'string', []),
    apVertices:     m.cwrap('pegpu_annotpoly_vertices', 'number', []),

    light0:   m.cwrap('pegpu_set_light0', 'number',
                      ['number', 'number', 'number', 'number']),

    pan:        m.cwrap('pegpu_pan', 'number', ['number', 'number', 'number']),
    wheelSteps: m.cwrap('pegpu_wheel_steps', 'number', ['number']),
    wheelZoom:  m.cwrap('pegpu_wheel_zoom', 'number', ['number', 'number']),

    // --- cursor tracking (PeUserInterface.HotSpot.Data) ---
    pick:       m.cwrap('pegpu_pick', 'number', ['number', 'number', 'number']),
    pickSubset: m.cwrap('pegpu_pick_subset', 'number', []),
    pickPoint:  m.cwrap('pegpu_pick_point', 'number', []),
    pickNote:   m.cwrap('pegpu_pick_note', 'string', []),
    octreeNote: m.cwrap('pegpu_octree_note', 'string', []),

    // --- the 2D contour ---
    c2dCompute:   m.cwrap('pegpu_contour2d_compute', 'number', ['number']),
    c2dSetSource: m.cwrap('pegpu_contour2d_set_source', null, ['number']),
    c2dRender:    m.cwrap('pegpu_render_contour2d', 'number', ['number', 'number']),
    c2dVertices:  m.cwrap('pegpu_contour2d_vertices', 'number', []),
    c2dRealVerts: m.cwrap('pegpu_contour2d_real_vertices', 'number', []),
    c2dComputeNote: m.cwrap('pegpu_contour2d_compute_note', 'string', []),
    c2dDrawNote:  m.cwrap('pegpu_contour2d_draw_note', 'string', []),
    c2dDraws:     m.cwrap('pegpu_contour2d_draws', 'number', []),

    bgEnable:    m.cwrap('pegpu_bg_enable', 'number', ['number']),
    bgSimple:    m.cwrap('pegpu_bg_simple', 'number', ['number']),
    bgHardcoded: m.cwrap('pegpu_bg_hardcoded', 'number', ['number']),
    bgDraws:     m.cwrap('pegpu_bg_draws', 'number', []),
    bgRan:       m.cwrap('pegpu_bg_ran', 'number', []),
    bgNote:      m.cwrap('pegpu_bg_note', 'string', []),
    bgColors:    m.cwrap('pegpu_bg_colors', 'string', []),
    bgCreateFails: m.cwrap('pegpu_bg_create_fails', 'number', []),
    bgUnported:  m.cwrap('pegpu_bg_unported', 'number', []),
    clearColor:  m.cwrap('pegpu_surface_clear_color', 'number', []),

    errors:    m.cwrap('pegpu_error_count', 'number', []),
    lastError: m.cwrap('pegpu_last_error', 'string', []),
    pipes:     m.cwrap('pegpu_js_pipelines', 'number', []),
    draws:     m.cwrap('pegpu_js_draws', 'number', []),
    buffers:   m.cwrap('pegpu_js_buffers', 'number', []),
    unsupN:    m.cwrap('pegpu_js_unsup_count', 'number', []),
    unsup:     m.cwrap('pegpu_js_unsup', 'number', ['number']),
    unsupName: m.cwrap('pegpu_js_unsup_name', 'string', ['number']),
  };
}

// PENDING IS NOT FAILED. The device request is async and a couple of hundred
// milliseconds of PENDING must never be reported as "no WebGPU here".
export async function waitForDevice(gpu, selector, w, h, timeoutMs) {
  gpu.setSize(w, h);
  gpu.request(selector);
  const t0 = performance.now();
  while (gpu.state() === 1 && performance.now() - t0 < (timeoutMs || 8000))
    await new Promise((r) => setTimeout(r, 16));
  return {
    state: gpu.state(),
    name: DEVICE_STATE[gpu.state()] || String(gpu.state()),
    ms: Math.round(performance.now() - t0),
    fail: gpu.state() === 3 ? gpu.fail() : '',
  };
}

export function drawSurface(gpu, core, handle, w, h, st, report) {
  if (!st.skipInvalidate) core.reinitializeResetImage(handle);   // <- the invalidate

  try {
    st.axisBuilt = gpu.axis(handle);
  } catch (e) {
    st.axisBuilt = 0;
    if (!st.axisFailed) { st.axisFailed = 1; report('axis THREW: ' + errText(e)); }
  }

  try {
    st.annotBuilt = gpu.constructAnnot(handle);
  } catch (e) {
    st.annotBuilt = 0;
    if (!st.annotFailed) { st.annotFailed = 1; report('annot THREW: ' + errText(e)); }
  }

  try {
    gpu.text(handle);
    gpu.legend(handle);
  } catch (e) {
    if (!st.textFailed) { st.textFailed = 1; report('text/legend THREW: ' + errText(e)); }
  }

  gpu.render(w, h);

  if (st.overlay) {
    if (st.axisBuilt) st.overlay.paint(st.module, gpu);
    else st.overlay.clear();     // see the header: a pile at the centre is NOT
  }                              // a justification bug, it is a missing camera

  st.frames = (st.frames || 0) + 1;
  return st.axisBuilt;
}

function errText(e) { return (e && e.message) ? e.message : String(e); }
