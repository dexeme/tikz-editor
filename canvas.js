import { getState } from './state.js';
import { getQuadraticCurveControlPoint, distToSegment } from './geometry.js';

const NODE_RADIUS = 30;
const NODE_WIDTH = 80;
const NODE_HEIGHT = 40;

export function resizeCanvas() {
    const { canvas } = getState();
    const container = canvas.parentElement;
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    draw();
}

function drawEdge(edge) {
    const { ctx, graphData, selected } = getState();
    const from = graphData.nodes.find(n => n.id === edge.from);
    const to = graphData.nodes.find(n => n.id === edge.to);
    if (!from || !to) return;

    ctx.lineWidth = 3;
    ctx.strokeStyle = (selected?.item.id === edge.id) ? '#60a5fa' : '#6b7280';
    
    ctx.setLineDash(edge.style === 'dashed' ? [8, 8] : edge.style === 'dotted' ? [2, 5] : []);

    ctx.beginPath();
    ctx.moveTo(from.x, from.y);

    const shape = edge.shape || '--';
    if (shape.startsWith('bend')) {
        const cp = getQuadraticCurveControlPoint(from, to, shape, edge.bend || 30);
        ctx.quadraticCurveTo(cp.x, cp.y, to.x, to.y);
    } else if (shape === '|-') {
        ctx.lineTo(to.x, from.y);
        ctx.lineTo(to.x, to.y);
    } else if (shape === '-|') {
        ctx.lineTo(from.x, to.y);
        ctx.lineTo(to.x, to.y);
    } else {
        ctx.lineTo(to.x, to.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
}

function drawNode(node) {
    const { ctx, selected } = getState();
    ctx.lineWidth = 3;
    ctx.strokeStyle = (selected?.item.id === node.id) ? '#60a5fa' : '#4b5563';
    ctx.fillStyle = node.color || '#d1d5db';

    ctx.beginPath();
    if (node.shape === 'rectangle') {
        ctx.rect(node.x - NODE_WIDTH / 2, node.y - NODE_HEIGHT / 2, NODE_WIDTH, NODE_HEIGHT);
    } else {
        ctx.arc(node.x, node.y, NODE_RADIUS, 0, 2 * Math.PI);
    }
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#111827';
    ctx.font = `bold ${node.fontSize || 16}px Inter`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(node.label, node.x, node.y);
}

export function draw() {
    const { ctx, canvas, graphData } = getState();
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    graphData.edges.forEach(drawEdge);
    graphData.nodes.forEach(drawNode);
}

export function getNodeAt(x, y) {
    const { graphData } = getState();
    return graphData.nodes.find(node => {
        if (node.shape === 'rectangle') {
            return x > node.x - NODE_WIDTH / 2 && x < node.x + NODE_WIDTH / 2 &&
                   y > node.y - NODE_HEIGHT / 2 && y < node.y + NODE_HEIGHT / 2;
        } else {
            const dist = Math.sqrt((node.x - x)**2 + (node.y - y)**2);
            return dist < NODE_RADIUS;
        }
    });
}

export function getEdgeAt(x, y) {
    const { graphData } = getState();
    const threshold = 8;
    return graphData.edges.find(edge => {
        const from = graphData.nodes.find(n => n.id === edge.from);
        const to = graphData.nodes.find(n => n.id === edge.to);
        if (!from || !to) return false;
        
        const dist = distToSegment({x, y}, from, to);
        return dist < threshold;
    });
}

export function initCanvas() {
    resizeCanvas();
    draw();
}
