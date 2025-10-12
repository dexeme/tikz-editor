// @ts-nocheck

export const NODE_RADIUS = 32;
export const NODE_WIDTH = 112;
export const NODE_HEIGHT = 64;

export const DEFAULT_CYLINDER_MIN_WIDTH_CM = 1.6;
export const DEFAULT_CYLINDER_MIN_HEIGHT_CM = 1.8;
export const DEFAULT_CYLINDER_CONTENT_HEIGHT = 24;
export const DEFAULT_CYLINDER_ASPECT = 0.35;

const PX_PER_CM_WIDTH = NODE_WIDTH / DEFAULT_CYLINDER_MIN_WIDTH_CM;
const PX_PER_CM_HEIGHT = DEFAULT_CYLINDER_CONTENT_HEIGHT / DEFAULT_CYLINDER_MIN_HEIGHT_CM;

const CM_PER_INCH = 2.54;
const CM_PER_POINT = CM_PER_INCH / 72;
const CM_PER_PICA = CM_PER_POINT * 12;

function sanitizeNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function convertDimension(raw, axis) {
  if (raw == null) return null;
  if (typeof raw === 'number') {
    return raw >= 0 ? raw : null;
  }
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^(-?\d*\.?\d+)\s*(cm|mm|in|pt|pc|px)?$/i);
  if (!match) {
    const numeric = Number(trimmed);
    return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
  }
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value < 0) {
    return null;
  }
  const unit = (match[2] || 'px').toLowerCase();

  if (unit === 'px') {
    return value;
  }

  let cmValue;
  switch (unit) {
    case 'cm':
      cmValue = value;
      break;
    case 'mm':
      cmValue = value / 10;
      break;
    case 'in':
      cmValue = value * CM_PER_INCH;
      break;
    case 'pt':
      cmValue = value * CM_PER_POINT;
      break;
    case 'pc':
      cmValue = value * CM_PER_PICA;
      break;
    default:
      cmValue = value / PX_PER_CM_HEIGHT;
      break;
  }

  const scale = axis === 'width' ? PX_PER_CM_WIDTH : PX_PER_CM_HEIGHT;
  return cmValue * scale;
}

const clampPositive = value => (Number.isFinite(value) && value > 0 ? value : null);

export function getCylinderMetrics(node = {}) {
  const minWidthPx = clampPositive(convertDimension(node.minimumWidth, 'width'));
  const paddingX = clampPositive(convertDimension(node.innerXsep, 'width')) || 0;
  const contentWidth = Math.max(NODE_WIDTH, minWidthPx ?? NODE_WIDTH);
  const totalWidth = contentWidth + paddingX * 2;
  const halfWidth = totalWidth / 2;

  let aspect = sanitizeNumber(node.aspect);
  if (!Number.isFinite(aspect) || aspect <= 0) {
    aspect = DEFAULT_CYLINDER_ASPECT;
  }
  aspect = Math.min(1.5, Math.max(0.1, aspect));

  const minHeightPx = clampPositive(convertDimension(node.minimumHeight, 'height'));
  const contentHeight = Math.max(
    DEFAULT_CYLINDER_CONTENT_HEIGHT,
    minHeightPx ?? DEFAULT_CYLINDER_CONTENT_HEIGHT
  );
  const paddingY = clampPositive(convertDimension(node.innerYsep, 'height')) || 0;
  const bodyHeight = contentHeight + paddingY * 2;

  const rx = halfWidth;
  let ry = rx * aspect;
  const minRy = Math.max(6, rx * 0.12);
  const maxRy = Math.max(minRy, rx * 0.75);
  ry = Math.min(Math.max(ry, minRy), maxRy);

  const totalHeight = bodyHeight + ry * 2;
  const halfHeight = totalHeight / 2;

  return {
    halfWidth,
    halfHeight,
    rx,
    ry,
    bodyHeight,
    totalHeight,
    width: totalWidth,
    contentWidth,
    contentHeight,
    paddingX,
    paddingY,
  };
}

export function getNodeDimensions(node) {
  if (node?.shape === 'circle') {
    return { halfWidth: NODE_RADIUS, halfHeight: NODE_RADIUS };
  }
  if (node?.shape === 'cylinder') {
    const metrics = getCylinderMetrics(node);
    return { halfWidth: metrics.halfWidth, halfHeight: metrics.halfHeight };
  }
  return { halfWidth: NODE_WIDTH / 2, halfHeight: NODE_HEIGHT / 2 };
}

export function getNodeBounds(node) {
  const { halfWidth, halfHeight } = getNodeDimensions(node);
  return {
    left: node.x - halfWidth,
    right: node.x + halfWidth,
    top: node.y - halfHeight,
    bottom: node.y + halfHeight,
    centerX: node.x,
    centerY: node.y,
  };
}

export function isNodeInsideFrame(node, frame) {
  if (!frame) return true;
  if (
    typeof frame.x !== 'number' ||
    typeof frame.y !== 'number' ||
    typeof frame.width !== 'number' ||
    typeof frame.height !== 'number'
  ) {
    return false;
  }
  const bounds = getNodeBounds(node);
  const frameRight = frame.x + frame.width;
  const frameBottom = frame.y + frame.height;
  return (
    bounds.left >= frame.x &&
    bounds.right <= frameRight &&
    bounds.top >= frame.y &&
    bounds.bottom <= frameBottom
  );
}
