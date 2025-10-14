// @ts-nocheck

import { rounding } from '../core.js';
import { registerShape } from '../registry.js';
import { registerShapeAnchors } from '../anchorRegistry.js';
import { getNodeDimensions } from '../../utils/sceneMetrics.js';

const ALIGN_CENTER = 'align=center';

const toRadians = degrees => (degrees * Math.PI) / 180;

const rectangleBorderPoint = angle => node => {
  const { halfWidth, halfHeight } = getNodeDimensions(node);
  const radians = toRadians(angle);
  const dx = Math.cos(radians);
  const dy = -Math.sin(radians);
  const denom = Math.max(
    Math.abs(dx) / (halfWidth || 1),
    Math.abs(dy) / (halfHeight || 1)
  );
  const scale = denom === 0 ? 0 : 1 / denom;
  return {
    x: node.x + dx * scale,
    y: node.y + dy * scale,
  };
};

const rectangleAnchors = [
  {
    id: 'center',
    tikz: 'center',
    isConnectable: false,
    getPoint: node => ({ x: node.x, y: node.y }),
  },
  {
    id: 'shape center',
    tikz: 'shape center',
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
    id: 'north west',
    tikz: 'north west',
    isConnectable: true,
    aliases: ['northwest'],
    getPoint: node => {
      const { halfWidth, halfHeight } = getNodeDimensions(node);
      return { x: node.x - halfWidth, y: node.y - halfHeight };
    },
  },
  {
    id: 'north east',
    tikz: 'north east',
    isConnectable: true,
    aliases: ['northeast'],
    getPoint: node => {
      const { halfWidth, halfHeight } = getNodeDimensions(node);
      return { x: node.x + halfWidth, y: node.y - halfHeight };
    },
  },
  {
    id: 'south west',
    tikz: 'south west',
    isConnectable: true,
    aliases: ['southwest'],
    getPoint: node => {
      const { halfWidth, halfHeight } = getNodeDimensions(node);
      return { x: node.x - halfWidth, y: node.y + halfHeight };
    },
  },
  {
    id: 'south east',
    tikz: 'south east',
    isConnectable: true,
    aliases: ['southeast'],
    getPoint: node => {
      const { halfWidth, halfHeight } = getNodeDimensions(node);
      return { x: node.x + halfWidth, y: node.y + halfHeight };
    },
  },
  {
    id: '130',
    tikz: '130',
    isConnectable: false,
    getPoint: rectangleBorderPoint(130),
  },
  {
    id: '10',
    tikz: '10',
    isConnectable: false,
    getPoint: rectangleBorderPoint(10),
  },
  {
    id: 'mid west',
    tikz: 'mid west',
    isConnectable: true,
    aliases: ['midwest'],
    getPoint: node => {
      const { halfWidth } = getNodeDimensions(node);
      return { x: node.x - halfWidth, y: node.y };
    },
  },
  {
    id: 'base west',
    tikz: 'base west',
    isConnectable: true,
    getPoint: node => {
      const { halfWidth, halfHeight } = getNodeDimensions(node);
      return { x: node.x - halfWidth, y: node.y + halfHeight };
    },
  },
  {
    id: 'mid east',
    tikz: 'mid east',
    isConnectable: true,
    aliases: ['mideast'],
    getPoint: node => {
      const { halfWidth } = getNodeDimensions(node);
      return { x: node.x + halfWidth, y: node.y };
    },
  },
  {
    id: 'base east',
    tikz: 'base east',
    isConnectable: true,
    getPoint: node => {
      const { halfWidth, halfHeight } = getNodeDimensions(node);
      return { x: node.x + halfWidth, y: node.y + halfHeight };
    },
  },
];

export function registerRectangle() {
  registerShape('rectangle', params => {
    const radius = Number.isFinite(params?.cornerRadius) ? params.cornerRadius : 16;
    return {
      options: [
        'rectangle',
        `rounded corners=${rounding(Math.max(0, radius))}pt`,
        'minimum width=2.4cm',
        'minimum height=1.2cm',
        ALIGN_CENTER,
      ],
    };
  });

  registerShapeAnchors('rectangle', rectangleAnchors);
}
