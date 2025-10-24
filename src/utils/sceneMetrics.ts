// @ts-nocheck

export const NODE_RADIUS = 32;
export const NODE_WIDTH = 112;
export const NODE_HEIGHT = 64;

const MIN_SIZE = 8;

export const PX_TO_CM = 0.05;

export const pxToCm = (value: unknown) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  return numeric * PX_TO_CM;
};

export const formatCm = (value: unknown, precision = 2) => {
  const cmValue = pxToCm(value);
  if (!Number.isFinite(cmValue)) {
    return null;
  }
  const fixed = cmValue.toFixed(precision);
  const normalized = precision > 0 ? fixed.replace(/\.?0+$/, '') : fixed;
  return `${normalized}cm`;
};

const SHAPE_DEFAULT_SIZES: Record<string, { width: number; height: number }> = {
  circle: { width: NODE_RADIUS * 2, height: NODE_RADIUS * 2 },
};

const sanitizePositive = (value: unknown): number | null => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }
  return numeric;
};

const inferDimension = (
  rawSize: unknown,
  key: 'width' | 'height',
  fallback: number
): number => {
  if (typeof rawSize === 'number') {
    return Math.max(MIN_SIZE, rawSize);
  }
  if (!rawSize || typeof rawSize !== 'object') {
    return Math.max(MIN_SIZE, fallback);
  }
  const direct = sanitizePositive((rawSize as Record<string, unknown>)[key]);
  if (direct != null) {
    return Math.max(MIN_SIZE, direct);
  }
  const mirrorKey = key === 'width' ? 'height' : 'width';
  const mirror = sanitizePositive((rawSize as Record<string, unknown>)[mirrorKey]);
  if (mirror != null) {
    return Math.max(MIN_SIZE, mirror);
  }
  return Math.max(MIN_SIZE, fallback);
};

export function getDefaultNodeSize(shape: unknown) {
  const key = typeof shape === 'string' ? shape.trim().toLowerCase() : '';
  return (
    SHAPE_DEFAULT_SIZES[key] || {
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    }
  );
}

export function resolveNodeSize(node: Record<string, unknown> | null | undefined) {
  const fallback = getDefaultNodeSize(node?.shape);
  if (!node) {
    return { ...fallback };
  }
  if (node.shape === 'circle') {
    const diameter = inferDimension(node.size, 'width', fallback.width);
    const safeDiameter = Math.max(diameter, fallback.width);
    return { width: safeDiameter, height: safeDiameter };
  }
  const width = inferDimension(node.size, 'width', fallback.width);
  const height = inferDimension(node.size, 'height', fallback.height);
  return {
    width,
    height,
  };
}

export const DEFAULT_CYLINDER_MIN_WIDTH_CM = 5.6;
export const DEFAULT_CYLINDER_MIN_HEIGHT_CM = 1.2;
export const DEFAULT_CYLINDER_CONTENT_HEIGHT = 24;
export const DEFAULT_CYLINDER_ASPECT = 0.1;

const PX_PER_CM_WIDTH = NODE_WIDTH / DEFAULT_CYLINDER_MIN_WIDTH_CM;
const PX_PER_CM_HEIGHT = DEFAULT_CYLINDER_CONTENT_HEIGHT / DEFAULT_CYLINDER_MIN_HEIGHT_CM;

const CM_PER_INCH = 0.5;
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
    const size = resolveNodeSize(node);
    const radius = Math.max(size.width, size.height) / 2;
    return { halfWidth: radius, halfHeight: radius };
  }
  if (node?.shape === 'cylinder') {
    const metrics = getCylinderMetrics(node);
    return { halfWidth: metrics.halfWidth, halfHeight: metrics.halfHeight };
  }
  const size = resolveNodeSize(node);
  return { halfWidth: size.width / 2, halfHeight: size.height / 2 };
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
