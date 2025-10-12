import { createSimpleShape } from '../core.js';
import { registerShape } from '../registry.js';
import { registerShapeAnchors } from '../anchorRegistry.js';
import { getNodeDimensions } from '../../utils/sceneMetrics.js';

const ALIGN_CENTER = 'align=center';
const toRadians = degrees => (degrees * Math.PI) / 180;

const diamondMidpoint = (a, b) => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
});

const diamondBorderPoint = angle => node => {
  const { halfWidth, halfHeight } = getNodeDimensions(node);
  const radians = toRadians(angle);
  const dx = Math.cos(radians);
  const dy = -Math.sin(radians);
  const denom =
    Math.abs(dx) / (halfWidth || 1) + Math.abs(dy) / (halfHeight || 1);
  const scale = denom === 0 ? 0 : 1 / denom;
  return {
    x: node.x + dx * scale,
    y: node.y + dy * scale,
  };
};

const diamondAnchors = [
  {
    id: 'center',
    tikz: 'center',
    isConnectable: false,
    getPoint: node => ({ x: node.x, y: node.y }),
  },
  {
    id: 'text',
    tikz: 'text',
    isConnectable: false,
    getPoint: node => ({ x: node.x, y: node.y }),
  },
  {
    id: 'mid',
    tikz: 'mid',
    isConnectable: false,
    getPoint: node => ({ x: node.x, y: node.y }),
  },
  {
    id: 'base',
    tikz: 'base',
    isConnectable: false,
    getPoint: node => ({ x: node.x, y: node.y }),
  },
  {
    id: 'north',
    tikz: 'north',
    isConnectable: true,
    aliases: ['n'],
    getPoint: node => {
      const { halfHeight } = getNodeDimensions(node);
      return { x: node.x, y: node.y - halfHeight };
    },
  },
  {
    id: 'south',
    tikz: 'south',
    isConnectable: true,
    aliases: ['s'],
    getPoint: node => {
      const { halfHeight } = getNodeDimensions(node);
      return { x: node.x, y: node.y + halfHeight };
    },
  },
  {
    id: 'east',
    tikz: 'east',
    isConnectable: true,
    aliases: ['e'],
    getPoint: node => {
      const { halfWidth } = getNodeDimensions(node);
      return { x: node.x + halfWidth, y: node.y };
    },
  },
  {
    id: 'west',
    tikz: 'west',
    isConnectable: true,
    aliases: ['w'],
    getPoint: node => {
      const { halfWidth } = getNodeDimensions(node);
      return { x: node.x - halfWidth, y: node.y };
    },
  },
  {
    id: 'north east',
    tikz: 'north east',
    isConnectable: true,
    aliases: ['northeast'],
    getPoint: node => {
      const { halfWidth, halfHeight } = getNodeDimensions(node);
      const north = { x: node.x, y: node.y - halfHeight };
      const east = { x: node.x + halfWidth, y: node.y };
      return diamondMidpoint(north, east);
    },
  },
  {
    id: 'north west',
    tikz: 'north west',
    isConnectable: true,
    aliases: ['northwest'],
    getPoint: node => {
      const { halfWidth, halfHeight } = getNodeDimensions(node);
      const north = { x: node.x, y: node.y - halfHeight };
      const west = { x: node.x - halfWidth, y: node.y };
      return diamondMidpoint(north, west);
    },
  },
  {
    id: 'south east',
    tikz: 'south east',
    isConnectable: true,
    aliases: ['southeast'],
    getPoint: node => {
      const { halfWidth, halfHeight } = getNodeDimensions(node);
      const south = { x: node.x, y: node.y + halfHeight };
      const east = { x: node.x + halfWidth, y: node.y };
      return diamondMidpoint(south, east);
    },
  },
  {
    id: 'south west',
    tikz: 'south west',
    isConnectable: true,
    aliases: ['southwest'],
    getPoint: node => {
      const { halfWidth, halfHeight } = getNodeDimensions(node);
      const south = { x: node.x, y: node.y + halfHeight };
      const west = { x: node.x - halfWidth, y: node.y };
      return diamondMidpoint(south, west);
    },
  },
  {
    id: '130',
    tikz: '130',
    isConnectable: true,
    getPoint: diamondBorderPoint(130),
  },
  {
    id: '10',
    tikz: '10',
    isConnectable: true,
    getPoint: diamondBorderPoint(10),
  },
];

export function registerDiamond() {
  registerShape(
    'diamond',
    createSimpleShape(['diamond', 'aspect=2', ALIGN_CENTER], ['shapes.geometric'])
  );
  registerShapeAnchors('diamond', diamondAnchors);
}
