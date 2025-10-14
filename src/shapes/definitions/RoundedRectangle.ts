// @ts-nocheck

import { createSimpleShape } from '../core.js';
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

const ratioPoint = (sx, sy) => node => {
  const { halfWidth, halfHeight } = getNodeDimensions(node);
  return {
    x: node.x + halfWidth * sx,
    y: node.y + halfHeight * sy,
  };
};

const roundedRectangleAnchors = [
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
    aliases: ['t'],
    getPoint: node => ({ x: node.x, y: node.y }),
  },
  {
    id: 'mid',
    tikz: 'mid',
    isConnectable: false,
    aliases: ['m'],
    getPoint: node => ({ x: node.x, y: node.y }),
  },
  {
    id: 'base',
    tikz: 'base',
    isConnectable: false,
    aliases: ['b'],
    getPoint: node => ({ x: node.x, y: node.y }),
  },
  {
    id: 'north',
    tikz: 'north',
    isConnectable: true,
    aliases: ['n'],
    getPoint: ratioPoint(0, -1),
  },
  {
    id: 'south',
    tikz: 'south',
    isConnectable: true,
    aliases: ['s'],
    getPoint: ratioPoint(0, 1),
  },
  {
    id: 'east',
    tikz: 'east',
    isConnectable: true,
    aliases: ['e'],
    getPoint: ratioPoint(1, 0),
  },
  {
    id: 'west',
    tikz: 'west',
    isConnectable: true,
    aliases: ['w'],
    getPoint: ratioPoint(-1, 0),
  },
  {
    id: 'north west',
    tikz: 'north west',
    isConnectable: true,
    aliases: ['nw', 'northwest'],
    getPoint: ratioPoint(-1, -1),
  },
  {
    id: 'north east',
    tikz: 'north east',
    isConnectable: true,
    aliases: ['ne', 'northeast'],
    getPoint: ratioPoint(1, -1),
  },
  {
    id: 'south west',
    tikz: 'south west',
    isConnectable: true,
    aliases: ['sw', 'southwest'],
    getPoint: ratioPoint(-1, 1),
  },
  {
    id: 'south east',
    tikz: 'south east',
    isConnectable: true,
    aliases: ['se', 'southeast'],
    getPoint: ratioPoint(1, 1),
  },
  {
    id: 'mid west',
    tikz: 'mid west',
    isConnectable: true,
    aliases: ['midwest'],
    getPoint: ratioPoint(-1, 0),
  },
  {
    id: 'mid east',
    tikz: 'mid east',
    isConnectable: true,
    aliases: ['mideast'],
    getPoint: ratioPoint(1, 0),
  },
  {
    id: 'base west',
    tikz: 'base west',
    isConnectable: true,
    getPoint: ratioPoint(-1, 1),
  },
  {
    id: 'base east',
    tikz: 'base east',
    isConnectable: true,
    getPoint: ratioPoint(1, 1),
  },
  {
    id: '10',
    tikz: '10',
    isConnectable: false,
    getPoint: rectangleBorderPoint(10),
  },
];

export function registerRoundedRectangle() {
  registerShape(
    'rounded rectangle',
    createSimpleShape(
      [
        'rounded rectangle',
        'rounded corners=15pt', // Rounded rectangle corner radius requirement
        'minimum width=2.4cm',
        'minimum height=1.2cm',
        ALIGN_CENTER,
      ],
      ['shapes.misc']
    )
  );
  registerShapeAnchors('rounded rectangle', roundedRectangleAnchors);
}
