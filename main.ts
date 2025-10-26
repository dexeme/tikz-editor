// @ts-nocheck

import {
  createApp,
  ref,
  reactive,
  computed,
  watch,
  onMounted,
  onUnmounted,
  nextTick,
} from 'https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js';
import { createCanvasRenderer, TEXT_BLOCK_CONSTRAINTS } from './src/canvas.js';
import {
  DEFAULT_CYLINDER_MIN_WIDTH_CM,
  DEFAULT_CYLINDER_MIN_HEIGHT_CM,
  DEFAULT_CYLINDER_ASPECT,
  getDefaultNodeSize,
  resolveNodeSize,
} from './src/utils/sceneMetrics.js';
import { generateTikzDocument } from './src/tikz.js';

const defaultNode = shape => {
  const resolvedShape = shape || 'circle';
  const defaultSize = getDefaultNodeSize(resolvedShape);
  return {
    label: 'New node',
    color: '#f8fafc',
    borderColor: '#94a3b8',
    shape: resolvedShape,
    size: { width: defaultSize.width, height: defaultSize.height },
    fontSize: '16',
    borderWidth: 3,
    borderStyle: 'solid',
    cornerRadius: 16,
    opacity: 1,
    rectangleSplitCells: [],
  };
};

const NODE_SIZE_LIMITS = {
  width: { min: 20, max: 720 },
  height: { min: 20, max: 720 },
};

const TEXT_BLOCK_DEFAULT_WIDTH = 260;
const TEXT_BLOCK_DEFAULT_HEIGHT = 160;
const TEXT_FONT_SIZE_LIMITS = { min: 10, max: 72 };
const TEXT_BLOCK_BORDER_WIDTH_DEFAULT = 2;
const TEXT_BLOCK_BORDER_STYLE_DEFAULT = 'solid';
const TEXT_BLOCK_OPACITY_RANGE = { min: 0.1, max: 1 };
const RECTANGLE_SPLIT_MIN_PARTS = 2;
const RECTANGLE_SPLIT_MAX_PARTS = 12;
const LINE_SNAP_TOLERANCE = 12;
const GRID_SNAP_SPACING = 64;

function clampNodeSize(value, dimension) {
  const limits = dimension === 'height' ? NODE_SIZE_LIMITS.height : NODE_SIZE_LIMITS.width;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return limits.min;
  }
  return Math.min(limits.max, Math.max(limits.min, numeric));
}

function coerceSizeValue(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }
  return numeric;
}

function parseNumericPrefix(value, fallback = null) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : fallback;
  }
  if (typeof value !== 'string') {
    return fallback;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }
  const match = trimmed.match(/^(-?\d*\.?\d+)/);
  if (!match) {
    return fallback;
  }
  const numeric = Number(match[1]);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeNodeSizeForShape(size, shape) {
  const defaults = getDefaultNodeSize(shape);
  let width;
  let height;
  if (typeof size === 'number') {
    width = size;
    height = size;
  } else if (size && typeof size === 'object') {
    width = coerceSizeValue(size.width, null);
    height = coerceSizeValue(size.height, null);
    if (width == null && height != null) {
      width = height;
    } else if (height == null && width != null) {
      height = width;
    }
  }
  if (width == null) {
    width = defaults.width;
  }
  if (height == null) {
    height = defaults.height;
  }
  if (shape === 'circle') {
    const diameter = clampNodeSize(Math.max(width, height), 'width');
    return { width: diameter, height: diameter };
  }
  return {
    width: clampNodeSize(width, 'width'),
    height: clampNodeSize(height, 'height'),
  };
}

function applyShapeDefaults(node) {
  if (!node) {
    return;
  }

  const shape = typeof node.shape === 'string' ? node.shape : 'circle';
  node.shape = shape;
  node.size = normalizeNodeSizeForShape(node.size, shape);

  if (shape === 'rectangle split') {
    ensureRectangleSplitCells(node);
    return;
  }

  if (shape !== 'cylinder') {
    return;
  }

  const coerceNumber = (value, fallback) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  };

  const ensureTrimmed = (value, fallback = '') => {
    if (typeof value === 'string') {
      return value.trim();
    }
    return fallback;
  };

  node.rotate = coerceNumber(node.rotate, 0);
  node.shapeBorderRotate = coerceNumber(node.shapeBorderRotate, 0);

  const rawAspect = Number(node.aspect);
  node.aspect = Number.isFinite(rawAspect) && rawAspect > 0 ? rawAspect : 0.35;

  const minimumHeight = typeof node.minimumHeight === 'string' ? node.minimumHeight.trim() : '';
  const parsedHeight = parseNumericPrefix(minimumHeight, null);
  if (!minimumHeight || (Number.isFinite(parsedHeight) && Math.abs(parsedHeight - 1.8) < 0.05)) {
    node.minimumHeight = '1.2cm';
  } else {
    node.minimumHeight = minimumHeight;
  }
  const minimumWidth = typeof node.minimumWidth === 'string' ? node.minimumWidth.trim() : '';
  const parsedWidth = parseNumericPrefix(minimumWidth, null);
  if (!minimumWidth || (Number.isFinite(parsedWidth) && Math.abs(parsedWidth - 1.6) < 0.05)) {
    node.minimumWidth = '5.6cm';
  } else {
    node.minimumWidth = minimumWidth;
  }
  node.innerXsep = ensureTrimmed(node.innerXsep);
  node.innerYsep = ensureTrimmed(node.innerYsep);

  if (node.cylinderUsesCustomFill == null) {
    node.cylinderUsesCustomFill = true;
  } else if (typeof node.cylinderUsesCustomFill === 'string') {
    node.cylinderUsesCustomFill = node.cylinderUsesCustomFill.trim().toLowerCase() === 'true';
  } else {
    node.cylinderUsesCustomFill = Boolean(node.cylinderUsesCustomFill);
  }

  const fallbackFill =
    (typeof node.color === 'string' && node.color.trim()) || '#f8fafc';
  if (!(typeof node.cylinderBodyFill === 'string' && node.cylinderBodyFill.trim())) {
    node.cylinderBodyFill = fallbackFill;
  } else {
    node.cylinderBodyFill = node.cylinderBodyFill.trim();
  }
  if (!(typeof node.cylinderEndFill === 'string' && node.cylinderEndFill.trim())) {
    node.cylinderEndFill = fallbackFill;
  } else {
    node.cylinderEndFill = node.cylinderEndFill.trim();
  }
}

let nodeSequence = 1;
let edgeSequence = 1;
let textSequence = 1;
let matrixSequence = 1;
let lineSequence = 1;

const DEFAULT_EDGE_THICKNESS = 2.5;
const RECTANGLE_SPLIT_DEFAULT_PARTS = 4;
const clampRectangleSplitParts = value => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return RECTANGLE_SPLIT_DEFAULT_PARTS;
  }
  return Math.min(
    RECTANGLE_SPLIT_MAX_PARTS,
    Math.max(RECTANGLE_SPLIT_MIN_PARTS, Math.round(numeric))
  );
};

function ensureRectangleSplitCells(node) {
  if (!node || node.shape !== 'rectangle split') {
    return;
  }
  const parts = clampRectangleSplitParts(node.rectangleSplitParts);
  const existing = Array.isArray(node.rectangleSplitCells) ? node.rectangleSplitCells : [];
  const cells = [];
  for (let index = 0; index < parts; index += 1) {
    const current = existing[index] || {};
    const textFallback =
      typeof current.text === 'string'
        ? current.text
        : index === 0 && typeof node.label === 'string'
          ? node.label
          : '';
    cells.push({
      id: typeof current.id === 'string' ? current.id : `rectangle-split-${index + 1}`,
      text: textFallback,
      fill: typeof current.fill === 'string' && current.fill.trim() ? current.fill.trim() : null,
      textColor:
        typeof current.textColor === 'string' && current.textColor.trim()
          ? current.textColor.trim()
          : null,
    });
  }
  node.rectangleSplitParts = parts;
  node.rectangleSplitCells = cells;
  if (cells[0] && typeof cells[0].text === 'string') {
    node.label = cells[0].text;
  }
}

function makeNode(x, y, shape) {
  return normalizeNode({
    id: `node-${nodeSequence++}`,
    x,
    y,
    ...defaultNode(shape),
  });
}

function makeEdge(from, to) {
  return {
    id: `edge-${edgeSequence++}`,
    from,
    to,
    style: 'solid',
    direction: '->',
    shape: 'straight',
    bend: 30,
    label: null,
    color: '#94a3b8',
    thickness: null,
  };
}

function makeLine(start, end) {
  return {
    id: `line-${lineSequence++}`,
    start: { x: start.x, y: start.y },
    end: { x: end.x, y: end.y },
    color: '#94a3b8',
    style: 'solid',
    thickness: DEFAULT_EDGE_THICKNESS,
    label: null,
  };
}

function normalizeLine(line = {}) {
  const startX = Number(line.start?.x);
  const startY = Number(line.start?.y);
  const endX = Number(line.end?.x);
  const endY = Number(line.end?.y);
  const color = typeof line.color === 'string' && line.color ? line.color : '#94a3b8';
  const styleOptions = new Set(['solid', 'dashed', 'dotted']);
  const rawStyle = typeof line.style === 'string' ? line.style.toLowerCase() : 'solid';
  const style = styleOptions.has(rawStyle) ? rawStyle : 'solid';
  const thicknessValue = Number(line.thickness);
  const thickness = Number.isFinite(thicknessValue) && thicknessValue > 0
    ? thicknessValue
    : null;
  const label = typeof line.label === 'string' && line.label.trim()
    ? line.label.trim()
    : null;

  return {
    id: typeof line.id === 'string' ? line.id : `line-${lineSequence++}`,
    start: {
      x: Number.isFinite(startX) ? startX : 0,
      y: Number.isFinite(startY) ? startY : 0,
    },
    end: {
      x: Number.isFinite(endX) ? endX : 0,
      y: Number.isFinite(endY) ? endY : 0,
    },
    color,
    style,
    thickness,
    label,
  };
}

function normalizeEdge(edge) {
  const legacyShapeMap = {
    '--': 'straight',
    '|-': '90-horizontal',
    '-|': '90-vertical',
    'bend left': 'curva-esquerda',
    'bend right': 'curva-direita',
  };
  if (legacyShapeMap[edge.shape]) {
    edge.shape = legacyShapeMap[edge.shape];
  }
  if (!edge.shape) {
    edge.shape = 'straight';
  }
  if (typeof edge.label === 'string') {
    edge.label = edge.label ? { text: edge.label, position: 'auto' } : null;
  }
  if (!edge.color) {
    edge.color = '#94a3b8';
  }
  const thicknessValue = Number(edge.thickness);
  edge.thickness = Number.isFinite(thicknessValue) && thicknessValue > 0 ? thicknessValue : null;
  return edge;
}

function normalizeNode(node = {}) {
  const normalized = { ...node };
  if (!normalized.color) {
    normalized.color = '#f8fafc';
  }
  if (!normalized.borderColor) {
    normalized.borderColor = '#94a3b8';
  }
  const allowedBorderStyles = new Set(['solid', 'dashed', 'dotted']);
  if (!allowedBorderStyles.has(normalized.borderStyle)) {
    normalized.borderStyle = 'solid';
  }
  if (!normalized.shape) {
    normalized.shape = 'circle';
  }
  normalized.size = normalizeNodeSizeForShape(normalized.size, normalized.shape);
  if (!normalized.fontSize) {
    normalized.fontSize = '16';
  }
  const widthValue = Number(normalized.borderWidth);
  normalized.borderWidth = Number.isFinite(widthValue) && widthValue > 0 ? widthValue : 3;
  const cornerRadiusValue = Number(normalized.cornerRadius);
  normalized.cornerRadius = Number.isFinite(cornerRadiusValue) && cornerRadiusValue >= 0
    ? Math.min(64, cornerRadiusValue)
    : 16;
  const opacityValue = Number(normalized.opacity);
  if (!Number.isFinite(opacityValue)) {
    normalized.opacity = 1;
  } else {
    const clampedOpacity = Math.min(1, Math.max(0, opacityValue));
    normalized.opacity = Number(clampedOpacity.toFixed(2));
  }
  applyShapeDefaults(normalized);
  return normalized;
}

function makeTextBlock(x, y, width, height, options = {}) {
  const normalizeString = (value, fallback) =>
    typeof value === 'string' && value.trim() ? value : fallback;
  const normalizeNumeric = (value, fallback) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  };
  const normalizeColor = value => {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed || null;
  };
  const normalizeBoolean = value => {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true') return true;
      if (normalized === 'false') return false;
    }
    return null;
  };
  const borderStyles = new Set(['solid', 'dashed', 'dotted']);
  const normalizeOpacity = value => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return TEXT_BLOCK_OPACITY_RANGE.max;
    }
    return Math.min(TEXT_BLOCK_OPACITY_RANGE.max, Math.max(TEXT_BLOCK_OPACITY_RANGE.min, numeric));
  };
  const showBackground = normalizeBoolean(options.showBackground);
  return {
    id: `text-${textSequence++}`,
    x,
    y,
    width,
    height,
    text: normalizeString(options.text, 'New text'),
    fontSize: normalizeNumeric(options.fontSize, 16),
    fontWeight: normalizeNumeric(options.fontWeight, 500),
    color: normalizeColor(options.color),
    fillColor: normalizeColor(options.fillColor) || '#f8fafc',
    borderColor: normalizeColor(options.borderColor) || '#94a3b8',
    borderWidth: Math.max(
      0.5,
      normalizeNumeric(options.borderWidth, TEXT_BLOCK_BORDER_WIDTH_DEFAULT)
    ),
    borderStyle: borderStyles.has(options.borderStyle) ? options.borderStyle : TEXT_BLOCK_BORDER_STYLE_DEFAULT,
    showBackground: showBackground == null ? true : showBackground,
    opacity: normalizeOpacity(options.opacity ?? TEXT_BLOCK_OPACITY_RANGE.max),
  };
}

function refreshSequencesFromState(
  nodes = [],
  edges = [],
  lines = [],
  textBlocks = [],
  matrixGrids = []
) {
  const extractMax = (items, pattern) => {
    return items.reduce((max, item) => {
      if (typeof item.id !== 'string') return max;
      const match = item.id.match(pattern);
      if (!match) return max;
      const value = Number(match[1]);
      return Number.isFinite(value) ? Math.max(max, value) : max;
    }, 0);
  };
  const maxNode = extractMax(nodes, /^node-(\d+)$/);
  const maxEdge = extractMax(edges, /^edge-(\d+)$/);
  const maxLine = extractMax(lines, /^line-(\d+)$/);
  const maxText = extractMax(textBlocks, /^text-(\d+)$/);
  const maxMatrix = extractMax(matrixGrids, /^matrix-(\d+)$/);
  nodeSequence = Math.max(nodeSequence, maxNode + 1);
  edgeSequence = Math.max(edgeSequence, maxEdge + 1);
  lineSequence = Math.max(lineSequence, maxLine + 1);
  textSequence = Math.max(textSequence, maxText + 1);
  matrixSequence = Math.max(matrixSequence, maxMatrix + 1);
}

createApp({
  setup() {
    const state = reactive({
      nodes: [],
      edges: [],
      lines: [],
      textBlocks: [],
      matrixGrids: [],
      mode: 'move',
      selected: null,
      lineHandles: null,
      theme: 'dark',
      edgeStart: null,
      dragContext: null,
      dragMoved: false,
      pointer: null,
      frame: null,
      drawing: null,
      camera: {
        scale: 1,
        offsetX: 0,
        offsetY: 0,
      },
      cameraDrag: null,
      guides: { vertical: null, horizontal: null, snapTarget: null, rotation: null, spacing: null },
      spacingMeasurements: null,
      spacingMeasureActive: false,
      edgeThickness: DEFAULT_EDGE_THICKNESS,
      edgeLabelAlignment: 'right',
      selectionRect: null,
      selectionDraft: [],
      borderPreviewSuppressed: false,
    });

    const panModifierActive = ref(false);

    const history = reactive({
      past: [],
      future: [],
    });

    const canUndo = computed(() => history.past.length > 1);
    const canRedo = computed(() => history.future.length > 0);

    const availableShapes = [
      { id: 'rectangle', label: 'Rectangle', shortcut: 'R' },
      { id: 'rounded rectangle', label: 'Rounded rectangle', shortcut: 'U' },
      { id: 'rectangle split', label: 'Rectangle split', shortcut: 'P' },
      { id: 'circle', label: 'Circle', shortcut: 'C' },
      { id: 'ellipse', label: 'Ellipse', shortcut: 'E' },
      { id: 'semicircle', label: 'Semicircle', shortcut: 'S' },
      { id: 'triangle', label: 'Triangle', shortcut: 'T' },
      { id: 'diamond', label: 'Diamond', shortcut: 'G' },
      { id: 'decision', label: 'Decision node', shortcut: 'D' },
      { id: 'cylinder', label: 'Cylinder', shortcut: 'Y' },
      { id: 'cloud', label: 'Cloud', shortcut: 'L' },
    ];
    const activeShapeId = ref(availableShapes[0]?.id || null);
    const activeShape = computed(() =>
      availableShapes.find(shape => shape.id === activeShapeId.value) || availableShapes[0] || null
    );

    const shapeShortcutMap = availableShapes.reduce((map, shape) => {
      if (shape.shortcut) {
        map[shape.shortcut.toLowerCase()] = shape.id;
      }
      return map;
    }, {});

    const showTemplateBrowser = ref(false);

    const formatClipboard = ref(null);
    const clipboard = ref(null);
    const contextMenu = reactive({
      visible: false,
      x: 0,
      y: 0,
    });
    const nodeToolbarRef = ref(null);
    const edgeToolbarRef = ref(null);
    const contextMenuRef = ref(null);
    const matrixFileInputRef = ref(null);
    const selectedNodes = computed(() => {
      if (state.selected?.type !== 'node') {
        return [];
      }
      const items = Array.isArray(state.selected.items)
        ? state.selected.items.filter(Boolean)
        : [];
      const primary = state.selected.item;
      if (primary && !items.some(item => item?.id === primary.id)) {
        return [...items, primary];
      }
      return items;
    });
    const selectedNode = computed(() => selectedNodes.value[0] || null);
    const selectedEdge = computed(() =>
      state.selected?.type === 'edge' ? state.selected.item : null
    );
    const selectedLine = computed(() =>
      state.selected?.type === 'line' ? state.selected.item : null
    );

    function syncLineHandles(line) {
      if (!line) {
        state.lineHandles = null;
        return;
      }
      const start = line.start || { x: 0, y: 0 };
      const end = line.end || { x: 0, y: 0 };
      state.lineHandles = {
        start: { x: Number(start.x) || 0, y: Number(start.y) || 0 },
        end: { x: Number(end.x) || 0, y: Number(end.y) || 0 },
      };
    }

    watch(
      () => {
        const line = selectedLine.value;
        if (!line) {
          return null;
        }
        return [line.id, line.start?.x, line.start?.y, line.end?.x, line.end?.y];
      },
      () => {
        if (selectedLine.value) {
          syncLineHandles(selectedLine.value);
        } else {
          syncLineHandles(null);
        }
      },
      { immediate: true }
    );

    watch(
      () => selectedNodes.value.map(node => `${node.id}:${node.x}:${node.y}`),
      () => {
        if (state.spacingMeasureActive) {
          state.spacingMeasurements = computeSelectionSpacingPairs();
          renderer.value?.draw();
        }
      }
    );

    function computeSelectionSpacingPairs() {
      if (!renderer.value) {
        return null;
      }
      const nodes = selectedNodes.value;
      if (!Array.isArray(nodes) || nodes.length < 2) {
        return null;
      }
      const boundsList = nodes
        .map(node => renderer.value?.getNodeBounds(node))
        .filter(Boolean);
      if (boundsList.length < 2) {
        return null;
      }
      boundsList.sort((a, b) => a.left - b.left);
      const entries = [];
      for (let index = 0; index < boundsList.length - 1; index += 1) {
        const current = boundsList[index];
        const next = boundsList[index + 1];
        if (!current || !next) continue;
        const gap = next.left - current.right;
        if (!Number.isFinite(gap) || gap < 0.5) {
          continue;
        }
        const baseline = Math.max(current.bottom, next.bottom) + 12;
        entries.push({
          axis: 'x',
          from: { x: current.right, y: baseline },
          to: { x: next.left, y: baseline },
          gap,
          label: `${Math.round(gap)}px`,
        });
      }
      return entries.length ? entries : null;
    }

    function updateSpacingMeasurement(active) {
      if (!active) {
        state.spacingMeasureActive = false;
        state.spacingMeasurements = null;
        renderer.value?.draw();
        return;
      }
      state.spacingMeasureActive = true;
      state.spacingMeasurements = computeSelectionSpacingPairs();
      renderer.value?.draw();
    }

    const inspectorVisible = computed(() => {
      const type = state.selected?.type;
      return type === 'node' || type === 'edge' || type === 'line' || type === 'text';
    });
    const nodeToolbarState = reactive({
      activePopover: null,
      hoveredOption: null,
      fillCustomColor: '#f8fafc',
      strokeCustomColor: '#94a3b8',
    });
    const edgeToolbarState = reactive({
      activePopover: null,
      hoveredOption: null,
      customColor: '#94a3b8',
    });
    const matrixImport = reactive({
      visible: false,
      fileName: '',
      data: [],
      values: [],
      colorMap: {},
    });
    const matrixImportQueue = reactive([]);
    const matrixPrompt = reactive({
      visible: false,
      text: '',
      error: '',
    });
    const matrixPromptTextAreaRef = ref(null);
    const DEFAULT_MATRIX_ZERO_COLOR = '#7d7d7d';
    const DEFAULT_MATRIX_ONE_COLOR = '#000000';
    const defaultMatrixPalette = [
      '#0f172a',
      '#f8fafc',
      '#38bdf8',
      '#f97316',
      '#facc15',
      '#22c55e',
      '#ef4444',
      '#a855f7',
      '#6366f1',
      '#14b8a6',
    ];
    const defaultFillSwatches = [
      '#f97316',
      '#fbbf24',
      '#34d399',
      '#38bdf8',
      '#a855f7',
      '#f87171',
      '#fef3c7',
      '#bbf7d0',
      '#bae6fd',
      '#c7d2fe',
      '#fde68a',
      '#fbcfe8',
    ];
    const defaultStrokeSwatches = [
      '#1f2937',
      '#334155',
      '#475569',
      '#94a3b8',
      '#0ea5e9',
      '#22c55e',
      '#f97316',
      '#eab308',
      '#7c3aed',
      '#ef4444',
    ];
    const customSwatches = reactive({
      fill: [],
      stroke: [],
    });
    const recentColors = reactive([]);
    const MAX_RECENT_COLORS = 6;
    const nodeFillPalette = computed(() => [
      ...defaultFillSwatches,
      ...customSwatches.fill.filter(Boolean),
    ]);
    const nodeStrokePalette = computed(() => [
      ...defaultStrokeSwatches,
      ...customSwatches.stroke.filter(Boolean),
    ]);
    const recentColorPalette = computed(() => [...recentColors]);
    const nodeToolbarLabels = {
      fill: 'Fill color',
      stroke: 'Border color',
      borderWidth: 'Border width',
      fontSize: 'Font size',
      shape: 'Node shape',
      copy: 'Copy formatting',
      paste: 'Paste formatting',
      cornerRadius: 'Corner radius',
      remove: 'Remove node',
    };
    const edgeToolbarLabels = {
      color: 'Edge color',
      style: 'Edge style',
      direction: 'Arrow direction',
      thickness: 'Edge thickness',
      alignment: 'Label alignment',
      copy: 'Copy formatting',
      paste: 'Paste formatting',
      remove: 'Remove edge',
    };
    const fontSizeOptions = ['12', '14', '16', '18', '20', '24', '28', '32', '36'].map(value => ({
      value,
      label: `${value} px`,
    }));
    const nodeToolbarHint = computed(() => {
      if (nodeToolbarState.hoveredOption) {
        return nodeToolbarLabels[nodeToolbarState.hoveredOption] || '';
      }
      if (nodeToolbarState.activePopover) {
        return nodeToolbarLabels[nodeToolbarState.activePopover] || '';
      }
      return '';
    });
    const edgeToolbarHint = computed(() => {
      const showAlignmentReminder =
        (edgeToolbarState.hoveredOption === 'alignment' ||
          edgeToolbarState.activePopover === 'alignment') &&
        !hasSelectedEdgeLabel.value;
      if (showAlignmentReminder) {
        return 'Add a label to the edge to adjust alignment.';
      }
      if (edgeToolbarState.hoveredOption) {
        return edgeToolbarLabels[edgeToolbarState.hoveredOption] || '';
      }
      if (edgeToolbarState.activePopover) {
        return edgeToolbarLabels[edgeToolbarState.activePopover] || '';
      }
      return '';
    });
    const contextMenuStyle = computed(() => ({
      left: `${contextMenu.x}px`,
      top: `${contextMenu.y}px`,
    }));
    const canCopySelection = computed(() => {
      const current = state.selected;
      if (!current) {
        return false;
      }
      if (current.type === 'node') {
        return selectedNodes.value.length > 0;
      }
      if (current.type === 'text') {
        return !!current.item;
      }
      if (current.type === 'matrix') {
        return !!current.item;
      }
      return false;
    });
    const canCutSelection = canCopySelection;
    const canDuplicateSelection = canCopySelection;
    const canPasteClipboard = computed(() => !!clipboard.value);
    const nodeToolbarStyle = computed(() => {
      const node = selectedNode.value;
      state.camera.offsetX;
      state.camera.offsetY;
      state.camera.scale;
      if (!node || !renderer.value?.getNodeBounds || !renderer.value?.worldToScreen) {
        return {};
      }
      const bounds = renderer.value.getNodeBounds(node);
      if (!bounds) {
        return {};
      }
      const anchor = renderer.value.worldToScreen(bounds.right, bounds.top);
      const spacing = 16;
      return {
        left: `${anchor.x + spacing}px`,
        top: `${anchor.y - spacing}px`,
      };
    });
    const edgeToolbarStyle = computed(() => {
      const edge = selectedEdge.value;
      state.camera.offsetX;
      state.camera.offsetY;
      state.camera.scale;
      if (!edge || !renderer.value?.getEdgeGeometry || !renderer.value?.worldToScreen) {
        return {};
      }
      const geometry = renderer.value.getEdgeGeometry(edge);
      if (!geometry) {
        return {};
      }
      const points = [];
      if (geometry.startPoint) points.push(geometry.startPoint);
      if (geometry.endPoint) points.push(geometry.endPoint);
      if (geometry.control) points.push(geometry.control);
      if (geometry.elbow) points.push(geometry.elbow);
      if (geometry.labelPoint) points.push(geometry.labelPoint);
      if (Array.isArray(geometry.segments)) {
        geometry.segments.forEach(segment => {
          if (segment?.start) points.push(segment.start);
          if (segment?.end) points.push(segment.end);
        });
      }
      if (!points.length) {
        return {};
      }
      const maxX = Math.max(...points.map(point => point.x));
      const minY = Math.min(...points.map(point => point.y));
      const anchor = renderer.value.worldToScreen(maxX, minY);
      const spacing = 16;
      return {
        left: `${anchor.x + spacing}px`,
        top: `${anchor.y - spacing}px`,
      };
    });
    const canSubmitMatrixPrompt = computed(() => {
      if (!matrixPrompt.visible) {
        return false;
      }
      return matrixPrompt.text.trim().length > 0;
    });
    const canConfirmMatrixImport = computed(() => {
      if (!matrixImport.visible) {
        return false;
      }
      if (!matrixImport.values.length) {
        return false;
      }
      return matrixImport.values.every(value => {
        const color = matrixImport.colorMap[value];
        return typeof color === 'string' && color.trim().length > 0;
      });
    });
    const canPasteFormatting = computed(() => {
      const payload = formatClipboard.value;
      if (!payload) {
        return false;
      }
      if (payload.type === 'node') {
        return !!selectedNode.value;
      }
      if (payload.type === 'edge') {
        return !!selectedEdge.value;
      }
      if (payload.type === 'line') {
        return !!selectedLine.value;
      }
      return false;
    });
    const canCopyFormatting = computed(
      () => !!selectedNode.value || !!selectedEdge.value || !!selectedLine.value
    );

const templates = [
      {
        id: 'blank-canvas',
        name: 'Blank canvas',
        description: 'Clear the editor and start a new diagram from scratch.',
        previewImage: 'img/templates/blank.png', // <-- Adicione um caminho de imagem se desejar
        nodes: [],
        edges: [],
        textBlocks: [],
      },
      {
        id: 'linear-flow',
        name: 'Linear step flow',
        description: 'Template with three sequential stages for simple flows.',
        previewImage: 'img/templates/linear-flow.png', // <-- Adicione um caminho de imagem se desejar
        nodes: [
          {
            id: 'tpl-linear-start',
            label: 'Initial idea',
            color: '#bae6fd',
            shape: 'rectangle',
            fontSize: '16',
            x: 260,
            y: 220,
          },
          {
            id: 'tpl-linear-review',
            label: 'Review and adjust',
            color: '#fef3c7',
            shape: 'rectangle',
            fontSize: '16',
            x: 520,
            y: 220,
          },
          {
            id: 'tpl-linear-delivery',
            label: 'Final delivery',
            color: '#bbf7d0',
            shape: 'rectangle',
            fontSize: '16',
            x: 780,
            y: 220,
          },
        ],
        edges: [
          {
            id: 'tpl-linear-e1',
            from: 'tpl-linear-start',
            to: 'tpl-linear-review',
            fromAnchor: 'east',
            toAnchor: 'west',
            style: 'solid',
            direction: '->',
            shape: 'straight',
            bend: 30,
            label: { text: 'Plan', position: 'auto' },
          },
          {
            id: 'tpl-linear-e2',
            from: 'tpl-linear-review',
            to: 'tpl-linear-delivery',
            fromAnchor: 'east',
            toAnchor: 'west',
            style: 'solid',
            direction: '->',
            shape: 'straight',
            bend: 30,
            label: { text: 'Execute', position: 'auto' },
          },
        ],
        textBlocks: [
          {
            id: 'tpl-linear-note',
            x: 240,
            y: 320,
            width: 360,
            height: 120,
            text: 'Use this flow to quickly document simple pipelines. Double-click to adapt the labels.',
            fontSize: 16,
            fontWeight: 500,
          },
        ],
      },
      {
        id: 'decision-tree',
        name: 'Decision tree',
        description: 'Branched structure with a decision and two outcomes.',
        previewImage: 'img/templates/decision-tree.png', // <-- Adicione um caminho de imagem se desejar
        nodes: [
          {
            id: 'tpl-decision-start',
            label: 'Current situation',
            color: '#e0f2fe',
            shape: 'circle',
            fontSize: '16',
            x: 360,
            y: 220,
          },
          {
            id: 'tpl-decision-choice',
            label: 'Make a decision?',
            color: '#fde68a',
            shape: 'decision',
            fontSize: '16',
            x: 560,
            y: 220,
          },
          {
            id: 'tpl-decision-yes',
            label: 'Positive outcome',
            color: '#bbf7d0',
            shape: 'rectangle',
            fontSize: '16',
            x: 760,
            y: 140,
          },
          {
            id: 'tpl-decision-no',
            label: 'Alternative plan',
            color: '#fecdd3',
            shape: 'rectangle',
            fontSize: '16',
            x: 760,
            y: 300,
          },
        ],
        edges: [
          {
            id: 'tpl-decision-e1',
            from: 'tpl-decision-start',
            to: 'tpl-decision-choice',
            fromAnchor: 'east',
            toAnchor: 'west',
            style: 'solid',
            direction: '->',
            shape: 'straight',
            bend: 30,
            label: null,
          },
          {
            id: 'tpl-decision-e2',
            from: 'tpl-decision-choice',
            to: 'tpl-decision-yes',
            fromAnchor: 'north',
            toAnchor: 'west',
            style: 'solid',
            direction: '->',
            shape: '90-horizontal',
            bend: 30,
            label: { text: 'Yes', position: 'auto' },
          },
          {
            id: 'tpl-decision-e3',
            from: 'tpl-decision-choice',
            to: 'tpl-decision-no',
            fromAnchor: 'south',
            toAnchor: 'west',
            style: 'solid',
            direction: '->',
            shape: '90-horizontal',
            bend: 30,
            label: { text: 'No', position: 'auto' },
          },
        ],
        textBlocks: [],
      },
      {
        id: 'pseudoentropy-views',
        name: 'Pseudoentropy: classical views',
        description: 'Diagram comparing the views of Yao, Hill, and Metric.',
        previewImage: 'img/templates/pseudoentropy.png', // <-- Adicione um caminho de imagem se desejar
        nodes: [
          {
            id: 'tpl-pseudo-source',
            label: "Probability distribution\n'X'",
            color: '#f0f0f0',
            shape: 'rectangle',
            fontSize: '16',
            x: 220,
            y: 260,
          },
          {
            id: 'tpl-pseudo-goal',
            label: 'What is the adversary\'s goal?',
            color: '#ffe6cc',
            shape: 'diamond',
            fontSize: '16',
            x: 500,
            y: 260,
          },
          {
            id: 'tpl-pseudo-yao',
            label: 'YAO\'s view\n(Pseudoentropy via Compression)\nAttacker: Constructive',
            color: '#e6e6ff',
            shape: 'rectangle',
            fontSize: '16',
            x: 780,
            y: 180,
          },
          {
            id: 'tpl-pseudo-choice',
            label: 'Comparison:\nONE vs. SET?',
            color: '#ffe6cc',
            shape: 'diamond',
            fontSize: '16',
            x: 780,
            y: 340,
          },
          {
            id: 'tpl-pseudo-hill',
            label: 'HILL\'s view\n(Pseudoentropy via Indistinguishability)\nAttacker: Decision',
            color: '#e6e6ff',
            shape: 'rectangle',
            fontSize: '16',
            x: 1060,
            y: 240,
          },
          {
            id: 'tpl-pseudo-metric',
            label: 'METRIC view\n(Pseudoentropy via Metric)\nAttacker: Decision',
            color: '#e6e6ff',
            shape: 'rectangle',
            fontSize: '16',
            x: 1060,
            y: 400,
          },
        ],
        edges: [
          {
            id: 'tpl-pseudo-e1',
            from: 'tpl-pseudo-source',
            to: 'tpl-pseudo-goal',
            fromAnchor: 'east',
            toAnchor: 'west',
            style: 'solid',
            direction: '->',
            shape: 'straight',
            bend: 30,
            label: null,
          },
          {
            id: 'tpl-pseudo-e2',
            from: 'tpl-pseudo-goal',
            to: 'tpl-pseudo-yao',
            fromAnchor: 'north',
            toAnchor: 'west',
            style: 'solid',
            direction: '->',
            shape: '90-vertical',
            bend: 30,
            label: { text: 'COMPRESS', position: 'auto' },
          },
          {
            id: 'tpl-pseudo-e3',
            from: 'tpl-pseudo-goal',
            to: 'tpl-pseudo-choice',
            fromAnchor: 'south',
            toAnchor: 'west',
            style: 'solid',
            direction: '->',
            shape: '90-horizontal',
            bend: 30,
            label: { text: 'DISTINGUISH', position: 'auto' },
          },
          {
            id: 'tpl-pseudo-e4',
            from: 'tpl-pseudo-choice',
            to: 'tpl-pseudo-hill',
            fromAnchor: 'east',
            toAnchor: 'west',
            style: 'solid',
            direction: '->',
            shape: 'straight',
            bend: 30,
            label: { text: 'Against ONE', position: 'auto' },
          },
          {
            id: 'tpl-pseudo-e5',
            from: 'tpl-pseudo-choice',
            to: 'tpl-pseudo-metric',
            fromAnchor: 'south',
            toAnchor: 'west',
            style: 'solid',
            direction: '->',
            shape: '90-horizontal',
            bend: 30,
            label: { text: 'Against the SET', position: 'auto' },
          },
          {
            id: 'tpl-pseudo-e6',
            from: 'tpl-pseudo-hill',
            to: 'tpl-pseudo-metric',
            fromAnchor: 'south',
            toAnchor: 'north',
            style: 'dashed',
            direction: '->',
            shape: 'straight',
            bend: 30,
            label: { text: 'implies', position: 'auto' },
          },
          {
            id: 'tpl-pseudo-e7',
            from: 'tpl-pseudo-metric',
            to: 'tpl-pseudo-yao',
            fromAnchor: 'north',
            toAnchor: 'south',
            style: 'dashed',
            direction: '->',
            shape: 'straight',
            bend: 30,
            label: { text: 'implies', position: 'auto' },
          },
        ],
        textBlocks: [],
      },
      {
        "id": "compressibility-illustration-bits",
        "name": "Compressibility Illustration (Bits)",
        "description": "Illustrates compressibility of patterned (low-entropy) vs. random-like (high-entropy) bit sequences.",
        "previewImage": "img/templates/compressibility.png",
        "nodes": [
          {
            "id": "node-seq-pattern",
            "x": 250,
            "y": 150,
            "label": "00000000\n11111111",
            "color": "#f8fafc",
            "borderColor": "#94a3b8",
            "shape": "rectangle",
            "size": { "width": 140, "height": 70 },
            "fontSize": "14",
            "borderWidth": 2,
            "borderStyle": "solid",
            "cornerRadius": 8,
            "opacity": 1
          },
          {
            "id": "node-comp-pattern",
            "x": 550,
            "y": 150,
            "label": "Comprimido\n(Bem menor)",
            "color": "#f8fafc",
            "borderColor": "#94a3b8",
            "shape": "rectangle",
            "size": { "width": 120, "height": 70 },
            "fontSize": "14",
            "borderWidth": 2,
            "borderStyle": "dashed",
            "cornerRadius": 8,
            "opacity": 1
          },
          {
            "id": "node-seq-random",
            "x": 250,
            "y": 350,
            "label": "10110010\n01101001",
            "color": "#f8fafc",
            "borderColor": "#94a3b8",
            "shape": "rectangle",
            "size": { "width": 140, "height": 70 },
            "fontSize": "14",
            "borderWidth": 2,
            "borderStyle": "solid",
            "cornerRadius": 8,
            "opacity": 1
          },
          {
            "id": "node-comp-random",
            "x": 550,
            "y": 350,
            "label": "Comprimido\n(Tamanho similar)",
            "color": "#f8fafc",
            "borderColor": "#94a3b8",
            "shape": "rectangle",
            "size": { "width": 140, "height": 70 },
            "fontSize": "14",
            "borderWidth": 2,
            "borderStyle": "dashed",
            "cornerRadius": 8,
            "opacity": 1
          }
        ],
        "edges": [
          {
            "id": "edge-compress-pattern",
            "from": "node-seq-pattern",
            "to": "node-comp-pattern",
            "fromAnchor": "east",
            "toAnchor": "west",
            "style": "solid",
            "direction": "->",
            "shape": "straight",
            "bend": 30,
            "label": { "text": "Compressão", "position": "auto" },
            "color": "#94a3b8",
            "thickness": 2.5
          },
          {
            "id": "edge-compress-random",
            "from": "node-seq-random",
            "to": "node-comp-random",
            "fromAnchor": "east",
            "toAnchor": "west",
            "style": "solid",
            "direction": "->",
            "shape": "straight",
            "bend": 30,
            "label": { "text": "Compressão", "position": "auto" },
            "color": "#94a3b8",
            "thickness": 2.5
          }
        ],
        "lines": [],
        "textBlocks": [
          {
            "id": "text-label-pattern",
            "x": 170,
            "y": 205,
            "width": 160,
            "height": 60,
            "text": "Sequência Compressível\n(Baixa Entropia / Padrão)",
            "fontSize": 13,
            "fontWeight": 500,
            "color": null,
            "fillColor": null,
            "borderColor": null,
            "borderWidth": 0,
            "borderStyle": "solid",
            "showBackground": false,
            "opacity": 1
          },
          {
            "id": "text-label-random",
            "x": 170,
            "y": 405,
            "width": 160,
            "height": 60,
            "text": "Sequência Incompressível\n(Alta Entropia / Aleatória)",
            "fontSize": 13,
            "fontWeight": 500,
            "color": null,
            "fillColor": null,
            "borderColor": null,
            "borderWidth": 0,
            "borderStyle": "solid",
            "showBackground": false,
            "opacity": 1
          }
        ],
        "matrixGrids": [],
        "frame": null,
        "edgeThickness": 2.5,
        "edgeLabelAlignment": "auto"
      },
      {
  "id": "graph-drawing-taxonomy",
  "name": "Taxonomia de Desenho de Grafos",
  "description": "Um fluxograma mostrando diferentes abordagens para o desenho de grafos.",
  "previewImage": null,
  "nodes": [
    {
      "id": "n-root",
      "x": 50,
      "y": 400,
      "label": "Desenho\nde grafos",
      "color": "#e5e7eb",
      "borderColor": "#94a3b8",
      "shape": "rectangle",
      "size": { "width": 120, "height": 70 },
      "fontSize": "14",
      "borderWidth": 2,
      "borderStyle": "solid",
      "cornerRadius": 8,
      "opacity": 1
    },
    {
      "id": "n-geral",
      "x": 250,
      "y": 200,
      "label": "Caso geral",
      "color": "#e5e7eb",
      "borderColor": "#94a3b8",
      "shape": "rectangle",
      "size": { "width": 120, "height": 70 },
      "fontSize": "14",
      "borderWidth": 2,
      "borderStyle": "solid",
      "cornerRadius": 8,
      "opacity": 1
    },
    {
      "id": "n-especificos",
      "x": 250,
      "y": 600,
      "label": "Casos\nespecíficos",
      "color": "#e5e7eb",
      "borderColor": "#94a3b8",
      "shape": "rectangle",
      "size": { "width": 120, "height": 70 },
      "fontSize": "14",
      "borderWidth": 2,
      "borderStyle": "solid",
      "cornerRadius": 8,
      "opacity": 1
    },
    {
      "id": "n-forca",
      "x": 450,
      "y": 100,
      "label": "Baseados\nem força",
      "color": "#e5e7eb",
      "borderColor": "#94a3b8",
      "shape": "rectangle",
      "size": { "width": 120, "height": 70 },
      "fontSize": "14",
      "borderWidth": 2,
      "borderStyle": "solid",
      "cornerRadius": 8,
      "opacity": 1
    },
    {
      "id": "n-reducao",
      "x": 450,
      "y": 200,
      "label": "Redução\nMultidimensional",
      "color": "#e5e7eb",
      "borderColor": "#94a3b8",
      "shape": "rectangle",
      "size": { "width": 140, "height": 70 },
      "fontSize": "14",
      "borderWidth": 2,
      "borderStyle": "solid",
      "cornerRadius": 8,
      "opacity": 1
    },
    {
      "id": "n-multinivel",
      "x": 450,
      "y": 300,
      "label": "Multinível",
      "color": "#e5e7eb",
      "borderColor": "#94a3b8",
      "shape": "rectangle",
      "size": { "width": 120, "height": 50 },
      "fontSize": "14",
      "borderWidth": 2,
      "borderStyle": "solid",
      "cornerRadius": 8,
      "opacity": 1
    },
    {
      "id": "n-dags",
      "x": 450,
      "y": 500,
      "label": "DAGs",
      "color": "#e5e7eb",
      "borderColor": "#94a3b8",
      "shape": "rectangle",
      "size": { "width": 120, "height": 50 },
      "fontSize": "14",
      "borderWidth": 2,
      "borderStyle": "solid",
      "cornerRadius": 8,
      "opacity": 1
    },
    {
      "id": "n-planares",
      "x": 450,
      "y": 600,
      "label": "Planares",
      "color": "#e5e7eb",
      "borderColor": "#94a3b8",
      "shape": "rectangle",
      "size": { "width": 120, "height": 50 },
      "fontSize": "14",
      "borderWidth": 2,
      "borderStyle": "solid",
      "cornerRadius": 8,
      "opacity": 1
    },
    {
      "id": "n-arvores",
      "x": 450,
      "y": 700,
      "label": "Árvores",
      "color": "#e5e7eb",
      "borderColor": "#94a3b8",
      "shape": "rectangle",
      "size": { "width": 120, "height": 50 },
      "fontSize": "14",
      "borderWidth": 2,
      "borderStyle": "solid",
      "cornerRadius": 8,
      "opacity": 1
    },
    {
      "id": "n-elastico",
      "x": 650,
      "y": 50,
      "label": "Elástico-\nElétrico",
      "color": "#e5e7eb",
      "borderColor": "#94a3b8",
      "shape": "rectangle",
      "size": { "width": 120, "height": 70 },
      "fontSize": "14",
      "borderWidth": 2,
      "borderStyle": "solid",
      "cornerRadius": 8,
      "opacity": 1
    },
    {
      "id": "n-energia",
      "x": 650,
      "y": 150,
      "label": "Energia",
      "color": "#e5e7eb",
      "borderColor": "#94a3b8",
      "shape": "rectangle",
      "size": { "width": 120, "height": 50 },
      "fontSize": "14",
      "borderWidth": 2,
      "borderStyle": "solid",
      "cornerRadius": 8,
      "opacity": 1
    },
    {
      "id": "n-mds-metrico",
      "x": 650,
      "y": 210,
      "label": "MDS\nMétrico",
      "color": "#e5e7eb",
      "borderColor": "#94a3b8",
      "shape": "rectangle",
      "size": { "width": 120, "height": 50 },
      "fontSize": "14",
      "borderWidth": 2,
      "borderStyle": "solid",
      "cornerRadius": 8,
      "opacity": 1
    },
    {
      "id": "n-mds-classico",
      "x": 650,
      "y": 270,
      "label": "MDS\nClássico",
      "color": "#e5e7eb",
      "borderColor": "#94a3b8",
      "shape": "rectangle",
      "size": { "width": 120, "height": 50 },
      "fontSize": "14",
      "borderWidth": 2,
      "borderStyle": "solid",
      "cornerRadius": 8,
      "opacity": 1
    },
    {
      "id": "n-hu",
      "x": 650,
      "y": 330,
      "label": "Hu",
      "color": "#fef9c3",
      "borderColor": "#fde047",
      "shape": "rectangle",
      "size": { "width": 120, "height": 50 },
      "fontSize": "14",
      "borderWidth": 2,
      "borderStyle": "solid",
      "cornerRadius": 8,
      "opacity": 1
    },
    {
      "id": "n-walshaw",
      "x": 650,
      "y": 390,
      "label": "Walshaw",
      "color": "#dbeafe",
      "borderColor": "#93c5fd",
      "shape": "rectangle",
      "size": { "width": 120, "height": 50 },
      "fontSize": "14",
      "borderWidth": 2,
      "borderStyle": "solid",
      "cornerRadius": 8,
      "opacity": 1
    },
    {
      "id": "n-sugiyama",
      "x": 650,
      "y": 500,
      "label": "Sugiyama",
      "color": "#dbeafe",
      "borderColor": "#93c5fd",
      "shape": "rectangle",
      "size": { "width": 120, "height": 50 },
      "fontSize": "14",
      "borderWidth": 2,
      "borderStyle": "solid",
      "cornerRadius": 8,
      "opacity": 1
    },
    {
      "id": "n-tutte",
      "x": 650,
      "y": 570,
      "label": "Tutte",
      "color": "#dbeafe",
      "borderColor": "#93c5fd",
      "shape": "rectangle",
      "size": { "width": 120, "height": 50 },
      "fontSize": "14",
      "borderWidth": 2,
      "borderStyle": "solid",
      "cornerRadius": 8,
      "opacity": 1
    },
    {
      "id": "n-schnyder",
      "x": 650,
      "y": 630,
      "label": "Schnyder",
      "color": "#dbeafe",
      "borderColor": "#93c5fd",
      "shape": "rectangle",
      "size": { "width": 120, "height": 50 },
      "fontSize": "14",
      "borderWidth": 2,
      "borderStyle": "solid",
      "cornerRadius": 8,
      "opacity": 1
    },
    {
      "id": "n-planet",
      "x": 650,
      "y": 690,
      "label": "PLANET",
      "color": "#dbeafe",
      "borderColor": "#93c5fd",
      "shape": "rectangle",
      "size": { "width": 120, "height": 50 },
      "fontSize": "14",
      "borderWidth": 2,
      "borderStyle": "solid",
      "cornerRadius": 8,
      "opacity": 1
    },
    {
      "id": "n-reingold",
      "x": 650,
      "y": 750,
      "label": "Reingold\n& Tilford",
      "color": "#dbeafe",
      "borderColor": "#93c5fd",
      "shape": "rectangle",
      "size": { "width": 120, "height": 70 },
      "fontSize": "14",
      "borderWidth": 2,
      "borderStyle": "solid",
      "cornerRadius": 8,
      "opacity": 1
    },
    {
      "id": "n-eades",
      "x": 850,
      "y": -30,
      "label": "Eades",
      "color": "#dbeafe",
      "borderColor": "#93c5fd",
      "shape": "rectangle",
      "size": { "width": 160, "height": 50 },
      "fontSize": "14",
      "borderWidth": 2,
      "borderStyle": "solid",
      "cornerRadius": 8,
      "opacity": 1
    },
    {
      "id": "n-fruchterman",
      "x": 850,
      "y": 30,
      "label": "Fruchterman\n& Reingold",
      "color": "#fef9c3",
      "borderColor": "#fde047",
      "shape": "rectangle",
      "size": { "width": 160, "height": 70 },
      "fontSize": "14",
      "borderWidth": 2,
      "borderStyle": "solid",
      "cornerRadius": 8,
      "opacity": 1
    },
    {
      "id": "n-bigangle",
      "x": 850,
      "y": 110,
      "label": "BIGANGLE",
      "color": "#fef9c3",
      "borderColor": "#fde047",
      "shape": "rectangle",
      "size": { "width": 160, "height": 50 },
      "fontSize": "14",
      "borderWidth": 2,
      "borderStyle": "solid",
      "cornerRadius": 8,
      "opacity": 1
    },
    {
      "id": "n-kamada",
      "x": 850,
      "y": 170,
      "label": "Kamada &\nKawai",
      "color": "#dbeafe",
      "borderColor": "#93c5fd",
      "shape": "rectangle",
      "size": { "width": 160, "height": 70 },
      "fontSize": "14",
      "borderWidth": 2,
      "borderStyle": "solid",
      "cornerRadius": 8,
      "opacity": 1
    },
    {
      "id": "n-forceatlas",
      "x": 850,
      "y": 250,
      "label": "ForceAtlas2",
      "color": "#dbeafe",
      "borderColor": "#93c5fd",
      "shape": "rectangle",
      "size": { "width": 160, "height": 50 },
      "fontSize": "14",
      "borderWidth": 2,
      "borderStyle": "solid",
      "cornerRadius": 8,
      "opacity": 1
    },
    {
      "id": "n-stress",
      "x": 850,
      "y": 310,
      "label": "Stress\nMajorization",
      "color": "#dbeafe",
      "borderColor": "#93c5fd",
      "shape": "rectangle",
      "size": { "width": 160, "height": 70 },
      "fontSize": "14",
      "borderWidth": 2,
      "borderStyle": "solid",
      "cornerRadius": 8,
      "opacity": 1
    },
    {
      "id": "n-pivot",
      "x": 850,
      "y": 390,
      "label": "PivotMDS",
      "color": "#dbeafe",
      "borderColor": "#93c5fd",
      "shape": "rectangle",
      "size": { "width": 160, "height": 50 },
      "fontSize": "14",
      "borderWidth": 2,
      "borderStyle": "solid",
      "cornerRadius": 8,
      "opacity": 1
    }
  ],
  "edges": [
    {
      "id": "e-root-geral",
      "from": "n-root",
      "to": "n-geral",
      "fromAnchor": "east",
      "toAnchor": "west",
      "style": "solid",
      "direction": "->",
      "shape": "straight",
      "color": "#94a3b8",
      "thickness": 2
    },
    {
      "id": "e-root-especificos",
      "from": "n-root",
      "to": "n-especificos",
      "fromAnchor": "east",
      "toAnchor": "west",
      "style": "solid",
      "direction": "->",
      "shape": "straight",
      "color": "#94a3b8",
      "thickness": 2
    },
    {
      "id": "e-geral-forca",
      "from": "n-geral",
      "to": "n-forca",
      "fromAnchor": "east",
      "toAnchor": "west",
      "style": "solid",
      "direction": "->",
      "shape": "straight",
      "color": "#94a3b8",
      "thickness": 2
    },
    {
      "id": "e-geral-reducao",
      "from": "n-geral",
      "to": "n-reducao",
      "fromAnchor": "east",
      "toAnchor": "west",
      "style": "solid",
      "direction": "->",
      "shape": "straight",
      "color": "#94a3b8",
      "thickness": 2
    },
    {
      "id": "e-geral-multinivel",
      "from": "n-geral",
      "to": "n-multinivel",
      "fromAnchor": "east",
      "toAnchor": "west",
      "style": "solid",
      "direction": "->",
      "shape": "straight",
      "color": "#94a3b8",
      "thickness": 2
    },
    {
      "id": "e-especificos-dags",
      "from": "n-especificos",
      "to": "n-dags",
      "fromAnchor": "east",
      "toAnchor": "west",
      "style": "solid",
      "direction": "->",
      "shape": "straight",
      "color": "#94a3b8",
      "thickness": 2
    },
    {
      "id": "e-especificos-planares",
      "from": "n-especificos",
      "to": "n-planares",
      "fromAnchor": "east",
      "toAnchor": "west",
      "style": "solid",
      "direction": "->",
      "shape": "straight",
      "color": "#94a3b8",
      "thickness": 2
    },
    {
      "id": "e-especificos-arvores",
      "from": "n-especificos",
      "to": "n-arvores",
      "fromAnchor": "east",
      "toAnchor": "west",
      "style": "solid",
      "direction": "->",
      "shape": "straight",
      "color": "#94a3b8",
      "thickness": 2
    },
    {
      "id": "e-forca-elastico",
      "from": "n-forca",
      "to": "n-elastico",
      "fromAnchor": "east",
      "toAnchor": "west",
      "style": "solid",
      "direction": "->",
      "shape": "straight",
      "color": "#94a3b8",
      "thickness": 2
    },
    {
      "id": "e-forca-energia",
      "from": "n-forca",
      "to": "n-energia",
      "fromAnchor": "east",
      "toAnchor": "west",
      "style": "solid",
      "direction": "->",
      "shape": "straight",
      "color": "#94a3b8",
      "thickness": 2
    },
    {
      "id": "e-reducao-metrico",
      "from": "n-reducao",
      "to": "n-mds-metrico",
      "fromAnchor": "east",
      "toAnchor": "west",
      "style": "solid",
      "direction": "->",
      "shape": "straight",
      "color": "#94a3b8",
      "thickness": 2
    },
    {
      "id": "e-reducao-classico",
      "from": "n-reducao",
      "to": "n-mds-classico",
      "fromAnchor": "east",
      "toAnchor": "west",
      "style": "solid",
      "direction": "->",
      "shape": "straight",
      "color": "#94a3b8",
      "thickness": 2
    },
    {
      "id": "e-multinivel-hu",
      "from": "n-multinivel",
      "to": "n-hu",
      "fromAnchor": "east",
      "toAnchor": "west",
      "style": "solid",
      "direction": "->",
      "shape": "straight",
      "color": "#94a3b8",
      "thickness": 2
    },
    {
      "id": "e-multinivel-walshaw",
      "from": "n-multinivel",
      "to": "n-walshaw",
      "fromAnchor": "east",
      "toAnchor": "west",
      "style": "solid",
      "direction": "->",
      "shape": "straight",
      "color": "#94a3b8",
      "thickness": 2
    },
    {
      "id": "e-dags-sugiyama",
      "from": "n-dags",
      "to": "n-sugiyama",
      "fromAnchor": "east",
      "toAnchor": "west",
      "style": "solid",
      "direction": "->",
      "shape": "straight",
      "color": "#94a3b8",
      "thickness": 2
    },
    {
      "id": "e-planares-tutte",
      "from": "n-planares",
      "to": "n-tutte",
      "fromAnchor": "east",
      "toAnchor": "west",
      "style": "solid",
      "direction": "->",
      "shape": "straight",
      "color": "#94a3b8",
      "thickness": 2
    },
    {
      "id": "e-planares-schnyder",
      "from": "n-planares",
      "to": "n-schnyder",
      "fromAnchor": "east",
      "toAnchor": "west",
      "style": "solid",
      "direction": "->",
      "shape": "straight",
      "color": "#94a3b8",
      "thickness": 2
    },
    {
      "id": "e-planares-planet",
      "from": "n-planares",
      "to": "n-planet",
      "fromAnchor": "east",
      "toAnchor": "west",
      "style": "solid",
      "direction": "->",
      "shape": "straight",
      "color": "#94a3b8",
      "thickness": 2
    },
    {
      "id": "e-arvores-reingold",
      "from": "n-arvores",
      "to": "n-reingold",
      "fromAnchor": "east",
      "toAnchor": "west",
      "style": "solid",
      "direction": "->",
      "shape": "straight",
      "color": "#94a3b8",
      "thickness": 2
    },
    {
      "id": "e-elastico-eades",
      "from": "n-elastico",
      "to": "n-eades",
      "fromAnchor": "east",
      "toAnchor": "west",
      "style": "solid",
      "direction": "->",
      "shape": "straight",
      "color": "#94a3b8",
      "thickness": 2
    },
    {
      "id": "e-elastico-fruchterman",
      "from": "n-elastico",
      "to": "n-fruchterman",
      "fromAnchor": "east",
      "toAnchor": "west",
      "style": "solid",
      "direction": "->",
      "shape": "straight",
      "color": "#94a3b8",
      "thickness": 2
    },
    {
      "id": "e-elastico-bigangle",
      "from": "n-elastico",
      "to": "n-bigangle",
      "fromAnchor": "east",
      "toAnchor": "west",
      "style": "solid",
      "direction": "->",
      "shape": "straight",
      "color": "#94a3b8",
      "thickness": 2
    },
    {
      "id": "e-energia-kamada",
      "from": "n-energia",
      "to": "n-kamada",
      "fromAnchor": "east",
      "toAnchor":"west",
      "style": "solid",
      "direction": "->",
      "shape": "straight",
      "color": "#94a3b8",
      "thickness": 2
    },
    {
      "id": "e-energia-forceatlas",
      "from": "n-energia",
      "to": "n-forceatlas",
      "fromAnchor": "east",
      "toAnchor": "west",
      "style": "solid",
      "direction": "->",
      "shape": "straight",
      "color": "#94a3b8",
      "thickness": 2
    },
    {
      "id": "e-metrico-stress",
      "from": "n-mds-metrico",
      "to": "n-stress",
      "fromAnchor": "east",
      "toAnchor": "west",
      "style": "solid",
      "direction": "->",
      "shape": "straight",
      "color": "#94a3b8",
      "thickness": 2
    },
    {
      "id":-"e-classico-pivot",
      "from": "n-mds-classico",
      "to": "n-pivot",
      "fromAnchor": "east",
      "toAnchor": "west",
      "style": "solid",
      "direction": "->",
      "shape": "straight",
      "color": "#94a3b8",
      "thickness": 2
    }
  ],
  "lines": [],
  "textBlocks": [],
  "matrixGrids": [],
  "frame": null,
  "edgeThickness": 2,
  "edgeLabelAlignment": "auto"
}
    ];

    const canvasRef = ref(null);
    const canvasWrapperRef = ref(null);
    const diagramMenuButtonRef = ref(null);
    const diagramMenuRef = ref(null);
    const inlineEditorRef = ref(null);
    const renderer = ref(null);
    const diagramFileInputRef = ref(null);
    const feedback = ref('');
    const tikzCode = ref('');
    const previewViewportRef = ref(null);
    const previewStageRef = ref(null);
    const preview = reactive({
      srcdoc: '',
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      drag: null,
      contentWidth: 0,
      contentHeight: 0,
    });
    const previewPanelHeight = ref(360);
    const isPreviewLoading = ref(false);
    const sidebarTab = ref('code');
    const lastRenderedTikz = ref('');
    const autoUpdateTikz = ref(true);
    const tikzUpdatePending = ref(false);
    const showDiagramMenu = ref(false);
    const showFormsMenu = ref(false);
    const showEdgeThicknessMenu = ref(false);
    const showLabelAlignmentMenu = ref(false);
    const showSettingsDialog = ref(false);
    const inlineEditor = reactive({
      visible: false,
      value: '',
      left: 0,
      top: 0,
      width: 200,
      height: 64,
      type: null,
      target: null,
    });

    const inlineEditorLineMarkers = computed(() => {
      if (inlineEditor.type !== 'node') {
        return null;
      }
      const rawValue = typeof inlineEditor.value === 'string'
        ? inlineEditor.value.replace(/\r\n/g, '\n')
        : '';
      const lines = rawValue.length ? rawValue.split('\n') : [''];
      if (!lines.length) {
        lines.push('');
      }
      return lines
        .map((_, index) => (index === 0 ? `${index + 1}` : `\\\\ ${index + 1}`))
        .join('\n');
    });
    const edgeThicknessMenuButtonRef = ref(null);
    const edgeThicknessMenuRef = ref(null);
    const labelAlignmentMenuButtonRef = ref(null);
    const labelAlignmentMenuRef = ref(null);
    const formsMenuAnchorRef = ref(null);
    const formsMenuRef = ref(null);
    const viewport = ref({ width: 0, height: 0 });
    const zoomLevel = computed(() => Math.round(state.camera.scale * 100));
    const edgeThicknessDisplay = computed(() => state.edgeThickness.toFixed(1));
    const edgeThickness = computed(() => state.edgeThickness);
    const edgeLabelAlignment = computed({
      get: () => state.edgeLabelAlignment,
      set: value => {
        state.edgeLabelAlignment = value;
      },
    });
    const currentTheme = computed(() => (state.theme === 'light' ? 'light' : 'dark'));
    const hasSelectedEdgeLabel = computed(() => {
      const text = selectedEdge.value?.label?.text;
      return typeof text === 'string' && text.trim().length > 0;
    });
    const isPanningActive = computed(() => panModifierActive.value || !!state.cameraDrag);
    const frame = computed(() => state.frame);
    const MIN_ZOOM = 0.25;
    const MAX_ZOOM = 4;

    let feedbackTimeout = null;
    let resizeObserver = null;
    let previewLoadingTimeout = null;
    let pendingRenderedTikz = null;

    function flash(message) {
      feedback.value = message;
      if (feedbackTimeout) {
        clearTimeout(feedbackTimeout);
      }
      feedbackTimeout = setTimeout(() => {
        feedback.value = '';
      }, 2800);
    }

    function applyTheme(theme) {
      if (typeof document === 'undefined') {
        return;
      }
      document.documentElement.setAttribute('data-theme', theme);
      document.body.setAttribute('data-theme', theme);
    }

    function resolvePreferredTheme() {
      if (typeof window === 'undefined') {
        return null;
      }
      try {
        const stored = window.localStorage?.getItem('tikz-theme');
        if (stored === 'light' || stored === 'dark') {
          return stored;
        }
      } catch (storageError) {
        console.warn('Could not read the saved theme:', storageError);
      }
      try {
        if (window.matchMedia?.('(prefers-color-scheme: light)').matches) {
          return 'light';
        }
      } catch (matchError) {
        console.warn('Failed to query the system preferred theme:', matchError);
      }
      return null;
    }

    function setTheme(theme) {
      state.theme = theme === 'light' ? 'light' : 'dark';
    }

    const preferredTheme = resolvePreferredTheme();
    if (preferredTheme) {
      state.theme = preferredTheme;
    }

    watch(
      currentTheme,
      theme => {
        applyTheme(theme);
        try {
          window.localStorage?.setItem('tikz-theme', theme);
        } catch (storageError) {
          console.warn('Could not save the selected theme:', storageError);
        }
        renderer.value?.draw();
      },
      { immediate: true }
    );

    function normalizeHex(color) {
      if (typeof color !== 'string') {
        return null;
      }
      let value = color.trim();
      if (!value) {
        return null;
      }
      if (!value.startsWith('#')) {
        value = `#${value}`;
      }
      if (/^#[0-9a-fA-F]{3}$/.test(value)) {
        value = `#${value
          .slice(1)
          .split('')
          .map(char => char + char)
          .join('')}`;
      }
      if (/^#[0-9a-fA-F]{6}$/.test(value)) {
        return value.toLowerCase();
      }
      return null;
    }

    function parseMatrixFromText(raw) {
      if (typeof raw !== 'string') {
        throw new Error('Invalid content.');
      }
      const lines = raw
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean);
      if (!lines.length) {
        throw new Error('The file does not contain matrix data.');
      }
      const rows = lines
        .map(line =>
          line
            .split(/[;,\s]+/)
            .map(token => token.trim())
            .filter(Boolean)
        )
        .filter(cells => cells.length > 0);
      if (!rows.length) {
        throw new Error('The file does not contain matrix data.');
      }
      const columnCount = rows[0].length;
      const inconsistent = rows.some(row => row.length !== columnCount);
      if (inconsistent) {
        throw new Error('All rows must have the same number of columns.');
      }
      return rows.map(row => row.map(value => value));
    }

    function clearMatrixImportQueue() {
      matrixImportQueue.length = 0;
    }

    function resetMatrixImportState() {
      matrixImport.visible = false;
      matrixImport.fileName = '';
      matrixImport.data = [];
      matrixImport.values = [];
      matrixImport.colorMap = {};
    }

    function loadNextMatrixFromQueue() {
      if (!matrixImportQueue.length) {
        resetMatrixImportState();
        return;
      }
      const next = matrixImportQueue.shift();
      const cloned = next.data.map(row => [...row]);
      matrixImport.data = cloned;
      const valueSet = new Set();
      cloned.forEach(row => {
        row.forEach(cell => {
          valueSet.add(String(cell));
        });
      });
      const sortedValues = Array.from(valueSet).sort((a, b) =>
        a.localeCompare(b, 'pt-BR', { numeric: true })
      );
      let paletteIndex = 0;
      const colorMap = sortedValues.reduce((acc, value) => {
        if (value === '0') {
          acc[value] = DEFAULT_MATRIX_ZERO_COLOR;
          return acc;
        }
        if (value === '1') {
          acc[value] = DEFAULT_MATRIX_ONE_COLOR;
          return acc;
        }
        acc[value] = defaultMatrixPalette[paletteIndex % defaultMatrixPalette.length];
        paletteIndex += 1;
        return acc;
      }, {});
      matrixImport.values = sortedValues;
      matrixImport.colorMap = colorMap;
      matrixImport.fileName = next.fileName || '';
      matrixImport.visible = true;
    }

    function queueMatrixImports(entries, { replaceQueue = false } = {}) {
      if (!Array.isArray(entries) || !entries.length) {
        return 0;
      }
      if (replaceQueue) {
        clearMatrixImportQueue();
        resetMatrixImportState();
      }
      let enqueued = 0;
      entries.forEach(entry => {
        const rawData = Array.isArray(entry.data)
          ? entry.data.map(row =>
              Array.isArray(row) ? row.map(cell => String(cell)) : []
            )
          : [];
        if (!rawData.length) {
          return;
        }
        const columnCount = rawData[0]?.length || 0;
        if (!columnCount) {
          return;
        }
        const consistent = rawData.every(row => row.length === columnCount);
        if (!consistent) {
          return;
        }
        matrixImportQueue.push({
          data: rawData.map(row => [...row]),
          fileName: entry.fileName || '',
        });
        enqueued += 1;
      });
      if (!matrixImport.visible && enqueued > 0) {
        loadNextMatrixFromQueue();
      }
      return enqueued;
    }

    function prepareMatrixImport(data, fileName, options = {}) {
      return queueMatrixImports([{ data, fileName }], options);
    }

    function updateMatrixImportColor(value, color) {
      const normalized = normalizeHex(color);
      if (!normalized) {
        return;
      }
      matrixImport.colorMap = {
        ...matrixImport.colorMap,
        [value]: normalized,
      };
    }

    function normalizeMatrixGrid(grid = {}) {
      const rawData = Array.isArray(grid.data)
        ? grid.data
            .map(row => (Array.isArray(row) ? row.map(cell => String(cell)) : []))
            .filter(row => row.length > 0)
        : [];
      const columnCount = rawData[0]?.length || 0;
      const data =
        columnCount > 0
          ? rawData.filter(row => row.length === columnCount).map(row => [...row])
          : [];
      const colorMap =
        grid.colorMap && typeof grid.colorMap === 'object'
          ? Object.entries(grid.colorMap).reduce((acc, [key, value]) => {
              const normalized = normalizeHex(typeof value === 'string' ? value : '');
              if (normalized) {
                acc[String(key)] = normalized;
              }
              return acc;
            }, {})
          : {};
      const cellSizeValue = Number(grid.cellSize);
      const cellSize = Number.isFinite(cellSizeValue) && cellSizeValue > 0 ? cellSizeValue : 4;
      const xValue = Number(grid.x);
      const yValue = Number(grid.y);
      return {
        id: typeof grid.id === 'string' ? grid.id : `matrix-${matrixSequence++}`,
        x: Number.isFinite(xValue) ? xValue : 0,
        y: Number.isFinite(yValue) ? yValue : 0,
        data,
        colorMap,
        cellSize,
      };
    }

    function normalizeTextBlock(block = {}, options = {}) {
      const fallbackColor =
        typeof options.defaultColor === 'string' && options.defaultColor.trim()
          ? options.defaultColor.trim()
          : '#0f172a';
      const widthValue = Number(block.width);
      const heightValue = Number(block.height);
      const fontSizeValue = Number(block.fontSize);
      const fontWeightValue = Number(block.fontWeight);
      const xValue = Number(block.x);
      const yValue = Number(block.y);
      const colorValue =
        normalizeHex(typeof block.color === 'string' ? block.color : '') || fallbackColor;
      const fillValue = normalizeHex(typeof block.fillColor === 'string' ? block.fillColor : '') || null;
      const borderColorValue =
        normalizeHex(typeof block.borderColor === 'string' ? block.borderColor : '') || '#94a3b8';
      const borderWidthValue = Number(block.borderWidth);
      const borderWidth =
        Number.isFinite(borderWidthValue) && borderWidthValue >= 0
          ? borderWidthValue
          : TEXT_BLOCK_BORDER_WIDTH_DEFAULT;
      const borderStyleOptions = new Set(['solid', 'dashed', 'dotted']);
      const rawBorderStyle =
        typeof block.borderStyle === 'string' ? block.borderStyle.toLowerCase().trim() : '';
      const borderStyle = borderStyleOptions.has(rawBorderStyle)
        ? rawBorderStyle
        : TEXT_BLOCK_BORDER_STYLE_DEFAULT;
      const opacityValue = Number(block.opacity);
      const opacity = Number.isFinite(opacityValue)
        ? Math.min(
            TEXT_BLOCK_OPACITY_RANGE.max,
            Math.max(TEXT_BLOCK_OPACITY_RANGE.min, opacityValue)
          )
        : TEXT_BLOCK_OPACITY_RANGE.max;
      return {
        id: typeof block.id === 'string' ? block.id : `text-${textSequence++}`,
        x: Number.isFinite(xValue) ? xValue : 0,
        y: Number.isFinite(yValue) ? yValue : 0,
        width: Math.max(
          TEXT_BLOCK_CONSTRAINTS.minWidth,
          Number.isFinite(widthValue) && widthValue > 0 ? widthValue : TEXT_BLOCK_DEFAULT_WIDTH
        ),
        height: Math.max(
          TEXT_BLOCK_CONSTRAINTS.minHeight,
          Number.isFinite(heightValue) && heightValue > 0 ? heightValue : TEXT_BLOCK_DEFAULT_HEIGHT
        ),
        text: typeof block.text === 'string' ? block.text : '',
        fontSize: Math.min(
          TEXT_FONT_SIZE_LIMITS.max,
          Math.max(
            TEXT_FONT_SIZE_LIMITS.min,
            Number.isFinite(fontSizeValue) && fontSizeValue > 0 ? fontSizeValue : 16
          )
        ),
        fontWeight: Number.isFinite(fontWeightValue) ? fontWeightValue : 500,
        color: colorValue,
        fillColor: fillValue,
        borderColor: borderColorValue,
        borderWidth,
        borderStyle,
        showBackground: block.showBackground === false ? false : true,
        opacity,
      };
    }

    function ensureCustomSwatch(type, color) {
      const normalized = normalizeHex(color);
      if (!normalized || !customSwatches[type]) {
        return false;
      }
      if (!customSwatches[type].includes(normalized)) {
        customSwatches[type].push(normalized);
        return true;
      }
      return false;
    }

    function registerRecentColor(color) {
      const normalized = normalizeHex(color);
      if (!normalized) {
        return;
      }
      const existingIndex = recentColors.indexOf(normalized);
      if (existingIndex !== -1) {
        recentColors.splice(existingIndex, 1);
      }
      recentColors.unshift(normalized);
      if (recentColors.length > MAX_RECENT_COLORS) {
        recentColors.length = MAX_RECENT_COLORS;
      }
    }

    function toggleNodePopover(id) {
      nodeToolbarState.activePopover = nodeToolbarState.activePopover === id ? null : id;
    }

    function setNodeToolbarHover(id) {
      nodeToolbarState.hoveredOption = id;
    }

    function applyNodeFill(color, options = {}) {
      const nodes = selectedNodes.value;
      const normalized = normalizeHex(color);
      if (!nodes.length || !normalized) {
        return;
      }
      nodeToolbarState.fillCustomColor = normalized;
      if (options.addToPalette) {
        ensureCustomSwatch('fill', normalized);
      }
      registerRecentColor(normalized);
      let changed = false;
      nodes.forEach(node => {
        const previousFill = normalizeHex(node.color) || node.color;
        if (node.shape === 'cylinder' && node.cylinderUsesCustomFill !== false) {
          const bodyValue = normalizeHex(node.cylinderBodyFill) || node.cylinderBodyFill;
          if (
            (!node.cylinderBodyFill || bodyValue === previousFill) &&
            node.cylinderBodyFill !== normalized
          ) {
            node.cylinderBodyFill = normalized;
            changed = true;
          }
          const endValue = normalizeHex(node.cylinderEndFill) || node.cylinderEndFill;
          if (
            (!node.cylinderEndFill || endValue === previousFill) &&
            node.cylinderEndFill !== normalized
          ) {
            node.cylinderEndFill = normalized;
            changed = true;
          }
        }
        if (node.color !== normalized) {
          node.color = normalized;
          changed = true;
        }
      });
      if (!changed && !options.forceCommit) {
        return;
      }
      if (!changed && !options.forceCommit) {
        return;
      }
      if (!changed && !options.forceCommit) {
        return;
      }
      if ((options.commit !== false && changed) || options.forceCommit) {
        pushHistory();
      }
      renderer.value?.draw();
      invalidateTikz();
    }

    function applyNodeBorder(color, options = {}) {
      const nodes = selectedNodes.value;
      const normalized = normalizeHex(color);
      if (!nodes.length || !normalized) {
        return;
      }
      if (options.commit === false && !options.forceCommit) {
        state.borderPreviewSuppressed = true;
      } else {
        state.borderPreviewSuppressed = false;
      }
      nodeToolbarState.strokeCustomColor = normalized;
      if (options.addToPalette) {
        ensureCustomSwatch('stroke', normalized);
      }
      registerRecentColor(normalized);
      let changed = false;
      nodes.forEach(node => {
        if (node.borderColor !== normalized) {
          node.borderColor = normalized;
          changed = true;
        }
      });
      if ((options.commit !== false && changed) || options.forceCommit) {
        pushHistory();
      }
      renderer.value?.draw();
    }

    function addCustomColor(type) {
      if (type === 'fill') {
        const added = ensureCustomSwatch('fill', nodeToolbarState.fillCustomColor);
        if (added) {
          flash('Color added to the fill palette.');
        } else {
          flash('That color is already in the palette.');
        }
      } else if (type === 'stroke') {
        const added = ensureCustomSwatch('stroke', nodeToolbarState.strokeCustomColor);
        if (added) {
          flash('Color added to the border palette.');
        } else {
          flash('That color is already in the palette.');
        }
      }
    }

    function updateNodeBorderWidth(value, options = {}) {
      const nodes = selectedNodes.value;
      if (!nodes.length) {
        return;
      }
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) {
        return;
      }
      const clamped = Math.min(Math.max(numeric, 1), 8);
      let changed = false;
      nodes.forEach(node => {
        const previous = Number(node.borderWidth) || 3;
        if (previous !== clamped) {
          node.borderWidth = clamped;
          changed = true;
        }
      });
      if ((options.commit !== false && changed) || options.forceCommit) {
        pushHistory();
      }
    }

    function updateNodeCornerRadius(value, options = {}) {
      const nodes = selectedNodes.value;
      if (!nodes.length) {
        return;
      }
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) {
        return;
      }
      const clamped = Math.min(Math.max(numeric, 0), 64);
      let changed = false;
      nodes.forEach(node => {
        const previous = Number(node.cornerRadius) || 16;
        if (previous !== clamped) {
          node.cornerRadius = clamped;
          changed = true;
        }
      });
      if ((options.commit !== false && changed) || options.forceCommit) {
        pushHistory();
      }
    }

    function updateNodeBorderStyle(style, options = {}) {
      const nodes = selectedNodes.value;
      if (!nodes.length) {
        return;
      }
      const allowed = new Set(['solid', 'dashed', 'dotted']);
      const normalized = allowed.has(style) ? style : 'solid';
      let changed = false;
      nodes.forEach(node => {
        if (node.borderStyle !== normalized) {
          node.borderStyle = normalized;
          changed = true;
        }
      });
      if ((options.commit !== false && changed) || options.forceCommit) {
        pushHistory();
      }
      if (changed) {
        renderer.value?.draw();
        invalidateTikz();
      }
    }

    function updateNodeOpacity(value, options = {}) {
      const nodes = selectedNodes.value;
      if (!nodes.length) {
        return;
      }
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) {
        return;
      }
      const ratio = Math.min(100, Math.max(0, numeric)) / 100;
      const normalized = Math.min(1, Math.max(0, ratio));
      let changed = false;
      nodes.forEach(node => {
        const currentOpacity = Number.isFinite(Number(node.opacity)) ? Number(node.opacity) : 1;
        if (Math.abs(currentOpacity - normalized) > 0.01) {
          if (normalized >= 0.99) {
            delete node.opacity;
          } else {
            node.opacity = Number(normalized.toFixed(2));
          }
          changed = true;
        }
      });
      if ((options.commit !== false && changed) || options.forceCommit) {
        pushHistory();
      }
      if (changed) {
        renderer.value?.draw();
        invalidateTikz();
      }
    }

    function getNodeSizePx(node, dimension) {
      if (!node) {
        return 0;
      }
      const size = resolveNodeSize(node);
      if (dimension === 'height') {
        return Number(size.height) || 0;
      }
      return Number(size.width) || 0;
    }

    function getNodeSizeSliderValue(node, dimension) {
      const value = getNodeSizePx(node, dimension);
      return Math.round(Number.isFinite(value) ? value : 0);
    }

    function updateNodeSize(dimension, value, options = {}) {
      const nodes = selectedNodes.value;
      if (!nodes.length) {
        return;
      }
      if (
        value == null ||
        (typeof value === 'string' && value.trim() === '')
      ) {
        return;
      }
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) {
        return;
      }
      const clamped = clampNodeSize(numeric, dimension);
      let changed = false;
      nodes.forEach(node => {
        const normalizedSize = normalizeNodeSizeForShape(node.size, node.shape);
        if (node.shape === 'circle') {
          if (normalizedSize.width !== clamped || normalizedSize.height !== clamped) {
            node.size = { width: clamped, height: clamped };
            changed = true;
          }
          return;
        }
        if (normalizedSize[dimension] !== clamped) {
          normalizedSize[dimension] = clamped;
          node.size = { width: normalizedSize.width, height: normalizedSize.height };
          changed = true;
        }
      });
      if ((options.commit !== false && changed) || options.forceCommit) {
        pushHistory();
      }
      if (changed) {
        renderer.value?.draw();
        invalidateTikz();
      }
    }

    function updateTextFontSize(value, options = {}) {
      const current = state.selected;
      if (!current || current.type !== 'text' || !current.item) {
        return;
      }
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) {
        return;
      }
      const clamped = Math.min(
        TEXT_FONT_SIZE_LIMITS.max,
        Math.max(TEXT_FONT_SIZE_LIMITS.min, numeric)
      );
      if (current.item.fontSize !== clamped) {
        current.item.fontSize = clamped;
        if (options.commit !== false || options.forceCommit) {
          pushHistory();
        }
        renderer.value?.draw();
      } else if (options.forceCommit) {
        pushHistory();
      }
      invalidateTikz();
    }

    function applyTextColor(color, options = {}) {
      const current = state.selected;
      if (!current || current.type !== 'text' || !current.item) {
        return;
      }
      const normalized = normalizeHex(color);
      if (!normalized) {
        return;
      }
      if (current.item.color !== normalized) {
        current.item.color = normalized;
        if (options.commit !== false || options.forceCommit) {
          pushHistory();
        }
        renderer.value?.draw();
      } else if (options.forceCommit) {
        pushHistory();
      }
      invalidateTikz();
    }

    function setTextBackgroundEnabled(enabled, options = {}) {
      const current = state.selected;
      if (!current || current.type !== 'text' || !current.item) {
        return;
      }
      const nextValue = Boolean(enabled);
      if (current.item.showBackground === nextValue) {
        if (options.forceCommit) {
          pushHistory();
        }
        return;
      }
      current.item.showBackground = nextValue;
      if (options.commit !== false || options.forceCommit) {
        pushHistory();
      }
      renderer.value?.draw();
      invalidateTikz();
    }

    function updateTextFillColor(color, options = {}) {
      const current = state.selected;
      if (!current || current.type !== 'text' || !current.item) {
        return;
      }
      const normalized = normalizeHex(color);
      if (!normalized) {
        return;
      }
      if (current.item.fillColor !== normalized) {
        current.item.fillColor = normalized;
        if (options.commit !== false || options.forceCommit) {
          pushHistory();
        }
        renderer.value?.draw();
        invalidateTikz();
      } else if (options.forceCommit) {
        pushHistory();
      }
    }

    function updateTextBorderColor(color, options = {}) {
      const current = state.selected;
      if (!current || current.type !== 'text' || !current.item) {
        return;
      }
      const normalized = normalizeHex(color);
      if (!normalized) {
        return;
      }
      if (current.item.borderColor !== normalized) {
        current.item.borderColor = normalized;
        if (options.commit !== false || options.forceCommit) {
          pushHistory();
        }
        renderer.value?.draw();
        invalidateTikz();
      } else if (options.forceCommit) {
        pushHistory();
      }
    }

    function updateTextBorderWidth(value, options = {}) {
      const current = state.selected;
      if (!current || current.type !== 'text' || !current.item) {
        return;
      }
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) {
        return;
      }
      const clamped = Math.max(0, Math.min(8, numeric));
      if (current.item.borderWidth !== clamped) {
        current.item.borderWidth = clamped;
        if (options.commit !== false || options.forceCommit) {
          pushHistory();
        }
        renderer.value?.draw();
        invalidateTikz();
      } else if (options.forceCommit) {
        pushHistory();
      }
    }

    function updateTextBorderStyle(style, options = {}) {
      const current = state.selected;
      if (!current || current.type !== 'text' || !current.item) {
        return;
      }
      const allowed = new Set(['solid', 'dashed', 'dotted']);
      const normalized = allowed.has(style) ? style : TEXT_BLOCK_BORDER_STYLE_DEFAULT;
      if (current.item.borderStyle !== normalized) {
        current.item.borderStyle = normalized;
        if (options.commit !== false || options.forceCommit) {
          pushHistory();
        }
        renderer.value?.draw();
        invalidateTikz();
      } else if (options.forceCommit) {
        pushHistory();
      }
    }

    function updateTextOpacity(value, options = {}) {
      const current = state.selected;
      if (!current || current.type !== 'text' || !current.item) {
        return;
      }
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) {
        return;
      }
      const ratio = Math.min(100, Math.max(10, numeric)) / 100;
      const normalized = Math.min(
        TEXT_BLOCK_OPACITY_RANGE.max,
        Math.max(TEXT_BLOCK_OPACITY_RANGE.min, ratio)
      );
      if (Math.abs((current.item.opacity ?? TEXT_BLOCK_OPACITY_RANGE.max) - normalized) > 0.01) {
        current.item.opacity = Number(normalized.toFixed(2));
        if (options.commit !== false || options.forceCommit) {
          pushHistory();
        }
        renderer.value?.draw();
        invalidateTikz();
      } else if (options.forceCommit) {
        pushHistory();
      }
    }

    function updateRectangleSplitParts(value, options = {}) {
      const nodes = selectedNodes.value;
      if (!nodes.length) {
        return;
      }
      const clamped = clampRectangleSplitParts(value);
      let changed = false;
      nodes.forEach(node => {
        if (node.shape !== 'rectangle split') {
          return;
        }
        const previous = clampRectangleSplitParts(node.rectangleSplitParts);
        if (previous !== clamped) {
          node.rectangleSplitParts = clamped;
          changed = true;
        }
        ensureRectangleSplitCells(node);
      });
      if ((options.commit !== false && changed) || options.forceCommit) {
        pushHistory();
      }
      if (changed) {
        renderer.value?.draw();
        invalidateTikz();
      }
    }

    function updateRectangleSplitCellText(index, value, options = {}) {
      const nodes = selectedNodes.value.filter(node => node.shape === 'rectangle split');
      if (!nodes.length) {
        return;
      }
      const targetIndex = Math.max(0, Math.floor(Number(index)));
      const textValue = typeof value === 'string' ? value : '';
      let changed = false;
      nodes.forEach(node => {
        ensureRectangleSplitCells(node);
        const cell = node.rectangleSplitCells?.[targetIndex];
        if (!cell) {
          return;
        }
        if (cell.text !== textValue) {
          cell.text = textValue;
          if (targetIndex === 0) {
            node.label = textValue;
          }
          changed = true;
        }
      });
      if ((options.commit !== false && changed) || options.forceCommit) {
        pushHistory();
      }
      if (changed) {
        renderer.value?.draw();
        invalidateTikz();
      }
    }

    function updateRectangleSplitCellFill(index, color, options = {}) {
      const nodes = selectedNodes.value.filter(node => node.shape === 'rectangle split');
      if (!nodes.length) {
        return;
      }
      const targetIndex = Math.max(0, Math.floor(Number(index)));
      const normalized = color == null ? null : normalizeHex(color);
      if (color != null && !normalized) {
        return;
      }
      let changed = false;
      nodes.forEach(node => {
        ensureRectangleSplitCells(node);
        const cell = node.rectangleSplitCells?.[targetIndex];
        if (!cell) {
          return;
        }
        if (cell.fill !== normalized) {
          cell.fill = normalized;
          changed = true;
        }
      });
      if ((options.commit !== false && changed) || options.forceCommit) {
        pushHistory();
      }
      if (changed) {
        renderer.value?.draw();
        invalidateTikz();
      }
    }

    function updateRectangleSplitCellTextColor(index, color, options = {}) {
      const nodes = selectedNodes.value.filter(node => node.shape === 'rectangle split');
      if (!nodes.length) {
        return;
      }
      const targetIndex = Math.max(0, Math.floor(Number(index)));
      const normalized = color == null ? null : normalizeHex(color);
      if (color != null && !normalized) {
        return;
      }
      let changed = false;
      nodes.forEach(node => {
        ensureRectangleSplitCells(node);
        const cell = node.rectangleSplitCells?.[targetIndex];
        if (!cell) {
          return;
        }
        if (cell.textColor !== normalized) {
          cell.textColor = normalized;
          changed = true;
        }
      });
      if ((options.commit !== false && changed) || options.forceCommit) {
        pushHistory();
      }
      if (changed) {
        renderer.value?.draw();
        invalidateTikz();
      }
    }

    function setNodeFontSize(size) {
      const nodes = selectedNodes.value;
      if (!nodes.length) {
        return;
      }
      const normalized = String(size);
      let changed = false;
      nodes.forEach(node => {
        if (node.fontSize !== normalized) {
          node.fontSize = normalized;
          changed = true;
        }
      });
      if (changed) {
        pushHistory();
      }
    }

    function setNodeShape(shape) {
      const nodes = selectedNodes.value;
      if (!nodes.length) {
        return;
      }
      let changed = false;
      nodes.forEach(node => {
        if (node.shape !== shape) {
          node.shape = shape;
          applyShapeDefaults(node);
          if (shape === 'rectangle split') {
            ensureRectangleSplitCells(node);
          }
          changed = true;
        } else if (shape === 'rectangle split') {
          ensureRectangleSplitCells(node);
        }
      });
      if (changed) {
        pushHistory();
      }
    }

    const DEFAULT_CYLINDER_INNER_SEP_PT = 1;

    const clampValue = (value, min, max) => Math.min(max, Math.max(min, value));

    function formatNumeric(value, digits = 1) {
      if (!Number.isFinite(value)) {
        return null;
      }
      if (digits === 0) {
        return Math.round(value).toString();
      }
      return Number(value.toFixed(digits)).toString();
    }

    function getCylinderMinimumHeightValue(node) {
      const numeric = parseNumericPrefix(node?.minimumHeight, DEFAULT_CYLINDER_MIN_HEIGHT_CM);
      return clampValue(Number.isFinite(numeric) ? numeric : DEFAULT_CYLINDER_MIN_HEIGHT_CM, 1, 50);
    }

    function getCylinderMinimumWidthValue(node) {
      const numeric = parseNumericPrefix(node?.minimumWidth, DEFAULT_CYLINDER_MIN_WIDTH_CM);
      return clampValue(Number.isFinite(numeric) ? numeric : DEFAULT_CYLINDER_MIN_WIDTH_CM, 1, 25);
    }

    function formatCylinderMinimumHeight(node) {
      const numeric = parseNumericPrefix(node?.minimumHeight, null);
      const value = Number.isFinite(numeric) ? numeric : getCylinderMinimumHeightValue(node);
      const formatted = formatNumeric(value, 1);
      return formatted ? `${formatted} cm` : '';
    }

    function formatCylinderMinimumWidth(node) {
      const numeric = parseNumericPrefix(node?.minimumWidth, null);
      const value = Number.isFinite(numeric) ? numeric : getCylinderMinimumWidthValue(node);
      const formatted = formatNumeric(value, 1);
      return formatted ? `${formatted} cm` : '';
    }

    function getCylinderInnerSepValue(node, key) {
      const numeric = parseNumericPrefix(node?.[key], null);
      if (!Number.isFinite(numeric)) {
        return DEFAULT_CYLINDER_INNER_SEP_PT;
      }
      return clampValue(numeric, 1, 10);
    }

    function formatCylinderInnerSep(node, key) {
      const numeric = parseNumericPrefix(node?.[key], null);
      if (!Number.isFinite(numeric)) {
        return 'auto';
      }
      const formatted = formatNumeric(numeric, 1);
      return formatted ? `${formatted} pt` : 'auto';
    }

    function getCylinderAspectSliderValue(node) {
      const numeric = parseNumericPrefix(node?.aspect, DEFAULT_CYLINDER_ASPECT);
      const clamped = clampValue(
        Number.isFinite(numeric) ? numeric : DEFAULT_CYLINDER_ASPECT,
        0.1,
        1
      );
      return Math.round(clamped * 10);
    }

    function formatCylinderAspect(node) {
      const numeric = parseNumericPrefix(node?.aspect, null);
      const value = Number.isFinite(numeric)
        ? numeric
        : getCylinderAspectSliderValue(node) / 10;
      return value.toFixed(2);
    }

    function updateCylinderMinimumHeight(value, options = {}) {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) {
        return;
      }
      const clamped = clampValue(numeric, 1, 50);
      const formatted = `${formatNumeric(clamped, 1)}cm`;
      updateCylinderDimension('minimumHeight', formatted, options);
    }

    function updateCylinderMinimumWidth(value, options = {}) {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) {
        return;
      }
      const clamped = clampValue(numeric, 1, 25);
      const formatted = `${formatNumeric(clamped, 1)}cm`;
      updateCylinderDimension('minimumWidth', formatted, options);
    }

    function updateCylinderInnerSep(key, value, options = {}) {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) {
        return;
      }
      const clamped = clampValue(numeric, 1, 10);
      const formatted = `${formatNumeric(clamped, 1)}pt`;
      updateCylinderDimension(key, formatted, options);
    }

    function updateCylinderAspectFromSlider(value, options = {}) {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) {
        return;
      }
      const normalized = numeric / 10;
      updateCylinderAspect(normalized, options);
    }

    function updateCylinderProperty(key, value, options = {}) {
      const nodes = selectedNodes.value.filter(node => node.shape === 'cylinder');
      if (!nodes.length) {
        return;
      }
      let changed = false;
      nodes.forEach(node => {
        if (node[key] !== value) {
          node[key] = value;
          changed = true;
        }
      });
      if (!changed) {
        return;
      }
      if (options.reapplyDefaults) {
        nodes.forEach(applyShapeDefaults);
      }
      if ((options.commit !== false && changed) || options.forceCommit) {
        pushHistory();
      }
      renderer.value?.draw();
    }

    function updateCylinderRotate(value, options = {}) {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) {
        return;
      }
      const clamped = Math.min(360, Math.max(-360, numeric));
      updateCylinderProperty('rotate', Number(clamped.toFixed(1)), options);
    }

    function updateCylinderBorderRotate(value, options = {}) {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) {
        return;
      }
      const clamped = Math.min(360, Math.max(-360, numeric));
      updateCylinderProperty('shapeBorderRotate', Number(clamped.toFixed(1)), options);
    }

    function updateCylinderAspect(value, options = {}) {
      const numeric = Number(value);
      if (!Number.isFinite(numeric) || numeric <= 0) {
        return;
      }
      const clamped = Math.min(3, Math.max(0.1, numeric));
      updateCylinderProperty('aspect', Number(clamped.toFixed(2)), options);
    }

    function updateCylinderDimension(key, value, options = {}) {
      const normalized =
        typeof value === 'string' ? value.trim() : value == null ? '' : String(value);
      updateCylinderProperty(key, normalized, options);
    }

    function updateCylinderCustomFill(value) {
      const normalized = value === false || value === 'false' ? false : true;
      updateCylinderProperty('cylinderUsesCustomFill', normalized, {
        forceCommit: true,
        reapplyDefaults: normalized,
      });
    }

    function updateCylinderColor(key, color, options = {}) {
      const normalized =
        normalizeHex(color) || (typeof color === 'string' ? color.trim() : null);
      if (!normalized) {
        return;
      }
      updateCylinderProperty(key, normalized, options);
    }

    function copySelectedFormatting() {
      const node = selectedNode.value;
      const edge = selectedEdge.value;
      const line = selectedLine.value;
      if (node) {
        formatClipboard.value = {
          type: 'node',
          color: normalizeHex(node.color) || '#f8fafc',
          borderColor: normalizeHex(node.borderColor) || '#94a3b8',
          borderWidth: Number(node.borderWidth) || 3,
          fontSize: String(node.fontSize || '16'),
          cornerRadius: Number(node.cornerRadius) || 16,
          borderStyle: node.borderStyle || 'solid',
          opacity: Number.isFinite(Number(node.opacity)) ? Number(node.opacity) : null,
        };
        flash('Node formatting copied.');
        return;
      }
      if (edge) {
        const rawThickness = Number(edge.thickness);
        formatClipboard.value = {
          type: 'edge',
          color: normalizeHex(edge.color) || '#94a3b8',
          style: edge.style || 'solid',
          direction: edge.direction || '->',
          thickness:
            Number.isFinite(rawThickness) && rawThickness > 0 ? rawThickness : null,
        };
        flash('Edge formatting copied.');
        return;
      }
      if (line) {
        const rawThickness = Number(line.thickness);
        formatClipboard.value = {
          type: 'line',
          color: normalizeHex(line.color) || '#94a3b8',
          style: line.style || 'solid',
          thickness:
            Number.isFinite(rawThickness) && rawThickness > 0 ? rawThickness : null,
          label: line.label || null,
        };
        flash('Line formatting copied.');
      }
    }

    function pasteSelectedFormatting() {
      const payload = formatClipboard.value;
      if (!payload) {
        return;
      }
      if (payload.type === 'node') {
        const nodes = selectedNodes.value;
        if (!nodes.length) {
          return;
        }
        let changed = false;
        const fillColor = normalizeHex(payload.color);
        const strokeColor = normalizeHex(payload.borderColor);
        const borderWidth = Number(payload.borderWidth);
        const cornerRadius = Number(payload.cornerRadius);
        const fontSize = payload.fontSize ? String(payload.fontSize) : null;
        const borderStyle =
          typeof payload.borderStyle === 'string' ? payload.borderStyle : 'solid';
        const opacityValue = Number(payload.opacity);
        nodes.forEach(node => {
          if (fillColor && node.color !== fillColor) {
            node.color = fillColor;
            changed = true;
          }
          if (strokeColor && node.borderColor !== strokeColor) {
            node.borderColor = strokeColor;
            changed = true;
          }
          if (
            Number.isFinite(borderWidth) &&
            borderWidth > 0 &&
            node.borderWidth !== borderWidth
          ) {
            node.borderWidth = borderWidth;
            changed = true;
          }
          if (
            Number.isFinite(cornerRadius) &&
            cornerRadius >= 0
          ) {
            const clampedRadius = Math.min(cornerRadius, 64);
            if (node.cornerRadius !== clampedRadius) {
              node.cornerRadius = clampedRadius;
              changed = true;
            }
          }
          if (fontSize && node.fontSize !== fontSize) {
            node.fontSize = fontSize;
            changed = true;
          }
          if (borderStyle && node.borderStyle !== borderStyle) {
            node.borderStyle = borderStyle;
            changed = true;
          }
          if (Number.isFinite(opacityValue)) {
            const normalizedOpacity = Math.min(1, Math.max(0, opacityValue));
            if (normalizedOpacity >= 0.99) {
              if (node.opacity != null) {
                delete node.opacity;
                changed = true;
              }
            } else if (node.opacity !== normalizedOpacity) {
              node.opacity = Number(normalizedOpacity.toFixed(2));
              changed = true;
            }
          }
        });
        if (fillColor) {
          nodeToolbarState.fillCustomColor = fillColor;
          ensureCustomSwatch('fill', fillColor);
          registerRecentColor(fillColor);
        }
        if (strokeColor) {
          nodeToolbarState.strokeCustomColor = strokeColor;
          ensureCustomSwatch('stroke', strokeColor);
          registerRecentColor(strokeColor);
        }
        if (changed) {
          pushHistory();
          const message = nodes.length > 1
            ? 'Formatting applied to the selected nodes.'
            : 'Formatting applied to the selected node.';
          flash(message);
        } else {
          const message = nodes.length > 1
            ? 'All selected nodes already had this formatting.'
            : 'The formatting is already applied to this node.';
          flash(message);
        }
        return;
      }

      if (payload.type === 'edge') {
        const edge = selectedEdge.value;
        if (!edge) {
          return;
        }
        let changed = false;
        const edgeColor = normalizeHex(payload.color);
        if (edgeColor && edge.color !== edgeColor) {
          edge.color = edgeColor;
          edgeToolbarState.customColor = edgeColor;
          ensureCustomSwatch('stroke', edgeColor);
          registerRecentColor(edgeColor);
          changed = true;
        }
        const style = payload.style;
        if (style && edge.style !== style) {
          edge.style = style;
          changed = true;
        }
        const direction = payload.direction;
        if (direction && edge.direction !== direction) {
          edge.direction = direction;
          changed = true;
        }
        if (payload.thickness === null) {
          if (edge.thickness !== null) {
            edge.thickness = null;
            changed = true;
          }
        } else {
          const thicknessValue = Number(payload.thickness);
          if (
            Number.isFinite(thicknessValue) &&
            thicknessValue > 0 &&
            edge.thickness !== thicknessValue
          ) {
            edge.thickness = thicknessValue;
            changed = true;
          }
        }
        if (changed) {
          pushHistory();
          flash('Formatting applied to the selected edge.');
        } else {
          flash('Formatting is already applied to this edge.');
        }
        return;
      }

      if (payload.type === 'line') {
        const line = selectedLine.value;
        if (!line) {
          return;
        }
        let changed = false;
        const lineColor = normalizeHex(payload.color);
        if (lineColor && line.color !== lineColor) {
          line.color = lineColor;
          registerRecentColor(lineColor);
          changed = true;
        }
        const style = payload.style;
        if (style && line.style !== style) {
          line.style = style;
          changed = true;
        }
        if (payload.thickness === null) {
          if (line.thickness !== null) {
            line.thickness = null;
            changed = true;
          }
        } else {
          const thicknessValue = Number(payload.thickness);
          if (
            Number.isFinite(thicknessValue) &&
            thicknessValue > 0 &&
            line.thickness !== thicknessValue
          ) {
            line.thickness = thicknessValue;
            changed = true;
          }
        }
        if (typeof payload.label === 'string' && line.label !== payload.label) {
          line.label = payload.label;
          changed = true;
        }

        if (changed) {
          pushHistory();
          flash('Formatting applied to the selected line.');
        } else {
          flash('Formatting is already applied to this line.');
        }
      }
    }

    function commitHistory() {
      pushHistory();
    }

    function onOptionChange() {
      invalidateTikz();
      pushHistory();
    }

    function updateEdgeLabelColor(color) {
      const edge = state.selected?.type === 'edge' ? state.selected.item : null;
      if (!edge || !edge.label) return;
      edge.label.color = color;
      invalidateTikz();
    }

    function toggleEdgePopover(id) {
      if (id === 'alignment' && !hasSelectedEdgeLabel.value) {
        flash('Add a label to the edge before adjusting alignment.');
        return;
      }
      edgeToolbarState.activePopover = edgeToolbarState.activePopover === id ? null : id;
    }

    function setEdgeToolbarHover(id) {
      edgeToolbarState.hoveredOption = id;
    }

    function applyEdgeColor(color, options = {}) {
      const edge = selectedEdge.value;
      const normalized = normalizeHex(color);
      if (!edge || !normalized) {
        return;
      }
      const previous = edge.color;
      edge.color = normalized;
      edgeToolbarState.customColor = normalized;
      registerRecentColor(normalized);
      const hasChanged = previous !== normalized;
      if ((options.commit !== false && hasChanged) || options.forceCommit) {
        pushHistory();
      }
    }

    function setEdgeStyle(style) {
      const edge = selectedEdge.value;
      if (!edge || edge.style === style) {
        return;
      }
      edge.style = style;
      pushHistory();
    }

    function setEdgeDirection(direction) {
      const edge = selectedEdge.value;
      if (!edge || edge.direction === direction) {
        return;
      }
      edge.direction = direction;
      pushHistory();
    }

    function flipEdgeDirection() {
      const edge = selectedEdge.value;
      if (!edge) {
        return;
      }
      if (edge.direction === '->') {
        setEdgeDirection('<-');
      } else if (edge.direction === '<-') {
        setEdgeDirection('->');
      } else if (edge.direction === '<->') {
        setEdgeDirection('->');
      } else if (edge.direction === '-') {
        setEdgeDirection('<->');
      } else {
        setEdgeDirection('->');
      }
    }

    function updateSelectedEdgeThickness(value, options = {}) {
      const edge = selectedEdge.value;
      if (!edge) {
        return;
      }
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) {
        return;
      }
      const clamped = Math.min(Math.max(numeric, 1), 8);
      const previous = Number(edge.thickness) || null;
      edge.thickness = clamped;
      const hasChanged = previous !== clamped;
      if ((options.commit !== false && hasChanged) || options.forceCommit) {
        pushHistory();
      }
    }

    function clearEdgeThickness() {
      const edge = selectedEdge.value;
      if (!edge || edge.thickness == null) {
        return;
      }
      edge.thickness = null;
      pushHistory();
    }

    function updateSelectedLineThickness(value, options = {}) {
      const line = selectedLine.value;
      if (!line) {
        return;
      }
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) {
        return;
      }
      const clamped = Math.min(Math.max(numeric, 1), 8);
      const previous = Number(line.thickness) || null;
      line.thickness = clamped;
      const hasChanged = previous !== clamped;
      if ((options.commit !== false && hasChanged) || options.forceCommit) {
        pushHistory();
      }
    }

    function clearLineThickness() {
      const line = selectedLine.value;
      if (!line || line.thickness == null) {
        return;
      }
      line.thickness = null;
      pushHistory();
    }

    function updateSelectedLineColor(color, options = {}) {
      const line = selectedLine.value;
      const normalized = normalizeHex(color);
      if (!line || !normalized) {
        return;
      }
      if (options.commit === false && !options.forceCommit) {
        state.borderPreviewSuppressed = true;
      } else {
        state.borderPreviewSuppressed = false;
      }
      const previous = line.color;
      line.color = normalized;
      registerRecentColor(normalized);
      const hasChanged = previous !== normalized;
      if ((options.commit !== false && hasChanged) || options.forceCommit) {
        pushHistory();
      }
      invalidateTikz();
      renderer.value?.draw();
    }

    function updateSelectedLineLabel(value, options = {}) {
      const line = selectedLine.value;
      if (!line) {
        return;
      }
      const previous = line.label;
      line.label = value;
      const hasChanged = previous !== value;
      if ((options.commit !== false && hasChanged) || options.forceCommit) {
        pushHistory();
      }
    }

    function clearLineLabel() {
      const line = selectedLine.value;
      if (!line || line.label == null) {
        return;
      }
      line.label = null;
      pushHistory();
    }

    function setEdgeLabelAlignment(alignment) {
      const edge = selectedEdge.value;
      const label = edge?.label;
      if (!edge || !label || typeof label.text !== 'string' || !label.text.trim()) {
        flash('Add a label to the edge before adjusting alignment.');
        return;
      }
      const normalized = alignment || 'auto';
      if (label.alignment === normalized) {
        return;
      }
      edge.label = {
        ...label,
        alignment: normalized,
      };
      pushHistory();
    }

    function updateEdgeThickness(value) {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) {
        return;
      }
      const clamped = Math.min(Math.max(numeric, 1), 8);
      state.edgeThickness = clamped;
    }

    function onEdgeLabelAlignmentChange(value) {
      state.edgeLabelAlignment = value;
      pushHistory();
    }

    function triggerLoadDiagram() {
      diagramFileInputRef.value?.click();
    }

    async function handleDiagramFileChange(event) {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const payload = JSON.parse(text);
        applyDiagramPayload(payload);
        flash('Diagram loaded from the JSON file.');
      } catch (error) {
        console.error('Failed to load diagram', error);
        flash('Could not load the file. Make sure it is valid JSON.');
      } finally {
        event.target.value = '';
      }
    }

    function triggerMatrixImport() {
      matrixPrompt.text = '';
      matrixPrompt.error = '';
      matrixPrompt.visible = true;
      nextTick(() => {
        matrixPromptTextAreaRef.value?.focus();
      });
    }

    function triggerMatrixFileSelection() {
      matrixPrompt.error = '';
      matrixFileInputRef.value?.click();
    }

    function closeMatrixPrompt() {
      matrixPrompt.visible = false;
      matrixPrompt.text = '';
      matrixPrompt.error = '';
    }

    function confirmMatrixPrompt() {
      const text = matrixPrompt.text.trim();
      if (!text) {
      matrixPrompt.error = 'Paste the matrix data or select a file.';
        return;
      }
      try {
        const matrix = parseMatrixFromText(text);
        prepareMatrixImport(matrix, 'manual input', { replaceQueue: true });
        closeMatrixPrompt();
      } catch (error) {
        console.error('Failed to import pasted matrix', error);
        matrixPrompt.error =
          error instanceof Error && error.message
            ? error.message
            : 'Could not interpret the provided content.';
      }
    }

    async function handleMatrixFileChange(event) {
      const files = Array.from(event.target.files || []);
      if (!files.length) return;
      try {
        const sortedFiles = files.sort((a, b) =>
          a.name.localeCompare(b.name, 'en-US', { numeric: true, sensitivity: 'base' })
        );
        const successes = [];
        const failures = [];
        for (const file of sortedFiles) {
          try {
            const text = await file.text();
            const matrix = parseMatrixFromText(text);
            successes.push({ data: matrix, fileName: file.name });
          } catch (error) {
            console.error('Failed to import matrix', error);
            const message =
              error instanceof Error && error.message
                ? error.message
                : 'Could not import the selected file. Make sure it is a valid CSV.';
            failures.push({ fileName: file.name, message });
          }
        }
        if (successes.length) {
          queueMatrixImports(successes, { replaceQueue: true });
          closeMatrixPrompt();
          if (failures.length) {
            const failedNames = failures.map(failure => failure.fileName).join(', ');
            flash(`Some files could not be imported: ${failedNames}.`);
          }
        } else if (failures.length) {
          const firstFailure = failures[0];
          const combinedMessage =
            failures.length === 1
              ? `Could not import ${firstFailure.fileName}: ${firstFailure.message}`
              : 'Could not import the selected files. Make sure they are valid CSVs.';
          if (matrixPrompt.visible) {
            matrixPrompt.error = combinedMessage;
          } else {
            flash(combinedMessage);
          }
          resetMatrixImportState();
          clearMatrixImportQueue();
        }
      } finally {
        event.target.value = '';
      }
    }

    function cancelMatrixImport() {
      resetMatrixImportState();
      clearMatrixImportQueue();
    }

    function confirmMatrixImport() {
      if (!matrixImport.visible || !matrixImport.values.length) {
        resetMatrixImportState();
        return;
      }
      const data = matrixImport.data.map(row => [...row]);
      const rows = data.length;
      const columns = rows > 0 ? data[0].length : 0;
      if (!rows || !columns) {
        flash('The imported matrix is empty. Select another file.');
        resetMatrixImportState();
        return;
      }
      const colorMap = matrixImport.values.reduce((acc, value) => {
        const normalized = normalizeHex(matrixImport.colorMap[value]);
        if (normalized) {
          acc[value] = normalized;
        } else if (value === '0') {
          acc[value] = DEFAULT_MATRIX_ZERO_COLOR;
        } else if (value === '1') {
          acc[value] = DEFAULT_MATRIX_ONE_COLOR;
        } else {
          acc[value] = '#0f172a';
        }
        return acc;
      }, {});
      const cellSize = 4;
      const center = getViewportCenterWorld();
      const width = columns * cellSize;
      const height = rows * cellSize;
      const grid = {
        id: `matrix-${matrixSequence++}`,
        x: center.x - width / 2,
        y: center.y - height / 2,
        data,
        colorMap,
        cellSize,
      };
      clampMatrixGridToFrame(grid);
      state.matrixGrids = [...state.matrixGrids, grid];
      setSelected({ type: 'matrix', item: grid });
      refreshSequencesFromState(state.nodes, state.edges, state.lines, state.textBlocks, state.matrixGrids);
      pushHistory();
      invalidateTikz();
      renderer.value?.draw();
      flash('Matrix imported. Drag to reposition.');
      resetMatrixImportState();
      loadNextMatrixFromQueue();
    }

    function applyDiagramPayload(payload) {
      if (!payload || typeof payload !== 'object') {
        throw new Error('Invalid payload');
      }
      const nodes = Array.isArray(payload.nodes)
        ? payload.nodes.map(node => normalizeNode({ ...node }))
        : [];
      const edges = Array.isArray(payload.edges)
        ? payload.edges.map(edge => normalizeEdge({ ...edge }))
        : [];
      const lines = Array.isArray(payload.lines)
        ? payload.lines.map(line => normalizeLine({ ...line }))
        : [];
      const textBlocks = Array.isArray(payload.textBlocks)
        ? payload.textBlocks.map(block =>
            normalizeTextBlock({ ...block }, { defaultColor: defaultTextColor.value })
          )
        : [];
      const matrixGrids = Array.isArray(payload.matrixGrids)
        ? payload.matrixGrids
            .map(grid => normalizeMatrixGrid({ ...grid }))
            .filter(grid => grid.data.length && grid.data[0]?.length)
        : [];
      const frame = payload.frame ? { ...payload.frame } : null;
      const thickness = Number(payload.edgeThickness);

      state.nodes = nodes;
      state.edges = edges;
      state.lines = lines;
      state.textBlocks = textBlocks;
      state.matrixGrids = matrixGrids;
      state.frame = frame;
      if (Number.isFinite(thickness) && thickness > 0) {
        state.edgeThickness = thickness;
      } else {
        state.edgeThickness = DEFAULT_EDGE_THICKNESS;
      }
      const alignmentCandidates = ['auto', 'left', 'center', 'right'];
      const payloadAlignment = typeof payload.edgeLabelAlignment === 'string'
        ? payload.edgeLabelAlignment.toLowerCase()
        : null;
      if (payloadAlignment && alignmentCandidates.includes(payloadAlignment)) {
        state.edgeLabelAlignment = payloadAlignment;
      } else if (typeof payload.centerEdgeLabels === 'boolean') {
        state.edgeLabelAlignment = payload.centerEdgeLabels ? 'center' : 'right';
      } else {
        state.edgeLabelAlignment = 'right';
      }
      state.selected = null;
      state.mode = 'move';
      state.edgeDraft = null;
      state.hoverNodeId = null;
      state.hoverAnchor = null;
      state.pointer = null;
      state.cameraDrag = null;
      if (payload.camera) {
        state.camera.scale = payload.camera.scale ?? 1;
        state.camera.offsetX = payload.camera.offsetX ?? 0;
        state.camera.offsetY = payload.camera.offsetY ?? 0;
      } else {
        state.camera.scale = 1;
        state.camera.offsetX = 0;
        state.camera.offsetY = 0;
      }
      clearGuides();
      refreshSequencesFromState(state.nodes, state.edges, state.lines, state.textBlocks, state.matrixGrids);
      invalidateTikz();
      pushHistory();
    }

    const mode = computed(() => state.mode);
    const selected = computed(() => state.selected);
    const defaultTextColor = computed(() =>
      state.theme === 'dark' ? '#e2e8f0' : '#0f172a'
    );

    const previewZoomLevel = computed(() => Math.max(1, Math.round(preview.scale * 100)));
    const previewStageStyle = computed(() => {
      const width = Math.max(1, Number(preview.contentWidth) || 0);
      const height = Math.max(1, Number(preview.contentHeight) || 0);
      return {
        left: `${preview.offsetX}px`,
        top: `${preview.offsetY}px`,
        width: `${width}px`,
        height: `${height}px`,
        transform: 'translate(0px, 0px) scale(1)',
        transformOrigin: '0 0',
      };
    });
    const previewStageContentStyle = computed(() => ({
      width: '100%',
      height: '100%',
      transform: `scale(${preview.scale})`,
      transformOrigin: '0 0',
      willChange: 'transform',
    }));
    const previewFrameStyle = computed(() => ({
      height: `${previewPanelHeight.value}px`,
    }));
    const hasPreviewContent = computed(() => !!preview.srcdoc);
    const isPreviewDirty = computed(
      () => !!tikzCode.value && tikzCode.value !== lastRenderedTikz.value
    );
    const isPreviewPanning = computed(() => panModifierActive.value || !!preview.drag);

    let previewContentBounds = null;
    const PREVIEW_MIN_SCALE = 0.05;
    const PREVIEW_MAX_SCALE = 6;
    const PREVIEW_PADDING_RATIO = 0.1;
    const PREVIEW_PADDING_MIN = 32;
    const PREVIEW_PADDING_MAX = 160;
    const PREVIEW_HEIGHT_MIN = 240;
    const PREVIEW_HEIGHT_MAX = 780;
    const previewResizeState = reactive({
      active: false,
      startY: 0,
      initialHeight: previewPanelHeight.value,
      previousUserSelect: '',
    });

    function clampPreviewScale(value) {
      if (!Number.isFinite(value) || value <= 0) {
        return PREVIEW_MIN_SCALE;
      }
      return Math.min(PREVIEW_MAX_SCALE, Math.max(PREVIEW_MIN_SCALE, value));
    }

    function clampPreviewHeight(value) {
      if (!Number.isFinite(value)) {
        return PREVIEW_HEIGHT_MIN;
      }
      return Math.min(PREVIEW_HEIGHT_MAX, Math.max(PREVIEW_HEIGHT_MIN, value));
    }

    function handlePreviewResizeMove(event) {
      if (!previewResizeState.active) {
        return;
      }
      const delta = event.clientY - previewResizeState.startY;
      const nextHeight = clampPreviewHeight(previewResizeState.initialHeight + delta);
      if (nextHeight !== previewPanelHeight.value) {
        previewPanelHeight.value = nextHeight;
        if (previewContentBounds) {
          nextTick(() => {
            updatePreviewTransform();
          });
        }
      }
    }

    function adjustPreviewHeightBy(delta) {
      const nextHeight = clampPreviewHeight(previewPanelHeight.value + delta);
      if (nextHeight === previewPanelHeight.value) {
        return;
      }
      previewPanelHeight.value = nextHeight;
      if (previewContentBounds) {
        nextTick(() => {
          updatePreviewTransform();
        });
      }
    }

    function stopPreviewResize() {
      if (!previewResizeState.active) {
        window.removeEventListener('pointermove', handlePreviewResizeMove);
        window.removeEventListener('pointerup', stopPreviewResize);
        window.removeEventListener('pointercancel', stopPreviewResize);
        return;
      }
      previewResizeState.active = false;
      window.removeEventListener('pointermove', handlePreviewResizeMove);
      window.removeEventListener('pointerup', stopPreviewResize);
      window.removeEventListener('pointercancel', stopPreviewResize);
      if (typeof document !== 'undefined' && document.body) {
        document.body.style.userSelect = previewResizeState.previousUserSelect || '';
      }
      previewResizeState.previousUserSelect = '';
    }

    function startPreviewResize(event) {
      if (previewResizeState.active) {
        return;
      }
      if (event.pointerType === 'mouse' && event.button !== 0) {
        return;
      }
      previewResizeState.active = true;
      previewResizeState.startY = event.clientY;
      previewResizeState.initialHeight = previewPanelHeight.value;
      if (typeof document !== 'undefined' && document.body) {
        previewResizeState.previousUserSelect = document.body.style.userSelect;
        document.body.style.userSelect = 'none';
      } else {
        previewResizeState.previousUserSelect = '';
      }
      window.addEventListener('pointermove', handlePreviewResizeMove);
      window.addEventListener('pointerup', stopPreviewResize);
      window.addEventListener('pointercancel', stopPreviewResize);
      event.preventDefault();
    }

    function buildTikzPreviewSrcdoc(rawCode) {
      if (!rawCode) {
        return '';
      }

      const documentMatch = rawCode.match(/\\begin{document}([\s\S]*)\\end{document}/);
      const body = documentMatch ? documentMatch[1].trim() : rawCode.trim();
      const preamble = documentMatch ? rawCode.slice(0, documentMatch.index).trim() : '';

      const preambleLines = preamble
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('\\documentclass') && !line.startsWith('\\usepackage'));

      const sanitizedPreamble = preambleLines.join('\n');

      const accentMap = {
        'á': "\\'{a}",
        'Á': "\\'{A}",
        'à': "\\`{a}",
        'À': "\\`{A}",
        'ã': "\\~{a}",
        'Ã': "\\~{A}",
        'â': "\\^{a}",
        'Â': "\\^{A}",
        'é': "\\'{e}",
        'É': "\\'{E}",
        'ê': "\\^{e}",
        'Ê': "\\^{E}",
        'í': "\\'{i}",
        'Í': "\\'{I}",
        'ó': "\\'{o}",
        'Ó': "\\'{O}",
        'ô': "\\^{o}",
        'Ô': "\\^{O}",
        'õ': "\\~{o}",
        'Õ': "\\~{O}",
        'ú': "\\'{u}",
        'Ú': "\\'{U}",
        'ü': '\\"{u}',
        'Ü': '\\"{U}',
        'ç': '\\c{c}',
        'Ç': '\\c{C}',
        'ñ': "\\~{n}",
        'Ñ': "\\~{N}",
      };

      const normalizeAccents = value => value.replace(/[\u0080-\uFFFF]/g, char => accentMap[char] ?? char);

      const sanitizeScript = content => content.replace(/<\/script/gi, '<\\/script');
      const scriptContents = sanitizeScript(
        normalizeAccents([sanitizedPreamble, body].filter(Boolean).join('\n\n'))
      );

      return [
        '<!DOCTYPE html>',
        '<html lang="pt-BR">',
        '<head>',
        '<meta charset="utf-8">',
        '<title>TikZ Preview</title>',
        '<link rel="stylesheet" href="https://tikzjax.com/v1/fonts.css">',
        '<script src="https://tikzjax.com/v1/tikzjax.js"></script>',
        '<style>html,body{margin:0;height:100%;overflow:hidden;background:#ffffff;color:#0f172a;font-family:\'Inter\',system-ui,sans-serif;}body{display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;}svg{max-width:100%;height:auto;} .loading{color:#475569;font-size:0.9rem;}</style>',
        '</head>',
        '<body>',
        '<div class="loading">Loading preview…</div>',
        '<script type="text/tikz" data-latex>',
        scriptContents,
        '</script>',
        '<script>',
        '  window.addEventListener(\'load\', () => {',
        '    const sendBounds = () => {',
        '      const svg = document.querySelector(\'svg\');',
        '      if (!svg) return;',
        '      try {',
        '        const bbox = svg.getBBox();',
        '        if (!bbox || !isFinite(bbox.width) || !isFinite(bbox.height)) {',
        '          return;',
        '        }',
        '        if (bbox.width > 0 && bbox.height > 0) {',
        '          const viewBox = [bbox.x, bbox.y, bbox.width, bbox.height].join(\' \');',
        '          svg.setAttribute(\'viewBox\', viewBox);',
        '        }',
        '        if (window.parent) {',
        '          window.parent.postMessage({',
        '            type: \'tikz-preview-bounds\',',
        '            bounds: { minX: bbox.x, minY: bbox.y, width: bbox.width, height: bbox.height },',
        '          }, "*");',
        '        }',
        '      } catch (error) {',
        '        console.error(\'Could not compute the bounds of the TikZ-generated SVG\', error);',
        '      }',
        '    };',
        '    const observer = new MutationObserver(() => {',
        '      const svg = document.querySelector(\'svg\');',
        '      if (svg) {',
        '        document.querySelector(\'.loading\')?.remove();',
        '        observer.disconnect();',
        '        requestAnimationFrame(() => {',
        '          sendBounds();',
        '        });',
        '      }',
        '    });',
        '    observer.observe(document.body, { childList: true, subtree: true });',
        '    sendBounds();',
        '  });',
        '</script>',
        '</body>',
        '</html>',
      ].join('\n');
    }

    function resetPreviewTransform() {
      preview.scale = 1;
      preview.offsetX = 0;
      preview.offsetY = 0;
    }

    function renderPreview() {
      stopPreviewDrag();
      resetPreviewTransform();
      preview.contentWidth = 0;
      preview.contentHeight = 0;
      previewContentBounds = null;
      if (previewLoadingTimeout) {
        clearTimeout(previewLoadingTimeout);
        previewLoadingTimeout = null;
      }
      if (!tikzCode.value) {
        preview.srcdoc = '';
        isPreviewLoading.value = false;
        lastRenderedTikz.value = '';
        pendingRenderedTikz = null;
        return;
      }
      preview.srcdoc = buildTikzPreviewSrcdoc(tikzCode.value);
      isPreviewLoading.value = true;
      pendingRenderedTikz = tikzCode.value || '';
      if (typeof window !== 'undefined' && window.setTimeout) {
        previewLoadingTimeout = window.setTimeout(() => {
          isPreviewLoading.value = false;
          previewLoadingTimeout = null;
        }, 15000);
      }
    }

    function getPreviewViewportRect() {
      const viewportEl = previewViewportRef.value;
      if (!viewportEl) {
        return { left: 0, top: 0, width: 0, height: 0 };
      }
      const rect = viewportEl.getBoundingClientRect();
      return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    }

    function getPreviewPointer(event) {
      const rect = getPreviewViewportRect();
      const screenX = event.clientX - rect.left;
      const screenY = event.clientY - rect.top;
      const x = (screenX - preview.offsetX) / preview.scale;
      const y = (screenY - preview.offsetY) / preview.scale;
      return { screenX, screenY, x, y };
    }

    function zoomPreviewAt(pointer, factor) {
      const nextScale = clampPreviewScale(preview.scale * factor);
      if (nextScale === preview.scale) {
        return;
      }
      preview.scale = nextScale;
      preview.offsetX = pointer.screenX - pointer.x * nextScale;
      preview.offsetY = pointer.screenY - pointer.y * nextScale;
    }

    function getPreviewCenterPointer() {
      const rect = getPreviewViewportRect();
      const screenX = rect.width / 2;
      const screenY = rect.height / 2;
      const x = (screenX - preview.offsetX) / preview.scale;
      const y = (screenY - preview.offsetY) / preview.scale;
      return { screenX, screenY, x, y };
    }

    function zoomPreviewIn() {
      if (!hasPreviewContent.value) return;
      const center = getPreviewCenterPointer();
      zoomPreviewAt(center, 1.2);
    }

    function zoomPreviewOut() {
      if (!hasPreviewContent.value) return;
      const center = getPreviewCenterPointer();
      zoomPreviewAt(center, 1 / 1.2);
    }

    function getPreviewStagePadding() {
      const stageEl = previewStageRef.value;
      if (!stageEl) {
        return { x: 0, y: 0 };
      }
      const style = window.getComputedStyle(stageEl);
      const paddingX =
        parseFloat(style.paddingLeft || '0') + parseFloat(style.paddingRight || '0');
      const paddingY =
        parseFloat(style.paddingTop || '0') + parseFloat(style.paddingBottom || '0');
      return { x: paddingX, y: paddingY };
    }

    function updatePreviewTransform() {
      if (!previewContentBounds) {
        return;
      }
      const viewportRect = getPreviewViewportRect();
      if (!viewportRect.width || !viewportRect.height) {
        return;
      }
      const { x: paddingX, y: paddingY } = getPreviewStagePadding();
      const availableWidth = Math.max(0, viewportRect.width - paddingX);
      const availableHeight = Math.max(0, viewportRect.height - paddingY);
      if (availableWidth <= 0 || availableHeight <= 0) {
        return;
      }
      const width = previewContentBounds.width || 1;
      const height = previewContentBounds.height || 1;
      const rawScale = Math.min(availableWidth / width, availableHeight / height);
      if (!(rawScale > 0)) {
        return;
      }
      const clampedScale = clampPreviewScale(rawScale);
      preview.scale = rawScale < PREVIEW_MIN_SCALE ? rawScale : clampedScale;
      const effectiveScale = preview.scale;
      const contentWidth = width * effectiveScale;
      const contentHeight = height * effectiveScale;
      preview.offsetX = (viewportRect.width - contentWidth) / 2;
      preview.offsetY = (viewportRect.height - contentHeight) / 2;
    }

    function applyPreviewBounds(bounds) {
      if (!bounds) {
        return;
      }
      const width = Math.max(1, Number(bounds.width) || 0);
      const rawHeight = Math.max(1, Number(bounds.height) || 0);
      const baseSize = Math.max(width, rawHeight);
      const padding = Math.max(
        PREVIEW_PADDING_MIN,
        Math.min(PREVIEW_PADDING_MAX, baseSize * PREVIEW_PADDING_RATIO)
      );
      const paddedWidth = width + padding * 2;
      const paddedHeight = rawHeight + padding * 2;
      previewContentBounds = {
        width: paddedWidth,
        height: paddedHeight,
      };
      preview.contentWidth = paddedWidth;
      preview.contentHeight = paddedHeight;
      nextTick(() => {
        updatePreviewTransform();
      });
    }

    function handlePreviewMessage(event) {
      if (!event || typeof event.data !== 'object' || event.data == null) {
        return;
      }
      if (event.data.type === 'tikz-preview-bounds' && event.data.bounds) {
        isPreviewLoading.value = false;
        if (previewLoadingTimeout) {
          clearTimeout(previewLoadingTimeout);
          previewLoadingTimeout = null;
        }
        const renderedCode = typeof pendingRenderedTikz === 'string'
          ? pendingRenderedTikz
          : tikzCode.value || '';
        lastRenderedTikz.value = renderedCode;
        pendingRenderedTikz = null;
        applyPreviewBounds(event.data.bounds);
      }
    }

    function startPreviewDrag(event) {
      const pointer = getPreviewPointer(event);
      preview.drag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        initialOffsetX: preview.offsetX,
        initialOffsetY: preview.offsetY,
        pointer,
      };
      event.currentTarget?.setPointerCapture?.(event.pointerId);
    }

    function stopPreviewDrag() {
      if (preview.drag?.pointerId != null) {
        const viewportEl = previewViewportRef.value;
        if (viewportEl?.hasPointerCapture?.(preview.drag.pointerId)) {
          viewportEl.releasePointerCapture(preview.drag.pointerId);
        }
      }
      preview.drag = null;
    }

    function onPreviewPointerDown(event) {
      if (!hasPreviewContent.value) return;
      if (shouldStartCameraPan(event)) {
        startPreviewDrag(event);
        event.preventDefault();
      }
    }

    function onPreviewPointerMove(event) {
      if (!preview.drag) return;
      const dx = event.clientX - preview.drag.startX;
      const dy = event.clientY - preview.drag.startY;
      preview.offsetX = preview.drag.initialOffsetX + dx;
      preview.offsetY = preview.drag.initialOffsetY + dy;
    }

    function onPreviewPointerUp(event) {
      if (preview.drag?.pointerId === event.pointerId) {
        stopPreviewDrag();
      }
    }

    function onPreviewPointerCancel(event) {
      if (preview.drag?.pointerId === event.pointerId) {
        stopPreviewDrag();
      }
    }

    function onPreviewWheel(event) {
      if (!hasPreviewContent.value) return;
      event.preventDefault();
      const pointer = getPreviewPointer(event);
      const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
      zoomPreviewAt(pointer, factor);
    }

    watch(tikzCode, value => {
      if (!value) {
        stopPreviewDrag();
        preview.srcdoc = '';
        lastRenderedTikz.value = '';
        resetPreviewTransform();
      }
    });

    const currentHint = computed(() => {
      if (state.drawing?.type === 'forms' || state.mode === 'forms') {
        return 'drag to create a new shape';
      }
      if (state.drawing?.type === 'frame' || state.mode === 'frame') {
        return 'drag to define the frame';
      }
      if (state.drawing?.type === 'line' || state.mode === 'line') {
        return 'click and drag to create a free line';
      }
      return state.edgeDraft
        ? 'connect the edge to the target node'
        : 'select elements or drag connectors to create edges';
    });

    const canReset = computed(
      () =>
        state.nodes.length > 0 ||
        state.edges.length > 0 ||
        state.lines.length > 0 ||
        state.textBlocks.length > 0 ||
        state.matrixGrids.length > 0
    );

    function invalidateTikz(options = {}) {
      renderer.value?.draw();
      if (!autoUpdateTikz.value && !options.force) {
        tikzUpdatePending.value = true;
        return;
      }

      tikzCode.value = generateTikzDocument(
        state.nodes,
        state.edges,
        state.lines,
        state.textBlocks,
        state.matrixGrids,
        state.frame,
        {
          edgeThickness: state.edgeThickness,
          edgeLabelAlignment: state.edgeLabelAlignment,
        }
      );
      tikzUpdatePending.value = false;
    }

    watch(
      () => [state.nodes, state.edges, state.lines, state.textBlocks, state.matrixGrids],
      () => {
        invalidateTikz();
      },
      { deep: true, immediate: true }
    );

    watch(
      () => state.edgeThickness,
      () => {
        invalidateTikz();
      }
    );

    watch(
      () => state.edgeLabelAlignment,
      () => {
        invalidateTikz();
      }
    );

    function toggleAutoUpdateTikz() {
      autoUpdateTikz.value = !autoUpdateTikz.value;
      if (autoUpdateTikz.value) {
        invalidateTikz({ force: true });
      }
    }

    watch(
      () => matrixPrompt.visible,
      visible => {
        if (visible) {
          nextTick(() => {
            matrixPromptTextAreaRef.value?.focus();
          });
        }
      }
    );

    watch(
      () => contextMenu.visible,
      visible => {
        if (visible) {
          nextTick(() => {
            adjustContextMenuPosition();
          });
        }
      }
    );

    watch(
      () => matrixPrompt.text,
      () => {
        if (matrixPrompt.error) {
          matrixPrompt.error = '';
        }
      }
    );

    watch(
      () => state.selected?.item?.id,
      () => {
        renderer.value?.draw();
      }
    );

    watch(
      selectedNode,
      node => {
        if (!node) {
          nodeToolbarState.activePopover = null;
          nodeToolbarState.hoveredOption = null;
          nodeToolbarState.fillCustomColor = '#f8fafc';
          nodeToolbarState.strokeCustomColor = '#94a3b8';
          state.borderPreviewSuppressed = false;
          return;
        }
        nodeToolbarState.activePopover = null;
        nodeToolbarState.hoveredOption = null;
        nodeToolbarState.fillCustomColor = normalizeHex(node.color) || '#f8fafc';
        nodeToolbarState.strokeCustomColor = normalizeHex(node.borderColor) || '#94a3b8';
        state.borderPreviewSuppressed = false;
      }
    );

    watch(
      selectedEdge,
      edge => {
        if (!edge) {
          edgeToolbarState.activePopover = null;
          edgeToolbarState.hoveredOption = null;
          edgeToolbarState.customColor = '#94a3b8';
          return;
        }
        edgeToolbarState.activePopover = null;
        edgeToolbarState.hoveredOption = null;
        edgeToolbarState.customColor = normalizeHex(edge.color) || '#94a3b8';
      }
    );

    watch(
      inspectorVisible,
      visible => {
        if (visible) {
          sidebarTab.value = 'inspect';
        } else if (sidebarTab.value === 'inspect') {
          sidebarTab.value = 'code';
        }
      }
    );

    watch(
      () => state.textBlocks,
      blocks => {
        blocks.forEach(block => {
          if (block.width < TEXT_BLOCK_CONSTRAINTS.minWidth) {
            block.width = TEXT_BLOCK_CONSTRAINTS.minWidth;
          }
          if (block.height < TEXT_BLOCK_CONSTRAINTS.minHeight) {
            block.height = TEXT_BLOCK_CONSTRAINTS.minHeight;
          }
        });
      },
      { deep: true }
    );

    watch(
      () => state.frame,
      frame => {
        if (frame) {
          if (frame.width < 64) frame.width = 64;
          if (frame.height < 64) frame.height = 64;
        }
        renderer.value?.draw();
        invalidateTikz();
      },
      { deep: true }
    );

    function changeMode(newMode) {
      const allowed = ['move', 'forms', 'frame', 'line'];
      const target = allowed.includes(newMode) ? newMode : 'move';
      if (target === state.mode) {
        if (target !== 'move') {
          cancelDrawing({ revertMode: false });
          state.mode = 'move';
        }
      } else {
        if (target === 'move') {
          cancelDrawing({ revertMode: false, restoreSelection: false });
        } else {
          cancelDrawing({ revertMode: false });
        }
        state.mode = target;
      }
      state.edgeDraft = null;
      state.hoverNodeId = null;
      state.hoverAnchor = null;
      renderer.value?.draw();
      showDiagramMenu.value = false;
      if (state.mode !== 'forms') {
        showFormsMenu.value = false;
      }
    }

    function toggleDiagramMenu() {
      const next = !showDiagramMenu.value;
      showDiagramMenu.value = next;
      if (next) {
        showEdgeThicknessMenu.value = false;
        showLabelAlignmentMenu.value = false;
        showFormsMenu.value = false;
        showSettingsDialog.value = false;
      }
    }

    function closeDiagramMenu() {
      showDiagramMenu.value = false;
    }

    function toggleFormsMenu() {
      const next = !showFormsMenu.value;
      showFormsMenu.value = next;
      if (next) {
        showDiagramMenu.value = false;
        showEdgeThicknessMenu.value = false;
        showLabelAlignmentMenu.value = false;
        showSettingsDialog.value = false;
      }
    }

    function closeFormsMenu() {
      showFormsMenu.value = false;
    }

    function toggleEdgeThicknessMenu() {
      const next = !showEdgeThicknessMenu.value;
      showEdgeThicknessMenu.value = next;
      if (next) {
        showDiagramMenu.value = false;
        showLabelAlignmentMenu.value = false;
        showFormsMenu.value = false;
        showSettingsDialog.value = false;
      }
    }

    function closeEdgeThicknessMenu() {
      showEdgeThicknessMenu.value = false;
    }

    function toggleLabelAlignmentMenu() {
      const next = !showLabelAlignmentMenu.value;
      showLabelAlignmentMenu.value = next;
      if (next) {
        showDiagramMenu.value = false;
        showEdgeThicknessMenu.value = false;
        showFormsMenu.value = false;
        showSettingsDialog.value = false;
      }
    }

    function closeLabelAlignmentMenu() {
      showLabelAlignmentMenu.value = false;
    }

    function adjustContextMenuPosition() {
      const menuEl = contextMenuRef.value;
      if (!menuEl) {
        return;
      }
      const rect = menuEl.getBoundingClientRect();
      const padding = 12;
      let nextX = contextMenu.x;
      let nextY = contextMenu.y;
      if (rect.right > window.innerWidth) {
        nextX = Math.max(padding, window.innerWidth - rect.width - padding);
      }
      if (rect.bottom > window.innerHeight) {
        nextY = Math.max(padding, window.innerHeight - rect.height - padding);
      }
      if (rect.left < 0) {
        nextX = padding;
      }
      if (rect.top < 0) {
        nextY = padding;
      }
      contextMenu.x = nextX;
      contextMenu.y = nextY;
    }

    function openContextMenu(event) {
      event.preventDefault();
      const pointer = getPointerPosition(event);
      state.pointer = pointer;
      showFormsMenu.value = false;
      showDiagramMenu.value = false;
      showEdgeThicknessMenu.value = false;
      showLabelAlignmentMenu.value = false;
      showSettingsDialog.value = false;
      contextMenu.x = event.clientX;
      contextMenu.y = event.clientY;
      contextMenu.visible = true;
      nextTick(() => {
        adjustContextMenuPosition();
      });
    }

    function closeContextMenu() {
      contextMenu.visible = false;
    }

    function toggleSettingsDialog() {
      const next = !showSettingsDialog.value;
      showSettingsDialog.value = next;
      if (next) {
        showDiagramMenu.value = false;
        showEdgeThicknessMenu.value = false;
        showLabelAlignmentMenu.value = false;
        showFormsMenu.value = false;
      }
    }

    function closeSettingsDialog() {
      showSettingsDialog.value = false;
    }

    function toggleTemplateBrowser() {
      showTemplateBrowser.value = !showTemplateBrowser.value;
    }

    function closeTemplateBrowser() {
      showTemplateBrowser.value = false;
    }

    function currentViewport() {
      const view = renderer.value?.getViewport();
      if (view?.width && view?.height) {
        return view;
      }
      const canvas = canvasRef.value;
      if (!canvas) {
        return { width: 640, height: 360 };
      }
      const rect = canvas.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    }

    function screenToWorld(screenX, screenY) {
      const scale = state.camera.scale;
      const offsetX = state.camera.offsetX;
      const offsetY = state.camera.offsetY;
      return {
        x: (screenX - offsetX) / scale,
        y: (screenY - offsetY) / scale,
      };
    }

    function getViewportCenterPointer() {
      const size = renderer.value?.getViewport() || currentViewport();
      const screenX = size.width / 2;
      const screenY = size.height / 2;
      const world = screenToWorld(screenX, screenY);
      return { ...world, screenX, screenY };
    }

    function getViewportCenterWorld() {
      const center = getViewportCenterPointer();
      return { x: center.x, y: center.y };
    }

    function clampScale(value) {
      return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
    }

    function zoomAt(point, factor) {
      const nextScale = clampScale(state.camera.scale * factor);
      if (nextScale === state.camera.scale) {
        return;
      }
      state.camera.scale = nextScale;
      state.camera.offsetX = point.screenX - point.x * nextScale;
      state.camera.offsetY = point.screenY - point.y * nextScale;
      renderer.value?.draw();
    }

    function focusOnPoint(point) {
      const size = renderer.value?.getViewport() || currentViewport();
      state.camera.offsetX = size.width / 2 - point.x * state.camera.scale;
      state.camera.offsetY = size.height / 2 - point.y * state.camera.scale;
      renderer.value?.draw();
    }

    function fitFrameInView() {
      if (!state.frame) return;
      const size = renderer.value?.getViewport() || currentViewport();
      const padding = 64;
      const availableWidth = Math.max(1, size.width - padding * 2);
      const availableHeight = Math.max(1, size.height - padding * 2);
      const scaleX = availableWidth / state.frame.width;
      const scaleY = availableHeight / state.frame.height;
      const targetScale = clampScale(Math.min(scaleX, scaleY));
      state.camera.scale = targetScale;
      state.camera.offsetX = (size.width - state.frame.width * targetScale) / 2 - state.frame.x * targetScale;
      state.camera.offsetY = (size.height - state.frame.height * targetScale) / 2 - state.frame.y * targetScale;
      renderer.value?.draw();
    }

    function clampRectToFrame(rect) {
      if (!state.frame) return;
      const minX = state.frame.x;
      const minY = state.frame.y;
      const maxX = Math.max(minX, state.frame.x + state.frame.width - rect.width);
      const maxY = Math.max(minY, state.frame.y + state.frame.height - rect.height);
      rect.x = Math.min(Math.max(rect.x, minX), maxX);
      rect.y = Math.min(Math.max(rect.y, minY), maxY);
    }

    function clampMatrixGridToFrame(grid) {
      if (!state.frame || !grid) return;
      const rows = Array.isArray(grid.data) ? grid.data.length : 0;
      const columns = rows > 0 && Array.isArray(grid.data[0]) ? grid.data[0].length : 0;
      const cellSize = Number(grid.cellSize) || 0;
      const rect = {
        x: grid.x,
        y: grid.y,
        width: columns * cellSize,
        height: rows * cellSize,
      };
      clampRectToFrame(rect);
      grid.x = rect.x;
      grid.y = rect.y;
    }

    function shouldStartCameraPan(event) {
      return panModifierActive.value || event.button === 1 || event.button === 2;
    }

    function startCameraDrag(pointer) {
      state.cameraDrag = {
        startScreenX: pointer.screenX,
        startScreenY: pointer.screenY,
        initialOffsetX: state.camera.offsetX,
        initialOffsetY: state.camera.offsetY,
      };
    }

    function endCameraDrag() {
      state.cameraDrag = null;
    }

    function onCanvasWheel(event) {
      event.preventDefault();
      const pointer = getPointerPosition(event);
      const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
      zoomAt(pointer, factor);
    }

    function zoomIn() {
      const center = getViewportCenterPointer();
      zoomAt(center, 1.2);
    }

    function zoomOut() {
      const center = getViewportCenterPointer();
      zoomAt(center, 1 / 1.2);
    }

    function resetView() {
      const center = getViewportCenterWorld();
      state.camera.scale = 1;
      focusOnPoint(center);
    }

    function focusFrame() {
      fitFrameInView();
    }

    function spawnNode(position, shape, options = {}) {
      const node = makeNode(position.x, position.y, shape);
      state.nodes = [...state.nodes, node];
      setSelected({ type: 'node', item: node });
      pushHistory();
      renderer.value?.draw();
      if (!options.silent) {
        flash(
          options.message ||
            'New node added. Drag to reposition and connect using the blue handles.'
        );
      }
      return node;
    }

    function createNodeAtCenter(shape, options = {}) {
      closeDiagramMenu();
      const reference = options.position || getViewportCenterWorld();
      return spawnNode(reference, shape, options);
    }

    function createActiveShape(options = {}) {
      const shapeId = activeShapeId.value || availableShapes[0]?.id;
      if (!shapeId) {
        return;
      }
      if (!options.keepOpen) {
        closeFormsMenu();
      }
      const position =
        options.position || state.pointer || getViewportCenterWorld();
      createNodeAtCenter(shapeId, { ...options, position });
    }

    function createTextBlock(options = {}) {
      closeFormsMenu();
      closeDiagramMenu();
      const target =
        options.position || state.pointer || getViewportCenterWorld();
      const width = Math.max(
        TEXT_BLOCK_CONSTRAINTS.minWidth,
        Number(options.width) || TEXT_BLOCK_DEFAULT_WIDTH
      );
      const height = Math.max(
        TEXT_BLOCK_CONSTRAINTS.minHeight,
        Number(options.height) || TEXT_BLOCK_DEFAULT_HEIGHT
      );
      const color =
        typeof options.color === 'string' && options.color.trim()
          ? options.color.trim()
          : defaultTextColor.value;
      const fillColor =
        typeof options.fillColor === 'string' && options.fillColor.trim()
          ? options.fillColor.trim()
          : state.theme === 'dark'
            ? '#1f2937'
            : '#f8fafc';
      const borderColor =
        typeof options.borderColor === 'string' && options.borderColor.trim()
          ? options.borderColor.trim()
          : '#94a3b8';
      const block = makeTextBlock(
        target.x - width / 2,
        target.y - height / 2,
        width,
        height,
        {
          color,
          fillColor,
          borderColor,
          borderStyle: options.borderStyle,
          borderWidth: options.borderWidth,
          showBackground: options.showBackground ?? true,
          opacity: options.opacity ?? TEXT_BLOCK_OPACITY_RANGE.max,
        }
      );
      state.textBlocks = [...state.textBlocks, block];
      setSelected({ type: 'text', item: block });
      pushHistory();
      renderer.value?.draw();
      invalidateTikz();
      flash(options.message || 'Text block added. Double-click to edit the content.');
      return block;
    }

    function selectShape(shapeId, options = {}) {
      if (!shapeId) {
        return;
      }
      activeShapeId.value = shapeId;
      const keepOpen = options.keepOpen === true;
      if (!keepOpen) {
        closeFormsMenu();
      }
      if (options.create) {
        createActiveShape({ ...options, keepOpen });
      }
    }

    function resetGraph() {
      state.nodes = [];
      state.edges = [];
      state.lines = [];
      state.textBlocks = [];
      state.matrixGrids = [];
      state.selected = null;
      state.edgeDraft = null;
      state.hoverNodeId = null;
      state.hoverAnchor = null;
      state.pointer = null;
      state.mode = 'move';
      clearGuides();
      clearSelectionBox();
      pushHistory();
      flash('The diagram was cleared. Start by adding new elements.');
      renderer.value?.draw();
    }

    function applyTemplate(templateId) {
      const template = templates.find(item => item.id === templateId);
      if (!template) return;

      const requiresConfirmation = canReset.value;
      if (requiresConfirmation) {
        const confirmed = window.confirm(
          'Loading a template will replace the current diagram. Continue?'
        );
        if (!confirmed) {
          return;
        }
      }

      closeInlineEditor();
      closeDiagramMenu();

      state.nodes = template.nodes.map(node => normalizeNode({ ...node }));
      state.edges = template.edges.map(edge => normalizeEdge({ ...edge }));
      state.lines = Array.isArray(template.lines)
        ? template.lines.map(line => normalizeLine({ ...line }))
        : [];
      state.textBlocks = (template.textBlocks || []).map(block =>
        normalizeTextBlock({ ...block }, { defaultColor: defaultTextColor.value })
      );
      state.matrixGrids = (template.matrixGrids || []).map(grid =>
        normalizeMatrixGrid({ ...grid })
      );
      state.selected = null;
      state.mode = 'move';
      state.edgeDraft = null;
      state.hoverNodeId = null;
      state.hoverAnchor = null;
      state.pointer = null;
      clearGuides();
      clearSelectionBox();
      refreshSequencesFromState(state.nodes, state.edges, state.lines, state.textBlocks, state.matrixGrids);

      pushHistory();
      invalidateTikz();
      renderer.value?.draw();
      showTemplateBrowser.value = false;
      flash(`Template "${template.name}" loaded. Adjust as needed.`);
    }

    function selectNode(node, options = {}) {
      if (!node) {
        setSelected(null);
        return;
      }
      if (options.additive) {
        const current = selectedNodes.value;
        const exists = current.some(item => item.id === node.id);
        const nextItems = exists
          ? current.filter(item => item.id !== node.id)
          : [...current, node];
        if (!nextItems.length) {
          setSelected(null);
          return;
        }
        const primary = exists ? nextItems[nextItems.length - 1] : node;
        setSelected({ type: 'node', items: nextItems, item: primary });
        return;
      }
      const current = selectedNodes.value;
      const alreadySelected = current.some(item => item.id === node.id);
      if (alreadySelected && current.length > 1) {
        setSelected({ type: 'node', items: current, item: node });
        return;
      }
      setSelected({ type: 'node', item: node });
    }

    function setSelected(payload, options = {}) {
      if (!payload) {
        state.selected = null;
        if (!options.preserveMode) {
          state.mode = 'move';
        }
        state.borderPreviewSuppressed = false;
        syncLineHandles(null);
        return;
      }
      if (payload.type === 'node') {
        const items = [];
        if (Array.isArray(payload.items)) {
          payload.items.forEach(item => {
            if (item && typeof item.id === 'string' && !items.some(existing => existing.id === item.id)) {
              items.push(item);
            }
          });
        }
        if (payload.item && typeof payload.item.id === 'string' && !items.some(item => item.id === payload.item.id)) {
          items.push(payload.item);
        }
        if (!items.length) {
          state.selected = null;
          return;
        }
        const primary =
          payload.item && items.some(item => item.id === payload.item.id)
            ? payload.item
            : items[items.length - 1];
        state.selected = {
          type: 'node',
          item: primary,
          items,
        };
        syncLineHandles(null);
        return;
      }
      if (payload.type === 'line') {
        if (!payload.item) {
          state.selected = null;
          if (!options.preserveMode) {
            state.mode = 'move';
          }
          state.borderPreviewSuppressed = false;
          syncLineHandles(null);
          return;
        }
        state.selected = { type: 'line', item: payload.item };
        state.borderPreviewSuppressed = false;
        syncLineHandles(payload.item);
        return;
      }
      state.selected = payload;
      state.borderPreviewSuppressed = false;
      if (payload.type !== 'line') {
        syncLineHandles(null);
      }
    }

    function removeSelected(options = {}) {
      const current = state.selected;
      if (!current) return;
      if (current.type === 'node') {
        const nodes = Array.isArray(current.items) && current.items.length
          ? current.items
          : current.item
            ? [current.item]
            : [];
        if (!nodes.length) {
          return;
        }
        const nodeIds = new Set(nodes.map(node => node.id));
        state.edges = state.edges.filter(
          edge => !nodeIds.has(edge.from) && !nodeIds.has(edge.to)
        );
        state.nodes = state.nodes.filter(node => !nodeIds.has(node.id));
      } else if (current.type === 'line') {
        state.lines = state.lines.filter(line => line.id !== current.item.id);
      } else if (current.type === 'edge') {
        state.edges = state.edges.filter(edge => edge.id !== current.item.id);
      } else if (current.type === 'text') {
        state.textBlocks = state.textBlocks.filter(block => block.id !== current.item.id);
      } else if (current.type === 'matrix') {
        state.matrixGrids = state.matrixGrids.filter(grid => grid.id !== current.item.id);
      }
      state.selected = null;
      pushHistory();
      if (!options.silent) {
        flash('Element removed from the canvas.');
      }
    }

    function createFrame() {
      if (state.frame) return;
      const center = getViewportCenterWorld();
      const defaultWidth = 640;
      const defaultHeight = 480;
      state.frame = {
        x: center.x - defaultWidth / 2,
        y: center.y - defaultHeight / 2,
        width: defaultWidth,
        height: defaultHeight,
      };
      nextTick(() => {
        fitFrameInView();
        pushHistory();
        flash('Frame created. Adjust the dimensions as needed.');
      });
    }

    function removeFrame() {
      if (!state.frame) return;
      state.frame = null;
      clearGuides();
      renderer.value?.draw();
      pushHistory();
      flash('Frame removed. The canvas now shows all content.');
    }

    function copySelection(options = {}) {
      const selection = state.selected;
      if (!selection) {
        return false;
      }
      if (selection.type === 'node') {
        const nodes = selectedNodes.value;
        if (!nodes.length) {
          return false;
        }
        const centerX = nodes.reduce((sum, node) => sum + node.x, 0) / nodes.length;
        const centerY = nodes.reduce((sum, node) => sum + node.y, 0) / nodes.length;
        const nodePayload = nodes.map(node => ({
          sourceId: node.id,
          x: node.x,
          y: node.y,
          label: node.label,
          color: node.color,
          borderColor: node.borderColor,
          borderWidth: node.borderWidth,
          fontSize: node.fontSize,
          cornerRadius: node.cornerRadius,
          shape: node.shape,
          opacity: node.opacity,
          size: (() => {
            const { width, height } = resolveNodeSize(node);
            return { width, height };
          })(),
        }));
        const nodeIds = new Set(nodes.map(node => node.id));
        const edgePayload = state.edges
          .filter(edge => nodeIds.has(edge.from) && nodeIds.has(edge.to))
          .map(edge => ({
            sourceId: edge.id,
            from: edge.from,
            to: edge.to,
            fromAnchor: edge.fromAnchor,
            toAnchor: edge.toAnchor,
            style: edge.style,
            direction: edge.direction,
            shape: edge.shape,
            bend: edge.bend,
            label: edge.label ? { ...edge.label } : null,
            color: edge.color,
            thickness: edge.thickness,
          }));
        clipboard.value = {
          type: 'nodes',
          center: { x: centerX, y: centerY },
          nodes: nodePayload,
          edges: edgePayload,
        };
        if (!options?.silent) {
          const message = nodePayload.length > 1
            ? 'Elementos copiados. Use Ctrl+V para colar.'
            : 'Elemento copiado. Use Ctrl+V para colar.';
          flash(message);
        }
        return true;
      }
        if (selection.type === 'text' && selection.item) {
        const block = selection.item;
        clipboard.value = {
          type: 'text',
          center: { x: block.x, y: block.y },
          block: {
            x: block.x,
            y: block.y,
            width: block.width,
            height: block.height,
            text: block.text,
            fontSize: block.fontSize,
            fontWeight: block.fontWeight,
            color: block.color,
            fillColor: block.fillColor,
            borderColor: block.borderColor,
            borderWidth: block.borderWidth,
            borderStyle: block.borderStyle,
            showBackground: block.showBackground,
            opacity: block.opacity,
          },
        };
        if (!options?.silent) {
          flash('Text block copied. Use Ctrl+V to paste.');
        }
        return true;
      }
      if (selection.type === 'line' && selection.item) {
        const line = selection.item;
        const start = {
          x: Number(line.start?.x) || 0,
          y: Number(line.start?.y) || 0,
        };
        const end = {
          x: Number(line.end?.x) || 0,
          y: Number(line.end?.y) || 0,
        };
        clipboard.value = {
          type: 'line',
          center: {
            x: (start.x + end.x) / 2,
            y: (start.y + end.y) / 2,
          },
          line: {
            start,
            end,
            color: line.color,
            style: line.style,
            thickness: line.thickness,
            label: line.label,
          },
        };
        if (!options?.silent) {
          flash('Linha copiada. Use Ctrl+V para colar.');
        }
        return true;
      }
      if (selection.type === 'matrix' && selection.item) {
        const grid = selection.item;
        clipboard.value = {
          type: 'matrix',
          center: { x: grid.x, y: grid.y },
          grid: {
            x: grid.x,
            y: grid.y,
            cellSize: grid.cellSize,
            data: Array.isArray(grid.data) ? grid.data.map(row => [...row]) : [],
            colorMap: { ...(grid.colorMap || {}) },
          },
        };
        if (!options?.silent) {
          flash('Matrix copied. Use Ctrl+V to paste.');
        }
        return true;
      }
      return false;
    }

    function getPasteAnchor(options = {}) {
      if (options.anchor) {
        return options.anchor;
      }
      if (state.pointer) {
        return { x: state.pointer.x, y: state.pointer.y };
      }
      return getViewportCenterWorld();
    }

    function pasteSelection(options = {}) {
      const payload = options.clipboard || clipboard.value;
      if (!payload) {
        flash('There is no copied content to paste.');
        return false;
      }
      const anchor = getPasteAnchor(options);
      const baseCenter = payload.center || anchor;
      const extraOffsetX = options.offset?.x ?? 0;
      const extraOffsetY = options.offset?.y ?? 0;
      const offsetX = anchor.x - baseCenter.x + extraOffsetX;
      const offsetY = anchor.y - baseCenter.y + extraOffsetY;

      if (payload.type === 'nodes') {
        const createdNodes = [];
        const idMap = new Map();
        payload.nodes.forEach(nodeData => {
          const node = makeNode(nodeData.x + offsetX, nodeData.y + offsetY, nodeData.shape);
          node.label = nodeData.label;
          node.color = nodeData.color;
          node.borderColor = nodeData.borderColor;
          node.borderWidth = nodeData.borderWidth;
          node.fontSize = nodeData.fontSize;
          node.cornerRadius = nodeData.cornerRadius;
          node.opacity = nodeData.opacity;
          if (nodeData.size) {
            node.size = normalizeNodeSizeForShape(nodeData.size, node.shape);
          }
          createdNodes.push(node);
          idMap.set(nodeData.sourceId || nodeData.id || node.id, node.id);
        });
        if (!createdNodes.length) {
          return false;
        }
        state.nodes = [...state.nodes, ...createdNodes];
        const createdEdges = [];
        if (Array.isArray(payload.edges)) {
          payload.edges.forEach(edgeData => {
            const fromId = idMap.get(edgeData.from);
            const toId = idMap.get(edgeData.to);
            if (!fromId || !toId) {
              return;
            }
            const edge = makeEdge(fromId, toId);
            edge.fromAnchor = edgeData.fromAnchor;
            edge.toAnchor = edgeData.toAnchor;
            edge.style = edgeData.style || 'solid';
            edge.direction = edgeData.direction || '->';
            edge.shape = edgeData.shape || 'straight';
            edge.bend = edgeData.bend ?? 30;
            edge.label = edgeData.label ? { ...edgeData.label } : null;
            edge.color = edgeData.color || '#94a3b8';
            edge.thickness = edgeData.thickness ?? null;
            createdEdges.push(edge);
          });
        }
        if (createdEdges.length) {
          state.edges = [...state.edges, ...createdEdges];
        }
        setSelected({
          type: 'node',
          items: createdNodes,
          item: createdNodes[createdNodes.length - 1] || null,
        });
        pushHistory();
        renderer.value?.draw();
        flash(options.message || 'Elementos colados no canvas.');
        return true;
      }

      if (payload.type === 'line' && payload.line) {
        const lineData = payload.line;
        const start = {
          x: (Number(lineData.start?.x) || 0) + offsetX,
          y: (Number(lineData.start?.y) || 0) + offsetY,
        };
        const end = {
          x: (Number(lineData.end?.x) || 0) + offsetX,
          y: (Number(lineData.end?.y) || 0) + offsetY,
        };
        const newLine = makeLine(start, end);
        if (typeof lineData.color === 'string' && lineData.color.trim()) {
          newLine.color = lineData.color.trim();
        }
        const styleOptions = new Set(['solid', 'dashed', 'dotted']);
        if (typeof lineData.style === 'string') {
          const normalizedStyle = lineData.style.trim().toLowerCase();
          if (styleOptions.has(normalizedStyle)) {
            newLine.style = normalizedStyle;
          }
        }
        const thicknessValue = Number(lineData.thickness);
        if (Number.isFinite(thicknessValue) && thicknessValue > 0) {
          newLine.thickness = thicknessValue;
        } else if (lineData.thickness === null) {
          newLine.thickness = null;
        }
        if (typeof lineData.label === 'string') {
          const trimmedLabel = lineData.label.trim();
          newLine.label = trimmedLabel || null;
        } else if (lineData.label == null) {
          newLine.label = null;
        }
        state.lines = [...state.lines, newLine];
        setSelected({ type: 'line', item: newLine });
        pushHistory();
        renderer.value?.draw();
        flash(options.message || 'Linha colada no canvas.');
        return true;
      }

      if (payload.type === 'text' && payload.block) {
        const blockData = payload.block;
        const newBlock = normalizeTextBlock(
          {
            id: `text-${textSequence++}`,
            x: blockData.x + offsetX,
            y: blockData.y + offsetY,
            width: blockData.width,
            height: blockData.height,
            text: blockData.text,
            fontSize: blockData.fontSize,
            fontWeight: blockData.fontWeight,
            color: blockData.color,
            fillColor: blockData.fillColor,
            borderColor: blockData.borderColor,
            borderWidth: blockData.borderWidth,
            borderStyle: blockData.borderStyle,
            showBackground: blockData.showBackground,
            opacity: blockData.opacity,
          },
          { defaultColor: defaultTextColor.value }
        );
        state.textBlocks = [...state.textBlocks, newBlock];
        setSelected({ type: 'text', item: newBlock });
        pushHistory();
        renderer.value?.draw();
        flash(options.message || 'Bloco de texto colado.');
        return true;
      }

      if (payload.type === 'matrix' && payload.grid) {
        const gridData = payload.grid;
        const newGrid = {
          id: `matrix-${matrixSequence++}`,
          x: gridData.x + offsetX,
          y: gridData.y + offsetY,
          cellSize: gridData.cellSize,
          data: Array.isArray(gridData.data) ? gridData.data.map(row => [...row]) : [],
          colorMap: { ...(gridData.colorMap || {}) },
        };
        state.matrixGrids = [...state.matrixGrids, newGrid];
        setSelected({ type: 'matrix', item: newGrid });
        pushHistory();
        renderer.value?.draw();
        flash(options.message || 'Matriz colada no canvas.');
        return true;
      }

      return false;
    }

    function cutSelection() {
      const copied = copySelection({ silent: true });
      if (!copied) {
        return;
      }
      removeSelected({ silent: true });
      flash('Elements cut. Use Ctrl+V to paste.');
    }

    function duplicateSelection() {
      const copied = copySelection({ silent: true });
      if (!copied || !clipboard.value) {
        return;
      }
      const payload = clipboard.value;
      const baseCenter = payload.center || getViewportCenterWorld();
      const anchor = {
        x: baseCenter.x + 40,
        y: baseCenter.y + 40,
      };
      pasteSelection({ clipboard: payload, anchor, message: 'Elementos duplicados.' });
    }

    function getPointerPosition(event) {
      const canvas = canvasRef.value;
      if (!canvas) return { x: 0, y: 0, screenX: 0, screenY: 0 };
      const rect = canvas.getBoundingClientRect();
      const clientX = 'clientX' in event ? event.clientX : rect.left + rect.width / 2;
      const clientY = 'clientY' in event ? event.clientY : rect.top + rect.height / 2;
      const screenX = clientX - rect.left;
      const screenY = clientY - rect.top;
      const world = screenToWorld(screenX, screenY);
      return {
        ...world,
        screenX,
        screenY,
      };
    }

    function determineAnchorForPointer(node, point) {
      const dx = point.x - node.x;
      const dy = point.y - node.y;
      if (Math.abs(dx) > Math.abs(dy)) {
        return dx >= 0 ? 'east' : 'west';
      }
      return dy >= 0 ? 'south' : 'north';
    }

    function startDrag(context) {
      state.dragContext = {
        ...context,
      };
      state.dragMoved = false;
      clearGuides();
    }

    function clearGuides() {
      if (!state.guides) return;
      state.guides.vertical = null;
      state.guides.horizontal = null;
      state.guides.snapTarget = null;
      state.guides.rotation = null;
      state.guides.spacing = null;
    }

    function applyGuides(optionsOrVertical, maybeHorizontal) {
      if (!state.guides) return;
      if (
        typeof optionsOrVertical === 'object' &&
        optionsOrVertical !== null &&
        maybeHorizontal === undefined
      ) {
        const {
          vertical = null,
          horizontal = null,
          snapTarget = null,
          rotation = null,
          spacing = null,
        } = optionsOrVertical;
        state.guides.vertical = vertical;
        state.guides.horizontal = horizontal;
        state.guides.snapTarget = snapTarget;
        state.guides.rotation = rotation;
        state.guides.spacing = spacing;
        return;
      }
      state.guides.vertical = optionsOrVertical ?? null;
      state.guides.horizontal = maybeHorizontal ?? null;
      state.guides.snapTarget = null;
      state.guides.rotation = null;
      state.guides.spacing = null;
    }

    function getNodesWithinRect(rect) {
      if (!renderer.value || !rect) {
        return [];
      }
      const nodes = [];
      state.nodes.forEach(node => {
        const bounds = renderer.value?.getNodeBounds?.(node);
        if (!bounds) {
          return;
        }
        if (
          bounds.left >= rect.left &&
          bounds.right <= rect.right &&
          bounds.top >= rect.top &&
          bounds.bottom <= rect.bottom
        ) {
          nodes.push(node);
        }
      });
      return nodes;
    }

    function startSelectionBox(pointer, options = {}) {
      state.selectionRect = {
        originX: pointer.x,
        originY: pointer.y,
        left: pointer.x,
        top: pointer.y,
        right: pointer.x,
        bottom: pointer.y,
        width: 0,
        height: 0,
        additive: !!options.additive,
      };
      state.selectionDraft = [];
    }

    function updateSelectionBox(pointer) {
      const rect = state.selectionRect;
      if (!rect) return;
      const left = Math.min(rect.originX, pointer.x);
      const right = Math.max(rect.originX, pointer.x);
      const top = Math.min(rect.originY, pointer.y);
      const bottom = Math.max(rect.originY, pointer.y);
      rect.left = left;
      rect.right = right;
      rect.top = top;
      rect.bottom = bottom;
      rect.width = right - left;
      rect.height = bottom - top;
      state.selectionDraft = getNodesWithinRect(rect);
    }

    function clearSelectionBox() {
      state.selectionRect = null;
      state.selectionDraft = [];
    }

    function normalizeSelectionSnapshot(selection) {
      if (!selection) return null;
      if (selection.type === 'node') {
        const items = Array.isArray(selection.items)
          ? selection.items.filter(Boolean)
          : selection.item
          ? [selection.item]
          : [];
        const item = selection.item || items[items.length - 1] || null;
        if (!item) return null;
        return { type: 'node', item, items };
      }
      if (selection.type === 'line') {
        return { type: 'line', item: selection.item };
      }
      if (selection.type === 'edge' || selection.type === 'text' || selection.type === 'matrix') {
        return { type: selection.type, item: selection.item };
      }
      return null;
    }

    function beginDrawing(mode, pointer) {
      if (!pointer) return;
      if (!['forms', 'frame', 'line'].includes(mode)) {
        return;
      }
      const selectionSnapshot = normalizeSelectionSnapshot(state.selected);
      state.drawing = {
        type: mode,
        start: { x: pointer.x, y: pointer.y },
        current: { x: pointer.x, y: pointer.y },
        shape: mode === 'forms' ? (activeShapeId.value || availableShapes[0]?.id || null) : null,
        selection: selectionSnapshot,
      };
      renderer.value?.draw();
    }

    function updateDrawing(pointer, options = {}) {
      if (!state.drawing || !pointer) {
        return;
      }
      const draft = state.drawing;
      if (draft.type === 'line') {
        let nextPoint = { x: pointer.x, y: pointer.y };
        if (options.shiftKey) {
          nextPoint = constrainPointToAxis(draft.start, nextPoint);
          clearGuides();
        } else {
          const snapped = findLineSnapPoint(nextPoint, { excludePoints: [draft.start] });
          if (snapped) {
            nextPoint = { x: snapped.x, y: snapped.y };
            applyGuides({ snapTarget: snapped });
          } else {
            clearGuides();
          }
        }
        draft.current = nextPoint;
      } else {
        draft.current = { x: pointer.x, y: pointer.y };
      }
      renderer.value?.draw();
    }

    function cancelDrawing(options = {}) {
      const draft = state.drawing;
      if (!draft) return;
      state.drawing = null;
      if (options.restoreSelection !== false && draft.selection) {
        setSelected(draft.selection, { preserveMode: true });
      }
      if (options.revertMode !== false) {
        state.mode = 'move';
      }
      renderer.value?.draw();
      clearGuides();
    }

    function completeDrawing(pointer) {
      const draft = state.drawing;
      if (!draft) {
        return false;
      }
      const endPoint = pointer
        ? { x: pointer.x, y: pointer.y }
        : draft.current || draft.start;
      const startPoint = draft.start;
      let created = false;

      if (draft.type === 'forms') {
        const shapeId = draft.shape || activeShapeId.value || availableShapes[0]?.id;
        if (!shapeId) {
          cancelDrawing({ revertMode: true });
          return false;
        }
        const distance = Math.hypot(endPoint.x - startPoint.x, endPoint.y - startPoint.y);
        const center = distance < 6
          ? { x: startPoint.x, y: startPoint.y }
          : {
              x: startPoint.x + (endPoint.x - startPoint.x) / 2,
              y: startPoint.y + (endPoint.y - startPoint.y) / 2,
            };
        const node = spawnNode(center, shapeId, { silent: true });
        if (node) {
          invalidateTikz();
          flash('Shape created.');
          created = true;
        }
      } else if (draft.type === 'frame') {
        const rawWidth = Math.abs(endPoint.x - startPoint.x);
        const rawHeight = Math.abs(endPoint.y - startPoint.y);
        if (rawWidth >= 4 && rawHeight >= 4) {
          const minSize = 64;
          const width = Math.max(minSize, rawWidth);
          const height = Math.max(minSize, rawHeight);
          const left = Math.min(startPoint.x, endPoint.x);
          const top = Math.min(startPoint.y, endPoint.y);
          state.frame = {
            x: left,
            y: top,
            width,
            height,
          };
          pushHistory();
          invalidateTikz();
          flash('Frame created.');
          created = true;
        }
      } else if (draft.type === 'line') {
        const distance = Math.hypot(endPoint.x - startPoint.x, endPoint.y - startPoint.y);
        if (distance >= 6) {
          const line = makeLine(startPoint, endPoint);
          line.thickness = state.edgeThickness;
          state.lines = [...state.lines, line];
          setSelected({ type: 'line', item: line });
          pushHistory();
          invalidateTikz();
          flash('Line created.');
          created = true;
        }
      }

      state.drawing = null;
      state.mode = 'move';
      renderer.value?.draw();
      clearGuides();
      if (!created && draft.selection) {
        setSelected(draft.selection);
      }
      return created;
    }

    function finalizeSelectionBox() {
      const rect = state.selectionRect;
      if (!rect) {
        return false;
      }
      const nodes = getNodesWithinRect(rect);
      const additive = rect.additive;
      const isClick = rect.width <= 3 && rect.height <= 3;
      clearSelectionBox();
      if (!nodes.length) {
        if (!additive && isClick) {
          setSelected(null);
        }
        return true;
      }
      if (additive && state.selected?.type === 'node') {
        const existing = selectedNodes.value;
        const combined = [...existing];
        nodes.forEach(node => {
          if (!combined.some(item => item.id === node.id)) {
            combined.push(node);
          }
        });
        if (combined.length) {
          setSelected({ type: 'node', items: combined, item: nodes[nodes.length - 1] });
        }
      } else {
        setSelected({ type: 'node', items: nodes, item: nodes[nodes.length - 1] });
      }
      return true;
    }

    function collectStaticBounds(context) {
      const boundsList = [];
      if (!renderer.value) {
        return boundsList;
      }
      const pushBounds = bounds => {
        if (bounds && Number.isFinite(bounds.left) && Number.isFinite(bounds.top)) {
          boundsList.push(bounds);
        }
      };
      const skipIds = new Set();
      if (context.mode === 'move-node') {
        if (Array.isArray(context.selection) && context.selection.length) {
          context.selection.forEach(entry => {
            if (entry?.node?.id) {
              skipIds.add(entry.node.id);
            }
          });
        } else if (context.item?.id) {
          skipIds.add(context.item.id);
        }
      }
      state.nodes.forEach(node => {
        if (skipIds.has(node.id)) return;
        pushBounds(renderer.value.getNodeBounds(node));
      });
      (state.textBlocks || []).forEach(block => {
        if (context.mode === 'move-text' && block.id === context.item?.id) return;
        pushBounds(renderer.value.getTextBlockBounds(block));
      });
      (state.matrixGrids || []).forEach(grid => {
        if (context.mode === 'move-matrix' && grid.id === context.item?.id) return;
        pushBounds(renderer.value?.getMatrixGridBounds?.(grid));
      });
      if (state.frame) {
        pushBounds(renderer.value.getFrameBounds(state.frame));
      }
      return boundsList;
    }

    function collectGuideCandidates(context) {
      const result = { vertical: [], horizontal: [] };
      const boundsList = collectStaticBounds(context);
      boundsList.forEach(bounds => {
        result.vertical.push(bounds.left, bounds.centerX, bounds.right);
        result.horizontal.push(bounds.top, bounds.centerY, bounds.bottom);
      });
      result.vertical = Array.from(new Set(result.vertical));
      result.horizontal = Array.from(new Set(result.horizontal));
      return result;
    }

    const SPACING_SNAP_TOLERANCE = 8;
    const MIN_SPACING_FOR_SNAP = 2;

    function computeAxisGaps(boundsList, axis) {
      const sorted = [...boundsList].sort((a, b) =>
        axis === 'x' ? a.left - b.left : a.top - b.top
      );
      const gaps = new Set();
      for (let index = 0; index < sorted.length - 1; index += 1) {
        const current = sorted[index];
        const next = sorted[index + 1];
        if (!current || !next) continue;
        const gap =
          axis === 'x' ? next.left - current.right : next.top - current.bottom;
        if (Number.isFinite(gap) && gap >= MIN_SPACING_FOR_SNAP) {
          gaps.add(Number(gap.toFixed(2)));
        }
      }
      return Array.from(gaps);
    }

    function buildSpacingGuide(axis, orientation, baseBounds, referenceBounds, gap, dx, dy) {
      if (axis === 'x') {
        const left = baseBounds.left + dx;
        const right = baseBounds.right + dx;
        const baseline = Math.max(referenceBounds.bottom, baseBounds.bottom + dy) + 12;
        if (orientation === 'right-of') {
          return {
            axis: 'x',
            from: { x: referenceBounds.right, y: baseline },
            to: { x: left, y: baseline },
            gap,
          };
        }
        return {
          axis: 'x',
          from: { x: right, y: baseline },
          to: { x: referenceBounds.left, y: baseline },
          gap,
        };
      }
      const top = baseBounds.top + dy;
      const bottom = baseBounds.bottom + dy;
      const baseline = Math.max(referenceBounds.right, baseBounds.right + dx) + 12;
      if (orientation === 'below') {
        return {
          axis: 'y',
          from: { x: baseline, y: referenceBounds.bottom },
          to: { x: baseline, y: top },
          gap,
        };
      }
      return {
        axis: 'y',
        from: { x: baseline, y: bottom },
        to: { x: baseline, y: referenceBounds.top },
        gap,
      };
    }

    function computeSpacingAdjustment(context, dx, dy) {
      if (!context.bounds) {
        return null;
      }
      const staticBounds = collectStaticBounds(context);
      if (!staticBounds.length) {
        return null;
      }
      const baseBounds = context.bounds;
      const gapsX = computeAxisGaps(staticBounds, 'x');
      const gapsY = computeAxisGaps(staticBounds, 'y');
      let snappedDx = dx;
      let snappedDy = dy;
      let spacingGuide = null;

      const evaluateAxis = (axis, gaps, currentDelta) => {
        if (!gaps.length) {
          return;
        }
        let best = null;
        staticBounds.forEach(bounds => {
          gaps.forEach(gap => {
            if (!Number.isFinite(gap)) return;
            if (axis === 'x') {
              const candidateLeft = bounds.right + gap;
              const dxCandidate = candidateLeft - baseBounds.left;
              const deltaRight = Math.abs(dxCandidate - currentDelta);
              if (deltaRight <= SPACING_SNAP_TOLERANCE && (!best || deltaRight < best.delta)) {
                best = {
                  axis: 'x',
                  delta: deltaRight,
                  value: dxCandidate,
                  orientation: 'right-of',
                  ref: bounds,
                  gap,
                };
              }
              const candidateRight = bounds.left - gap;
              const dxCandidateLeft = candidateRight - baseBounds.right;
              const deltaLeft = Math.abs(dxCandidateLeft - currentDelta);
              if (deltaLeft <= SPACING_SNAP_TOLERANCE && (!best || deltaLeft < best.delta)) {
                best = {
                  axis: 'x',
                  delta: deltaLeft,
                  value: dxCandidateLeft,
                  orientation: 'left-of',
                  ref: bounds,
                  gap,
                };
              }
            } else {
              const candidateTop = bounds.bottom + gap;
              const dyCandidate = candidateTop - baseBounds.top;
              const deltaBelow = Math.abs(dyCandidate - currentDelta);
              if (deltaBelow <= SPACING_SNAP_TOLERANCE && (!best || deltaBelow < best.delta)) {
                best = {
                  axis: 'y',
                  delta: deltaBelow,
                  value: dyCandidate,
                  orientation: 'below',
                  ref: bounds,
                  gap,
                };
              }
              const candidateBottom = bounds.top - gap;
              const dyCandidateTop = candidateBottom - baseBounds.bottom;
              const deltaAbove = Math.abs(dyCandidateTop - currentDelta);
              if (deltaAbove <= SPACING_SNAP_TOLERANCE && (!best || deltaAbove < best.delta)) {
                best = {
                  axis: 'y',
                  delta: deltaAbove,
                  value: dyCandidateTop,
                  orientation: 'above',
                  ref: bounds,
                  gap,
                };
              }
            }
          });
        });
        if (best) {
          if (best.axis === 'x') {
            snappedDx = best.value;
            spacingGuide = buildSpacingGuide('x', best.orientation, baseBounds, best.ref, best.gap, snappedDx, snappedDy);
          } else {
            snappedDy = best.value;
            spacingGuide = buildSpacingGuide('y', best.orientation, baseBounds, best.ref, best.gap, snappedDx, snappedDy);
          }
        }
      };

      evaluateAxis('x', gapsX, snappedDx);
      evaluateAxis('y', gapsY, snappedDy);

      if (spacingGuide) {
        spacingGuide.label = `${Math.round(spacingGuide.gap)}px`;
      }

      return spacingGuide
        ? { dx: snappedDx, dy: snappedDy, spacing: spacingGuide }
        : null;
    }

    function computeGuideSnap(context, dx, dy) {
      if (!renderer.value || !context.bounds) {
        return null;
      }
      const candidates = collectGuideCandidates(context);
      const tolerance = 12;
      let snappedDx = dx;
      let snappedDy = dy;
      let verticalGuide = null;
      let horizontalGuide = null;
      let spacingGuide = null;

      const initial = context.bounds;

      const evaluateAxis = (lines, projections, axis) => {
        let best = null;
        lines.forEach(line => {
          projections.forEach(projection => {
            const delta = Math.abs(line - (projection.base + projection.offset));
            if (delta <= tolerance && (!best || delta < best.delta)) {
              best = { line, projection, delta };
            }
          });
        });
        if (!best) return null;
        if (axis === 'x') {
          const current = best.projection.base + best.projection.offset;
          snappedDx += best.line - current;
          verticalGuide = best.line;
        } else {
          const current = best.projection.base + best.projection.offset;
          snappedDy += best.line - current;
          horizontalGuide = best.line;
        }
        return best.line;
      };

      const verticalProjections = [
        { base: initial.left, offset: snappedDx },
        { base: initial.centerX, offset: snappedDx },
        { base: initial.right, offset: snappedDx },
      ];
      evaluateAxis(candidates.vertical, verticalProjections, 'x');

      const horizontalProjections = [
        { base: initial.top, offset: snappedDy },
        { base: initial.centerY, offset: snappedDy },
        { base: initial.bottom, offset: snappedDy },
      ];
      evaluateAxis(candidates.horizontal, horizontalProjections, 'y');

      const spacingAdjustment = computeSpacingAdjustment(context, snappedDx, snappedDy);
      if (spacingAdjustment) {
        snappedDx = spacingAdjustment.dx;
        snappedDy = spacingAdjustment.dy;
        spacingGuide = spacingAdjustment.spacing;
      }

      return {
        dx: snappedDx,
        dy: snappedDy,
        vertical: verticalGuide,
        horizontal: horizontalGuide,
        spacing: spacingGuide,
      };
    }

    function constrainPointToAxis(origin, point) {
      if (!origin || !point) {
        return point;
      }
      const dx = point.x - origin.x;
      const dy = point.y - origin.y;
      if (Math.abs(dx) > Math.abs(dy)) {
        return { x: point.x, y: origin.y };
      }
      return { x: origin.x, y: point.y };
    }

    function getGridSnapPoints(point) {
      if (!point) return [];
      const baseX = Math.round(point.x / GRID_SNAP_SPACING) * GRID_SNAP_SPACING;
      const baseY = Math.round(point.y / GRID_SNAP_SPACING) * GRID_SNAP_SPACING;
      const points = [];
      for (let dx = -GRID_SNAP_SPACING; dx <= GRID_SNAP_SPACING; dx += GRID_SNAP_SPACING) {
        for (let dy = -GRID_SNAP_SPACING; dy <= GRID_SNAP_SPACING; dy += GRID_SNAP_SPACING) {
          const x = baseX + dx;
          const y = baseY + dy;
          points.push({ x, y, type: 'grid', source: `grid-${x}-${y}` });
        }
      }
      return points;
    }

    function collectLineSnapPoints(point) {
      if (!renderer.value) {
        return [];
      }
      const points = [];
      const pushPoint = (x, y, meta = {}) => {
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
          return;
        }
        points.push({ x, y, ...meta });
      };

      state.nodes.forEach(node => {
        pushPoint(node.x, node.y, { type: 'node-center', source: node.id });
        const anchors = renderer.value?.getNodeAnchors?.(node) || [];
        anchors.forEach(anchor => {
          if (!anchor?.point) return;
          pushPoint(anchor.point.x, anchor.point.y, {
            type: 'node-anchor',
            source: `${node.id}:${anchor.direction}`,
            direction: anchor.direction,
          });
        });
      });

      (state.textBlocks || []).forEach(block => {
        const left = block.x;
        const top = block.y;
        const right = block.x + block.width;
        const bottom = block.y + block.height;
        const centerX = (left + right) / 2;
        const centerY = (top + bottom) / 2;
        pushPoint(centerX, centerY, { type: 'text-center', source: block.id });
        pushPoint(left, top, { type: 'text-corner', source: `${block.id}-nw` });
        pushPoint(right, top, { type: 'text-corner', source: `${block.id}-ne` });
        pushPoint(right, bottom, { type: 'text-corner', source: `${block.id}-se` });
        pushPoint(left, bottom, { type: 'text-corner', source: `${block.id}-sw` });
      });

      if (state.frame) {
        const frame = state.frame;
        const corners = [
          { x: frame.x, y: frame.y, source: 'frame-nw' },
          { x: frame.x + frame.width, y: frame.y, source: 'frame-ne' },
          { x: frame.x + frame.width, y: frame.y + frame.height, source: 'frame-se' },
          { x: frame.x, y: frame.y + frame.height, source: 'frame-sw' },
        ];
        corners.forEach(corner => {
          pushPoint(corner.x, corner.y, { type: 'frame-corner', source: corner.source });
        });
        pushPoint(frame.x + frame.width / 2, frame.y, { type: 'frame-edge', source: 'frame-top' });
        pushPoint(frame.x + frame.width, frame.y + frame.height / 2, {
          type: 'frame-edge',
          source: 'frame-right',
        });
        pushPoint(frame.x + frame.width / 2, frame.y + frame.height, {
          type: 'frame-edge',
          source: 'frame-bottom',
        });
        pushPoint(frame.x, frame.y + frame.height / 2, { type: 'frame-edge', source: 'frame-left' });
      }

      points.push(...getGridSnapPoints(point));
      return points;
    }

    function findLineSnapPoint(point, options = {}) {
      if (!point) {
        return null;
      }
      const skip = Array.isArray(options.excludePoints) ? options.excludePoints : [];
      const tolerance = options.tolerance ?? LINE_SNAP_TOLERANCE;
      const candidates = collectLineSnapPoints(point);
      let best = null;
      candidates.forEach(candidate => {
        if (!candidate) return;
        const matchesSkip = skip.some(skipPoint => {
          if (!skipPoint) {
            return false;
          }
          return Math.hypot((candidate.x ?? 0) - skipPoint.x, (candidate.y ?? 0) - skipPoint.y) < 1e-3;
        });
        if (matchesSkip) {
          return;
        }
        const dx = (candidate.x ?? 0) - point.x;
        const dy = (candidate.y ?? 0) - point.y;
        const distance = Math.hypot(dx, dy);
        if (distance <= tolerance && (!best || distance < best.distance)) {
          best = { ...candidate, distance };
        }
      });
      return best;
    }

    function applyFrameResize(context, dx, dy) {
      if (!state.frame) return;
      const minSize = 64;
      const initial = context.initial;
      let x = initial.x;
      let y = initial.y;
      let width = initial.width;
      let height = initial.height;
      const handle = context.handle || '';

      if (handle.includes('e')) {
        width = Math.max(minSize, initial.width + dx);
      }
      if (handle.includes('s')) {
        height = Math.max(minSize, initial.height + dy);
      }
      if (handle.includes('w')) {
        const maxX = initial.x + initial.width - minSize;
        const newX = Math.min(initial.x + dx, maxX);
        x = newX;
        width = Math.max(minSize, initial.width + (initial.x - newX));
      }
      if (handle.includes('n')) {
        const maxY = initial.y + initial.height - minSize;
        const newY = Math.min(initial.y + dy, maxY);
        y = newY;
        height = Math.max(minSize, initial.height + (initial.y - newY));
      }

      state.frame.x = x;
      state.frame.y = y;
      state.frame.width = width;
      state.frame.height = height;
    }

    function onCanvasMouseDown(event) {
      const pointer = getPointerPosition(event);
      state.pointer = pointer;
      const frameHandle = renderer.value?.getFrameHandleAtPosition(pointer.x, pointer.y) || null;
      const allowDrag = state.mode === 'move';
      if (shouldStartCameraPan(event)) {
        closeDiagramMenu();
        startCameraDrag(pointer);
        event.preventDefault();
        return;
      }
      if (frameHandle?.type === 'resize' && state.frame && state.mode === 'move') {
        closeDiagramMenu();
        startDrag({
          mode: 'resize-frame',
          pointerStart: pointer,
          initial: {
            x: state.frame.x,
            y: state.frame.y,
            width: state.frame.width,
            height: state.frame.height,
          },
          handle: frameHandle.handle,
        });
        event.preventDefault();
        return;
      }
      if (['forms', 'frame', 'line'].includes(state.mode)) {
        if (event.button === 0) {
          beginDrawing(state.mode, pointer);
        }
        event.preventDefault();
        return;
      }
      const anchorHit = renderer.value?.getAnchorAtPosition(pointer.x, pointer.y) || null;
      const textHit = renderer.value?.getTextBlockAtPosition(pointer.x, pointer.y) || null;
      const matrixHit = !textHit
        ? renderer.value?.getMatrixGridAtPosition(pointer.x, pointer.y) || null
        : null;
      let node = textHit ? null : renderer.value?.getNodeAtPosition(pointer.x, pointer.y) || null;
      const edge = !node && !textHit && !matrixHit
        ? renderer.value?.getEdgeAtPosition(pointer.x, pointer.y) || null
        : null;
      const labelHit = !node && !textHit && !matrixHit
        ? renderer.value?.getEdgeLabelAtPosition(pointer.x, pointer.y) || null
        : null;
      const lineHit = !node && !edge && !textHit && !matrixHit
        ? renderer.value?.getLineAtPosition(pointer.x, pointer.y) || null
        : null;
      const lineHandleHit = allowDrag && event.button === 0
        ? renderer.value?.getLineHandleAtPosition(pointer.x, pointer.y) || null
        : null;
      if (!node && anchorHit) {
        node = anchorHit.node;
      }
      closeDiagramMenu();

      const canStartEdgeFromAnchor = !!anchorHit && state.mode === 'move';

      if (canStartEdgeFromAnchor) {
        const anchor = anchorHit.anchor;
        const selectedEdge = state.selected?.type === 'edge' ? state.selected.item : null;
        if (selectedEdge) {
          const isFromMatch =
            selectedEdge.from === anchorHit.node.id && selectedEdge.fromAnchor === anchor;
          const isToMatch = selectedEdge.to === anchorHit.node.id && selectedEdge.toAnchor === anchor;
          if (isFromMatch || isToMatch) {
            state.edgeDraft = {
              mode: 'rewire',
              edgeId: selectedEdge.id,
              endpoint: isFromMatch ? 'from' : 'to',
              from: { nodeId: isFromMatch ? selectedEdge.from : selectedEdge.to, anchor },
              counterpart: isFromMatch
                ? { nodeId: selectedEdge.to, anchor: selectedEdge.toAnchor }
                : { nodeId: selectedEdge.from, anchor: selectedEdge.fromAnchor },
              pointer,
              target: null,
            };
            state.hoverNodeId = isFromMatch
              ? selectedEdge.to
              : selectedEdge.from;
            state.hoverAnchor = isFromMatch
              ? selectedEdge.toAnchor
              : selectedEdge.fromAnchor;
            renderer.value?.draw();
            event.preventDefault();
            return;
          }
        }

        if (!selectedEdge) {
          const connected = state.edges.filter(edgeItem => {
            return (
              (edgeItem.from === anchorHit.node.id && edgeItem.fromAnchor === anchor) ||
              (edgeItem.to === anchorHit.node.id && edgeItem.toAnchor === anchor)
            );
          });
          if (connected.length) {
            const targetEdge = connected[connected.length - 1];
            const isFrom = targetEdge.from === anchorHit.node.id && targetEdge.fromAnchor === anchor;
            state.edgeDraft = {
              mode: 'rewire',
              edgeId: targetEdge.id,
              endpoint: isFrom ? 'from' : 'to',
              from: { nodeId: isFrom ? targetEdge.from : targetEdge.to, anchor },
              counterpart: isFrom
                ? { nodeId: targetEdge.to, anchor: targetEdge.toAnchor }
                : { nodeId: targetEdge.from, anchor: targetEdge.fromAnchor },
              pointer,
              target: null,
            };
            state.hoverNodeId = isFrom ? targetEdge.to : targetEdge.from;
            state.hoverAnchor = isFrom ? targetEdge.toAnchor : targetEdge.fromAnchor;
            setSelected({ type: 'edge', item: targetEdge });
            renderer.value?.draw();
            event.preventDefault();
            return;
          }
        }

        state.edgeDraft = {
          mode: 'new',
          from: { nodeId: anchorHit.node.id, anchor },
          pointer,
          target: null,
        };
        state.hoverNodeId = anchorHit.node.id;
        state.hoverAnchor = anchor;
        renderer.value?.draw();
        event.preventDefault();
        return;
      }

      if (labelHit) {
        const edgeForLabel = labelHit.edge;
        setSelected({ type: 'edge', item: edgeForLabel });
        if (allowDrag) {
          if (!edgeForLabel.label.offset) {
            edgeForLabel.label.offset = [0, 0];
          }
          startDrag({
            mode: 'move-edge-label',
            item: edgeForLabel,
            pointerStart: pointer,
            initialOffset: [...edgeForLabel.label.offset],
          });
          event.preventDefault();
        }
        renderer.value?.draw();
        return;
      }

      if (lineHandleHit?.line && allowDrag && event.button === 0) {
        const targetLine = lineHandleHit.line;
        setSelected({ type: 'line', item: targetLine });
        startDrag({
          type: 'line',
          mode: 'resize-line',
          item: targetLine,
          pointerStart: pointer,
          handle: lineHandleHit.handle,
          initial: {
            start: { ...targetLine.start },
            end: { ...targetLine.end },
          },
        });
        event.preventDefault();
        renderer.value?.draw();
        return;
      }

      if (lineHit) {
        setSelected({ type: 'line', item: lineHit });
        if (allowDrag && event.button === 0) {
          const pivot = { x: lineHit.start.x, y: lineHit.start.y };
          const initialAngle = Math.atan2(pointer.y - pivot.y, pointer.x - pivot.x);
          const initialLength = Math.hypot(lineHit.end.x - pivot.x, lineHit.end.y - pivot.y);
          if (event.altKey && initialLength > 0) {
            startDrag({
              type: 'line',
              mode: 'rotate-line',
              item: lineHit,
              pointerStart: pointer,
              pivot,
              initialAngle,
              length: initialLength,
              original: {
                start: { ...lineHit.start },
                end: { ...lineHit.end },
              },
            });
          } else {
            startDrag({
              type: 'line',
              mode: 'move-line',
              item: lineHit,
              pointerStart: pointer,
              initial: {
                start: { ...lineHit.start },
                end: { ...lineHit.end },
              },
            });
          }
          event.preventDefault();
        }
        renderer.value?.draw();
        return;
      }

      if (textHit) {
        setSelected({ type: 'text', item: textHit.block });
        if (allowDrag) {
          if (textHit.mode === 'resize') {
            startDrag({
              type: 'text',
              mode: 'resize-text',
              item: textHit.block,
              pointerStart: pointer,
              initial: {
                width: textHit.block.width,
                height: textHit.block.height,
              },
            });
          } else {
            startDrag({
              type: 'text',
              mode: 'move-text',
              item: textHit.block,
              pointerStart: pointer,
              initial: {
                x: textHit.block.x,
                y: textHit.block.y,
              },
              bounds: renderer.value?.getTextBlockBounds(textHit.block),
            });
          }
          event.preventDefault();
        }
        renderer.value?.draw();
        return;
      }

      if (matrixHit && !node) {
        setSelected({ type: 'matrix', item: matrixHit });
        if (allowDrag) {
          startDrag({
            type: 'matrix',
            mode: 'move-matrix',
            item: matrixHit,
            pointerStart: pointer,
            initial: { x: matrixHit.x, y: matrixHit.y },
            bounds: renderer.value?.getMatrixGridBounds?.(matrixHit),
          });
          event.preventDefault();
        }
        renderer.value?.draw();
        return;
      }

      if (node) {
        selectNode(node, { additive: event.shiftKey });
        if (allowDrag) {
          const selection = selectedNodes.value;
          const stillSelected = selection.some(item => item.id === node.id);
          if (!stillSelected) {
            renderer.value?.draw();
            return;
          }
          const selectionEntries = selection.map(item => ({
            node: item,
            initial: { x: item.x, y: item.y },
          }));
          let bounds = renderer.value?.getNodeBounds(node) || null;
          if (selection.length > 1 && renderer.value) {
            let left = Infinity;
            let right = -Infinity;
            let top = Infinity;
            let bottom = -Infinity;
            selection.forEach(item => {
              const nodeBounds = renderer.value?.getNodeBounds(item);
              if (!nodeBounds) {
                return;
              }
              left = Math.min(left, nodeBounds.left);
              right = Math.max(right, nodeBounds.right);
              top = Math.min(top, nodeBounds.top);
              bottom = Math.max(bottom, nodeBounds.bottom);
            });
            if (Number.isFinite(left) && Number.isFinite(right) && Number.isFinite(top) && Number.isFinite(bottom)) {
              bounds = {
                left,
                right,
                top,
                bottom,
                centerX: left + (right - left) / 2,
                centerY: top + (bottom - top) / 2,
              };
            }
          }
          startDrag({
            type: 'node',
            mode: 'move-node',
            item: node,
            pointerStart: pointer,
            initial: { x: node.x, y: node.y },
            bounds,
            selection: selectionEntries,
          });
          event.preventDefault();
        }
        renderer.value?.draw();
        return;
      }

      if (frameHandle?.type === 'move' && state.frame && allowDrag && !edge) {
        startDrag({
          mode: 'move-frame',
          pointerStart: pointer,
          initial: { x: state.frame.x, y: state.frame.y },
        });
        event.preventDefault();
        return;
      }

      if (edge) {
        setSelected({ type: 'edge', item: edge });
        renderer.value?.draw();
        return;
      }

      if (allowDrag && event.button === 0) {
        startSelectionBox(pointer, { additive: event.shiftKey });
        if (!event.shiftKey) {
          setSelected(null);
        }
        renderer.value?.draw();
        return;
      }

      if (!event.shiftKey) {
        setSelected(null);
        renderer.value?.draw();
      }
    }

    function updateHoverState(pointer) {
      if (!renderer.value || !pointer) {
        state.hoverNodeId = null;
        state.hoverAnchor = null;
        return;
      }
      const anchor = renderer.value.getAnchorAtPosition(pointer.x, pointer.y);
      if (anchor) {
        state.hoverNodeId = anchor.node.id;
        state.hoverAnchor = anchor.anchor;
        return;
      }
      const node = renderer.value.getNodeAtPosition(pointer.x, pointer.y);
      if (node) {
        state.hoverNodeId = node.id;
        state.hoverAnchor = null;
        return;
      }
      state.hoverNodeId = null;
      state.hoverAnchor = null;
    }

    function onCanvasMouseMove(event) {
      const pointer = getPointerPosition(event);
      state.pointer = pointer;

      if (state.cameraDrag) {
        state.camera.offsetX = state.cameraDrag.initialOffsetX + (pointer.screenX - state.cameraDrag.startScreenX);
        state.camera.offsetY = state.cameraDrag.initialOffsetY + (pointer.screenY - state.cameraDrag.startScreenY);
        renderer.value?.draw();
        event.preventDefault();
        return;
      }

      if (state.drawing) {
        updateDrawing(pointer, { shiftKey: event.shiftKey });
        event.preventDefault();
        return;
      }

      if (state.edgeDraft) {
        const draft = state.edgeDraft;
        draft.pointer = pointer;
        const anchorHit = renderer.value?.getAnchorAtPosition(pointer.x, pointer.y) || null;
        const hoveredNode = renderer.value?.getNodeAtPosition(pointer.x, pointer.y) || null;

        const buildTarget = (nodeId, anchor) => {
          let valid = true;
          if (draft.mode === 'rewire' && draft.counterpart) {
            valid = nodeId !== draft.counterpart.nodeId;
          } else if (draft.mode === 'new' && draft.from) {
            valid = nodeId !== draft.from.nodeId;
          }
          return { nodeId, anchor, valid };
        };

        let target = null;
        let hoverNodeId = null;
        let hoverAnchor = null;

        if (anchorHit) {
          target = buildTarget(anchorHit.node.id, anchorHit.anchor);
          hoverNodeId = anchorHit.node.id;
          hoverAnchor = anchorHit.anchor;
        } else if (hoveredNode) {
          const suggested = determineAnchorForPointer(hoveredNode, pointer);
          target = buildTarget(hoveredNode.id, suggested);
          hoverNodeId = hoveredNode.id;
          hoverAnchor = suggested;
        }

        if (!hoverNodeId) {
          if (draft.mode === 'rewire') {
            if (draft.endpoint === 'to' && draft.counterpart) {
              hoverNodeId = draft.counterpart.nodeId;
              hoverAnchor = draft.counterpart.anchor;
            } else if (draft.endpoint === 'from' && draft.from) {
              hoverNodeId = draft.from.nodeId;
              hoverAnchor = draft.from.anchor;
            }
          } else if (draft.from) {
            hoverNodeId = draft.from.nodeId;
            hoverAnchor = draft.from.anchor;
          }
        }

        draft.target = target;
        state.hoverNodeId = hoverNodeId;
        state.hoverAnchor = hoverAnchor;
        renderer.value?.draw();
        return;
      }

      if (state.selectionRect) {
        updateSelectionBox(pointer);
        renderer.value?.draw();
        return;
      }

      const context = state.dragContext;
      if (context) {
        let dx = pointer.x - context.pointerStart.x;
        let dy = pointer.y - context.pointerStart.y;
        const supportsGuides = context.mode === 'move-node' || context.mode === 'move-text';
        if (supportsGuides && event.shiftKey) {
          const guides = computeGuideSnap(context, dx, dy);
          if (guides) {
            ({ dx, dy } = guides);
            applyGuides({
              vertical: guides.vertical,
              horizontal: guides.horizontal,
              spacing: guides.spacing,
            });
          } else {
            clearGuides();
          }
        } else {
          clearGuides();
        }

        if (context.mode === 'move-node') {
          if (Array.isArray(context.selection) && context.selection.length) {
            context.selection.forEach(entry => {
              if (!entry?.node || !entry.initial) return;
              entry.node.x = entry.initial.x + dx;
              entry.node.y = entry.initial.y + dy;
            });
          } else {
            context.item.x = context.initial.x + dx;
            context.item.y = context.initial.y + dy;
          }
        } else if (context.mode === 'move-text') {
          context.item.x = context.initial.x + dx;
          context.item.y = context.initial.y + dy;
        } else if (context.mode === 'move-matrix') {
          context.item.x = context.initial.x + dx;
          context.item.y = context.initial.y + dy;
          clampMatrixGridToFrame(context.item);
        } else if (context.mode === 'move-line') {
          if (context.item && context.initial?.start && context.initial?.end) {
            context.item.start.x = context.initial.start.x + dx;
            context.item.start.y = context.initial.start.y + dy;
            context.item.end.x = context.initial.end.x + dx;
            context.item.end.y = context.initial.end.y + dy;
            syncLineHandles(context.item);
          }
        } else if (context.mode === 'resize-line') {
          const line = context.item;
          if (line && context.handle) {
            const fixedPoint = context.handle === 'start' ? line.end : line.start;
            let nextPoint = { x: pointer.x, y: pointer.y };
            if (event.shiftKey && fixedPoint) {
              nextPoint = constrainPointToAxis(fixedPoint, nextPoint);
              clearGuides();
            } else {
              const snapped = findLineSnapPoint(nextPoint, { excludePoints: [fixedPoint] });
              if (snapped) {
                nextPoint = { x: snapped.x, y: snapped.y };
                applyGuides({ snapTarget: snapped });
              } else {
                clearGuides();
              }
            }
            if (context.handle === 'start') {
              line.start.x = nextPoint.x;
              line.start.y = nextPoint.y;
            } else {
              line.end.x = nextPoint.x;
              line.end.y = nextPoint.y;
            }
            syncLineHandles(line);
          }
        } else if (context.mode === 'rotate-line') {
          const line = context.item;
          const pivot = context.pivot;
          const length = context.length;
          if (line && pivot && Number.isFinite(length) && length > 0) {
            const pointerAngle = Math.atan2(pointer.y - pivot.y, pointer.x - pivot.x);
            line.start.x = pivot.x;
            line.start.y = pivot.y;
            line.end.x = pivot.x + Math.cos(pointerAngle) * length;
            line.end.y = pivot.y + Math.sin(pointerAngle) * length;
            syncLineHandles(line);
            applyGuides({
              rotation: {
                pivot: { ...pivot },
                angleStart: context.initialAngle,
                angleCurrent: pointerAngle,
                radius: length,
              },
            });
          }
        } else if (context.mode === 'resize-text') {
          const nextWidth = Math.max(TEXT_BLOCK_CONSTRAINTS.minWidth, context.initial.width + dx);
          const nextHeight = Math.max(TEXT_BLOCK_CONSTRAINTS.minHeight, context.initial.height + dy);
          context.item.width = nextWidth;
          context.item.height = nextHeight;
        } else if (context.mode === 'move-frame' && state.frame) {
          state.frame.x = context.initial.x + dx;
          state.frame.y = context.initial.y + dy;
        } else if (context.mode === 'resize-frame' && state.frame) {
          applyFrameResize(context, dx, dy);
        } else if (context.mode === 'move-edge-label') {
          const offsetX = context.initialOffset[0] + dx;
          const offsetY = context.initialOffset[1] + dy;
          context.item.label.offset = [offsetX, offsetY];
        }

        state.dragMoved = true;
        event.preventDefault();
        renderer.value?.draw();
        return;
      }

      updateHoverState(pointer);
      renderer.value?.draw();
    }

    function onCanvasMouseUp(event) {
      if (state.cameraDrag) {
        endCameraDrag();
        event?.preventDefault();
        renderer.value?.draw();
        return;
      }
      if (event) {
        state.pointer = getPointerPosition(event);
      }
      if (state.drawing) {
        completeDrawing(state.pointer);
        return;
      }
      if (state.selectionRect) {
        const handled = finalizeSelectionBox();
        if (handled) {
          renderer.value?.draw();
          return;
        }
      }
      if (state.edgeDraft) {
        const draft = state.edgeDraft;
        const target = draft.target;
        if (draft.mode === 'rewire') {
          const edge = state.edges.find(item => item.id === draft.edgeId);
          if (edge && target?.valid) {
            let changed = false;
            if (draft.endpoint === 'from') {
              if (edge.from !== target.nodeId || edge.fromAnchor !== target.anchor) {
                edge.from = target.nodeId;
                edge.fromAnchor = target.anchor;
                changed = true;
              }
            } else if (draft.endpoint === 'to') {
              if (edge.to !== target.nodeId || edge.toAnchor !== target.anchor) {
                edge.to = target.nodeId;
                edge.toAnchor = target.anchor;
                changed = true;
              }
            }
            if (changed) {
              pushHistory();
              flash('Edge connection updated.');
            }
            setSelected({ type: 'edge', item: edge });
          }
        } else if (target?.valid && draft.from) {
          const newEdge = makeEdge(draft.from.nodeId, target.nodeId);
          newEdge.fromAnchor = draft.from.anchor;
          newEdge.toAnchor = target.anchor;
          state.edges = [...state.edges, newEdge];
          setSelected({ type: 'edge', item: newEdge });
          state.mode = 'move';
          pushHistory();
          flash('Edge created successfully.');
        }
        state.edgeDraft = null;
        renderer.value?.draw();
        updateHoverState(state.pointer);
        return;
      }

      if (!state.dragContext) {
        clearGuides();
        updateHoverState(state.pointer);
        renderer.value?.draw();
        return;
      }
      if (state.dragMoved) {
        pushHistory();
      }
      state.dragContext = null;
      state.dragMoved = false;
      clearGuides();
      renderer.value?.draw();
      updateHoverState(state.pointer);
    }

    function onCanvasDblClick(event) {
      const pointer = getPointerPosition(event);
      const textHit = renderer.value?.getTextBlockAtPosition(pointer.x, pointer.y);
      if (textHit) {
        openTextBlockEditor(textHit.block);
        return;
      }
      const labelHit = renderer.value?.getEdgeLabelAtPosition(pointer.x, pointer.y);
      if (labelHit) {
        setSelected({ type: 'edge', item: labelHit.edge });
        openEdgeEditor(labelHit.edge, labelHit.center);
        return;
      }
      const lineHit = renderer.value?.getLineAtPosition(pointer.x, pointer.y);
      if (lineHit) {
        setSelected({ type: 'line', item: lineHit });
        openLineEditor(lineHit);
        return;
      }
      const node = renderer.value?.getNodeAtPosition(pointer.x, pointer.y);
      if (node) {
        setSelected({ type: 'node', item: node });
        openNodeEditor(node);
        return;
      }
      const edge = renderer.value?.getEdgeAtPosition(pointer.x, pointer.y);
      if (edge) {
        openEdgeEditor(edge);
      }
    }

    function positionInlineEditor(point, width, height) {
      const wrapperRect = canvasWrapperRef.value?.getBoundingClientRect();
      const canvasRect = canvasRef.value?.getBoundingClientRect();
      if (!wrapperRect || !canvasRect) {
        return { left: 0, top: 0 };
      }
      const margin = 16;
      const baseLeft = point.x + canvasRect.left - wrapperRect.left - width / 2;
      const baseTop = point.y + canvasRect.top - wrapperRect.top - height / 2;
      const maxLeft = wrapperRect.width - width - margin;
      const maxTop = wrapperRect.height - height - margin;
      const left = Math.min(Math.max(baseLeft, margin), Math.max(margin, maxLeft));
      const top = Math.min(Math.max(baseTop, margin), Math.max(margin, maxTop));
      return { left, top };
    }

    function openEdgeEditor(edge, preferredPoint = null) {
      const geometry = renderer.value?.getEdgeGeometry(edge);
      let point = preferredPoint || geometry?.labelPoint;
      if (!point) {
        const from = state.nodes.find(node => node.id === edge.from);
        const to = state.nodes.find(node => node.id === edge.to);
        if (from && to) {
          point = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
        } else {
          point = { x: 0, y: 0 };
        }
      }

      inlineEditor.value = edge.label?.text || '';
      inlineEditor.width = 350;
      inlineEditor.height = 220;
      inlineEditor.type = 'edge';
      inlineEditor.target = edge;
      const position = positionInlineEditor(point, inlineEditor.width, inlineEditor.height);
      inlineEditor.left = position.left;
      inlineEditor.top = position.top;
      inlineEditor.visible = true;
      nextTick(() => {
        inlineEditorRef.value?.focus();
        inlineEditorRef.value?.select();
      });
    }

    function openNodeEditor(node) {
      inlineEditor.value = node.label || '';
      inlineEditor.width = 350;
      inlineEditor.height = 220;
      inlineEditor.type = 'node';
      inlineEditor.target = node;
      const point = { x: node.x, y: node.y };
      const position = positionInlineEditor(point, inlineEditor.width, inlineEditor.height);
      inlineEditor.left = position.left;
      inlineEditor.top = position.top;
      inlineEditor.visible = true;
      nextTick(() => {
        inlineEditorRef.value?.focus();
        inlineEditorRef.value?.select();
      });
    }

    function openTextBlockEditor(block) {
      inlineEditor.value = block.text || '';
      inlineEditor.width = Math.max(block.width, 220);
      inlineEditor.height = Math.max(block.height, 120);
      inlineEditor.type = 'text';
      inlineEditor.target = block;
      const centerPoint = {
        x: block.x + block.width / 2,
        y: block.y + block.height / 2,
      };
      const position = positionInlineEditor(centerPoint, inlineEditor.width, inlineEditor.height);
      inlineEditor.left = position.left;
      inlineEditor.top = position.top;
      inlineEditor.visible = true;
      nextTick(() => {
        inlineEditorRef.value?.focus();
        inlineEditorRef.value?.select();
      });
    }

    function openLineEditor(line) {
      const point = {
        x: (line.start.x + line.end.x) / 2,
        y: (line.start.y + line.end.y) / 2,
      };
      inlineEditor.value = line.label || '';
      inlineEditor.width = 350;
      inlineEditor.height = 220;
      inlineEditor.type = 'line';
      inlineEditor.target = line;
      const position = positionInlineEditor(point, inlineEditor.width, inlineEditor.height);
      inlineEditor.left = position.left;
      inlineEditor.top = position.top;
      inlineEditor.visible = true;
      nextTick(() => {
        inlineEditorRef.value?.focus();
        inlineEditorRef.value?.select();
      });
    }

    function closeInlineEditor() {
      inlineEditor.visible = false;
      inlineEditor.value = '';
      inlineEditor.type = null;
      inlineEditor.target = null;
    }

    function confirmInlineEditor() {
      if (!inlineEditor.visible || !inlineEditor.target) {
        closeInlineEditor();
        return;
      }
      if (inlineEditor.type === 'edge') {
        const trimmed = inlineEditor.value.trim();
        const target = inlineEditor.target;
        const currentText = target.label?.text || '';
        if (currentText !== trimmed) {
          target.label = target.label || { text: '', position: 'auto' };
          if (!target.label.offset) {
            target.label.offset = [0, 0];
          }
          if (!target.label.color) {
            target.label.color = '#e2e8f0';
          }
          target.label.text = trimmed;
          pushHistory();
        }
      } else if (inlineEditor.type === 'node') {
        const value = inlineEditor.value.trim();
        if (inlineEditor.target.label !== value) {
          inlineEditor.target.label = value;
          pushHistory();
        }
      } else if (inlineEditor.type === 'text') {
        if (inlineEditor.target.text !== inlineEditor.value) {
          inlineEditor.target.text = inlineEditor.value;
          pushHistory();
        }
      } else if (inlineEditor.type === 'line') {
        const value = inlineEditor.value.trim();
        if (inlineEditor.target.label !== value) {
          inlineEditor.target.label = value;
          pushHistory();
        }
      }
      renderer.value?.draw();
      closeInlineEditor();
    }

    function handleEditorKeydown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeInlineEditor();
        return;
      }
      if (inlineEditor.type !== 'text' && event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        confirmInlineEditor();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'enter') {
        event.preventDefault();
        confirmInlineEditor();
      }
    }

    function snapshot() {
      return {
        nodes: state.nodes.map(node => ({ ...node })),
        edges: state.edges.map(edge => normalizeEdge({ ...edge })),
        lines: state.lines.map(line => normalizeLine({ ...line })),
        textBlocks: state.textBlocks.map(block => ({ ...block })),
        matrixGrids: state.matrixGrids.map(grid => ({
          ...grid,
          data: Array.isArray(grid.data) ? grid.data.map(row => [...row]) : [],
          colorMap: { ...(grid.colorMap || {}) },
        })),
        frame: state.frame ? { ...state.frame } : null,
        camera: { ...state.camera },
        edgeThickness: state.edgeThickness,
        edgeLabelAlignment: state.edgeLabelAlignment,
      };
    }

    function applySnapshot(snap) {
      state.nodes = snap.nodes.map(node => normalizeNode({ ...node }));
      state.edges = snap.edges.map(edge => normalizeEdge({ ...edge }));
      state.lines = (snap.lines || []).map(line => normalizeLine({ ...line }));
      state.textBlocks = snap.textBlocks.map(block =>
        normalizeTextBlock({ ...block }, { defaultColor: defaultTextColor.value })
      );
      state.matrixGrids = (snap.matrixGrids || []).map(grid =>
        normalizeMatrixGrid({ ...grid })
      );
      state.frame = snap.frame ? { ...snap.frame } : null;
      state.camera.scale = snap.camera?.scale ?? 1;
      state.camera.offsetX = snap.camera?.offsetX ?? 0;
      state.camera.offsetY = snap.camera?.offsetY ?? 0;
      state.edgeThickness = Number.isFinite(snap.edgeThickness)
        ? snap.edgeThickness
        : DEFAULT_EDGE_THICKNESS;
      const alignmentCandidates = ['auto', 'left', 'center', 'right'];
      if (alignmentCandidates.includes(snap.edgeLabelAlignment)) {
        state.edgeLabelAlignment = snap.edgeLabelAlignment;
      } else {
        state.edgeLabelAlignment = 'right';
      }
      state.selected = null;
      state.edgeDraft = null;
      state.hoverNodeId = null;
      state.hoverAnchor = null;
      state.pointer = null;
      state.cameraDrag = null;
      clearGuides();
      refreshSequencesFromState(state.nodes, state.edges, state.lines, state.textBlocks, state.matrixGrids);
      invalidateTikz();
    }
    function pushHistory() {
      const current = snapshot();
      history.past.push(current);
      if (history.past.length > 60) {
        history.past.shift();
      }
      history.future = [];
    }

    function undo() {
      if (history.past.length <= 1) return;
      const current = history.past.pop();
      history.future.push(current);
      const previous = history.past[history.past.length - 1];
      applySnapshot(previous);
      flash('Action undone.');
    }

    function redo() {
      if (!history.future.length) return;
      const nextState = history.future.pop();
      history.past.push(nextState);
      applySnapshot(nextState);
      flash('Action redone.');
    }

    function saveDiagram() {
      const payload = {
        nodes: state.nodes.map(node => ({ ...node })),
        edges: state.edges.map(edge => ({ ...edge })),
        lines: state.lines.map(line => ({ ...line })),
        textBlocks: state.textBlocks.map(block => ({ ...block })),
        matrixGrids: state.matrixGrids.map(grid => ({
          ...grid,
          data: Array.isArray(grid.data) ? grid.data.map(row => [...row]) : [],
          colorMap: { ...(grid.colorMap || {}) },
        })),
        frame: state.frame ? { ...state.frame } : null,
        edgeThickness: state.edgeThickness,
        camera: { ...state.camera },
        edgeLabelAlignment: state.edgeLabelAlignment,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const defaultName = `diagram-${timestamp}`;
      const requestedName = window.prompt(
        'Enter the file name (without extension):',
        defaultName
      );
      const sanitizedName = (() => {
        if (typeof requestedName !== 'string') {
          return defaultName;
        }
        const trimmed = requestedName.trim();
        if (!trimmed) {
          return defaultName;
        }
        const cleaned = trimmed.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '-');
        const limited = cleaned.slice(0, 80);
        return limited || defaultName;
      })();
      const link = document.createElement('a');
      link.href = url;
      link.download = `${sanitizedName}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      flash(`Diagram exported as ${sanitizedName}.json.`);
    }

    async function copyToClipboard() {
      try {
        await navigator.clipboard.writeText(tikzCode.value);
        flash('TikZ code copied to the clipboard.');
      } catch (error) {
        const textarea = document.createElement('textarea');
        textarea.value = tikzCode.value;
        textarea.setAttribute('readonly', 'readonly');
        textarea.style.position = 'absolute';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        try {
          const success = document.execCommand('copy');
          flash(
            success
              ? 'TikZ code copied to the clipboard.'
              : 'Could not copy automatically. Select the text manually.'
          );
        } catch (fallbackError) {
          console.error('Failed to copy', fallbackError);
          flash('Could not copy automatically. Select the text manually.');
        } finally {
          document.body.removeChild(textarea);
        }
      }
    }

    const handleResize = () => {
      if (!renderer.value) return;
      const center = getViewportCenterWorld();
      renderer.value.resize();
      viewport.value = renderer.value.getViewport();
      focusOnPoint(center);
      if (previewContentBounds) {
        nextTick(() => {
          updatePreviewTransform();
        });
      }
    };

    function handleKeyDown(event) {
      const target = event.target;
      const isTextInput =
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);

      if (event.code === 'ControlLeft' && !event.repeat) {
        updateSpacingMeasurement(true);
      }

      if (event.key === 'Escape') {
        if (state.drawing) {
          cancelDrawing();
          return;
        }
        if (['forms', 'frame', 'line'].includes(state.mode)) {
          changeMode('move');
          return;
        }
        if (showSettingsDialog.value) {
          closeSettingsDialog();
          return;
        }
        if (contextMenu.visible) {
          closeContextMenu();
          return;
        }
        if (showFormsMenu.value) {
          closeFormsMenu();
          return;
        }
        if (showEdgeThicknessMenu.value) {
          closeEdgeThicknessMenu();
          return;
        }
        if (showLabelAlignmentMenu.value) {
          closeLabelAlignmentMenu();
          return;
        }
        if (showDiagramMenu.value) {
          closeDiagramMenu();
          return;
        }
        if (showTemplateBrowser.value) {
          closeTemplateBrowser();
          return;
        }
        if (inlineEditor.visible) {
          closeInlineEditor();
          return;
        }
        if (state.selectionRect) {
          clearSelectionBox();
          renderer.value?.draw();
          return;
        }
        if (state.selected) {
          setSelected(null);
          renderer.value?.draw();
          return;
        }
        return;
      }

      if (event.code === 'Space') {
        if (isTextInput) {
          return;
        }
        if (!event.repeat) {
          panModifierActive.value = true;
        }
        event.preventDefault();
      }
      if (isTextInput && inlineEditor.visible) {
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) {
          redo();
        } else {
          undo();
        }
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        redo();
      }
      const modifier = event.metaKey || event.ctrlKey;
      if (modifier && event.shiftKey && event.key.toLowerCase() === 'c' && !isTextInput) {
        event.preventDefault();
        copySelectedFormatting();
        closeContextMenu();
        return;
      }
      if (modifier && event.shiftKey && event.key.toLowerCase() === 'v' && !isTextInput) {
        event.preventDefault();
        pasteSelectedFormatting();
        closeContextMenu();
        return;
      }
      if (modifier && !event.shiftKey && event.key.toLowerCase() === 'c' && !isTextInput) {
        event.preventDefault();
        copySelection();
        closeContextMenu();
        return;
      }
      if (modifier && !event.shiftKey && event.key.toLowerCase() === 'x' && !isTextInput) {
        event.preventDefault();
        cutSelection();
        closeContextMenu();
        return;
      }
      if (modifier && !event.shiftKey && event.key.toLowerCase() === 'v' && !isTextInput) {
        event.preventDefault();
        pasteSelection();
        closeContextMenu();
        return;
      }
      if (modifier && !event.shiftKey && event.key.toLowerCase() === 'd' && !isTextInput) {
        event.preventDefault();
        duplicateSelection();
        closeContextMenu();
        return;
      }
      if (event.key === 'Delete' && !isTextInput) {
        if (state.selected) {
          event.preventDefault();
          removeSelected();
        }
      }

      if (!isTextInput && !event.metaKey && !event.ctrlKey && !event.altKey) {
        const shortcutKey = event.key.toLowerCase();
        if (shortcutKey === 'v') {
          event.preventDefault();
          changeMode('move');
          return;
        }
        if (shortcutKey === 'f') {
          event.preventDefault();
          changeMode('frame');
          return;
        }
        if (shortcutKey === 'l') {
          event.preventDefault();
          changeMode('line');
          return;
        }
        const shapeId = shapeShortcutMap[shortcutKey];
        if (shapeId) {
          event.preventDefault();
          selectShape(shapeId);
          changeMode('forms');
        }
      }
    }

    function handleKeyUp(event) {
      if (event.code === 'ControlLeft') {
        updateSpacingMeasurement(false);
      }
      if (event.code === 'Space') {
        panModifierActive.value = false;
        if (state.cameraDrag) {
          endCameraDrag();
          renderer.value?.draw();
        }
        if (preview.drag) {
          stopPreviewDrag();
        }
      }
    }

    function handleDocumentPointer(event) {
      if (showEdgeThicknessMenu.value) {
        const menuEl = edgeThicknessMenuRef.value;
        const buttonEl = edgeThicknessMenuButtonRef.value;
        if (!(menuEl?.contains(event.target) || buttonEl?.contains(event.target))) {
          closeEdgeThicknessMenu();
        }
      }

      if (showLabelAlignmentMenu.value) {
        const menuEl = labelAlignmentMenuRef.value;
        const buttonEl = labelAlignmentMenuButtonRef.value;
        if (!(menuEl?.contains(event.target) || buttonEl?.contains(event.target))) {
          closeLabelAlignmentMenu();
        }
      }

      if (showDiagramMenu.value) {
        const menuEl = diagramMenuRef.value;
        const buttonEl = diagramMenuButtonRef.value;
        if (!(menuEl?.contains(event.target) || buttonEl?.contains(event.target))) {
          closeDiagramMenu();
        }
      }

      if (contextMenu.visible) {
        const menuEl = contextMenuRef.value;
        if (!menuEl?.contains(event.target)) {
          closeContextMenu();
        }
      }

      if (showFormsMenu.value) {
        const menuEl = formsMenuRef.value;
        const anchorEl = formsMenuAnchorRef.value;
        if (!(menuEl?.contains(event.target) || anchorEl?.contains(event.target))) {
          closeFormsMenu();
        }
      }

      if (nodeToolbarState.activePopover) {
        const toolbarEl = nodeToolbarRef.value;
        if (!(toolbarEl?.contains(event.target))) {
          nodeToolbarState.activePopover = null;
        }
      }

      if (edgeToolbarState.activePopover) {
        const toolbarEl = edgeToolbarRef.value;
        if (!(toolbarEl?.contains(event.target))) {
          edgeToolbarState.activePopover = null;
        }
      }

      if (inlineEditor.visible) {
        const editorEl = inlineEditorRef.value?.closest?.('.inline-editor');
        if (editorEl && !editorEl.contains(event.target)) {
          confirmInlineEditor();
        }
      }
    }

    onMounted(() => {
      const canvas = canvasRef.value;
      if (!canvas) return;
      renderer.value = createCanvasRenderer(canvas, state);
      renderer.value.resize();
      viewport.value = renderer.value.getViewport();
      pushHistory();
      if (canvas.parentElement && 'ResizeObserver' in window) {
        resizeObserver = new ResizeObserver(handleResize);
        resizeObserver.observe(canvas.parentElement);
      }
      window.addEventListener('resize', handleResize);
      window.addEventListener('message', handlePreviewMessage);
      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('keyup', handleKeyUp);
      window.addEventListener('pointerdown', handleDocumentPointer);
      invalidateTikz();
    });

    onUnmounted(() => {
      if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
      }
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('message', handlePreviewMessage);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      if (previewLoadingTimeout) {
        clearTimeout(previewLoadingTimeout);
        previewLoadingTimeout = null;
      }
      stopPreviewResize();
      window.removeEventListener('pointerdown', handleDocumentPointer);
    });

    function setSidebarTab(tab) {
      const allowed = ['inspect', 'code', 'preview'];
      sidebarTab.value = allowed.includes(tab) ? tab : 'inspect';
    }

    return {
      availableShapes,
      activeShape,
      activeShapeId,
      templates,
      selectedNodes,
      selectedNode,
      nodeToolbarRef,
      edgeToolbarRef,
      nodeToolbarState,
      edgeToolbarState,
      nodeFillPalette,
      nodeStrokePalette,
      recentColorPalette,
      canCopyFormatting,
      clipboard,
      contextMenu,
      contextMenuRef,
      contextMenuStyle,
      nodeToolbarHint,
      nodeToolbarStyle,
      edgeToolbarHint,
      edgeToolbarStyle,
      hasSelectedEdgeLabel,
      fontSizeOptions,
      canPasteFormatting,
      canCopySelection,
      canCutSelection,
      canDuplicateSelection,
      canPasteClipboard,
      toggleNodePopover,
      setNodeToolbarHover,
      applyNodeFill,
      applyNodeBorder,
      addCustomColor,
      updateNodeBorderWidth,
      updateNodeCornerRadius,
      updateNodeBorderStyle,
      updateNodeOpacity,
      nodeSizeLimits: NODE_SIZE_LIMITS,
      getNodeSizeSliderValue,
      updateNodeSize,
      updateRectangleSplitParts,
      updateRectangleSplitCellText,
      updateRectangleSplitCellFill,
      updateRectangleSplitCellTextColor,
      setNodeFontSize,
      setNodeShape,
      createTextBlock,
      updateTextFontSize,
      applyTextColor,
      setTextBackgroundEnabled,
      updateTextFillColor,
      updateTextBorderColor,
      updateTextBorderWidth,
      updateTextBorderStyle,
      updateTextOpacity,
      defaultTextColor,
      updateCylinderRotate,
      updateCylinderBorderRotate,
      getCylinderMinimumHeightValue,
      formatCylinderMinimumHeight,
      updateCylinderMinimumHeight,
      getCylinderMinimumWidthValue,
      formatCylinderMinimumWidth,
      updateCylinderMinimumWidth,
      getCylinderAspectSliderValue,
      formatCylinderAspect,
      updateCylinderAspectFromSlider,
      updateCylinderAspect,
      updateCylinderDimension,
      getCylinderInnerSepValue,
      formatCylinderInnerSep,
      updateCylinderInnerSep,
      updateCylinderCustomFill,
      updateCylinderColor,
      copySelectedFormatting,
      pasteSelectedFormatting,
      selectedEdge,
      selectedLine,
      toggleEdgePopover,
      setEdgeToolbarHover,
      applyEdgeColor,
      setEdgeStyle,
      setEdgeDirection,
      flipEdgeDirection,
      updateSelectedEdgeThickness,
      clearEdgeThickness,
      updateSelectedLineThickness,
      clearLineThickness,
      updateSelectedLineColor,
      setEdgeLabelAlignment,
      mode,
      selected,
      canUndo,
      canRedo,
      currentHint,
      canReset,
      frame,
      zoomLevel,
      isPanningActive,
      tikzCode,
      preview,
      autoUpdateTikz,
      tikzUpdatePending,
      previewViewportRef,
      previewStageRef,
      previewStageStyle,
      previewStageContentStyle,
      previewFrameStyle,
      previewZoomLevel,
      hasPreviewContent,
      isPreviewDirty,
      isPreviewPanning,
      isPreviewLoading,
      sidebarTab,
      currentTheme,
      setTheme,
      renderPreview,
      startPreviewResize,
      adjustPreviewHeightBy,
      zoomPreviewIn,
      zoomPreviewOut,
      onPreviewPointerDown,
      onPreviewPointerMove,
      onPreviewPointerUp,
      onPreviewPointerCancel,
      onPreviewWheel,
      feedback,
      edgeThickness,
      edgeLabelAlignment,
      inspectorVisible,
      canvasRef,
      canvasWrapperRef,
      diagramMenuButtonRef,
      diagramMenuRef,
      formsMenuAnchorRef,
      formsMenuRef,
      edgeThicknessMenuButtonRef,
      edgeThicknessMenuRef,
      labelAlignmentMenuButtonRef,
      labelAlignmentMenuRef,
      showTemplateBrowser,
      diagramFileInputRef,
      matrixFileInputRef,
      inlineEditor,
      inlineEditorLineMarkers,
      inlineEditorRef,
      showDiagramMenu,
      showFormsMenu,
      showEdgeThicknessMenu,
      showLabelAlignmentMenu,
      showSettingsDialog,
      changeMode,
      toggleDiagramMenu,
      closeDiagramMenu,
      toggleFormsMenu,
      toggleEdgeThicknessMenu,
      toggleLabelAlignmentMenu,
      toggleSettingsDialog,
      toggleTemplateBrowser,
      closeTemplateBrowser,
      closeFormsMenu,
      closeEdgeThicknessMenu,
      closeLabelAlignmentMenu,
      closeSettingsDialog,
      openContextMenu,
      closeContextMenu,
      createNodeAtCenter,
      createActiveShape,
      selectShape,
      resetGraph,
      applyTemplate,
      saveDiagram,
      copyToClipboard,
      matrixImport,
      matrixPrompt,
      matrixPromptTextAreaRef,
      canSubmitMatrixPrompt,
      canConfirmMatrixImport,
      triggerMatrixImport,
      triggerMatrixFileSelection,
      closeMatrixPrompt,
      confirmMatrixPrompt,
      handleMatrixFileChange,
      cancelMatrixImport,
      confirmMatrixImport,
      updateMatrixImportColor,
      onCanvasMouseDown,
      onCanvasMouseMove,
      onCanvasMouseUp,
      onCanvasWheel,
      onCanvasDblClick,
      removeSelected,
      copySelection,
      cutSelection,
      pasteSelection,
      duplicateSelection,
      createFrame,
      removeFrame,
      focusFrame,
      zoomIn,
      zoomOut,
      resetView,
      invalidateTikz,
      toggleAutoUpdateTikz,
      closeInlineEditor,
      confirmInlineEditor,
      handleEditorKeydown,
      openTextBlockEditor,
      commitHistory,
      onOptionChange,
      updateEdgeLabelColor,
      updateEdgeThickness,
      onEdgeLabelAlignmentChange,
      undo,
      redo,
      triggerLoadDiagram,
      handleDiagramFileChange,
      edgeThicknessDisplay,
      setSidebarTab,
    };
  },
}).mount('#app');
