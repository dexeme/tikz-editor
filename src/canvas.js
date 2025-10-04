import { distanceToSegment, getQuadraticControlPoint } from './utils/geometry.js';

const NODE_RADIUS = 32;
const NODE_WIDTH = 112;
const NODE_HEIGHT = 64;
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
      ctx.moveTo(from.x, from.y);
      ctx.quadraticCurveTo(geometry.control.x, geometry.control.y, to.x, to.y);
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

    if (edge.label) {
      drawEdgeLabel(edge, geometry);
    }

    ctx.restore();
  }

  function drawArrowHead(point, angle, edge) {
    const size = 12;
    const offset = edge.shape?.startsWith('bend') ? 6 : 0;
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

  function drawNode(node) {
    ctx.save();
    ctx.lineWidth = 3;
    const isSelected = state.selected?.item?.id === node.id;
    ctx.strokeStyle = isSelected ? '#38bdf8' : 'rgba(148, 163, 184, 0.55)';
    ctx.fillStyle = node.color || '#e2e8f0';

    const path = getNodePath(node);
    ctx.fill(path);
    ctx.stroke(path);

    ctx.fillStyle = '#0f172a';
    ctx.font = `600 ${node.fontSize || 16}px Inter, system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(node.label || 'Nó', node.x, node.y);
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
    ctx.fillText(edge.label, labelPoint.x, labelPoint.y - 8);
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
    if (edge.shape?.startsWith('bend')) {
      const control = getQuadraticControlPoint(from, to, edge.shape, Number(edge.bend) || 30);
      const mid = getQuadraticPoint(from, control, to, 0.5);
      const endVec = { x: to.x - control.x, y: to.y - control.y };
      const startVec = { x: control.x - from.x, y: control.y - from.y };
      return {
        type: 'quadratic',
        control,
        startPoint: from,
        endPoint: to,
        startAngle: Math.atan2(startVec.y, startVec.x),
        endAngle: Math.atan2(endVec.y, endVec.x),
        labelPoint: mid,
      };
    }

    let segments;
    if (edge.shape === '|-') {
      const mid = { x: to.x, y: from.y };
      segments = [
        { start: from, end: mid },
        { start: mid, end: to },
      ];
    } else if (edge.shape === '-|') {
      const mid = { x: from.x, y: to.y };
      segments = [
        { start: from, end: mid },
        { start: mid, end: to },
      ];
    } else {
      segments = [{ start: from, end: to }];
    }

    const totalLength = segments.reduce((sum, segment) => sum + Math.hypot(segment.end.x - segment.start.x, segment.end.y - segment.start.y), 0);
    let accumulated = 0;
    const halfway = totalLength / 2;
    let labelPoint = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
    for (const segment of segments) {
      const segmentLength = Math.hypot(segment.end.x - segment.start.x, segment.end.y - segment.start.y);
      if (accumulated + segmentLength >= halfway) {
        const ratio = (halfway - accumulated) / segmentLength;
        labelPoint = {
          x: segment.start.x + (segment.end.x - segment.start.x) * ratio,
          y: segment.start.y + (segment.end.y - segment.start.y) * ratio,
        };
        break;
      }
      accumulated += segmentLength;
    }

    const first = segments[0];
    const last = segments[segments.length - 1];

    return {
      type: 'polyline',
      segments,
      startPoint: first.start,
      endPoint: last.end,
      startAngle: Math.atan2(first.end.y - first.start.y, first.end.x - first.start.x),
      endAngle: Math.atan2(last.end.y - last.start.y, last.end.x - last.start.x),
      labelPoint,
    };
  }

  function getQuadraticPoint(start, control, end, t) {
    const invT = 1 - t;
    const x = invT * invT * start.x + 2 * invT * t * control.x + t * t * end.x;
    const y = invT * invT * start.y + 2 * invT * t * control.y + t * t * end.y;
    return { x, y };
  }

  function draw() {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    ctx.save();
    ctx.setTransform(rendererState.pixelRatio, 0, 0, rendererState.pixelRatio, 0, 0);
    state.edges.forEach(drawEdge);
    state.nodes.forEach(drawNode);
    state.textBlocks?.forEach(drawTextBlock);
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
      if (edge.shape?.startsWith('bend')) {
        // approximate by checking straight distance to endpoints
        const cp = getQuadraticControlPoint(from, to, edge.shape, Number(edge.bend) || 30);
        const dist = distanceToQuadratic({ x, y }, from, cp, to);
        return dist <= threshold;
      }
      if (edge.shape === '|-' || edge.shape === '-|') {
        const mid = edge.shape === '|-' ? { x: to.x, y: from.y } : { x: from.x, y: to.y };
        return (
          distanceToSegment({ x, y }, from, mid) <= threshold ||
          distanceToSegment({ x, y }, mid, to) <= threshold
        );
      }
      return distanceToSegment({ x, y }, from, to) <= threshold;
    }) || null;
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
      getTextBlockAtPosition,
      getViewport: () => ({ width: rendererState.width, height: rendererState.height }),
      getEdgeGeometry: edge => {
        const from = state.nodes.find(node => node.id === edge.from);
        const to = state.nodes.find(node => node.id === edge.to);
        if (!from || !to) return null;
        return calculateEdgeGeometry(from, to, edge);
      },
    };
  }
