import { distanceToSegment, getQuadraticControlPoint } from './utils/geometry.js';
import { isCurvedShape, isOrthogonalShape, resolveBendShape } from './routingMaps.js';
import { computeOrthogonalGeometry } from './geometry/orthogonal.js';

const NODE_RADIUS = 32;
const NODE_WIDTH = 112;
const NODE_HEIGHT = 64;
const CONNECTION_HANDLE_RADIUS = 8;
const CONNECTION_HANDLE_HITBOX = CONNECTION_HANDLE_RADIUS * 1.75;

const CARDINAL_DIRECTIONS = ['north', 'east', 'south', 'west'];

function getNodeDimensions(node) {
  if (node.shape === 'circle') {
    return { halfWidth: NODE_RADIUS, halfHeight: NODE_RADIUS };
  }
  return { halfWidth: NODE_WIDTH / 2, halfHeight: NODE_HEIGHT / 2 };
}

function getAnchorPoint(node, direction) {
  const { halfWidth, halfHeight } = getNodeDimensions(node);
  switch (direction) {
    case 'north':
      return { x: node.x, y: node.y - halfHeight };
    case 'south':
      return { x: node.x, y: node.y + halfHeight };
    case 'east':
      return { x: node.x + halfWidth, y: node.y };
    case 'west':
      return { x: node.x - halfWidth, y: node.y };
    default:
      return { x: node.x, y: node.y };
  }
}

function getAnchorPoints(node) {
  return CARDINAL_DIRECTIONS.map(direction => ({
    direction,
    point: getAnchorPoint(node, direction),
  }));
}
const TEXT_BLOCK_MIN_WIDTH = 96;
const TEXT_BLOCK_MIN_HEIGHT = 60;
const TEXT_BLOCK_PADDING = 14;
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
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = state.selected?.item?.id === edge.id ? '#38bdf8' : 'rgba(148, 163, 184, 0.85)';

    if (edge.style === 'dashed') {
      ctx.setLineDash([12, 10]);
    } else if (edge.style === 'dotted') {
      ctx.setLineDash([3, 7]);
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
      drawArrowHead(geometry.endPoint, geometry.endAngle, edge);
    }
    if (edge.direction && edge.direction.startsWith('<')) {
      drawArrowHead(geometry.startPoint, geometry.startAngle + Math.PI, edge);
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

  function drawArrowHead(point, angle, edge) {
    const size = 12;
    const offset = isCurvedShape(edge.shape) ? 6 : 0;
    const targetX = point.x - Math.cos(angle) * offset;
    const targetY = point.y - Math.sin(angle) * offset;
    ctx.save();
    ctx.translate(targetX, targetY);
    ctx.rotate(angle);
    ctx.fillStyle = state.selected?.item?.id === edge.id ? '#38bdf8' : 'rgba(148, 163, 184, 0.85)';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-size, size / 2);
    ctx.lineTo(-size, -size / 2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawElbowHandle(point) {
    const size = 10;
    ctx.save();
    ctx.fillStyle = '#f8fafc';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.rect(point.x - size / 2, point.y - size / 2, size, size);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawNodeBase(node) {
    ctx.save();
    const isSelected = state.selected?.type === 'node' && state.selected?.item?.id === node.id;
    const isHovered = state.hoverNodeId === node.id;
    const isOrigin = state.edgeDraft?.from?.nodeId === node.id;
    const targetInfo = state.edgeDraft?.target;
    const isTarget = targetInfo?.nodeId === node.id;
    const strokeColor = (() => {
      if (isSelected) return '#38bdf8';
      if (isTarget) return targetInfo.valid ? '#22c55e' : '#ef4444';
      if (isOrigin) return '#38bdf8';
      if (isHovered && state.edgeDraft) return 'rgba(96, 165, 250, 0.9)';
      if (isHovered) return 'rgba(148, 163, 184, 0.85)';
      return 'rgba(148, 163, 184, 0.55)';
    })();

    ctx.lineWidth = isTarget ? 3.6 : 3;
    ctx.strokeStyle = strokeColor;
    ctx.fillStyle = node.color || '#e2e8f0';

    const path = getNodePath(node);
    ctx.fill(path);
    ctx.stroke(path);

    const fontSize = Number(node.fontSize) || 16;
    const lines = (node.label || 'Nó').toString().split(/\n/);
    const lineHeight = fontSize * 1.25;
    const totalHeight = lineHeight * (lines.length - 1);

    ctx.fillStyle = '#0f172a';
    ctx.font = `600 ${fontSize}px Inter, system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    let offsetY = node.y - totalHeight / 2;
    lines.forEach(line => {
      ctx.fillText(line, node.x, offsetY);
      offsetY += lineHeight;
    });
    ctx.restore();
  }

  function drawNodeHandles(node) {
    const isSelected = state.selected?.type === 'node' && state.selected?.item?.id === node.id;
    const isHovered = state.hoverNodeId === node.id;
    const isOrigin = state.edgeDraft?.from?.nodeId === node.id;
    const targetInfo = state.edgeDraft?.target;
    const isTarget = targetInfo?.nodeId === node.id;
    const shouldShow = isSelected || isHovered || isOrigin || isTarget;
    if (!shouldShow) return;

    const anchors = getAnchorPoints(node);
    ctx.save();
    anchors.forEach(({ direction, point }) => {
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
      } else if (state.hoverAnchor === direction && isHovered) {
        fill = '#38bdf8';
        stroke = '#0f172a';
      }

      ctx.beginPath();
      ctx.arc(point.x, point.y, CONNECTION_HANDLE_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2;
      ctx.fill();
      ctx.stroke();
    });
    ctx.restore();
  }

  function drawTextBlock(block) {
    ctx.save();
    const isSelected = state.selected?.item?.id === block.id;
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = isSelected ? '#38bdf8' : 'rgba(148, 163, 184, 0.35)';
    ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';

    const radius = 12;
    const path = roundedRectPath(block.x, block.y, block.width, block.height, radius);
    ctx.fill(path);
    ctx.stroke(path);

    ctx.save();
    ctx.beginPath();
    ctx.rect(block.x + TEXT_BLOCK_PADDING, block.y + TEXT_BLOCK_PADDING, block.width - TEXT_BLOCK_PADDING * 2, block.height - TEXT_BLOCK_PADDING * 2);
    ctx.clip();
    ctx.fillStyle = '#e2e8f0';
    ctx.font = `${block.fontWeight || 500} ${block.fontSize || 16}px Inter, system-ui`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    drawWrappedText(block.text || '', block);
    ctx.restore();

    if (isSelected) {
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.rect(block.x + block.width - TEXT_HANDLE_SIZE, block.y + block.height - TEXT_HANDLE_SIZE, TEXT_HANDLE_SIZE, TEXT_HANDLE_SIZE);
      ctx.fill();
    }

    ctx.restore();
  }

  function drawEdgeLabel(edge, geometry) {
    ctx.save();
    ctx.fillStyle = '#e2e8f0';
    ctx.font = `500 15px Inter, system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    const labelPoint = geometry.labelPoint;
    const label = edge.label;
    const text = label?.text ?? '';
    const offsetX = label?.offset?.[0] ?? 0;
    const offsetY = label?.offset?.[1] ?? 0;
    ctx.fillText(text, labelPoint.x + offsetX, labelPoint.y - 8 + offsetY);
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
    const halfWidth = NODE_WIDTH / 2;
    const halfHeight = NODE_HEIGHT / 2;
    switch (node.shape) {
      case 'rectangle':
        addRoundedRect(path, node.x - halfWidth, node.y - halfHeight, NODE_WIDTH, NODE_HEIGHT, 16);
        break;
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
      default:
        path.arc(node.x, node.y, NODE_RADIUS, 0, Math.PI * 2);
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

    const fromNode = state.nodes.find(node => node.id === draft.from?.nodeId);
    if (!fromNode || !draft.pointer) return;
    const startPoint = getAnchorPoint(fromNode, draft.from.anchor);
    let endPoint = draft.pointer;
    if (draft.target?.nodeId) {
      const targetNode = state.nodes.find(node => node.id === draft.target.nodeId);
      if (targetNode) {
        endPoint = getAnchorPoint(targetNode, draft.target.anchor);
      }
    }

    ctx.save();
    ctx.setLineDash([8, 6]);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = draft.target?.valid ? '#38bdf8' : 'rgba(148, 163, 184, 0.8)';
    ctx.beginPath();
    ctx.moveTo(startPoint.x, startPoint.y);
    ctx.lineTo(endPoint.x, endPoint.y);
    ctx.stroke();
    ctx.restore();
  }

  function draw() {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    ctx.save();
    ctx.setTransform(rendererState.pixelRatio, 0, 0, rendererState.pixelRatio, 0, 0);
    state.edges.forEach(drawEdge);
    state.nodes.forEach(drawNodeBase);
    state.textBlocks?.forEach(drawTextBlock);
    state.nodes.forEach(drawNodeHandles);
    drawEdgePreview();
    ctx.restore();
  }

  function getNodeAtPosition(x, y) {
    return [...(state.nodes || [])].reverse().find(node => {
      const path = getNodePath(node);
      return ctx.isPointInPath(path, x * rendererState.pixelRatio, y * rendererState.pixelRatio) || ctx.isPointInPath(path, x, y);
    }) || null;
  }

  function getEdgeAtPosition(x, y) {
    const threshold = 10;
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

  function getEdgeHandleAtPosition(x, y) {
    const radius = 12;
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
    for (let index = state.nodes.length - 1; index >= 0; index -= 1) {
      const node = state.nodes[index];
      const anchors = getAnchorPoints(node);
      for (const anchor of anchors) {
        const distance = Math.hypot(anchor.point.x - x, anchor.point.y - y);
        if (distance <= CONNECTION_HANDLE_HITBOX) {
          return { node, anchor: anchor.direction };
        }
      }
    }
    return null;
  }

  function getTextBlockAtPosition(x, y) {
    const handleThreshold = TEXT_HANDLE_SIZE * 1.5;
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
      getEdgeHandleAtPosition,
      getAnchorAtPosition,
      getTextBlockAtPosition,
      getViewport: () => ({ width: rendererState.width, height: rendererState.height }),
      getEdgeGeometry: edge => {
        const from = state.nodes.find(node => node.id === edge.from);
        const to = state.nodes.find(node => node.id === edge.to);
        if (!from || !to) return null;
        return calculateEdgeGeometry(from, to, edge);
      },
      getAnchorPoint: (node, anchor) => getAnchorPoint(node, anchor),
    };
  }
