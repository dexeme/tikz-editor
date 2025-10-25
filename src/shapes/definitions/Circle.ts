// @ts-nocheck

import { registerShape } from '../registry.js';
import { registerShapeAnchors } from '../anchorRegistry.js';
import { getNodeDimensions, getDefaultNodeSize, formatCm } from '../../utils/sceneMetrics.js';

const ALIGN_CENTER = 'align=center';
const toRadians = degrees => (degrees * Math.PI) / 180;

const pointOnCircle = angle => node => {
  const { halfWidth } = getNodeDimensions(node);
  const radius = halfWidth || 0;
  const radians = toRadians(angle);
  return {
    x: node.x + Math.cos(radians) * radius,
    y: node.y - Math.sin(radians) * radius,
  };
};

const circleAnchors = [
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
    getPoint: pointOnCircle(90),
  },
  {
    id: 'south',
    tikz: 'south',
    isConnectable: true,
    aliases: ['s'],
    getPoint: pointOnCircle(270),
  },
  {
    id: 'east',
    tikz: 'east',
    isConnectable: true,
    aliases: ['e'],
    getPoint: pointOnCircle(0),
  },
  {
    id: 'west',
    tikz: 'west',
    isConnectable: true,
    aliases: ['w'],
    getPoint: pointOnCircle(180),
  },
  {
    id: 'north west',
    tikz: 'north west',
    isConnectable: true,
    aliases: ['northwest'],
    getPoint: pointOnCircle(135),
  },
  {
    id: 'north east',
    tikz: 'north east',
    isConnectable: true,
    aliases: ['northeast'],
    getPoint: pointOnCircle(45),
  },
  {
    id: 'south west',
    tikz: 'south west',
    isConnectable: true,
    aliases: ['southwest'],
    getPoint: pointOnCircle(225),
  },
  {
    id: 'south east',
    tikz: 'south east',
    isConnectable: true,
    aliases: ['southeast'],
    getPoint: pointOnCircle(315),
  },
  {
    id: '130',
    tikz: '130',
    isConnectable: true,
    getPoint: pointOnCircle(130),
  },
  {
    id: '10',
    tikz: '10',
    isConnectable: true,
    getPoint: pointOnCircle(10),
  },
  {
    id: 'mid west',
    tikz: 'mid west',
    isConnectable: true,
    aliases: ['midwest'],
    getPoint: pointOnCircle(180),
  },
  {
    id: 'base west',
    tikz: 'base west',
    isConnectable: true,
    getPoint: pointOnCircle(225),
  },
  {
    id: 'mid east',
    tikz: 'mid east',
    isConnectable: true,
    aliases: ['mideast'],
    getPoint: pointOnCircle(0),
  },
  {
    id: 'base east',
    tikz: 'base east',
    isConnectable: true,
    getPoint: pointOnCircle(315),
  },
];

export function registerCircle() {
  registerShape('circle', () => {
    const defaults = getDefaultNodeSize('circle');
    const diameter = Math.max(defaults.width, defaults.height);
    const minimumSize = formatCm(diameter) || '3cm';
    return {
      options: ['circle', `minimum size=${minimumSize}`, 'shape aspect=1', ALIGN_CENTER],
      libraries: [],
    };
  });
  registerShapeAnchors('circle', circleAnchors);
}
