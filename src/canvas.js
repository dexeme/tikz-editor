import { distanceToSegment, getQuadraticControlPoint } from './utils/geometry.js';

const NODE_RADIUS = 32;
const NODE_WIDTH = 96;
const NODE_HEIGHT = 56;

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
    ctx.moveTo(from.x, from.y);

    if (edge.shape?.startsWith('bend')) {
      const cp = getQuadraticControlPoint(from, to, edge.shape, Number(edge.bend) || 30);
      ctx.quadraticCurveTo(cp.x, cp.y, to.x, to.y);
    } else if (edge.shape === '|-') {
      ctx.lineTo(to.x, from.y);
      ctx.lineTo(to.x, to.y);
    } else if (edge.shape === '-|') {
      ctx.lineTo(from.x, to.y);
      ctx.lineTo(to.x, to.y);
    } else {
      ctx.lineTo(to.x, to.y);
    }

    ctx.stroke();
    ctx.setLineDash([]);

    if (edge.direction && edge.direction.includes('>')) {
      drawArrowHead(from, to, edge);
    }
    if (edge.direction && edge.direction.startsWith('<')) {
      drawArrowHead(to, from, edge);
    }

    ctx.restore();
  }

  function drawArrowHead(from, to, edge) {
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    const size = 12;
    const offset = edge.shape?.startsWith('bend') ? 18 : 0;
    const targetX = to.x - Math.cos(angle) * offset;
    const targetY = to.y - Math.sin(angle) * offset;
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

    ctx.beginPath();
    if (node.shape === 'rectangle') {
      roundedRect(ctx, node.x - NODE_WIDTH / 2, node.y - NODE_HEIGHT / 2, NODE_WIDTH, NODE_HEIGHT, 12);
    } else {
      ctx.arc(node.x, node.y, NODE_RADIUS, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#0f172a';
    ctx.font = `600 ${node.fontSize || 16}px Inter, system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(node.label || 'Nó', node.x, node.y);
    ctx.restore();
  }

  function roundedRect(context, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + width, y, x + width, y + height, r);
    context.arcTo(x + width, y + height, x, y + height, r);
    context.arcTo(x, y + height, x, y, r);
    context.arcTo(x, y, x + width, y, r);
    context.closePath();
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
    ctx.restore();
  }

  function getNodeAtPosition(x, y) {
    return [...state.nodes].reverse().find(node => {
      if (node.shape === 'rectangle') {
        return (
          x >= node.x - NODE_WIDTH / 2 &&
          x <= node.x + NODE_WIDTH / 2 &&
          y >= node.y - NODE_HEIGHT / 2 &&
          y <= node.y + NODE_HEIGHT / 2
        );
      }
      return Math.hypot(node.x - x, node.y - y) <= NODE_RADIUS;
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
  };
}
