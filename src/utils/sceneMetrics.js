export const NODE_RADIUS = 32;
export const NODE_WIDTH = 112;
export const NODE_HEIGHT = 64;

export function getNodeDimensions(node) {
  if (node?.shape === 'circle') {
    return { halfWidth: NODE_RADIUS, halfHeight: NODE_RADIUS };
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
