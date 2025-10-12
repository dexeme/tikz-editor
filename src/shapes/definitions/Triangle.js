import { createSimpleShape } from '../core.js';
import { registerShape } from '../registry.js';
import { registerShapeAnchors } from '../anchorRegistry.js';
import { getNodeDimensions } from '../../utils/sceneMetrics.js';

const ALIGN_CENTER = 'align=center';
const toRadians = degrees => (degrees * Math.PI) / 180;
const EPSILON = 1e-6;

const cross = (a, b) => a.x * b.y - a.y * b.x;

const getTriangleVertices = node => {
  const { halfWidth, halfHeight } = getNodeDimensions(node);
  return {
    apex: { x: node.x + halfWidth, y: node.y },
    leftCorner: { x: node.x - halfWidth, y: node.y - halfHeight },
    rightCorner: { x: node.x - halfWidth, y: node.y + halfHeight },
  };
};

const triangleCenter = vertices => ({
  x: (vertices.apex.x + vertices.leftCorner.x + vertices.rightCorner.x) / 3,
  y: (vertices.apex.y + vertices.leftCorner.y + vertices.rightCorner.y) / 3,
});

const intersectRayWithSegment = (origin, direction, a, b) => {
  const segment = { x: b.x - a.x, y: b.y - a.y };
  const diff = { x: a.x - origin.x, y: a.y - origin.y };
  const denominator = cross(direction, segment);
  if (Math.abs(denominator) < EPSILON) {
    return null;
  }
  const t = cross(diff, segment) / denominator;
  const u = cross(diff, direction) / denominator;
  if (t < 0 || u < -EPSILON || u > 1 + EPSILON) {
    return null;
  }
  return {
    t,
    point: {
      x: origin.x + direction.x * t,
      y: origin.y + direction.y * t,
    },
  };
};

const triangleBorderPoint = angle => node => {
  const vertices = getTriangleVertices(node);
  const center = triangleCenter(vertices);
  const radians = toRadians(angle);
  const direction = {
    x: Math.cos(radians),
    y: -Math.sin(radians),
  };
  const segments = [
    [vertices.apex, vertices.leftCorner],
    [vertices.apex, vertices.rightCorner],
    [vertices.leftCorner, vertices.rightCorner],
  ];
  let closest = null;
  for (const [start, end] of segments) {
    const intersection = intersectRayWithSegment(center, direction, start, end);
    if (intersection && intersection.t >= 0) {
      if (!closest || intersection.t < closest.t) {
        closest = intersection;
      }
    }
  }
  return closest ? closest.point : { x: node.x, y: node.y };
};

const midpoint = (a, b) => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
});

const triangleAnchors = [
  {
    id: 'center',
    tikz: 'center',
    isConnectable: false,
    getPoint: node => ({ x: node.x, y: node.y }),
  },
  {
    id: 'apex',
    tikz: 'apex',
    isConnectable: true,
    getPoint: node => getTriangleVertices(node).apex,
  },
  {
    id: 'left corner',
    tikz: 'left corner',
    isConnectable: true,
    getPoint: node => getTriangleVertices(node).leftCorner,
  },
  {
    id: 'right corner',
    tikz: 'right corner',
    isConnectable: true,
    getPoint: node => getTriangleVertices(node).rightCorner,
  },
  {
    id: 'east',
    tikz: 'east',
    isConnectable: true,
    aliases: ['e'],
    getPoint: node => getTriangleVertices(node).apex,
  },
  {
    id: 'west',
    tikz: 'west',
    isConnectable: true,
    aliases: ['w'],
    getPoint: node => {
      const vertices = getTriangleVertices(node);
      return midpoint(vertices.leftCorner, vertices.rightCorner);
    },
  },
  {
    id: 'lower side',
    tikz: 'lower side',
    isConnectable: true,
    getPoint: node => {
      const vertices = getTriangleVertices(node);
      return midpoint(vertices.leftCorner, vertices.rightCorner);
    },
  },
  {
    id: 'left side',
    tikz: 'left side',
    isConnectable: true,
    getPoint: node => {
      const vertices = getTriangleVertices(node);
      return midpoint(vertices.apex, vertices.leftCorner);
    },
  },
  {
    id: 'right side',
    tikz: 'right side',
    isConnectable: true,
    getPoint: node => {
      const vertices = getTriangleVertices(node);
      return midpoint(vertices.apex, vertices.rightCorner);
    },
  },
  {
    id: '120',
    tikz: '120',
    isConnectable: true,
    getPoint: triangleBorderPoint(120),
  },
  {
    id: '90',
    tikz: '90',
    isConnectable: true,
    getPoint: triangleBorderPoint(90),
  },
  {
    id: '220',
    tikz: '220',
    isConnectable: true,
    getPoint: triangleBorderPoint(220),
  },
  {
    id: '270',
    tikz: '270',
    isConnectable: true,
    getPoint: triangleBorderPoint(270),
  },
];

export function registerTriangle() {
  registerShape(
    'triangle',
    createSimpleShape(
      ['regular polygon', 'regular polygon sides=3', 'minimum size=1.8cm', ALIGN_CENTER],
      ['shapes.geometric']
    )
  );
  registerShapeAnchors('triangle', triangleAnchors);
}
