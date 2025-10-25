// @ts-nocheck

import { distanceToSegment, getQuadraticControlPoint } from './utils/geometry.js';
import { isCurvedShape, isOrthogonalShape, resolveBendShape } from './routingMaps.js';
import { computeOrthogonalGeometry } from './geometry/orthogonal.js';
import {
  NODE_RADIUS,
  NODE_WIDTH,
  NODE_HEIGHT,
  getNodeDimensions,
  getNodeBounds as computeNodeBounds,
  getCylinderMetrics,
} from './utils/sceneMetrics.js';
import { getShapeAnchors, findShapeAnchor } from './shapes/anchorRegistry.js';
import { registerBuiltInShapes } from './shapes/definitions.js';
const CONNECTION_HANDLE_RADIUS = 8;
const CONNECTION_HANDLE_HITBOX = CONNECTION_HANDLE_RADIUS * 1.75;
const GRID_SPACING = 64;
const FRAME_HANDLE_SIZE = 16;
const FRAME_HIT_PADDING = 12;
const DEFAULT_EDGE_THICKNESS = 2.5;

registerBuiltInShapes();

const CARDINAL_DIRECTIONS = ['north', 'east', 'south', 'west'];
const getNodeBounds = computeNodeBounds;

const RADIAN_FACTOR = Math.PI / 180;
const toRadians = degrees => degrees * RADIAN_FACTOR;

const CLOUD_PUFF_SHAPE = [
  { sx: 0, sy: 1 },
  { sx: -0.597326, sy: 0.810173 },
  { sx: -0.96766, sy: 0.312055 },
  { sx: -0.96766, sy: -0.312055 },
  { sx: -0.597326, sy: -0.810173 },
  { sx: 0, sy: -1 },
  { sx: 0.597326, sy: -0.810173 },
  { sx: 0.96766, sy: -0.312055 },
  { sx: 0.96766, sy: 0.312055 },
  { sx: 0.597326, sy: 0.810173 },
];

const RECTANGLE_SPLIT_MIN_PARTS = 2;
const RECTANGLE_SPLIT_MAX_PARTS = 12;

const clampRectangleSplitParts = value => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return RECTANGLE_SPLIT_MIN_PARTS;
  }
  return Math.max(
    RECTANGLE_SPLIT_MIN_PARTS,
    Math.min(RECTANGLE_SPLIT_MAX_PARTS, Math.round(numeric))
  );
};

const getRectangleSplitMetrics = node => {
  const { halfWidth, halfHeight } = getNodeDimensions(node);
  const parts = clampRectangleSplitParts(node?.rectangleSplitParts);
  const height = halfHeight * 2;
  const top = node.y - halfHeight;
  const partHeight = height / parts;
  return {
    halfWidth,
    halfHeight,
    parts,
    top,
    partHeight,
  };
};

function rotatePointAround(point, center, radians) {
  if (!radians) {
    return { x: point.x, y: point.y };
  }
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
}

function parseHexColor(color) {
  if (typeof color !== 'string') {
    return null;
  }
  const normalized = color.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(normalized)) {
    return null;
  }
  const hex = normalized.length === 3
    ? normalized
        .split('')
        .map(char => char + char)
        .join('')
    : normalized;
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

function rgbToHex({ r, g, b }) {
  const clamp = value => Math.max(0, Math.min(255, Math.round(value)));
  return `#${clamp(r).toString(16).padStart(2, '0')}${clamp(g)
    .toString(16)
    .padStart(2, '0')}${clamp(b).toString(16).padStart(2, '0')}`;
}

function mixColors(sourceColor, targetColor, ratio) {
  const source = parseHexColor(sourceColor);
  const target = parseHexColor(targetColor);
  if (!source || !target) {
    return sourceColor;
  }
  const mix = {
    r: source.r + (target.r - source.r) * ratio,
    g: source.g + (target.g - source.g) * ratio,
    b: source.b + (target.b - source.b) * ratio,
  };
  return rgbToHex(mix);
}

const lightenColor = (color, amount = 0.2) => mixColors(color, '#ffffff', amount);
const darkenColor = (color, amount = 0.2) => mixColors(color, '#0f172a', amount);

const resolveColor = (candidate, fallback) =>
  typeof candidate === 'string' && candidate.trim() ? candidate.trim() : fallback;

const clampOpacity = value => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 1;
  }
  return Math.min(1, Math.max(0.05, numeric));
};

const resolveDashPattern = (style, scale) => {
  if (style === 'dashed') {
    return [12 / scale, 8 / scale];
  }
  if (style === 'dotted') {
    return [3 / scale, 6 / scale];
  }
  
  return [];
};

const THEME_PALETTE = {
  dark: {
    canvasBackground: '#0f172a',
    gridStroke: 'rgba(148, 163, 184, 0.12)',
    matrixGridStroke: 'rgba(15, 23, 42, 0.35)',
    matrixCellFallback: '#0f172a',
    textBlockFill: 'rgba(15, 23, 42, 0.82)',
    textBlockStroke: 'rgba(148, 163, 184, 0.35)',
    textBlockText: '#e2e8f0',
  },
  light: {
    canvasBackground: '#ffffff',
    gridStroke: 'rgba(148, 163, 184, 0.22)',
    matrixGridStroke: 'rgba(148, 163, 184, 0.45)',
    matrixCellFallback: '#e2e8f0',
    textBlockFill: 'rgba(248, 250, 252, 0.92)',
    textBlockStroke: 'rgba(148, 163, 184, 0.55)',
    textBlockText: '#0f172a',
  },
};

function getMatrixGridSize(grid) {
  const rows = Array.isArray(grid?.data) ? grid.data.length : 0;
  const columns = rows > 0 && Array.isArray(grid.data[0]) ? grid.data[0].length : 0;
  const cellSize = Number(grid?.cellSize) || 0;
  return {
    rows,
    columns,
    cellSize,
    width: columns * cellSize,
    height: rows * cellSize,
  };
}

function resolveAnchorDefinition(node, direction) {
  if (!node || typeof node.shape !== 'string') {
    return null;
  }
  if (typeof direction !== 'string') {
    return null;
  }
  try {
    return findShapeAnchor(node.shape, direction);
  } catch (error) {
    return null;
  }
}

function computeFallbackAnchorPoint(node, direction) {
  if (!node) {
    return { x: 0, y: 0 };
  }
  const normalized =
    typeof direction === 'string' ? direction.trim().toLowerCase() : '';
  const { halfWidth, halfHeight } = getNodeDimensions(node);
  switch (normalized) {
    case 'north':
    case 'n':
      return { x: node.x, y: node.y - halfHeight };
    case 'south':
    case 's':
      return { x: node.x, y: node.y + halfHeight };
    case 'east':
    case 'e':
      return { x: node.x + halfWidth, y: node.y };
    case 'west':
    case 'w':
      return { x: node.x - halfWidth, y: node.y };
    case 'northeast':
    case 'north east':
      return { x: node.x + halfWidth, y: node.y - halfHeight };
    case 'southeast':
    case 'south east':
      return { x: node.x + halfWidth, y: node.y + halfHeight };
    case 'southwest':
    case 'south west':
      return { x: node.x - halfWidth, y: node.y + halfHeight };
    case 'northwest':
    case 'north west':
      return { x: node.x - halfWidth, y: node.y - halfHeight };
    default:
      return { x: node.x, y: node.y };
  }
}

function getAnchorPoint(node, direction) {
  if (!node) {
    return { x: 0, y: 0 };
  }
  let basePoint = null;
  const anchorDefinition = resolveAnchorDefinition(node, direction);
  if (anchorDefinition && typeof anchorDefinition.getPoint === 'function') {
    try {
      const computed = anchorDefinition.getPoint(node);
      if (
        computed &&
        Number.isFinite(computed.x) &&
        Number.isFinite(computed.y)
      ) {
        basePoint = computed;
      }
    } catch (error) {
      basePoint = null;
    }
  }
  if (!basePoint) {
    basePoint = computeFallbackAnchorPoint(node, direction);
  }
  const rotateDeg = Number(node.rotate);
  const borderRotateDeg = Number(node.shapeBorderRotate);
  const totalDeg =
    (Number.isFinite(rotateDeg) ? rotateDeg : 0) +
    (Number.isFinite(borderRotateDeg) ? borderRotateDeg : 0);
  if (!totalDeg) {
    return basePoint;
  }
  return rotatePointAround(basePoint, node, toRadians(totalDeg));
}

function getAnchorPoints(node) {
  if (!node) {
    return [];
  }
  let definitions = [];
  if (typeof node.shape === 'string') {
    try {
      definitions = getShapeAnchors(node.shape);
    } catch (error) {
      definitions = [];
    }
  }
  if (definitions.length) {
    return definitions.map(definition => ({
      direction: definition.id,
      tikz: definition.tikz,
      isConnectable: definition.isConnectable,
      point: getAnchorPoint(node, definition.id),
    }));
  }
  return CARDINAL_DIRECTIONS.map(direction => ({
    direction,
    tikz: direction,
    isConnectable: true,
    point: getAnchorPoint(node, direction),
  }));
}
const TEXT_BLOCK_MIN_WIDTH = 96;
const TEXT_BLOCK_MIN_HEIGHT = 60;
const TEXT_BLOCK_PADDING = 14;
const TEXT_BLOCK_BORDER_WIDTH_DEFAULT = 2;
const TEXT_HANDLE_SIZE = 12;

export const TEXT_BLOCK_CONSTRAINTS = {
  minWidth: TEXT_BLOCK_MIN_WIDTH,
  minHeight: TEXT_BLOCK_MIN_HEIGHT,
};

export function createCanvasRenderer(canvas, state) {
  const ctx = canvas.getContext('2d');
  const rendererState = {
    pixelRatio: window.devicePixelRatio || 1,
    width: 0,
    height: 0,
  };

  function getThemePalette() {
    return state.theme === 'light' ? THEME_PALETTE.light : THEME_PALETTE.dark;
  }

  function isNodeSelected(nodeId) {
    if (Array.isArray(state.selectionDraft)) {
      const inDraft = state.selectionDraft.some(item => item?.id === nodeId);
      if (inDraft) {
        return true;
      }
    }
    if (state.selected?.type !== 'node') {
      return false;
    }
    const items = state.selected?.items;
    if (Array.isArray(items)) {
      return items.some(item => item?.id === nodeId);
    }
    const item = state.selected?.item;
    return item?.id === nodeId;
  }

  function isLineSelected(lineId) {
    return state.selected?.type === 'line' && state.selected?.item?.id === lineId;
  }

  function getCameraScale() {
    return state.camera?.scale || 1;
  }

  function withAlpha(color, alpha = 1) {
    if (typeof color !== 'string') {
      return `rgba(148, 163, 184, ${alpha})`;
    }
    const trimmed = color.trim();
    const normalized = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;
    if (/^[0-9a-fA-F]{6}$/.test(normalized)) {
      const r = parseInt(normalized.slice(0, 2), 16);
      const g = parseInt(normalized.slice(2, 4), 16);
      const b = parseInt(normalized.slice(4, 6), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    return color;
  }

  function applyCameraTransform() {
    const scale = getCameraScale();
    const offsetX = state.camera?.offsetX || 0;
    const offsetY = state.camera?.offsetY || 0;
    ctx.setTransform(rendererState.pixelRatio, 0, 0, rendererState.pixelRatio, 0, 0);
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);
  }

  function resetTransform() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  function getVisibleWorldBounds() {
    const scale = getCameraScale();
    const offsetX = state.camera?.offsetX || 0;
    const offsetY = state.camera?.offsetY || 0;
    const width = rendererState.width;
    const height = rendererState.height;
    const left = (-offsetX) / scale;
    const top = (-offsetY) / scale;
    const right = left + width / scale;
    const bottom = top + height / scale;
    return { left, top, right, bottom };
  }

  function worldToScreen(x, y) {
    const scale = getCameraScale();
    const offsetX = state.camera?.offsetX || 0;
    const offsetY = state.camera?.offsetY || 0;
    return {
      x: x * scale + offsetX,
      y: y * scale + offsetY,
    };
  }

  function isPointInsideFrame(x, y, padding = 0) {
    const frame = state.frame;
    if (!frame) return true;
    return (
      x >= frame.x - padding &&
      x <= frame.x + frame.width + padding &&
      y >= frame.y - padding &&
      y <= frame.y + frame.height + padding
    );
  }

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    rendererState.pixelRatio = ratio;
    const { width, height } = canvas.getBoundingClientRect();
    rendererState.width = width;
    rendererState.height = height;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    draw();
  }

  function drawEdge(edge) {
    const from = state.nodes.find(node => node.id === edge.from);
    const to = state.nodes.find(node => node.id === edge.to);
    if (!from || !to) return;

    const geometry = calculateEdgeGeometry(from, to, edge);

    ctx.save();
    const scale = getCameraScale();
    const edgeThickness = Number(edge.thickness) || state.edgeThickness || 2.5;
    ctx.lineWidth = edgeThickness / scale;
    const baseColor = edge.color || 'rgba(148, 163, 184, 0.85)';
    const strokeColor = state.selected?.item?.id === edge.id ? '#38bdf8' : baseColor;
    ctx.strokeStyle = strokeColor;

    if (edge.style === 'dashed') {
      ctx.setLineDash([12 / scale, 10 / scale]);
    } else if (edge.style === 'dotted') {
      ctx.setLineDash([3 / scale, 7 / scale]);
    } else {
      ctx.setLineDash([]);
    }

    ctx.beginPath();
    if (geometry.type === 'quadratic') {
      ctx.moveTo(geometry.startPoint.x, geometry.startPoint.y);
      ctx.quadraticCurveTo(geometry.control.x, geometry.control.y, geometry.endPoint.x, geometry.endPoint.y);
    } else {
      geometry.segments.forEach((segment, index) => {
        if (index === 0) {
          ctx.moveTo(segment.start.x, segment.start.y);
        }
        ctx.lineTo(segment.end.x, segment.end.y);
      });
    }
    ctx.stroke();
    ctx.setLineDash([]);

    if (edge.direction && edge.direction.includes('>')) {
      drawArrowHead(geometry.endPoint, geometry.endAngle, edge, strokeColor, edgeThickness);
    }
    if (edge.direction && edge.direction.startsWith('<')) {
      drawArrowHead(
        geometry.startPoint,
        geometry.startAngle + Math.PI,
        edge,
        strokeColor,
        edgeThickness
      );
    }

    if (edge.label?.text) {
      drawEdgeLabel(edge, geometry);
    }

    if (
      geometry.elbow &&
      state.selected?.type === 'edge' &&
      state.selected?.item?.id === edge.id
    ) {
      drawElbowHandle(geometry.elbow);
    }

    ctx.restore();
  }

  function drawArrowHead(point, angle, edge, strokeColor, thicknessOverride) {
    const scale = getCameraScale();
    const baseThickness = Number(thicknessOverride) || state.edgeThickness || 2.5;
    const factor = baseThickness / 2.5;
    const size = (12 * factor) / scale;
    const offset = (isCurvedShape(edge.shape) ? 6 : 0) / scale;
    const targetX = point.x - Math.cos(angle) * offset;
    const targetY = point.y - Math.sin(angle) * offset;
    ctx.save();
    ctx.translate(targetX, targetY);
    ctx.rotate(angle);
    ctx.fillStyle = strokeColor;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-size, size / 2);
    ctx.lineTo(-size, -size / 2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawElbowHandle(point) {
    const scale = getCameraScale();
    const size = 10 / scale;
    ctx.save();
    ctx.fillStyle = '#f8fafc';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.5 / scale;
    ctx.beginPath();
    ctx.rect(point.x - size / 2, point.y - size / 2, size, size);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawCylinderNode(node, strokeColor, dashPattern) {
    const metrics = getCylinderMetrics(node);
    const { rx, ry, bodyHeight, paddingX, paddingY } = metrics;
    const scale = getCameraScale();
    const topCenterY = node.y - bodyHeight / 2;
    const bottomCenterY = node.y + bodyHeight / 2;

    const usesCustomFill = node.cylinderUsesCustomFill !== false;
    const fallbackFill = node.color || '#e2e8f0';
    const bodyColor = resolveColor(
      usesCustomFill ? node.cylinderBodyFill : null,
      fallbackFill
    );
    const endColor = resolveColor(
      usesCustomFill ? node.cylinderEndFill : null,
      fallbackFill
    );

    const bodyPath = new Path2D();
    bodyPath.moveTo(node.x - rx, topCenterY);
    bodyPath.lineTo(node.x - rx, bottomCenterY);
    bodyPath.ellipse(node.x, bottomCenterY, rx, ry, 0, Math.PI, 0);
    bodyPath.lineTo(node.x + rx, topCenterY);
    bodyPath.ellipse(node.x, topCenterY, rx, ry, 0, Math.PI, 0, true);
    bodyPath.closePath();

    const topEllipse = new Path2D();
    topEllipse.ellipse(node.x, topCenterY, rx, ry, 0, 0, Math.PI * 2);

    const highlight = lightenColor(bodyColor, 0.28);
    const shadow = darkenColor(bodyColor, 0.18);
    const bodyGradient = ctx.createLinearGradient(
      node.x,
      topCenterY - ry,
      node.x,
      bottomCenterY + ry
    );
    bodyGradient.addColorStop(0, highlight);
    bodyGradient.addColorStop(0.6, bodyColor);
    bodyGradient.addColorStop(1, shadow);

    ctx.fillStyle = bodyGradient;
    ctx.fill(bodyPath);

    const topHighlight = lightenColor(endColor, 0.18);
    ctx.fillStyle = topHighlight;
    ctx.fill(topEllipse);

    const outerStrokeWidth = ctx.lineWidth;

    ctx.strokeStyle = strokeColor;
    if (dashPattern.length) {
      ctx.setLineDash(dashPattern);
    } else {
      ctx.setLineDash([]);
    }
    ctx.stroke(bodyPath);

    ctx.save();
    ctx.lineWidth = Math.max(outerStrokeWidth * 0.85, 0.75 / scale);
    ctx.strokeStyle = withAlpha(strokeColor, 0.78);
    ctx.beginPath();
    ctx.ellipse(node.x, topCenterY, rx, ry, 0, 0, Math.PI);
    ctx.stroke();
    ctx.restore();

    const rimRx = Math.max(4, Math.min(rx - Math.max(4, paddingX * 0.6), rx * 0.88));
    const rimRy = Math.max(3, Math.min(ry - Math.max(3, paddingY * 0.6), ry * 0.85));
    if (rimRx > 6 && rimRy > 4) {
      const innerEllipse = new Path2D();
      innerEllipse.ellipse(node.x, topCenterY, rimRx, rimRy, 0, 0, Math.PI * 2);
      ctx.save();
      ctx.fillStyle = lightenColor(endColor, 0.35);
      ctx.globalAlpha = 0.85;
      ctx.fill(innerEllipse);
      ctx.restore();

      ctx.save();
      ctx.lineWidth = Math.max(outerStrokeWidth * 0.6, 0.65 / scale);
      ctx.strokeStyle = withAlpha(strokeColor, 0.55);
      ctx.stroke(innerEllipse);
      ctx.restore();
    }

    ctx.save();
    ctx.lineWidth = Math.max(outerStrokeWidth * 0.8, 0.7 / scale);
    ctx.setLineDash([6 / scale, 6 / scale]);
    ctx.strokeStyle = withAlpha(strokeColor, 0.4);
    ctx.beginPath();
    ctx.ellipse(node.x, bottomCenterY, rx, ry, 0, 0, Math.PI);
    ctx.stroke();
    ctx.restore();
  }

  function drawNodeBase(node) {
    ctx.save();
    const scale = getCameraScale();
    const isSelected = isNodeSelected(node.id);
    const isHovered = state.hoverNodeId === node.id;
    const isOrigin = state.edgeDraft?.from?.nodeId === node.id;
    const targetInfo = state.edgeDraft?.target;
    const isTarget = targetInfo?.nodeId === node.id;
    const baseStroke = node.borderColor || '#94a3b8';
    const strokeColor = (() => {
      if (isSelected && !state.borderPreviewSuppressed) return '#38bdf8';
      if (isTarget) return targetInfo.valid ? '#22c55e' : '#ef4444';
      if (isOrigin) return '#38bdf8';
      if (isHovered && state.edgeDraft) return 'rgba(96, 165, 250, 0.9)';
      if (isHovered) return withAlpha(baseStroke, 0.85);
      return withAlpha(baseStroke, 1);
    })();

    const baseWidth = Number(node.borderWidth) || 3;
    const width = (() => {
      if (isTarget) return baseWidth + 1.2;
      if ((isSelected && !state.borderPreviewSuppressed) || isOrigin) return baseWidth + 0.6;
      if (isHovered) return baseWidth + 0.3;
      return baseWidth;
    })();
    ctx.lineWidth = Math.max(width, 1) / scale;
    ctx.strokeStyle = strokeColor;
    const dashPattern = resolveDashPattern(node.borderStyle, scale);
    if (dashPattern.length) {
      ctx.setLineDash(dashPattern);
    } else {
      ctx.setLineDash([]);
    }
    ctx.globalAlpha = clampOpacity(node.opacity ?? 1);

    const rotateDeg = Number(node.rotate);
    const rotateRad = Number.isFinite(rotateDeg) ? toRadians(rotateDeg) : 0;
    if (rotateRad !== 0) {
      ctx.translate(node.x, node.y);
      ctx.rotate(rotateRad);
      ctx.translate(-node.x, -node.y);
    }

    const borderRotateDeg = Number(node.shapeBorderRotate);
    const borderRotateRad = Number.isFinite(borderRotateDeg)
      ? toRadians(borderRotateDeg)
      : 0;

    ctx.save();
    if (borderRotateRad !== 0) {
      ctx.translate(node.x, node.y);
      ctx.rotate(borderRotateRad);
      ctx.translate(-node.x, -node.y);
    }

    if (node.shape === 'cylinder') {
      drawCylinderNode(node, strokeColor, dashPattern);
    } else if (node.shape === 'rectangle split') {
      drawRectangleSplitNode(node, strokeColor, dashPattern);
      ctx.restore();
      ctx.restore();
      return;
    } else {
      ctx.fillStyle = node.color || '#e2e8f0';
      const path = getNodePath(node);
      ctx.fill(path);
      ctx.stroke(path);
    }
    ctx.restore();

    ctx.globalAlpha = 1;

    const fontSize = Number(node.fontSize) || 16;
    const lines = (node.label || 'Node').toString().split(/\n/);
    const lineHeight = fontSize * 1.25;

    ctx.fillStyle = '#0f172a';
    ctx.font = `600 ${fontSize}px Inter, system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const { halfWidth, halfHeight } = getNodeDimensions(node);
    let maxTextWidth = Math.max(halfWidth * 2 - fontSize, 24);
    let availableHeight = Math.max(halfHeight * 2 - fontSize * 0.5, lineHeight);
    if (node.shape === 'cylinder') {
      const metrics = getCylinderMetrics(node);
      const textWidth = Math.max(metrics.contentWidth - fontSize * 0.4, 16);
      const textHeight = Math.max(metrics.contentHeight, lineHeight);
      maxTextWidth = Math.max(textWidth, 24);
      availableHeight = Math.max(textHeight, lineHeight);
    }
    const maxLines = Math.max(1, Math.floor(availableHeight / lineHeight));
    const ellipsis = '…';

    const truncateLine = (content, forceEllipsis = false) => {
      const raw = typeof content === 'string' ? content : '';
      if (!forceEllipsis && ctx.measureText(raw).width <= maxTextWidth) {
        return raw;
      }
      const trimmed = raw.trimEnd();
      let best = forceEllipsis
        ? (trimmed ? `${trimmed}${ellipsis}` : ellipsis)
        : ellipsis;
      if (forceEllipsis && ctx.measureText(best).width <= maxTextWidth) {
        return best;
      }
      let low = 0;
      let high = trimmed.length;
      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const slice = trimmed.slice(0, mid).trimEnd();
        const candidate = slice ? `${slice}${ellipsis}` : ellipsis;
        if (ctx.measureText(candidate).width <= maxTextWidth) {
          best = candidate;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }
      return best;
    };

    const truncatedLines = [];
    for (let i = 0; i < lines.length && truncatedLines.length < maxLines; i += 1) {
      const isLastLine = truncatedLines.length === maxLines - 1;
      const hasMoreContent = isLastLine && i < lines.length - 1;
      truncatedLines.push(truncateLine(lines[i], hasMoreContent));
    }

    const effectiveHeight = lineHeight * (Math.max(truncatedLines.length, 1) - 1);
    let offsetY = node.y - effectiveHeight / 2;
    truncatedLines.forEach(line => {
      ctx.fillText(line, node.x, offsetY);
      offsetY += lineHeight;
    });
    ctx.restore();
  }

  function drawRectangleSplitNode(node, strokeColor, dashPattern) {
    const scale = getCameraScale();
    const metrics = getRectangleSplitMetrics(node);
    const width = metrics.halfWidth * 2;
    const left = node.x - metrics.halfWidth;
    const cells = Array.isArray(node.rectangleSplitCells) ? node.rectangleSplitCells : [];
    const baseFill = node.color || '#e2e8f0';

    ctx.save();
    for (let index = 0; index < metrics.parts; index += 1) {
      const cell = cells[index] || {};
      const fill = resolveColor(cell.fill, baseFill);
      if (fill) {
        ctx.fillStyle = fill;
        const top = metrics.top + metrics.partHeight * index;
        ctx.fillRect(left, top, width, metrics.partHeight);
      }
    }
    ctx.lineWidth = Math.max(Number(node.borderWidth) || 3, 1) / scale;
    ctx.strokeStyle = strokeColor;
    if (dashPattern.length) {
      ctx.setLineDash(dashPattern);
    }
    ctx.strokeRect(left, metrics.top, width, metrics.partHeight * metrics.parts);
    for (let split = 1; split < metrics.parts; split += 1) {
      const y = metrics.top + metrics.partHeight * split;
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(left + width, y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    drawRectangleSplitLabels(node, metrics, cells);
    ctx.restore();
  }

  function drawRectangleSplitLabels(node, metrics, cells) {
    const fontSize = Number(node.fontSize) || 16;
    const lineHeight = fontSize * 1.25;
    const maxTextWidth = Math.max(16, metrics.halfWidth * 2 - fontSize * 0.5);
    const maxLines = Math.max(1, Math.floor(metrics.partHeight / lineHeight));

    const truncateWithEllipsis = text => {
      const ellipsis = '…';
      const raw = text.trimEnd();
      if (ctx.measureText(raw).width <= maxTextWidth) {
        return raw || ellipsis;
      }
      let best = ellipsis;
      let low = 0;
      let high = raw.length;
      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const candidate = `${raw.slice(0, mid).trimEnd()}${ellipsis}`;
        if (ctx.measureText(candidate).width <= maxTextWidth) {
          best = candidate;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }
      return best;
    };

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `600 ${fontSize}px Inter, system-ui`;

    for (let index = 0; index < metrics.parts; index += 1) {
      const cell = cells[index] || {};
      const rawText = typeof cell.text === 'string' ? cell.text : '';
      const textColor = resolveColor(cell.textColor, '#0f172a');
      const rows = rawText.split(/\n/);
      const lines = [];
      rows.forEach(row => {
        const words = row.split(/\s+/);
        let current = '';
        words.forEach((word, wordIndex) => {
          if (!word && wordIndex !== words.length - 1) {
            return;
          }
          const tentative = current ? `${current} ${word}`.trim() : word;
          if (ctx.measureText(tentative).width <= maxTextWidth) {
            current = tentative;
          } else {
            if (current) {
              lines.push(current);
            }
            current = word;
          }
        });
        if (current) {
          lines.push(current);
        } else if (!words.length) {
          lines.push('');
        }
      });
      if (lines.length > maxLines) {
        const truncated = lines.slice(0, maxLines);
        truncated[maxLines - 1] = truncateWithEllipsis(truncated[maxLines - 1] || '');
        lines.length = 0;
        Array.prototype.push.apply(lines, truncated);
      }
      if (!lines.length) {
        lines.push('');
      }
      const totalHeight = lineHeight * (lines.length - 1);
      let offsetY = metrics.top + metrics.partHeight * index + metrics.partHeight / 2 - totalHeight / 2;
      ctx.fillStyle = textColor;
      lines.forEach(line => {
        ctx.fillText(line || '\u2009', node.x, offsetY);
        offsetY += lineHeight;
      });
    }

    ctx.restore();
  }

  function drawNodeHandles(node) {
    const scale = getCameraScale();
    const isSelected = isNodeSelected(node.id);
    const isHovered = state.hoverNodeId === node.id;
    const isOrigin = state.edgeDraft?.from?.nodeId === node.id;
    const targetInfo = state.edgeDraft?.target;
    const isTarget = targetInfo?.nodeId === node.id;
    const isCounterpart = state.edgeDraft?.counterpart?.nodeId === node.id;
    const shouldShow = isSelected || isHovered || isOrigin || isTarget || isCounterpart;
    if (!shouldShow) return;

    const anchors = getAnchorPoints(node);
    const renderAnchors = anchors.filter(anchor => {
      if (anchor.isConnectable) return true;
      if (
        state.edgeDraft?.from?.nodeId === node.id &&
        state.edgeDraft?.from?.anchor === anchor.direction
      ) {
        return true;
      }
      if (isTarget && targetInfo.anchor === anchor.direction) {
        return true;
      }
      if (
        state.edgeDraft?.counterpart &&
        state.edgeDraft.counterpart.nodeId === node.id &&
        state.edgeDraft.counterpart.anchor === anchor.direction
      ) {
        return true;
      }
      return false;
    });
    ctx.save();
    renderAnchors.forEach(({ direction, point }) => {
      let fill = 'rgba(226, 232, 240, 0.95)';
      let stroke = 'rgba(100, 116, 139, 0.85)';
      if (state.edgeDraft?.from?.nodeId === node.id && state.edgeDraft?.from?.anchor === direction) {
        fill = '#38bdf8';
        stroke = '#0f172a';
      } else if (isTarget && targetInfo.anchor === direction) {
        if (targetInfo.valid) {
          fill = '#22c55e';
          stroke = '#064e3b';
        } else {
          fill = '#ef4444';
          stroke = '#7f1d1d';
        }
      } else if (
        state.edgeDraft?.counterpart &&
        state.edgeDraft.counterpart.nodeId === node.id &&
        state.edgeDraft.counterpart.anchor === direction
      ) {
        fill = 'rgba(191, 219, 254, 0.95)';
        stroke = 'rgba(37, 99, 235, 0.9)';
      } else if (state.hoverAnchor === direction && isHovered) {
        fill = '#38bdf8';
        stroke = '#0f172a';
      }

      ctx.beginPath();
      ctx.arc(point.x, point.y, CONNECTION_HANDLE_RADIUS / scale, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2 / scale;
      ctx.fill();
      ctx.stroke();
    });
    ctx.restore();
  }

  function drawFreeLine(line) {
    if (!line?.start || !line?.end) return;
    const scale = getCameraScale();
    const isSelected = isLineSelected(line.id);
    const width = Number(line.thickness) || DEFAULT_EDGE_THICKNESS;
    const strokeWidth = Math.max(width, 0.75) / scale;
    const baseColor = line.color || '#94a3b8';
    const style = typeof line.style === 'string' ? line.style : 'solid';

    ctx.save();
    ctx.lineCap = 'round';
    if (style === 'dashed') {
      ctx.setLineDash([12 / scale, 10 / scale]);
    } else if (style === 'dotted') {
      ctx.setLineDash([3 / scale, 7 / scale]);
    } else {
      ctx.setLineDash([]);
    }
    ctx.lineWidth = strokeWidth;
    ctx.strokeStyle = baseColor;
    ctx.beginPath();
    ctx.moveTo(line.start.x, line.start.y);
    ctx.lineTo(line.end.x, line.end.y);
    ctx.stroke();
    ctx.setLineDash([]);

    if (isSelected && !state.borderPreviewSuppressed) {
      ctx.lineWidth = (strokeWidth * scale + 4) / scale;
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.6)';
      ctx.stroke();
    }

    if (isSelected) {
      const handleSize = 10 / scale;
      const fill = state.borderPreviewSuppressed ? baseColor : '#38bdf8';
      const stroke = state.borderPreviewSuppressed ? baseColor : '#0f172a';
      ctx.fillStyle = fill;
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1.5 / scale;
      const drawHandle = point => {
        ctx.beginPath();
        ctx.rect(point.x - handleSize / 2, point.y - handleSize / 2, handleSize, handleSize);
        ctx.fill();
        ctx.stroke();
      };
      drawHandle(line.start);
      drawHandle(line.end);
    }
    ctx.restore();
  }

  function drawTextBlock(block) {
    ctx.save();
    const scale = getCameraScale();
    const isSelected = state.selected?.item?.id === block.id;
    const palette = getThemePalette();
    const showBackground = block.showBackground !== false;
    const fillColor = showBackground
      ? resolveColor(block.fillColor, palette.textBlockFill)
      : null;
    const borderColor = resolveColor(block.borderColor, palette.textBlockStroke);
    const borderWidth = Math.max(Number(block.borderWidth) || TEXT_BLOCK_BORDER_WIDTH_DEFAULT, 0);
    const opacity = clampOpacity(block.opacity ?? 1);
    const dashPattern = resolveDashPattern(block.borderStyle, scale);

    const radius = 12;
    const path = roundedRectPath(block.x, block.y, block.width, block.height, radius);

    ctx.globalAlpha = opacity;
    if (fillColor) {
      ctx.fillStyle = fillColor;
      ctx.fill(path);
    }
    if (borderWidth > 0) {
      ctx.lineWidth = borderWidth / scale;
      ctx.strokeStyle = borderColor;
      if (dashPattern.length) {
        ctx.setLineDash(dashPattern);
      }
      ctx.stroke(path);
      ctx.setLineDash([]);
    }
    ctx.globalAlpha = 1;

    if (isSelected) {
      ctx.save();
      ctx.lineWidth = Math.max(borderWidth / scale + 2 / scale, 1 / scale);
      ctx.strokeStyle = '#38bdf8';
      ctx.setLineDash([6 / scale, 6 / scale]);
      ctx.stroke(path);
      ctx.restore();
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(
      block.x + TEXT_BLOCK_PADDING,
      block.y + TEXT_BLOCK_PADDING,
      block.width - TEXT_BLOCK_PADDING * 2,
      block.height - TEXT_BLOCK_PADDING * 2
    );
    ctx.clip();
    const textColor = typeof block.color === 'string' && block.color
      ? block.color
      : palette.textBlockText;
    ctx.fillStyle = textColor;
    ctx.font = `${block.fontWeight || 500} ${block.fontSize || 16}px Inter, system-ui`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    drawWrappedText(block.text || '', block);
    ctx.restore();

    if (isSelected) {
      ctx.fillStyle = '#38bdf8';
      const handleSize = TEXT_HANDLE_SIZE / scale;
      ctx.beginPath();
      ctx.rect(
        block.x + block.width - handleSize,
        block.y + block.height - handleSize,
        handleSize,
        handleSize
      );
      ctx.fill();
    }

    ctx.restore();
  }

  function drawEdgeLabel(edge, geometry) {
    ctx.save();
    const label = edge.label || {};
    ctx.fillStyle = label.color || '#e2e8f0';
    ctx.font = `500 15px Inter, system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    const labelPoint = geometry.labelPoint;
    const text = label?.text ?? '';
    const offsetX = label?.offset?.[0] ?? 0;
    const offsetY = label?.offset?.[1] ?? 0;
    ctx.fillText(text, labelPoint.x + offsetX, labelPoint.y - 8 + offsetY);

    if (state.selected?.type === 'edge' && state.selected?.item?.id === edge.id && text) {
      const metrics = ctx.measureText(text);
      const width = metrics.width;
      const height = 18;
      const cx = labelPoint.x + offsetX;
      const cy = labelPoint.y - 8 + offsetY - height / 2;
      const scale = getCameraScale();
      const margin = 6 / scale;
      const handleSize = 8 / scale;
      ctx.save();
      ctx.beginPath();
      ctx.strokeStyle = '#38bdf8';
      ctx.setLineDash([6 / scale, 6 / scale]);
      ctx.rect(cx - width / 2 - margin, cy - height / 2, width + margin * 2, height);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.fillStyle = '#38bdf8';
      ctx.arc(cx + width / 2, cy - height / 2 - handleSize * 0.75, handleSize, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  function drawWrappedText(text, block) {
    const maxWidth = block.width - TEXT_BLOCK_PADDING * 2;
    const lines = [];
    const rawLines = text.split(/\n/);
    rawLines.forEach(line => {
      const words = line.split(/\s+/);
      let current = '';
      words.forEach((word, index) => {
        if (!word && index !== words.length - 1) return;
        const tentative = current ? `${current} ${word}`.trim() : word;
        const width = ctx.measureText(tentative).width;
        if (width <= maxWidth) {
          current = tentative;
        } else {
          if (current) lines.push(current);
          current = word;
        }
      });
      lines.push(current);
    });

    const lineHeight = (block.fontSize || 16) * 1.4;
    let y = block.y + TEXT_BLOCK_PADDING;
    lines.forEach(line => {
      ctx.fillText(line, block.x + TEXT_BLOCK_PADDING, y);
      y += lineHeight;
    });
  }

  function getNodePath(node) {
    const path = new Path2D();
    const { halfWidth: rawHalfWidth, halfHeight: rawHalfHeight } = getNodeDimensions(node);
    const halfWidth = rawHalfWidth || NODE_WIDTH / 2;
    const halfHeight = rawHalfHeight || NODE_HEIGHT / 2;
    const width = halfWidth * 2;
    const height = halfHeight * 2;

    switch (node.shape) {
      case 'rectangle':
      case 'rounded rectangle':
        addRoundedRect(
          path,
          node.x - halfWidth,
          node.y - halfHeight,
          width,
          height,
          Math.max(0, node.cornerRadius ?? 16)
        );
        break;
      case 'rectangle split': {
        const metrics = getRectangleSplitMetrics(node);
        path.rect(
          node.x - metrics.halfWidth,
          node.y - metrics.halfHeight,
          metrics.halfWidth * 2,
          metrics.halfHeight * 2
        );
        for (let i = 1; i < metrics.parts; i += 1) {
          const y = metrics.top + metrics.partHeight * i;
          path.moveTo(node.x - metrics.halfWidth, y);
          path.lineTo(node.x + metrics.halfWidth, y);
        }
        break;
      }
      case 'triangle': {
        path.moveTo(node.x, node.y - halfHeight);
        path.lineTo(node.x + halfWidth, node.y + halfHeight);
        path.lineTo(node.x - halfWidth, node.y + halfHeight);
        path.closePath();
        break;
      }
      case 'diamond':
        path.moveTo(node.x, node.y - halfHeight);
        path.lineTo(node.x + halfWidth, node.y);
        path.lineTo(node.x, node.y + halfHeight);
        path.lineTo(node.x - halfWidth, node.y);
        path.closePath();
        break;
      case 'decision': {
        const horizontal = halfWidth * 0.65;
        path.moveTo(node.x - horizontal, node.y - halfHeight);
        path.lineTo(node.x + horizontal, node.y - halfHeight);
        path.lineTo(node.x + halfWidth, node.y);
        path.lineTo(node.x + horizontal, node.y + halfHeight);
        path.lineTo(node.x - horizontal, node.y + halfHeight);
        path.lineTo(node.x - halfWidth, node.y);
        path.closePath();
        break;
      }
      case 'semicircle': {
        const baseY = node.y + halfHeight;
        path.moveTo(node.x - halfWidth, baseY);
        path.lineTo(node.x + halfWidth, baseY);
        path.ellipse(node.x, baseY, halfWidth, halfHeight, 0, 0, Math.PI, false);
        path.closePath();
        break;
      }
      case 'ellipse':
        path.ellipse(node.x, node.y, halfWidth, halfHeight, 0, 0, Math.PI * 2);
        break;
      case 'cloud':
        addCloudPath(path, node, halfWidth, halfHeight);
        break;
      case 'cylinder': {
        const rx = halfWidth;
        const aspectRaw = Number(node.aspect);
        const aspect = Number.isFinite(aspectRaw) && aspectRaw > 0 ? aspectRaw : 0.6;
        const maxRy = halfHeight * 0.9;
        const ry = Math.min(maxRy, Math.max(halfHeight * 0.2, rx * aspect));
        const topCenterY = node.y - halfHeight + ry;
        const bottomCenterY = node.y + halfHeight - ry;
        path.moveTo(node.x - rx, topCenterY);
        path.lineTo(node.x - rx, bottomCenterY);
        path.ellipse(node.x, bottomCenterY, rx, ry, 0, Math.PI, 0);
        path.lineTo(node.x + rx, topCenterY);
        path.ellipse(node.x, topCenterY, rx, ry, 0, 0, Math.PI, true);
        path.closePath();
        break;
      }
      case 'circle':
        path.arc(node.x, node.y, halfWidth, 0, Math.PI * 2);
        break;
      default:
        path.ellipse(node.x, node.y, halfWidth, halfHeight, 0, 0, Math.PI * 2);
    }
    return path;
  }

  function addRoundedRect(path, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    path.moveTo(x + r, y);
    path.arcTo(x + width, y, x + width, y + height, r);
    path.arcTo(x + width, y + height, x, y + height, r);
    path.arcTo(x, y + height, x, y, r);
    path.arcTo(x, y, x + width, y, r);
    path.closePath();
  }

  function roundedRectPath(x, y, width, height, radius) {
    const path = new Path2D();
    addRoundedRect(path, x, y, width, height, radius);
    return path;
  }

  function addCloudPath(path, node, halfWidth, halfHeight) {
    const scalePoint = ({ sx, sy }) => ({
      x: node.x + halfWidth * sx,
      y: node.y - halfHeight * sy,
    });
    const points = CLOUD_PUFF_SHAPE.map(scalePoint);
    if (points.length === 0) {
      path.ellipse(node.x, node.y, halfWidth, halfHeight, 0, 0, Math.PI * 2);
      return;
    }
    const startMid = midpoint(points[points.length - 1], points[0]);
    path.moveTo(startMid.x, startMid.y);
    for (let i = 0; i < points.length; i += 1) {
      const current = points[i];
      const next = points[(i + 1) % points.length];
      const mid = midpoint(current, next);
      path.quadraticCurveTo(current.x, current.y, mid.x, mid.y);
    }
    path.closePath();
  }

  function midpoint(a, b) {
    return {
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
    };
  }

  function calculateEdgeGeometry(from, to, edge) {
    const startPoint = getAnchorPoint(from, edge.fromAnchor);
    const endPoint = getAnchorPoint(to, edge.toAnchor);

    if (isCurvedShape(edge.shape)) {
      const bendShape = resolveBendShape(edge.shape) || 'bend left';
      const control = getQuadraticControlPoint(startPoint, endPoint, bendShape, Number(edge.bend) || 30);
      const mid = getQuadraticPoint(startPoint, control, endPoint, 0.5);
      const endVec = { x: endPoint.x - control.x, y: endPoint.y - control.y };
      const startVec = { x: control.x - startPoint.x, y: control.y - startPoint.y };
      return {
        type: 'quadratic',
        startPoint,
        endPoint,
        control,
        startAngle: Math.atan2(startVec.y, startVec.x),
        endAngle: Math.atan2(endVec.y, endVec.x),
        labelPoint: mid,
      };
    }

    if (isOrthogonalShape(edge.shape)) {
      const { segments, elbow, startAngle, endAngle, labelPoint } = computeOrthogonalGeometry(startPoint, endPoint, edge.shape);
      return {
        type: 'polyline',
        segments,
        elbow,
        startPoint,
        endPoint,
        startAngle,
        endAngle,
        labelPoint,
      };
    }

    const segments = [{ start: startPoint, end: endPoint }];
    const startAngle = Math.atan2(endPoint.y - startPoint.y, endPoint.x - startPoint.x);
    const labelPoint = {
      x: startPoint.x + (endPoint.x - startPoint.x) / 2,
      y: startPoint.y + (endPoint.y - startPoint.y) / 2,
    };

    return {
      type: 'polyline',
      segments,
      startPoint,
      endPoint,
      startAngle,
      endAngle: startAngle,
      labelPoint,
    };
  }

  function getQuadraticPoint(start, control, end, t) {
    const invT = 1 - t;
    const x = invT * invT * start.x + 2 * invT * t * control.x + t * t * end.x;
    const y = invT * invT * start.y + 2 * invT * t * control.y + t * t * end.y;
    return { x, y };
  }

  function drawEdgePreview() {
    const draft = state.edgeDraft;
    if (!draft) return;

    let startPoint = null;
    let endPoint = null;

    if (draft.mode === 'rewire' && draft.counterpart) {
      const counterpartNode = state.nodes.find(node => node.id === draft.counterpart.nodeId);
      if (!counterpartNode || !draft.pointer) return;
      const counterpartPoint = getAnchorPoint(counterpartNode, draft.counterpart.anchor);
      if (draft.endpoint === 'to') {
        startPoint = counterpartPoint;
        if (draft.target?.nodeId) {
          const targetNode = state.nodes.find(node => node.id === draft.target.nodeId);
          if (targetNode) {
            endPoint = getAnchorPoint(targetNode, draft.target.anchor);
          }
        }
        if (!endPoint) {
          endPoint = draft.pointer;
        }
      } else {
        endPoint = counterpartPoint;
        if (draft.target?.nodeId) {
          const targetNode = state.nodes.find(node => node.id === draft.target.nodeId);
          if (targetNode) {
            startPoint = getAnchorPoint(targetNode, draft.target.anchor);
          }
        }
        if (!startPoint) {
          startPoint = draft.pointer;
        }
      }
    } else {
      const fromNode = state.nodes.find(node => node.id === draft.from?.nodeId);
      if (!fromNode || !draft.pointer) return;
      startPoint = getAnchorPoint(fromNode, draft.from.anchor);
      if (draft.target?.nodeId) {
        const targetNode = state.nodes.find(node => node.id === draft.target.nodeId);
        if (targetNode) {
          endPoint = getAnchorPoint(targetNode, draft.target.anchor);
        }
      }
      if (!endPoint) {
        endPoint = draft.pointer;
      }
    }

    if (!startPoint || !endPoint) return;

    ctx.save();
    const scale = getCameraScale();
    ctx.setLineDash([8 / scale, 6 / scale]);
    const thickness = state.edgeThickness || 2.5;
    ctx.lineWidth = thickness / scale;
    ctx.strokeStyle = draft.target?.valid ? '#38bdf8' : 'rgba(148, 163, 184, 0.8)';
    ctx.beginPath();
    ctx.moveTo(startPoint.x, startPoint.y);
    ctx.lineTo(endPoint.x, endPoint.y);
    ctx.stroke();
    ctx.restore();
  }

  function drawDrawingDraft() {
    const draft = state.drawing;
    if (!draft || !draft.start || !draft.current) {
      return;
    }
    const scale = getCameraScale();
    ctx.save();
    ctx.lineWidth = 1.5 / scale;
    ctx.setLineDash([6 / scale, 6 / scale]);
    ctx.strokeStyle = '#38bdf8';
    const start = draft.start;
    const current = draft.current;
    if (draft.type === 'forms' || draft.type === 'frame') {
      const left = Math.min(start.x, current.x);
      const top = Math.min(start.y, current.y);
      const width = Math.abs(current.x - start.x) || 1;
      const height = Math.abs(current.y - start.y) || 1;
      ctx.strokeRect(left, top, width, height);
    } else if (draft.type === 'line') {
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(current.x, current.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function draw() {
    resetTransform();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const palette = getThemePalette();
    ctx.fillStyle = palette.canvasBackground;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawGrid();

    ctx.save();
    applyCameraTransform();
    drawScene();
    drawSelectionRectangle();

    if (state.frame) {
      drawFrame(state.frame);
    }

    ctx.restore();
  }

  function drawMatrixGrid(grid) {
    const { rows, columns, cellSize, width, height } = getMatrixGridSize(grid);
    if (!rows || !columns || !cellSize) return;

    const palette = getThemePalette();

    for (let row = 0; row < rows; row += 1) {
      const rowData = Array.isArray(grid.data[row]) ? grid.data[row] : [];
      for (let col = 0; col < columns; col += 1) {
        const key = rowData[col];
        const color = grid.colorMap?.[String(key)] || palette.matrixCellFallback;
        ctx.fillStyle = color;
        const x = grid.x + col * cellSize;
        const y = grid.y + row * cellSize;
        ctx.fillRect(x, y, cellSize, cellSize);
      }
    }

    const scale = getCameraScale();
    ctx.save();
    ctx.lineWidth = Math.max(0.75 / scale, 0.4);
    ctx.strokeStyle = palette.matrixGridStroke;
    ctx.beginPath();
    for (let col = 0; col <= columns; col += 1) {
      const x = grid.x + col * cellSize;
      ctx.moveTo(x, grid.y);
      ctx.lineTo(x, grid.y + height);
    }
    for (let row = 0; row <= rows; row += 1) {
      const y = grid.y + row * cellSize;
      ctx.moveTo(grid.x, y);
      ctx.lineTo(grid.x + width, y);
    }
    ctx.stroke();
    ctx.restore();

    if (state.selected?.type === 'matrix' && state.selected.item?.id === grid.id) {
      ctx.save();
      const padding = 4 / scale;
      ctx.lineWidth = 2 / scale;
      ctx.strokeStyle = '#38bdf8';
      ctx.strokeRect(
        grid.x - padding,
        grid.y - padding,
        width + padding * 2,
        height + padding * 2
      );
      ctx.restore();
    }
  }

  function drawScene() {
    (state.matrixGrids || []).forEach(drawMatrixGrid);
    (state.lines || []).forEach(drawFreeLine);
    state.edges.forEach(drawEdge);
    state.nodes.forEach(drawNodeBase);
    state.textBlocks?.forEach(drawTextBlock);
    state.nodes.forEach(drawNodeHandles);
    drawEdgePreview();
    drawDrawingDraft();
    drawGuides();
  }

  function drawSelectionRectangle() {
    const rect = state.selectionRect;
    if (!rect || rect.width <= 0 || rect.height <= 0) {
      return;
    }
    const scale = getCameraScale();
    ctx.save();
    ctx.lineWidth = 1.5 / scale;
    ctx.fillStyle = 'rgba(99, 102, 241, 0.18)';
    ctx.strokeStyle = 'rgba(99, 102, 241, 0.55)';
    ctx.setLineDash([6 / scale, 4 / scale]);
    ctx.beginPath();
    ctx.rect(rect.left, rect.top, rect.width, rect.height);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawFrame(frame) {
    const scale = getCameraScale();
    ctx.save();
    ctx.lineWidth = 2 / scale;
    ctx.strokeStyle = '#38bdf8';
    ctx.setLineDash([6 / scale, 6 / scale]);
    ctx.strokeRect(frame.x, frame.y, frame.width, frame.height);
    ctx.setLineDash([]);

    const handles = getFrameHandles(frame);
    handles.forEach(handle => {
      ctx.beginPath();
      ctx.fillStyle = '#38bdf8';
      ctx.rect(handle.x - handle.size / 2, handle.y - handle.size / 2, handle.size, handle.size);
      ctx.fill();
    });
    ctx.restore();
  }

  function drawGuides() {
    const guides = state.guides;
    if (!guides) return;
    const scale = getCameraScale();
    ctx.save();
    ctx.lineWidth = 1.5 / scale;
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.65)';
    if (guides.vertical != null) {
      ctx.beginPath();
      ctx.moveTo(guides.vertical, -1e4);
      ctx.lineTo(guides.vertical, 1e4);
      ctx.stroke();
    }
    if (guides.horizontal != null) {
      ctx.beginPath();
      ctx.moveTo(-1e4, guides.horizontal);
      ctx.lineTo(1e4, guides.horizontal);
      ctx.stroke();
    }
    if (guides.snapTarget) {
      ctx.save();
      const size = 8 / scale;
      ctx.lineWidth = 1.5 / scale;
      ctx.fillStyle = '#38bdf8';
      ctx.strokeStyle = '#0f172a';
      ctx.beginPath();
      ctx.rect(
        guides.snapTarget.x - size / 2,
        guides.snapTarget.y - size / 2,
        size,
        size
      );
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    if (guides.rotation && guides.rotation.pivot && Number.isFinite(guides.rotation.radius)) {
      ctx.save();
      const { pivot, angleStart = 0, angleCurrent = angleStart, radius } = guides.rotation;
      if (radius > 0) {
        ctx.lineWidth = 1.2 / scale;
        ctx.strokeStyle = '#38bdf8';
        ctx.beginPath();
        ctx.moveTo(pivot.x, pivot.y);
        const endX = pivot.x + Math.cos(angleCurrent) * radius;
        const endY = pivot.y + Math.sin(angleCurrent) * radius;
        ctx.lineTo(endX, endY);
        ctx.stroke();
        ctx.setLineDash([6 / scale, 6 / scale]);
        const clockwise = angleCurrent < angleStart;
        ctx.beginPath();
        ctx.arc(pivot.x, pivot.y, radius, angleStart, angleCurrent, clockwise);
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.restore();
  }

  function getFrameHandles(frame) {
    const scale = getCameraScale();
    const size = FRAME_HANDLE_SIZE / scale;
    const midX = frame.x + frame.width / 2;
    const midY = frame.y + frame.height / 2;
    return [
      { type: 'nw', x: frame.x, y: frame.y, size },
      { type: 'n', x: midX, y: frame.y, size },
      { type: 'ne', x: frame.x + frame.width, y: frame.y, size },
      { type: 'e', x: frame.x + frame.width, y: midY, size },
      { type: 'se', x: frame.x + frame.width, y: frame.y + frame.height, size },
      { type: 's', x: midX, y: frame.y + frame.height, size },
      { type: 'sw', x: frame.x, y: frame.y + frame.height, size },
      { type: 'w', x: frame.x, y: midY, size },
    ];
  }

  function drawGrid() {
    const scale = getCameraScale();
    const { left, right, top, bottom } = getVisibleWorldBounds();
    const startX = Math.floor(left / GRID_SPACING) * GRID_SPACING;
    const startY = Math.floor(top / GRID_SPACING) * GRID_SPACING;

    ctx.save();
    applyCameraTransform();
    ctx.beginPath();
    ctx.lineWidth = 1 / scale;
    const palette = getThemePalette();
    ctx.strokeStyle = palette.gridStroke;
    for (let x = startX; x <= right; x += GRID_SPACING) {
      ctx.moveTo(x, top);
      ctx.lineTo(x, bottom);
    }
    for (let y = startY; y <= bottom; y += GRID_SPACING) {
      ctx.moveTo(left, y);
      ctx.lineTo(right, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  function getMatrixGridBounds(grid) {
    const { width, height } = getMatrixGridSize(grid);
    if (!width || !height) {
      return null;
    }
    const left = grid.x;
    const top = grid.y;
    return {
      left,
      top,
      right: left + width,
      bottom: top + height,
      width,
      height,
      centerX: left + width / 2,
      centerY: top + height / 2,
    };
  }

  function getMatrixGridAtPosition(x, y) {
    const grids = state.matrixGrids || [];
    for (let index = grids.length - 1; index >= 0; index -= 1) {
      const grid = grids[index];
      const bounds = getMatrixGridBounds(grid);
      if (!bounds) continue;
      if (x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom) {
        return grid;
      }
    }
    return null;
  }

  function getNodeAnchorsSnapshot(node) {
    if (!node) {
      return [];
    }
    return getAnchorPoints(node).map(anchor => ({
      direction: anchor.direction,
      point: { x: anchor.point.x, y: anchor.point.y },
      isConnectable: anchor.isConnectable,
    }));
  }

  function getNodeAtPosition(x, y) {
    return [...(state.nodes || [])].reverse().find(node => {
      return isPointInsideNode(node, { x, y });
    }) || null;
  }

  function getEdgeAtPosition(x, y) {
    const threshold = 10 / getCameraScale();
    return [...state.edges].reverse().find(edge => {
      const from = state.nodes.find(node => node.id === edge.from);
      const to = state.nodes.find(node => node.id === edge.to);
      if (!from || !to) return false;
      const startPoint = getAnchorPoint(from, edge.fromAnchor);
      const endPoint = getAnchorPoint(to, edge.toAnchor);
      if (isCurvedShape(edge.shape)) {
        const bendShape = resolveBendShape(edge.shape) || 'bend left';
        const cp = getQuadraticControlPoint(startPoint, endPoint, bendShape, Number(edge.bend) || 30);
        const dist = distanceToQuadratic({ x, y }, startPoint, cp, endPoint);
        return dist <= threshold;
      }
      if (isOrthogonalShape(edge.shape)) {
        const { segments } = computeOrthogonalGeometry(startPoint, endPoint, edge.shape);
        return segments.some(segment => distanceToSegment({ x, y }, segment.start, segment.end) <= threshold);
      }
      return distanceToSegment({ x, y }, startPoint, endPoint) <= threshold;
    }) || null;
  }

  function getLineAtPosition(x, y) {
    const threshold = 10 / getCameraScale();
    const lines = state.lines || [];
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const line = lines[index];
      const start = line.start || { x: 0, y: 0 };
      const end = line.end || { x: 0, y: 0 };
      const distance = distanceToSegment({ x, y }, start, end);
      if (distance <= threshold) {
        return line;
      }
    }
    return null;
  }

  function getLineHandleAtPosition(x, y) {
    if (state.selected?.type !== 'line') {
      return null;
    }
    const line = state.selected?.item;
    if (!line) {
      return null;
    }
    const scale = getCameraScale();
    const radius = 12 / scale;
    const checkHandle = (point, handle) => {
      if (!point) return null;
      const distance = Math.hypot(point.x - x, point.y - y);
      if (distance <= radius) {
        return { line, handle };
      }
      return null;
    };
    return checkHandle(line.start, 'start') || checkHandle(line.end, 'end');
  }

  function getEdgeHandleAtPosition(x, y) {
    const radius = 12 / getCameraScale();
    for (let index = state.edges.length - 1; index >= 0; index -= 1) {
      const edge = state.edges[index];
      if (!isOrthogonalShape(edge.shape)) continue;
      const from = state.nodes.find(node => node.id === edge.from);
      const to = state.nodes.find(node => node.id === edge.to);
      if (!from || !to) continue;
      const startPoint = getAnchorPoint(from, edge.fromAnchor);
      const endPoint = getAnchorPoint(to, edge.toAnchor);
      const { elbow } = computeOrthogonalGeometry(startPoint, endPoint, edge.shape);
      const distance = Math.hypot(elbow.x - x, elbow.y - y);
      if (distance <= radius) {
        return { edge, elbow };
      }
    }
    return null;
  }

  function getAnchorAtPosition(x, y) {
    const hitbox = CONNECTION_HANDLE_HITBOX / getCameraScale();
    for (let index = state.nodes.length - 1; index >= 0; index -= 1) {
      const node = state.nodes[index];
      const anchors = getAnchorPoints(node);
      for (const anchor of anchors) {
        if (!anchor.isConnectable) {
          continue;
        }
        const distance = Math.hypot(anchor.point.x - x, anchor.point.y - y);
        if (distance <= hitbox) {
          return { node, anchor: anchor.direction };
        }
      }
    }
    return null;
  }

  function getTextBlockAtPosition(x, y) {
    const handleThreshold = (TEXT_HANDLE_SIZE * 1.5) / getCameraScale();
    const blocks = state.textBlocks || [];
    for (let i = blocks.length - 1; i >= 0; i -= 1) {
      const block = blocks[i];
      const within = (
        x >= block.x &&
        x <= block.x + block.width &&
        y >= block.y &&
        y <= block.y + block.height
      );
      if (!within) continue;
      const handleX = block.x + block.width;
      const handleY = block.y + block.height;
      const distHandle = Math.hypot(handleX - x, handleY - y);
      if (distHandle <= handleThreshold) {
        return { block, mode: 'resize' };
      }
      return { block, mode: 'move' };
    }
    return null;
  }

  function isPointInsideNode(node, point) {
    const { halfWidth, halfHeight } = getNodeDimensions(node);
    switch (node.shape) {
      case 'circle': {
        const dx = point.x - node.x;
        const dy = point.y - node.y;
        return dx * dx + dy * dy <= NODE_RADIUS * NODE_RADIUS;
      }
      case 'triangle': {
        const vertices = [
          { x: node.x, y: node.y - halfHeight },
          { x: node.x + halfWidth, y: node.y + halfHeight },
          { x: node.x - halfWidth, y: node.y + halfHeight },
        ];
        return pointInPolygon(point, vertices);
      }
      case 'diamond': {
        const vertices = [
          { x: node.x, y: node.y - halfHeight },
          { x: node.x + halfWidth, y: node.y },
          { x: node.x, y: node.y + halfHeight },
          { x: node.x - halfWidth, y: node.y },
        ];
        return pointInPolygon(point, vertices);
      }
      case 'decision': {
        const horizontal = halfWidth * 0.65;
        const vertices = [
          { x: node.x - horizontal, y: node.y - halfHeight },
          { x: node.x + horizontal, y: node.y - halfHeight },
          { x: node.x + halfWidth, y: node.y },
          { x: node.x + horizontal, y: node.y + halfHeight },
          { x: node.x - horizontal, y: node.y + halfHeight },
          { x: node.x - halfWidth, y: node.y },
        ];
        return pointInPolygon(point, vertices);
      }
      default:
        return (
          point.x >= node.x - halfWidth &&
          point.x <= node.x + halfWidth &&
          point.y >= node.y - halfHeight &&
          point.y <= node.y + halfHeight
        );
    }
  }

  function pointInPolygon(point, vertices) {
    let inside = false;
    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
      const xi = vertices[i].x;
      const yi = vertices[i].y;
      const xj = vertices[j].x;
      const yj = vertices[j].y;
      const intersect = yi > point.y !== yj > point.y && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function getTextBlockBounds(block) {
    return {
      left: block.x,
      right: block.x + block.width,
      top: block.y,
      bottom: block.y + block.height,
      centerX: block.x + block.width / 2,
      centerY: block.y + block.height / 2,
    };
  }

  function getFrameBounds(frame) {
    return {
      left: frame.x,
      right: frame.x + frame.width,
      top: frame.y,
      bottom: frame.y + frame.height,
      centerX: frame.x + frame.width / 2,
      centerY: frame.y + frame.height / 2,
    };
  }

  function getFrameHandleAtPosition(x, y) {
    if (!state.frame) return null;
    const handles = getFrameHandles(state.frame);
    const padding = FRAME_HIT_PADDING / getCameraScale();
    for (const handle of handles) {
      const half = handle.size / 2 + padding;
      if (
        x >= handle.x - half &&
        x <= handle.x + half &&
        y >= handle.y - half &&
        y <= handle.y + half
      ) {
        return { type: 'resize', handle: handle.type };
      }
    }
    if (isPointInsideFrame(x, y)) {
      return { type: 'move' };
    }
    return null;
  }

  function getEdgeLabelAtPosition(x, y) {
    const scale = getCameraScale();
    const padding = 8 / scale;
    ctx.save();
    ctx.font = `500 15px Inter, system-ui`;
    for (let i = state.edges.length - 1; i >= 0; i -= 1) {
      const edge = state.edges[i];
      const label = edge.label;
      if (!label?.text) continue;
      const from = state.nodes.find(node => node.id === edge.from);
      const to = state.nodes.find(node => node.id === edge.to);
      if (!from || !to) continue;
      const geometry = calculateEdgeGeometry(from, to, edge);
      if (!geometry?.labelPoint) continue;
      const offsetX = label.offset?.[0] ?? 0;
      const offsetY = label.offset?.[1] ?? 0;
      const cx = geometry.labelPoint.x + offsetX;
      const cy = geometry.labelPoint.y - 8 + offsetY;
      const text = label.text;
      const width = ctx.measureText(text).width;
      const height = 18;
      const left = cx - width / 2 - padding;
      const right = cx + width / 2 + padding;
      const top = cy - height - padding;
      const bottom = cy + padding;
      if (x >= left && x <= right && y >= top && y <= bottom) {
        ctx.restore();
        return {
          edge,
          bounds: { left, right, top, bottom },
          center: { x: cx, y: cy - height / 2 },
        };
      }
    }
    ctx.restore();
    return null;
  }

  function distanceToQuadratic(point, start, control, end) {
    // crude sampling approximation sufficient for hit detection
    const steps = 20;
    let min = Infinity;
    let prev = start;
    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps;
      const invT = 1 - t;
      const px = invT * invT * start.x + 2 * invT * t * control.x + t * t * end.x;
      const py = invT * invT * start.y + 2 * invT * t * control.y + t * t * end.y;
      min = Math.min(min, distanceToSegment(point, prev, { x: px, y: py }));
      prev = { x: px, y: py };
    }
    return min;
  }

  resize();

  return {
    ctx,
    resize,
    draw,
    getNodeAtPosition,
    getEdgeAtPosition,
    getLineAtPosition,
    getLineHandleAtPosition,
    getEdgeHandleAtPosition,
    getAnchorAtPosition,
    getTextBlockAtPosition,
    getMatrixGridAtPosition,
    getFrameHandleAtPosition,
    getNodeBounds,
    getTextBlockBounds,
    getFrameBounds,
    getMatrixGridBounds,
    getEdgeLabelAtPosition,
    getNodeAnchors: node => getNodeAnchorsSnapshot(node),
    getViewport: () => ({ width: rendererState.width, height: rendererState.height }),
    getEdgeGeometry: edge => {
      const from = state.nodes.find(node => node.id === edge.from);
      const to = state.nodes.find(node => node.id === edge.to);
      if (!from || !to) return null;
      return calculateEdgeGeometry(from, to, edge);
    },
    getAnchorPoint: (node, anchor) => getAnchorPoint(node, anchor),
    getVisibleWorldBounds,
    worldToScreen,
  };
}
