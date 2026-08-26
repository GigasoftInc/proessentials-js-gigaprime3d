// ProEssentialsJS -- Copyright 1994-2026 Gigasoft, Inc. All rights reserved.
// Commercial product, free for commercial use under USD 250,000 annual
// revenue. See PEJS-LICENSE.md -- https://www.gigasoft.com

// main.js -- the browser port of ProEssentials11\GigaPrime3DwinUI.
// Function names match MainWindow.xaml.cs so the two read side by side.
// The 3D chart draws through the control's WebGPU layer; the two 2D charts
// replay the engine's record stream. HeightMap loads with fetch, so every
// entry point that loads one is async where the C# is synchronous.

import { Enums as E3, attachApi as attach3d } from '../lib/pe-api-3d.js';
import { Enums as ES, attachApi as attachSg } from '../lib/pe-api-sgraph.js';
import { makeCore } from '../lib/pe-core.js';
import { HeightMap } from './heightmap.js';
import { MyColors } from './colors.js';
import { makeGpu } from './gpu3d.js';
import { DATA_FILES, MAX_CELLS, MAX_EDGE } from './datafiles.js';

const PETM_NONE = 0;

const DX_ZOOM_MIN = -60;

const $ = (id) => document.getElementById(id);


const boot = (msg) => { $('bootmsg').innerHTML = msg; };

const PHONE_MQ = '(max-width: 760px), (max-height: 480px)';
const isPhone = () => window.matchMedia(PHONE_MQ).matches;

let CurrentHeightMap = null;
let HeightMapA = null;

let _bShowingPlane = false;
let _nDataStep = 2;        // Reduce Data default -- the user may have no GPU
let _nAppliedStep = 2;     // under 1000x1000 the data is not reduced
let _rows = 0, _cols = 0;
let _bZoomed = false;

let _maxx = 0, _miny = 0, _maxy = 0, _minz = 0, _maxz = 0;
let _VertLightDegree = 0, _HorzLightDegree = 0;
let _updatingUi = false;

const CursorTrackingMenu3d = 0;
const UndoZoomMenu3d = 1;

let sMyXData = null, sMyZData = null, sMyYData = null;

let m = null, core = null, gpu = null;

let ctl3d = null, ctlContour = null, ctlLine = null;
// The three chart objects, declared here and attached in Chart_Loaded.
// `let x = null` widens to `any` and the later assignment does not narrow it
// back, so without these annotations an editor offers nothing on a chart
// object however complete the typings beside it are. The facades are the same
// two this file imports; PeChart is what each one exports.
/** @type {import('../lib/pe-api-3d.js').PeChart} */
let Chart3DSurface = null;
let h3d = 0;
/** @type {import('../lib/pe-api-sgraph.js').PeChart} */
let Chart2DContour = null;
let hContour = 0;
/** @type {import('../lib/pe-api-sgraph.js').PeChart} */
let Chart2DLine = null;
let hLine = 0;


let W3 = 900, H3 = 600;            // 3D chart, device pixels
// The XAML's 360x360, reduced 15% because it crowded the light-rotation
// sliders. 360 * 0.85 = 306.
const CW = 306, CH = 306;
let LW = 200, LH = 400;            // cross-section


// Initialize3D -- MainWindow.xaml.cs:125
function Initialize3D() {
  const C = Chart3DSurface;

  // always start a 3D new initialization with a call to Reset
  core.reset(h3d);

  C.PeSpecial.AutoImageReset = false;   // important for final optimization

  C.PeString.MainTitle = '';
  C.PeString.SubTitle = '';
  C.PeString.MultiSubTitles[0] = '';
  C.PeString.XAxisLabel = '';    // was 'X'
  C.PeString.YAxisLabel = '';    // was 'Z'  (engine Y = depth)
  C.PeString.ZAxisLabel = '';    // was 'Y'  (engine Z = height)

  C.PeUserInterface.Dialog.ModelessAutoClose = true;
  C.PeUserInterface.Dialog.PlotCustomization = true;

  C.PePlot.PolyMode = E3.PolyMode.SurfacePolygons;
  C.PePlot.Method = E3.ThreeDGraphPlottingMethod.Four;   // Surface
  C.PeColor.DxTransparencyMode = PETM_NONE;   // OIT costs; see the const above

  // Pixel shader culling -- zooming the 2D contour zooms the 3D chart to match
  C.PeGrid.Configure.DxPsManualCullXZ = true;
  C.PePlot.Option.DxFitControlShape = false;  // aspect is set explicitly, not fitted
  C.PePlot.Option.DxViewportX = 0;
  C.PePlot.Option.DxViewportY = 2.5;
  C.PePlot.Option.DxFOV = 1;

  C.PePlot.Option.DxZoom = DX_ZOOM_MIN;   // C# is -24.0; see the block above

  if (isPhone()) {
    C.PePlot.Option.DxViewportX = 0.3;
    C.PePlot.Option.DxZoom = -28.0;
  }
  C.PeUserInterface.Scrollbar.ViewingHeight = 28;
  C.PeUserInterface.Scrollbar.DegreeOfRotation = 145;

  C.PePlot.Option.DegreePrompting = false;
  C.PePlot.LinesOrTubes = E3.LinesOrTubes.AllLines;
  C.PePlot.SubsetLineTypes[0] = E3.LineType.MediumThinSolid;

  C.PePlot.Allow.WireFrame = false;
  C.PePlot.Option.SurfacePolygonBorders = true;
  C.PePlot.Option.ShowContour = E3.ShowContour.None;

  C.PeFont.SizeGlobalCntl = 1.1;
  C.PeFont.Fixed = true;
  C.PeFont.FontSize = E3.FontSize.Medium;   // C# is Large; see above

  C.PeAnnotation.Show = true;

  // padding, because pixel-shader culling can clip data at the very edge
  C.PeGrid.Configure.AutoPadBeyondZeroX = true;
  C.PeGrid.Configure.AutoPadBeyondZeroY = true;
  C.PeGrid.Configure.AutoPadBeyondZeroZ = true;
  C.PeGrid.Configure.AutoMinMaxPaddingX = 1;
  C.PeGrid.Configure.AutoMinMaxPaddingY = 1;
  C.PeGrid.Configure.AutoMinMaxPaddingZ = 1;

  C.PeGrid.Configure.ManualScaleControlX = E3.ManualScaleControl.None;
  C.PeGrid.Configure.ManualScaleControlY = E3.ManualScaleControl.None;
  C.PeGrid.Configure.ManualScaleControlZ = E3.ManualScaleControl.None;
  C.PeGrid.Option.ShowXAxis = E3.ShowAxis.All;
  C.PeGrid.Option.ShowYAxis = E3.ShowAxis.All;
  C.PeGrid.Option.ShowZAxis = E3.ShowAxis.All;

  C.PeUserInterface.RotationDetail = E3.RotationDetail.WireFrame;
  C.PeUserInterface.Allow.FocalRect = false;
  C.PeUserInterface.Menu.LegendLocation = E3.MenuControl.Hide;

  C.PeUserInterface.Scrollbar.ScrollSmoothness = 0;
  C.PeUserInterface.Scrollbar.MouseWheelZoomSmoothness = 2;
  C.PeUserInterface.Scrollbar.MouseWheelZoomFactor = 25.0;
  C.PeUserInterface.Scrollbar.PinchZoomSmoothness = 2;
  C.PeUserInterface.Scrollbar.PinchZoomFactor = 20.0;

  C.PePlot.Option.DxViewportPanFactor = 10.0;   // SHIFT + drag translate
  C.PePlot.Option.DxZoomMin = DX_ZOOM_MIN;   // C# is -40; pull back further
  C.PePlot.Option.DxZoomMax = -3;    // unchanged, matches the C#

  C.PeUserInterface.Scrollbar.HorzScrollBar = false;
  C.PeUserInterface.Scrollbar.VertScrollBar = false;
  C.PeUserInterface.Scrollbar.MouseDraggingX = true;
  C.PeUserInterface.Scrollbar.MouseDraggingY = true;
  C.PeUserInterface.Scrollbar.MouseWheelFunction =
      E3.MouseWheelFunction.HorizontalVerticalZoom;
  C.PeUserInterface.Scrollbar.MouseWheelZoomEvents = true;

  C.PeData.DuplicateDataX = E3.DuplicateData.PointIncrement;
  C.PeData.DuplicateDataZ = E3.DuplicateData.SubsetIncrement;

  C.PeColor.SubsetColors.clear();
  C.PeColor.SubsetShades.clear();
  for (let colx = 0; colx < 256; ++colx) {
    const index = (colx / 256.0 * (MyColors.length - 1)) & 0xFF;
    C.PeColor.SubsetColors[colx] = MyColors[index];
    C.PeColor.SubsetShades[colx] = monoShade(colx);
  }
  C.PeColor.SubsetColors[E3.SurfaceColors.SolidSurface] = pergb(255, 170, 170, 255);

  C.PeColor.BitmapGradientMode = false;
  C.PeColor.QuickStyle = E3.QuickStyle.DarkNoBorder;   // after BitmapGradientMode
  C.PeConfigure.BorderTypes = E3.TABorder.NoBorder;
  C.PeColor.GraphBmpStyle = E3.BitmapStyle.NoBmp;
  C.PeColor.GraphBackground = pergb(255, 0x00, 0x2B, 0x35);
  C.PeColor.Desk = pergb(255, 0x00, 0x2B, 0x35);
  C.PeColor.GraphForeground = WHITE;
  C.PeColor.ZAxis = WHITE;
  C.PeColor.YAxis = WHITE;
  C.PeColor.XAxis = WHITE;
  C.PeColor.Text = WHITE;

  C.PeLegend.ContourStyle = true;
  C.PeLegend.Show = false;              // the Legend checkbox drives this
  C.PeLegend.Location = E3.LegendLocation.Right;

  C.PeData.NullDataValue = -9999;
  C.PeData.NullDataValueX = -9999;
  C.PeData.NullDataValueZ = -9999;

  C.PeUserInterface.Cursor.PromptLocation = E3.CursorPromptLocation.ToolTip;
  C.PeLegend.ContourLegendPrecision = E3.ContourLegendPrecision.TwoDecimals;
  C.PeFont.SizeGlobalCntl = 1.1;   // C# is 1.35 here (:251); see above

  C.PeUserInterface.Allow.Customization = false;
  C.PeUserInterface.Allow.Maximization = false;
  C.PeUserInterface.Menu.Contour = E3.MenuControl.Hide;
  C.PeUserInterface.Menu.BorderType = E3.MenuControl.Hide;
  C.PeUserInterface.Menu.BitmapGradient = E3.MenuControl.Hide;
  C.PeUserInterface.Menu.ShowLegend = E3.MenuControl.Hide;
  C.PeUserInterface.Menu.CustomizeDialog = E3.MenuControl.Hide;
  C.PeUserInterface.Menu.DataShadow = E3.MenuControl.Hide;
  C.PeUserInterface.Menu.QuickStyle = E3.MenuControl.Hide;
  C.PeUserInterface.Menu.DataPrecision = E3.MenuControl.Hide;
  C.PeUserInterface.Menu.Rotation = E3.MenuControl.Hide;
  C.PeUserInterface.Menu.LegendLocation = E3.MenuControl.Hide;
  C.PeUserInterface.Menu.ShowWireFrame = E3.MenuControl.Hide;

  C.PeUserInterface.Dialog.AllowEmfExport = false;
  C.PeUserInterface.Dialog.AllowSvgExport = false;
  C.PeUserInterface.Dialog.AllowWmfExport = false;
  C.PeUserInterface.Allow.TextExport = false;
  C.PeUserInterface.Dialog.HideExportImageDpi = true;
  C.PeUserInterface.Dialog.HidePrintDpi = true;
  C.PeUserInterface.Allow.FocalRect = false;

  C.PeUserInterface.Menu.CustomMenuText[CursorTrackingMenu3d] = 'Cursor Tracking';
  C.PeUserInterface.Menu.CustomMenuState[CursorTrackingMenu3d][0] =
      E3.CustomMenuState.UnChecked;
  C.PeUserInterface.Menu.CustomMenuLocation[CursorTrackingMenu3d] =
      E3.CustomMenuLocation.Bottom;

  C.PeUserInterface.Menu.CustomMenuText[UndoZoomMenu3d] = 'Undo Zoom';
  C.PeUserInterface.Menu.CustomMenuLocation[UndoZoomMenu3d] =
      E3.CustomMenuLocation.Bottom;
  C.PeUserInterface.Menu.CustomMenu[UndoZoomMenu3d][0] = E3.CustomMenu.Grayed;

  C.PeConfigure.RenderEngine = E3.RenderEngine.Direct3D;

  C.PeConfigure.PrepareImages = true;
  C.PeConfigure.CacheBmp = true;
  C.PeConfigure.AntiAliasGraphics = false;
  C.PeConfigure.AntiAliasText = false;

  core.setViewingAt(h3d, 0, 0, 0);   // default, not really needed here

  C.PeFunction.Force3dxNewColors = true;
  C.PeFunction.Force3dxAnnotVerticeRebuild = true;
  forceMeshRebuild(C);
}

// Initialize2DContour -- MainWindow.xaml.cs:318. Left side 2D contour.
function Initialize2DContour() {
  const C = Chart2DContour;

  C.PeConfigure.RenderEngine = ES.RenderEngine.Direct3D;
  C.PeConfigure.Composite2D3D = ES.Composite2D3D.Foreground;

  C.PeUserInterface.Allow.Zooming = ES.AllowZooming.HorzAndVert;
  C.PeUserInterface.Allow.ZoomStyle = ES.ZoomStyle.Ro2Not;

  C.PePlot.Allow.ContourColors = true;
  C.PePlot.Allow.ContourColorsShadows = true;
  C.PePlot.Allow.ContourLines = false;

  C.PeConfigure.PrepareImages = true;
  C.PeConfigure.CacheBmp = true;
  C.PeConfigure.AntiAliasGraphics = true;
  C.PePlot.SubsetLineTypes[0] = ES.LineType.MediumSolid;

  C.PeUserInterface.Allow.FocalRect = false;
  C.PeColor.Desk = pergb(255, 0x00, 0x2B, 0x35);
  C.PeColor.Text = pergb(255, 255, 255, 255);
  C.PeColor.GraphBackground = pergb(255, 0x00, 0x2B, 0x35);
  C.PeConfigure.BorderTypes = ES.TABorder.NoBorder;

  C.PeString.MainTitle = '';
  C.PeString.SubTitle = '';
  C.PeString.YAxisLabel = '';
  C.PeString.XAxisLabel = '';

  C.PeGrid.Configure.AutoMinMaxPadding = 0;

  C.PeFont.SizeGlobalCntl = 1.70;           // was 1.55 -- one step up, 12 -> 13px
  C.PeFont.FontSize = ES.FontSize.Medium;   // already the default; pinned

  C.PeLegend.ContourLegendPrecision = ES.ContourLegendPrecision.TwoDecimals;
  C.PeLegend.ContourStyle = true;
  C.PeLegend.Location = ES.LegendLocation.Left;
  C.PeLegend.Show = false;

  C.PeColor.SubsetColors.clear();
  C.PeColor.SubsetShades.clear();
  for (let colx = 0; colx < 256; ++colx) {
    const index = (colx / 256.0 * (MyColors.length - 1)) & 0xFF;
    C.PeColor.SubsetColors[colx] = MyColors[index];
    C.PeColor.SubsetShades[colx] = monoShade(colx);
  }

  C.PeConfigure.ImageAdjustLeft = -100;    // shrink-tweak the borders
  C.PeConfigure.ImageAdjustRight = -100;
  C.PeConfigure.ImageAdjustTop = 50;
  C.PeConfigure.ImageAdjustBottom = 0;

  C.PeUserInterface.Scrollbar.ScrollingHorzZoom = true;
  C.PeUserInterface.Scrollbar.ScrollingVertZoom = true;

  C.PeUserInterface.Allow.Customization = false;
  C.PeUserInterface.Allow.Maximization = false;
  C.PeUserInterface.Menu.BorderType = ES.MenuControl.Hide;
  C.PeUserInterface.Menu.BitmapGradient = ES.MenuControl.Hide;
  C.PeUserInterface.Menu.ShowLegend = ES.MenuControl.Hide;
  C.PeUserInterface.Menu.PlotMethod = ES.MenuControl.Hide;
  C.PeUserInterface.Menu.CustomizeDialog = ES.MenuControl.Hide;
  C.PeUserInterface.Menu.DataShadow = ES.MenuControl.Hide;
  C.PeUserInterface.Menu.QuickStyle = ES.MenuControl.Hide;
  C.PeUserInterface.Menu.DataPrecision = ES.MenuControl.Hide;
  C.PeUserInterface.Menu.LegendLocation = ES.MenuControl.Hide;
  C.PeUserInterface.Menu.MarkDataPoints = ES.MenuControl.Hide;
  C.PeUserInterface.Menu.ViewingStyle = ES.MenuControl.Hide;
  C.PeUserInterface.Menu.GridLine = ES.MenuControl.Hide;

  C.PeUserInterface.Dialog.AllowEmfExport = false;
  C.PeUserInterface.Dialog.AllowSvgExport = false;
  C.PeUserInterface.Dialog.AllowWmfExport = false;
  C.PeUserInterface.Allow.TextExport = false;
  C.PeUserInterface.Dialog.HideExportImageDpi = true;
  C.PeUserInterface.Dialog.HidePrintDpi = true;
}

// Initialize2D -- MainWindow.xaml.cs:402. Right side 2D cross-section.
function Initialize2D() {
  const C = Chart2DLine;

  C.PeConfigure.RenderEngine = ES.RenderEngine.Direct2D;

  C.PeString.MainTitle = '';
  C.PeString.SubTitle = '';
  C.PeString.XAxisLabel = 'Z';
  C.PeString.YAxisLabel = 'Y';
  C.PeGrid.Option.XAxisVertNumbering = true;

  C.PeFont.SizeGlobalCntl = 0.90;
  C.PeFont.FontSize = ES.FontSize.Medium;   // was Small; back to the C# default

  C.PeConfigure.PrepareImages = true;
  C.PeConfigure.CacheBmp = true;
  C.PeConfigure.AntiAliasGraphics = true;
  C.PePlot.SubsetLineTypes[0] = ES.LineType.MediumSolid;

  C.PeUserInterface.Allow.FocalRect = false;

  C.PeColor.Desk = pergb(255, 0x00, 0x2B, 0x35);
  C.PeColor.Text = pergb(255, 255, 255, 255);
  C.PeColor.GraphBackground = pergb(255, 0x00, 0x2B, 0x35);
  C.PeColor.GraphForeground = WHITE;

  C.PeConfigure.BorderTypes = ES.TABorder.NoBorder;
  C.PeGrid.GridBands = false;

  C.PeUserInterface.Allow.Customization = false;
  C.PeUserInterface.Allow.Maximization = false;
  C.PeUserInterface.Menu.BorderType = ES.MenuControl.Hide;
  C.PeUserInterface.Menu.BitmapGradient = ES.MenuControl.Hide;
  C.PeUserInterface.Menu.ShowLegend = ES.MenuControl.Hide;
  C.PeUserInterface.Menu.PlotMethod = ES.MenuControl.Hide;
  C.PeUserInterface.Menu.CustomizeDialog = ES.MenuControl.Hide;
  C.PeUserInterface.Menu.DataShadow = ES.MenuControl.Hide;
  C.PeUserInterface.Menu.QuickStyle = ES.MenuControl.Hide;
  C.PeUserInterface.Menu.DataPrecision = ES.MenuControl.Hide;
  C.PeUserInterface.Menu.LegendLocation = ES.MenuControl.Hide;
  C.PeUserInterface.Menu.MarkDataPoints = ES.MenuControl.Hide;
  C.PeUserInterface.Menu.ViewingStyle = ES.MenuControl.Hide;

  C.PeUserInterface.Dialog.AllowEmfExport = false;
  C.PeUserInterface.Dialog.AllowSvgExport = false;
  C.PeUserInterface.Dialog.AllowWmfExport = false;
  C.PeUserInterface.Allow.TextExport = false;
  C.PeUserInterface.Dialog.HideExportImageDpi = true;
  C.PeUserInterface.Dialog.HidePrintDpi = true;
}

// RefreshUi -- MainWindow.xaml.cs:544. New data, keeping zoom and rotation.
function RefreshUi(hm) {
  CurrentHeightMap = hm;

  _nAppliedStep = 1;
  if (hm.HeightPx > 1001 || hm.WidthPx > 1001) _nAppliedStep = _nDataStep;

  _rows = (hm.HeightPx / _nAppliedStep) | 0;
  _cols = (hm.WidthPx / _nAppliedStep) | 0;

  const size = _rows * _cols;
  const fResolution = hm.Resolution;

  const xv = sMyXData.array, zv = sMyZData.array, yv = sMyYData.array;

  let idx = 0;
  for (let row = 0; row < hm.HeightPx - (_nAppliedStep - 1); row += _nAppliedStep)
    zv[idx++] = row * fResolution;

  idx = 0;
  for (let col = 0; col < hm.WidthPx - (_nAppliedStep - 1); col += _nAppliedStep)
    xv[idx++] = col * fResolution;

  // Important when changing data WITHOUT a Reset first: the internal scaling
  // factors have to be cleared or the Y axis scale comes out wrong.
  Chart3DSurface.PeData.ScaleForYData = 0;

  if (_nAppliedStep > 1) {
    idx = 0;
    for (let row = 0; row < hm.HeightPx - (_nAppliedStep - 1); row += _nAppliedStep)
      for (let col = 0; col < hm.WidthPx - (_nAppliedStep - 1); col += _nAppliedStep)
        yv[idx++] = hm.GetPel(row, col);
  } else {
    yv.set(hm.ImageData.subarray(0, size));
  }

  _maxx = hm.WidthMm;
  _miny = hm.MinZMm;
  _maxy = hm.MaxZMm;
  _minz = 0.0;
  _maxz = hm.HeightMm;

  Chart3DSurface.PeData.Subsets = _rows;
  Chart3DSurface.PeData.Points = _cols;

  // XData and ZData hold ONE row / ONE column each; the engine increments.
  Chart3DSurface.PeData.DuplicateDataX = E3.DuplicateData.PointIncrement;
  Chart3DSurface.PeData.DuplicateDataZ = E3.DuplicateData.SubsetIncrement;

  Chart3DSurface.PeData.ComputeShader = true;

  Chart3DSurface.PeData.X.useDataAtLocation(sMyXData, _cols);
  Chart3DSurface.PeData.Y.useDataAtLocation(sMyYData, size);
  Chart3DSurface.PeData.Z.useDataAtLocation(sMyZData, _rows);

  const width = hm.WidthMm;
  const height = hm.HeightMm;
  const diag = Math.sqrt(width * width + height * height);

  Chart3DSurface.PeGrid.Option.GridAspectX = width;
  Chart3DSurface.PeGrid.Option.GridAspectZ = height;
  Chart3DSurface.PeGrid.Option.GridAspectY = diag * 0.1;   // Z axis expansion

  Chart3DSurface.PeString.MainTitle = hm.Path.split('/').pop();

  Chart3DSurface.PeFunction.SetLight(0, -2.0, -7.0, -7.0);   // reset the light location

  _updatingUi = true;
  $('SliderHorizontalRotation').value =
      Chart3DSurface.PeUserInterface.Scrollbar.SBPos;
  $('SliderVerticalRotation').value =
      Chart3DSurface.PeUserInterface.Scrollbar.ViewingHeight;
  $('SliderZExaggeration').value = 10;
  _updatingUi = false;

  forceMeshRebuild();
  resetImage3D();
  resetImage3D();

  Initialize2DContour();

  Chart2DContour.PeConfigure.RenderEngine = ES.RenderEngine.Direct3D;
  Chart2DContour.PeData.Subsets = _rows;
  Chart2DContour.PeData.Points = _cols;

  // Same v11 feature on the 2D side. 2D contours are work intensive.
  Chart2DContour.PeData.ComputeShader = true;

  Chart2DContour.PeData.DuplicateDataX = ES.DuplicateData.PointIncrement;
  Chart2DContour.PeData.DuplicateDataY = ES.DuplicateData.SubsetIncrement;

  Chart2DContour.PeData.X.useDataAtLocation(sMyXData, _cols);
  Chart2DContour.PeData.Z.useDataAtLocation(sMyYData, size);
  Chart2DContour.PeData.Y.useDataAtLocation(sMyZData, _rows);

  Chart2DContour.PeGrid.Option.GridAspect = _rows / _cols;
  Chart2DContour.PePlot.Method = ES.SGraphPlottingMethod.ContourColors;

  Chart2DContour.PeConfigure.Composite2D3D = ES.Composite2D3D.Foreground;
  Chart2DContour.PeConfigure.RenderEngine = ES.RenderEngine.Direct3D;
  Chart2DContour.PeFunction.Force3dxNewColors = true;
  Chart2DContour.PeFunction.Force3dxVerticeRebuild = true;

  drawContour();
}

let bgEnabled = false;
let lastSurfaceVerts = 0;

function forceMeshRebuild(chart) {
  const c = chart || Chart3DSurface;
  c.PeFunction.Force3dxVerticeRebuild = true;
  const ctl = (c === Chart2DContour) ? ctlContour : ctl3d;
  if (ctl && ctl.dataChanged) ctl.dataChanged();
}

const DESK_CSS = '#002B35';

function draw3D() {
  if (ctl3d) ctl3d.redraw();
}

// PeFunction.ReinitializeResetImage() followed by Invalidate() -- the pair the
// C# uses wherever the DATA or the layout changed, not just the camera.
function resetImage3D() {
  if (ctl3d) ctl3d.render();
}

function drawContour() { if (ctlContour) ctlContour.render(); }

function pergb(a, r, g, b) {
  return ((r | (g << 8) | (b << 16) | (a << 24)) >>> 0);
}
const WHITE = pergb(255, 255, 255, 255);

// The greyscale ramp behind Viewing Style / Mono and the print dialog's mono
// option. One definition for both charts: the surface and the contour set the
// same 256 shades, and two copies of a ramp are two ramps that can disagree.
//
// Neither end reaches an extreme, deliberately. Pure white is invisible on
// paper when the print dialog switches to mono, and pure black is invisible
// against the dark desk on screen; one ramp has to survive both.
const MONO_LO = 40;
const MONO_HI = 215;

function monoShade(colx) {
  const g = Math.round(MONO_LO + (MONO_HI - MONO_LO) * colx / 255);
  return pergb(255, g, g, g);
}

function floatToString(x) {
  if (!isFinite(x)) return String(x);
  const f = Math.fround(x);
  for (let p = 1; p <= 9; ++p) {
    const s = f.toPrecision(p);
    if (Math.fround(parseFloat(s)) === f) return String(parseFloat(s));
  }
  return String(f);
}

export {
  Initialize3D, Initialize2DContour, Initialize2D, RefreshUi,
  draw3D, drawContour, pergb,
};

(async function main() {
  try {
    if (!navigator.gpu) {
      boot('<b>This browser reports no <code>navigator.gpu</code>.</b><br><br>' +
           'GigaPrime3D is a GPU demonstration: the surface mesh, the axis box, ' +
           'the legend and the 2D contour are all built and drawn on the GPU. ' +
           'There is no Canvas2D fallback for a lit 3D surface, so rather than ' +
           'draw something that is not what the product does, it stops here.<br><br>' +
           'Chrome 113+ or Edge 113+ on a machine with a working GPU.');
      return;
    }

    boot('loading the ProEssentials module...');
    m = await ProEssentials();

    if (!window.PeControl) { boot('pe-control.js did not load'); return; }
    if (!(PeControl.FEATURES && PeControl.FEATURES.gpuLayer)) {
      boot('<b>Cached copy of pe-control.js is out of date.</b><br><br>' +
           'The browser is holding an older one than this build needs. ' +
           'Hard-reload the page with Ctrl+Shift+R. Without it every chart ' +
           'comes up with its furniture drawn and no data.');
      return;
    }
    if (!window.PeMenu) console.warn('WARNING: pe-menu.js missing -- no right-click menu');
    if (!window.PeScrollbars) console.warn('WARNING: pe-scrollbars.js missing -- no scrollbars');

    await PeControl.loadNotifyNames('./lib/pewn-names.json');

    const box = $('PeContainer').getBoundingClientRect();
    W3 = Math.max(320, Math.round(box.width));
    H3 = Math.max(240, Math.round(box.height));

    core = makeCore(m, W3, H3);
    const f_createmeta = m.cwrap('pe_createmeta', 'number', ['number', 'number', 'number']);
    const f_metadata = m.cwrap('pe_metadata', 'number', ['number']);
    core.metaBytesFor = (hh, w, hgt) => {
      const n = f_createmeta(hh, w || CW, hgt || CH);
      if (n <= 0) return new Uint8Array(0);
      const ptr = f_metadata(hh);
      return m.HEAPU8.slice(ptr, ptr + n);
    };

    gpu = makeGpu(m);

    ctl3d = new PeControl($('PeContainer'), {
      module: m, kind: 'sgraph3d', polyMode: 0,   // polyMode 0 -- see Initialize3D
      width: W3, height: H3, autoResize: true,
    });
    h3d = ctl3d.handle;
    if (!h3d) { boot('pe_create_sgraph3d returned 0'); return; }
    Chart3DSurface = ctl3d.attach(attach3d, core);

    ctlContour = new PeControl($('Chart2DContourBox'), {
      module: m, kind: 'sgraph', width: CW, height: CH,
    });
    hContour = ctlContour.handle;
    Chart2DContour = ctlContour.attach(attachSg, core);

    const lineBox = $('Chart2DLineBox').getBoundingClientRect();
    LW = Math.max(160, Math.round(lineBox.width) || 200);
    LH = Math.max(200, Math.round(lineBox.height) || 400);
    ctlLine = new PeControl($('Chart2DLineBox'), {
      module: m, kind: 'sgraph', width: LW, height: LH, autoResize: true,
    });
    hLine = ctlLine.handle;
    Chart2DLine = ctlLine.attach(attachSg, core);

    for (const c of [ctl3d, ctlContour, ctlLine]) c.canvas.tabIndex = -1;

    gpu.h = h3d;

    // --- Main_Loaded ---------------------------------------------------------
    _nDataStep = _nAppliedStep;
    _updatingUi = true;

    $('RootGrid').classList.add('no-xsection');

    if (isPhone()) {
      const ui = $('UIColContainer'), cs = $('ChartSliders');
      if (ui && cs) ui.insertBefore(cs, ui.firstChild);
    }

    for (const f of DATA_FILES) {
      const o = document.createElement('option');
      o.value = f.file;
      o.textContent = f.label;
      $('HeightMaps').appendChild(o);
    }
    for (const s of ['None', '2X', '3X', '4X']) {
      const o = document.createElement('option');
      o.textContent = s;
      $('ReduceDataAmount').appendChild(o);
    }
    const phoneStart = isPhone();
    $('ReduceDataAmount').selectedIndex = phoneStart ? 3 : 1;
    if (phoneStart) _nDataStep = 4;
    _updatingUi = false;

    // --- Chart_Loaded --------------------------------------------------------
    Initialize3D();
    Initialize2DContour();
    Initialize2D();

    sMyXData = Chart3DSurface.PeData.X.allocate(MAX_EDGE);
    sMyZData = Chart3DSurface.PeData.Z.allocate(MAX_EDGE);
    sMyYData = Chart3DSurface.PeData.Y.allocate(MAX_CELLS);

    boot('loading ' + DATA_FILES[0].label + ' ...');
    await HeightMaps_SelectionChanged();

    // Chart_Loaded's tail: read the sliders back OFF THE CHART, not off the
    // page's own state. If a property did not take, this is where it shows.
    $('SliderHorizontalRotation').value =
        Chart3DSurface.PeUserInterface.Scrollbar.DegreeOfRotation;
    $('SliderVerticalRotation').value =
        Chart3DSurface.PeUserInterface.Scrollbar.ViewingHeight;
    $('SliderZoom').value = Chart3DSurface.PePlot.Option.DxZoom;

    _updatingUi = true;
    $('SliderVerticalLightRotation').value = 300;
    $('SliderHorizontalLightRotation').value = 180;
    $('SliderHorizontalMove').value = Chart3DSurface.PePlot.Option.DxViewportX;
    $('SliderVerticalMove').value = Chart3DSurface.PePlot.Option.DxViewportY;
    _updatingUi = false;
    // calibrate against rather than the constructor's defaults.

    wireEvents();
    $('boot').classList.add('done');


  } catch (e) {
    boot('<b>Startup failed.</b><br><br><code>' +
         String(e && e.stack ? e.stack : e).replace(/</g, '&lt;') + '</code>');
    // eslint-disable-next-line no-console
    console.error(e);
  }
})();

function sizeCanvas(cv, w, h) {
  cv.width = w; cv.height = h;
  cv.style.width = w + 'px'; cv.style.height = h + 'px';
}

function wireEvents() {
  $('HeightMaps').addEventListener('change', HeightMaps_SelectionChanged);
  $('ReduceDataAmount').addEventListener('change', ReduceDataAmount_SelectionChanged);

  $('SliderHorizontalRotation').addEventListener('input', () => {
    if (_updatingUi) return;
    Chart3DSurface.PeUserInterface.Scrollbar.DegreeOfRotation =
        Math.round(+$('SliderHorizontalRotation').value);
    draw3D();
  });
  $('SliderVerticalRotation').addEventListener('input', () => {
    if (_updatingUi) return;
    Chart3DSurface.PeUserInterface.Scrollbar.ViewingHeight =
        Math.round(+$('SliderVerticalRotation').value);
    draw3D();
  });
  $('SliderZoom').addEventListener('input', () => {
    if (_updatingUi) return;
    Chart3DSurface.PePlot.Option.DxZoom = +$('SliderZoom').value;
    draw3D();
  });
  $('SliderHorizontalMove').addEventListener('input', () => {
    if (_updatingUi) return;
    Chart3DSurface.PePlot.Option.DxViewportX = +$('SliderHorizontalMove').value;
    draw3D();
  });
  $('SliderVerticalMove').addEventListener('input', () => {
    if (_updatingUi) return;
    Chart3DSurface.PePlot.Option.DxViewportY = +$('SliderVerticalMove').value;
    draw3D();
  });

  const lightChanged = () => {
    if (_updatingUi) return;
    if (CurrentHeightMap) {
      _HorzLightDegree = +$('SliderHorizontalLightRotation').value;
      _VertLightDegree = +$('SliderVerticalLightRotation').value;
      const x = Math.sin(_HorzLightDegree * 0.0174533) * 20.0;
      const z = Math.cos(_HorzLightDegree * 0.0174533) * 20.0;
      const y = Math.sin(_VertLightDegree * 0.0174533) * 20.0;
      Chart3DSurface.PeFunction.SetLight(0, x, y, z);
    }
    draw3D();
  };
  $('SliderHorizontalLightRotation').addEventListener('input', lightChanged);
  $('SliderVerticalLightRotation').addEventListener('input', lightChanged);

  $('SliderZExaggeration').addEventListener('input', SliderZExaggeration_OnValueChanged);
  $('SliderXPlane').addEventListener('input', SliderXPlane_OnValueChanged);

  $('ShowLegend').addEventListener('change', (e) => {
    if (e.target.checked) {
      Chart3DSurface.PeLegend.Location = E3.LegendLocation.Bottom;
      Chart3DSurface.PeLegend.Show = true;
    } else {
      Chart3DSurface.PeLegend.Show = false;
    }
    draw3D();
  });

  $('BottomContour').addEventListener('change', (e) => {
    Chart3DSurface.PePlot.Option.ShowContour =
        e.target.checked ? E3.ShowContour.BottomColors : E3.ShowContour.None;
    forceMeshRebuild();
    draw3D();
  });

  $('ShowPlane').addEventListener('change', (e) => {
    if (e.target.checked) ShowPlane_Checked();
    else ShowPlane_UnChecked();
  });

  $('HotSpots').addEventListener('change', (e) => {
    if (e.target.checked) HotSpots_Checked();
    else HotSpots_UnChecked();
  });

  $('HelpButton').addEventListener('click', HelpButton_Click);
  wireHelpDialog();

  wireControlNotifications();
  wireSliderFollowBack();
  wireHotSpotTracking();

  ///////////////////////////////////////////////////////////////////////////
  window.addEventListener('resize', Main_SizeChanged);
}

const PEWN = {};
function wireControlNotifications() {
  // Resolve the names -> codes once, off the synced table.
  const names = PeControl.notifyNames || {};
  for (const code of Object.keys(names)) PEWN[names[code]] = +code;
  const missing = ['PEWN_ZOOMIN', 'PEWN_ZOOMOUT', 'PEWN_CUSTOMMENU']
      .filter((n) => PEWN[n] === undefined);
  if (missing.length) {
    // Say so rather than fall back to a guessed number. A silently missing
    // table means the zoom link and the custom menu quietly do nothing.
    console.warn('WARNING: pewn-names.json missing ' + missing.join(', ') +
        ' -- zoom link and custom menu are INACTIVE');
  }

  if (ctl3d.PeCustomMenu) {
    ctl3d.PeCustomMenu.add((sender, e) => Chart_PeCustomMenu(e && e.menuIndex));
  } else {
    console.warn('WARNING: 3D control has no PeCustomMenu handle -- index.html must load ' +
        'lib/pe-events.js BEFORE app/main.js. Undo Zoom and Cursor ' +
        'Tracking from the right-click menu will do nothing.');
  }

  ctlContour.onNotify = (code) => {
    if (code === PEWN.PEWN_ZOOMIN) Chart2DContour_OnPeZoomIn();
    else if (code === PEWN.PEWN_ZOOMOUT) Chart2DContour_OnPeZoomOut();
  };

  if (ctlContour.PeHorzScroll && ctlContour.PeVertScroll) {
    ctlContour.PeHorzScroll.add(Chart2DContour_PeHorzScroll);
    ctlContour.PeVertScroll.add(Chart2DContour_PeVertScroll);
  } else {
    console.warn('WARNING: contour has no PeHorzScroll/PeVertScroll -- index.html must ' +
        'load lib/pe-events.js BEFORE app/main.js. Panning a zoomed ' +
        'contour will NOT re-range the 3D chart.');
  }

  // Chart2DContour_MouseEnter -- panning a zoomed contour over-burdens the
  // octree rebuild, so entering the contour turns cursor tracking OFF.
  ctlContour.el.addEventListener('pointerenter', Chart2DContour_MouseEnter);
}

function wireSliderFollowBack() {
  const need = ['PePreHScroll', 'PePreVScroll', 'PeZoomIn', 'PeParamUpdate'];
  const missing = need.filter((n) => !ctl3d[n]);
  if (missing.length) {
    console.warn('WARNING: 3D control has no ' + missing.join(', ') + ' -- index.html ' +
        'must load lib/pe-events.js BEFORE app/main.js. The sliders ' +
        'will NOT follow the chart.');
    return;
  }

  let pendingRotationSync = false;
  const syncRotationSoon = () => {
    if (pendingRotationSync) return;
    pendingRotationSync = true;
    Promise.resolve().then(() => {
      pendingRotationSync = false;
      _updatingUi = true;
      // SBPos, not DegreeOfRotation: this only runs once the bar has been
      // driven, which is exactly when the two agree. See the header.
      $('SliderHorizontalRotation').value =
          Chart3DSurface.PeUserInterface.Scrollbar.SBPos;
      $('SliderVerticalRotation').value =
          Chart3DSurface.PeUserInterface.Scrollbar.ViewingHeight;
      _updatingUi = false;
    });
  };
  ctl3d.PePreHScroll.add(syncRotationSoon);
  ctl3d.PePreVScroll.add(syncRotationSoon);

  ctl3d.PeZoomIn.add(() => {
    _updatingUi = true;
    $('SliderZoom').value = Chart3DSurface.PePlot.Option.DxZoom;
    _updatingUi = false;
  });

  ctl3d.PeParamUpdate.add(syncSlidersFromChart);
}

// The three reads Chart_Loaded's tail does, off the CHART rather than off the
// page's own state -- if a property did not take, this is where it shows.
function syncSlidersFromChart() {
  _updatingUi = true;
  $('SliderHorizontalRotation').value =
      Chart3DSurface.PeUserInterface.Scrollbar.DegreeOfRotation;
  $('SliderVerticalRotation').value =
      Chart3DSurface.PeUserInterface.Scrollbar.ViewingHeight;
  $('SliderZoom').value = Chart3DSurface.PePlot.Option.DxZoom;
  _updatingUi = false;
}

// Chart2DContour_MouseEnter -- MainWindow.xaml.cs:456.
function Chart2DContour_MouseEnter() {
  if (!$('HotSpots').checked) return;
  Chart2DContour.PeAnnotation.Graph.Show = false;
  Chart2DContour.PeAnnotation.Show = false;
  drawContour();
  $('HotSpots').checked = false;
  HotSpots_UnChecked();
}

function wireHotSpotTracking() {
  ctl3d.el.addEventListener('pointermove', Chart_MouseMove);
}

function Chart_MouseMove(ev) {
  if (!$('HotSpots').checked) return;
  if (!CurrentHeightMap) return;

  // get last mouse location within control
  const pt = Chart3DSurface.PeUserInterface.Cursor.LastMouseMove;
  const pX = pt.x | 0;
  const pY = pt.y | 0;

  // Call to fill hot spot data structure with hot spot data at given x and y
  Chart3DSurface.PeFunction.GetHotSpot(pX, pY);
  const ds = Chart3DSurface.PeFunction.GetHotSpotData();

  // get ydata value at hot spot
  if (ds.type === E3.HotSpotType.DataPoint) {
    const nHighLightSubset = ds.data1;
    const nHighLightPoint = ds.data2;

    // The C# reads PeData.X[subset, point] and PeData.Z[subset, point]. Those
    // arrays hold ONE row and ONE column here (DuplicateData X/Z above), and
    // the facade's jagged read does not apply that mapping -- it returns 0 for
    // every subset but 0 on X, and 0 always on Z, which put this dot in the
    // corner. Read the shared blocks; it is the same memory the engine plots.
    const aCnt = 0;
    Chart2DContour.PeAnnotation.Graph.X[aCnt] = sMyXData.array[nHighLightPoint];
    Chart2DContour.PeAnnotation.Graph.Y[aCnt] = sMyZData.array[nHighLightSubset];
    Chart2DContour.PeAnnotation.Graph.Type[aCnt] = ES.GraphAnnotationType.LargeDotSolid;
    Chart2DContour.PeAnnotation.Graph.Color[aCnt] = pergb(255, 50, 50, 50);

    Chart2DContour.PeAnnotation.Graph.Show = true;
    Chart2DContour.PeAnnotation.Show = true;
    Chart2DContour.PeAnnotation.InFront = true;

    drawContour();
  }
}

// Chart_PeCustomMenu -- MainWindow.xaml.cs:482.
function Chart_PeCustomMenu(menuIndex) {
  if (menuIndex === CursorTrackingMenu3d) {
    const n = Chart3DSurface.PeUserInterface.Menu.CustomMenuState[CursorTrackingMenu3d][0];
    if (n === E3.CustomMenuState.UnChecked) { $('HotSpots').checked = true; HotSpots_Checked(); }
    else { $('HotSpots').checked = false; HotSpots_UnChecked(); }
    return;
  }
  if (menuIndex === UndoZoomMenu3d && _bZoomed) {
    Chart2DContour.PeGrid.Zoom.Mode = false;
    _bZoomed = false;
    Chart3DSurface.PeUserInterface.Menu.CustomMenu[UndoZoomMenu3d][0] = E3.CustomMenu.Grayed;
    Chart3DSurface.PeGrid.Configure.ManualScaleControlX = E3.ManualScaleControl.None;
    Chart3DSurface.PeGrid.Configure.ManualScaleControlZ = E3.ManualScaleControl.None;
    forceMeshRebuild();
    Chart3DSurface.PeFunction.Force3dxAnnotVerticeRebuild = true;
    Chart3DSurface.PeData.SkipRanging = true;
    core.reinitialize(h3d);
    resetImage3D();
    drawContour();
    movePlaneFromSlider();
  }
}

// SliderZExaggeration_OnValueChanged -- MainWindow.xaml.cs:1134.
function SliderZExaggeration_OnValueChanged() {
  if (_updatingUi) return;
  if (!CurrentHeightMap) return;

  // Dragging this slider re-constructs the image repeatedly. The octree hot
  // spot structure is time intensive to build, so cursor tracking has to go.
  if ($('HotSpots').checked) { $('HotSpots').checked = false; HotSpots_UnChecked(); }

  const zExaggeration = (+$('SliderZExaggeration').value) / 100.0;
  const width = CurrentHeightMap.WidthMm;
  const height = CurrentHeightMap.HeightMm;
  const diag = Math.sqrt(width * width + height * height);

  Chart3DSurface.PeGrid.Option.GridAspectX = width;
  Chart3DSurface.PeGrid.Option.GridAspectZ = height;
  Chart3DSurface.PeGrid.Option.GridAspectY = diag * zExaggeration;

  if (_bShowingPlane) movePlaneFromSlider();

  Chart3DSurface.PeFunction.Force3dxNewColors = true;
  forceMeshRebuild();
  resetImage3D();
}

// HeightMaps_SelectionChanged -- MainWindow.xaml.cs:1175.
async function HeightMaps_SelectionChanged() {
  _bZoomed = false;
  Chart3DSurface.PeGrid.Configure.ManualScaleControlX = E3.ManualScaleControl.None;
  Chart3DSurface.PeGrid.Configure.ManualScaleControlZ = E3.ManualScaleControl.None;
  Chart3DSurface.PeUserInterface.Menu.CustomMenu[UndoZoomMenu3d][0] = E3.CustomMenu.Grayed;
  Chart2DContour.PeGrid.Zoom.Mode = false;

  const newfile = $('HeightMaps').value || DATA_FILES[0].file;
  boot('loading ' + newfile + ' ...');
  HeightMapA = await HeightMap.load('./data/' + newfile);
  if (!HeightMapA.IsValid) { console.warn('LOAD FAILED: ' + newfile); return; }

  RefreshUi(HeightMapA);

  $('BottomContour').checked = false;
  $('ShowLegend').checked = true;
  Chart3DSurface.PeLegend.Location = E3.LegendLocation.Bottom;
  Chart3DSurface.PeLegend.Show = true;
  $('ShowPlane').checked = true;
  ShowPlane_Checked();

  if (isPhone()) applyPhoneDefaults();
}

function applyPhoneDefaults() {
  $('ShowLegend').checked = false;
  Chart3DSurface.PeLegend.Show = false;

  if ($('ShowPlane').checked) { $('ShowPlane').checked = false; ShowPlane_UnChecked(); }

  if ($('HotSpots').checked) { $('HotSpots').checked = false; HotSpots_UnChecked(); }

}

function ReduceDataAmount_SelectionChanged() {
  if (!CurrentHeightMap) return;
  if (_updatingUi) return;
  _nDataStep = $('ReduceDataAmount').selectedIndex + 1;   // 0123 -> 1,2,3,4
  RefreshUi(CurrentHeightMap);
  if (_bShowingPlane) movePlaneFromSlider();
}

function HotSpots_Checked() {
  Chart3DSurface.PeUserInterface.Menu.CustomMenuState[CursorTrackingMenu3d][0] =
      E3.CustomMenuState.Checked;
  // ANY of these three enables the octree build, so set all three.
  Chart3DSurface.PeUserInterface.HotSpot.Data = true;
  Chart3DSurface.PeUserInterface.Cursor.PromptTracking = true;
  Chart3DSurface.PeUserInterface.Cursor.HighlightColor = pergb(255, 255, 0, 0);
  Chart3DSurface.PeUserInterface.Cursor.PromptStyle = E3.CursorPromptStyle.YValue;
  Chart3DSurface.PeUserInterface.Cursor.PromptLocation = E3.CursorPromptLocation.ToolTip;
  Chart3DSurface.PeData.Precision = E3.DataPrecision.TwoDecimals;
  forceMeshRebuild();
  resetImage3D();
}

function HotSpots_UnChecked() {
  Chart3DSurface.PeUserInterface.Menu.CustomMenuState[CursorTrackingMenu3d][0] =
      E3.CustomMenuState.UnChecked;
  Chart3DSurface.PeUserInterface.HotSpot.Data = false;
  Chart3DSurface.PeUserInterface.Cursor.PromptTracking = false;
  Chart3DSurface.PeUserInterface.Cursor.HighlightColor = pergb(0, 0, 0, 0);
  Chart3DSurface.PeUserInterface.Cursor.PromptStyle = E3.CursorPromptStyle.None;
  forceMeshRebuild();
  resetImage3D();
}

function ShowPlane_Checked() {
  if (!CurrentHeightMap) return;
  _bShowingPlane = true;
  $('SliderXPlane').value = 40;
  movePlaneFromSlider();
  Chart3DSurface.PeFunction.Force3dxAnnotVerticeRebuild = true;
  Chart3DSurface.PeData.SkipRanging = true;
  core.reinitialize(h3d);
  draw3D();
  $('RootGrid').classList.remove('no-xsection');
}

function ShowPlane_UnChecked() {
  _bShowingPlane = false;
  Chart3DSurface.PeAnnotation.Show = false;
  Chart3DSurface.PeFunction.Force3dxAnnotVerticeRebuild = true;
  Chart3DSurface.PeData.SkipRanging = true;
  core.reinitialize(h3d);
  draw3D();
  // Hides the cross-section AND collapses its column to zero, so the 3D chart
  // widens into it. One class so the two can never disagree.
  $('RootGrid').classList.add('no-xsection');
}

function SliderXPlane_OnValueChanged() {
  if (_updatingUi) return;
  movePlaneFromSlider();
}

function movePlaneFromSlider() {
  const minX = Chart3DSurface.PeGrid.Configure.ManualMinX;
  const maxX = Chart3DSurface.PeGrid.Configure.ManualMaxX;
  const fRange = maxX - minX;
  MoveXPlane(minX + fRange * (+$('SliderXPlane').value) / 100.0);
}

// Main_SizeChanged -- MainWindow.xaml.cs:1764.
function Main_SizeChanged() {
  if (ctlContour && ctlContour.chart) ctlContour.render();
}

function HelpButton_Click() {
  const help = $('help');
  help.classList.add('on');
  // Open at the top. The box scrolls on a short screen, and focusing OK below
  // would otherwise scroll it into view and land the reader on the license
  // instead of the help.
  const box = help.querySelector('.box');
  if (box) box.scrollTop = 0;
  // Focus the button so Enter and Space close it, and so a keyboard user is
  // inside the dialog rather than still on the page behind it.
  const ok = $('helpOk');
  if (ok) ok.focus({ preventScroll: true });
}

function wireHelpDialog() {
  const help = $('help');
  if (!help) { console.warn('WARNING: no #help element -- the Help button will do nothing'); return; }
  const close = () => help.classList.remove('on');
  $('helpOk').addEventListener('click', close);
  // The backdrop, but only the backdrop: a click that started inside the box
  // and ended on it must not close.
  help.addEventListener('click', (ev) => { if (ev.target === help) close(); });
  window.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && help.classList.contains('on')) close();
  });
}

// MoveXPlane -- MainWindow.xaml.cs:1300. The plane, its outline and the
// yellow intersection line.
function MoveXPlane(fPos) {
  if (!CurrentHeightMap) return;
  const hm = CurrentHeightMap;

  Chart3DSurface.PeAnnotation.Show = true;
  Chart3DSurface.PeAnnotation.Graph.Show = true;

  let x = fPos;
  let col = ((x / hm.WidthMm) * (hm.WidthPx - (_nAppliedStep - 1) - 1)) | 0;
  if (col <= 0) col = 0;
  if (col >= hm.WidthPx) col = hm.WidthPx - 1;

  x = col * hm.Resolution;          // place the line right on the pixel
  const alpha = 64;

  let index = 0;
  const A = Chart3DSurface.PeAnnotation.Graph;
  const GAT = E3.GraphAnnotationType;

  const minY = Chart3DSurface.PeGrid.Configure.ManualMinY;
  const maxY = Chart3DSurface.PeGrid.Configure.ManualMaxY;
  const fRange = maxY - minY;
  const fRangeOffset = fRange * 0.40;
  const fOffset = fRange * 0.25;    // lift the intersection line clear

  const WHITE_A = pergb(alpha, 255, 255, 255);
  const BLACK = pergb(255, 0, 0, 0);
  const YELLOW = pergb(255, 255, 255, 0);

  // the translucent plane
  A.HotSpot[index] = false;
  A.Type[index] = GAT.StartPoly;   A.Color[index] = WHITE_A;
  A.X[index] = x; A.Y[index] = _miny; A.Z[index] = _minz; index++;

  A.Type[index] = GAT.AddPolyPoint; A.Color[index] = WHITE_A;
  A.X[index] = x; A.Y[index] = _miny; A.Z[index] = _maxz; index++;

  A.Type[index] = GAT.AddPolyPoint; A.Color[index] = WHITE_A;
  A.X[index] = x; A.Y[index] = _maxy + fRangeOffset; A.Z[index] = _maxz; index++;

  A.Type[index] = GAT.EndPolygon;  A.Color[index] = WHITE_A;
  A.X[index] = x; A.Y[index] = _maxy + fRangeOffset; A.Z[index] = _minz; index++;

  // bound it with a black line
  A.HotSpot[index] = false;
  A.Type[index] = GAT.ThinSolidLine; A.Color[index] = BLACK;
  A.X[index] = x; A.Y[index] = _miny; A.Z[index] = _minz; index++;

  A.Type[index] = GAT.LineContinue; A.Color[index] = BLACK;
  A.X[index] = x; A.Y[index] = _miny; A.Z[index] = _maxz; index++;

  A.Type[index] = GAT.LineContinue; A.Color[index] = BLACK;
  A.X[index] = x; A.Y[index] = _maxy + fRangeOffset; A.Z[index] = _maxz; index++;

  A.Type[index] = GAT.LineContinue; A.Color[index] = BLACK;
  A.X[index] = x; A.Y[index] = _maxy + fRangeOffset; A.Z[index] = _minz; index++;

  A.Type[index] = GAT.LineContinue; A.Color[index] = BLACK;
  A.X[index] = x; A.Y[index] = _miny; A.Z[index] = _minz; index++;

  // the yellow line where the plane meets the surface, drawn TWICE -- once
  // just in front of the plane and once just behind it. A single line at the
  // plane's own x is coplanar with the polygon, and the depth test then breaks
  // it into dashes. Half a pixel column keeps both inside the column the line
  // is placed on, so they read as one line.
  const nRows = hm.HeightPx - (_nAppliedStep - 1);
  const yOffset = (hm.MaxZMm - hm.MinZMm) * 0.0005;
  const xOffset = hm.Resolution * 0.5;

  for (const xLine of [x - xOffset, x + xOffset]) {
    let row = 0;
    let z = hm.GetRowMm(row);
    let y = hm.GetPel(nRows - row - 1, col);

    A.HotSpot[index] = false;
    A.Type[index] = GAT.ThinSolidLine; A.Color[index] = YELLOW;
    A.X[index] = xLine; A.Y[index] = (y + yOffset) + fOffset; A.Z[index] = z; index++;

    for (row = 0; row < nRows; row++) {
      z = hm.GetRowMm(row);
      y = hm.GetPel(nRows - row - 1, col);
      A.Type[index] = GAT.LineContinue; A.Color[index] = YELLOW;
      A.X[index] = xLine; A.Y[index] = (y + yOffset) + fOffset; A.Z[index] = z; index++;
    }

    row = nRows - 1;
    z = hm.GetRowMm(row);
    y = hm.GetPel(row, col);
    A.Type[index] = GAT.EndPolyLineMedium; A.Color[index] = YELLOW;
    A.X[index] = xLine; A.Y[index] = (y + yOffset) + fOffset; A.Z[index] = z; index++;
  }

  Chart3DSurface.PeAnnotation.InFront = true;
  Chart3DSurface.PeFunction.Force3dxAnnotVerticeRebuild = true;
  draw3D();

  // ---- and the right-hand cross-section chart --------------------------
  updateCrossSection(hm, col, nRows, yOffset);
}

function updateCrossSection(hm, col, nRows, yOffset) {
  const C = Chart2DLine;
  C.PeData.Subsets = 1;
  C.PeData.Points = nRows;

  let index = 0;
  let row = 0;
  let z = hm.GetRowMm(row);
  let y = hm.GetPel(nRows - row - 1, col);

  C.PeData.Y[0][index] = z;
  C.PeData.X[0][index] = y + yOffset;
  index++;

  let fMin = 1e35, fMax = -1e35, nMaxIndex = 0, nMinIndex = 0;
  const minY3 = Chart3DSurface.PeGrid.Configure.ManualMinY;
  const fRangeY = Chart3DSurface.PeGrid.Configure.ManualMaxY - minY3;

  for (row = 0; row < nRows; row++) {
    z = hm.GetRowMm(row);
    y = hm.GetPel(nRows - row - 1, col);
    if (y > fMax) { fMax = y; nMaxIndex = row; }
    if (y < fMin) { fMin = y; nMinIndex = row; }

    C.PeData.Y[0][index] = z;
    C.PeData.X[0][index] = y + yOffset;

    let fIndex = ((y + yOffset) - minY3) / fRangeY;
    fIndex = fIndex * 255.0;
    if (fIndex > 255) fIndex = 255;
    if (fIndex < 0) fIndex = 0;
    C.PePlot.PointColors[0][index] = MyColors[fIndex | 0];
    index++;
  }

  row = nRows - 1;
  z = hm.GetRowMm(row);
  y = hm.GetPel(row, col);
  C.PeData.Y[0][index] = z;
  C.PeData.X[0][index] = y + yOffset;

  C.PeGrid.Configure.ManualMinX = Chart3DSurface.PeGrid.Configure.ManualMinY;
  C.PeGrid.Configure.ManualMaxX = Chart3DSurface.PeGrid.Configure.ManualMaxY;
  C.PeGrid.Configure.ManualScaleControlX = ES.ManualScaleControl.MinMax;

  let aCnt = 0;
  const GA = C.PeAnnotation.Graph;
  const GAT = ES.GraphAnnotationType;

  GA.X[aCnt] = C.PeData.X[0][nMaxIndex];
  GA.Y[aCnt] = C.PeData.Y[0][nMaxIndex];
  GA.Text[aCnt] = floatToString(fMax);
  GA.Type[aCnt] = GAT.Pointer;
  GA.Color[aCnt] = pergb(255, 255, 255, 255);
  aCnt++;

  GA.X[aCnt] = C.PeData.X[0][nMinIndex];
  GA.Y[aCnt] = C.PeData.Y[0][nMinIndex];
  GA.Text[aCnt] = floatToString(fMin);
  GA.Type[aCnt] = GAT.Pointer;
  GA.Color[aCnt] = pergb(255, 255, 255, 255);
  aCnt++;

  if (_bZoomed) {
    const minZ = Chart3DSurface.PeGrid.Configure.ManualMinZ;
    const maxZ = Chart3DSurface.PeGrid.Configure.ManualMaxZ;
    GA.X[aCnt] = C.PeGrid.Configure.ManualMinX; GA.Y[aCnt] = minZ;
    GA.Text[aCnt] = ''; GA.Type[aCnt] = GAT.StartPoly; aCnt++;
    GA.X[aCnt] = C.PeGrid.Configure.ManualMaxX; GA.Y[aCnt] = minZ;
    GA.Text[aCnt] = ''; GA.Type[aCnt] = GAT.AddPolyPoint; aCnt++;
    GA.X[aCnt] = C.PeGrid.Configure.ManualMaxX; GA.Y[aCnt] = maxZ;
    GA.Text[aCnt] = ''; GA.Type[aCnt] = GAT.AddPolyPoint; aCnt++;
    GA.X[aCnt] = C.PeGrid.Configure.ManualMinX; GA.Y[aCnt] = maxZ;
    GA.Text[aCnt] = ''; GA.Type[aCnt] = GAT.EndPolygon;
    GA.Color[aCnt] = pergb(40, 255, 255, 255); aCnt++;

    C.PeAnnotation.Line.YAxis[0] = minZ;
    C.PeAnnotation.Line.YAxisInFront[0] = ES.AnnotationInFront.InFront;
    C.PeAnnotation.Line.YAxis[1] = maxZ;
    C.PeAnnotation.Line.YAxisInFront[1] = ES.AnnotationInFront.InFront;
  } else {
    C.PeAnnotation.Line.YAxisInFront[0] = ES.AnnotationInFront.Hide;
    C.PeAnnotation.Line.YAxisInFront[1] = ES.AnnotationInFront.Hide;
    GA.Type[5] = GAT.NoSymbol;
  }

  C.PeAnnotation.Line.YAxisShow = true;
  C.PeAnnotation.Graph.TextSize = 140;
  C.PeAnnotation.Graph.Show = true;
  C.PeAnnotation.Show = true;

  drawLine();
}

function drawLine() { if (ctlLine) ctlLine.render(); }

// Chart_OnPeZoomIn -- MainWindow.xaml.cs:1123. Zooming the contour
// re-ranges the 3D chart.
function Chart2DContour_OnPeZoomIn() {
  _bZoomed = true;
  Chart3DSurface.PeUserInterface.Menu.CustomMenu[UndoZoomMenu3d][0] = E3.CustomMenu.Show;
  Chart3DSurface.PeGrid.Configure.DxPsManualCullXZ = true;

  Chart3DSurface.PeGrid.Configure.ManualScaleControlX = E3.ManualScaleControl.MinMax;
  Chart3DSurface.PeGrid.Configure.ManualMinX = Chart2DContour.PeGrid.Zoom.MinX;
  Chart3DSurface.PeGrid.Configure.ManualMaxX = Chart2DContour.PeGrid.Zoom.MaxX;

  Chart3DSurface.PeGrid.Configure.ManualScaleControlZ = E3.ManualScaleControl.MinMax;
  Chart3DSurface.PeGrid.Configure.ManualMinZ = Chart2DContour.PeGrid.Zoom.MinY;
  Chart3DSurface.PeGrid.Configure.ManualMaxZ = Chart2DContour.PeGrid.Zoom.MaxY;

  forceMeshRebuild();
  Chart3DSurface.PeFunction.Force3dxAnnotVerticeRebuild = true;
  Chart3DSurface.PeData.SkipRanging = true;
  core.reinitialize(h3d);          // needed: ManualScaleControl changed
  draw3D();
  movePlaneFromSlider();
}

function Chart2DContour_OnPeZoomOut() {
  _bZoomed = false;
  Chart3DSurface.PeUserInterface.Menu.CustomMenu[UndoZoomMenu3d][0] = E3.CustomMenu.Grayed;
  Chart3DSurface.PeGrid.Configure.ManualScaleControlX = E3.ManualScaleControl.None;
  Chart3DSurface.PeGrid.Configure.ManualScaleControlZ = E3.ManualScaleControl.None;
  forceMeshRebuild();
  Chart3DSurface.PeFunction.Force3dxAnnotVerticeRebuild = true;
  Chart3DSurface.PeData.SkipRanging = true;
  core.reinitialize(h3d);
  draw3D();
  movePlaneFromSlider();
}

function contourPanReRange3D() {
  if (!_bZoomed) return;
  Chart3DSurface.PeGrid.Configure.ManualScaleControlX = E3.ManualScaleControl.MinMax;
  Chart3DSurface.PeGrid.Configure.ManualMinX = Chart2DContour.PeGrid.Zoom.MinX;
  Chart3DSurface.PeGrid.Configure.ManualMaxX = Chart2DContour.PeGrid.Zoom.MaxX;

  Chart3DSurface.PeGrid.Configure.ManualScaleControlZ = E3.ManualScaleControl.MinMax;
  Chart3DSurface.PeGrid.Configure.ManualMinZ = Chart2DContour.PeGrid.Zoom.MinY;
  Chart3DSurface.PeGrid.Configure.ManualMaxZ = Chart2DContour.PeGrid.Zoom.MaxY;

  Chart3DSurface.PeFunction.Force3dxAnnotVerticeRebuild = true;
  forceMeshRebuild();
  Chart3DSurface.PeData.SkipRanging = true;
  core.reinitialize(h3d);          // needed because ManualScaleControl is changing
  draw3D();                        // Chart3DSurface.Invalidate()
}

function Chart2DContour_PeHorzScroll() {
  contourPanReRange3D();
}

function Chart2DContour_PeVertScroll() {
  contourPanReRange3D();
  if (_bShowingPlane) movePlaneFromSlider();
}

