// @ts-nocheck

import { registerShape } from '../registry.js';
import { registerShapeAnchors } from '../anchorRegistry.js';
import { getNodeDimensions, getDefaultNodeSize, formatCm } from '../../utils/sceneMetrics.js';

const ALIGN_CENTER = 'align=center';
const toRadians = degrees => (degrees * Math.PI) / 180;

const ellipseBorderPoint = angle => node => {
  const { halfWidth, halfHeight } = getNodeDimensions(node);
  const radians = toRadians(angle);
  const dx = Math.cos(radians);
  const dy = -Math.sin(radians);
  const safeHalfWidth = halfWidth || 1;
  const safeHalfHeight = halfHeight || 1;
  const denominator = Math.sqrt(
    (dx * dx) / (safeHalfWidth * safeHalfWidth) +
      (dy * dy) / (safeHalfHeight * safeHalfHeight)
  );
  const scale = denominator === 0 ? 0 : 1 / denominator;
  return {
    x: node.x + dx * scale,
    y: node.y + dy * scale,
  };
};

const ellipseAnchors = [
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
    getPoint: node => {
      const { halfHeight } = getNodeDimensions(node);
      return { x: node.x, y: node.y + halfHeight / 2 };
    },
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
    aliases: ['ne', 'northeast'],
    getPoint: ellipseBorderPoint(45),
  },
  {
    id: 'north west',
    tikz: 'north west',
    isConnectable: true,
    aliases: ['nw', 'northwest'],
    getPoint: ellipseBorderPoint(135),
  },
  {
    id: 'south east',
    tikz: 'south east',
    isConnectable: true,
    aliases: ['se', 'southeast'],
    getPoint: ellipseBorderPoint(315),
  },
  {
    id: 'south west',
    tikz: 'south west',
    isConnectable: true,
    aliases: ['sw', 'southwest'],
    getPoint: ellipseBorderPoint(225),
  },
  {
    id: 'mid west',
    tikz: 'mid west',
    isConnectable: true,
    aliases: ['midwest'],
    getPoint: ellipseBorderPoint(180),
  },
  {
    id: 'mid east',
    tikz: 'mid east',
    isConnectable: true,
    aliases: ['mideast'],
    getPoint: ellipseBorderPoint(0),
  },
  {
    id: 'base west',
    tikz: 'base west',
    isConnectable: true,
    getPoint: ellipseBorderPoint(225),
  },
  {
    id: 'base east',
    tikz: 'base east',
    isConnectable: true,
    getPoint: ellipseBorderPoint(315),
  },
  {
    id: '130',
    tikz: '130',
    isConnectable: false,
    getPoint: ellipseBorderPoint(130),
  },
  {
    id: '10',
    tikz: '10',
    isConnectable: false,
    getPoint: ellipseBorderPoint(10),
  },
];

export function registerEllipse() {
  registerShape('ellipse', () => {
    const defaults = getDefaultNodeSize('ellipse');
    const minimumWidth = formatCm(defaults.width) || '4cm';
    const minimumHeight = formatCm(defaults.height) || '3cm';
    return {
      options: ['ellipse', `minimum width=${minimumWidth}`, `minimum height=${minimumHeight}`, ALIGN_CENTER],
      libraries: ['shapes.geometric'],
    };
  });
  registerShapeAnchors('ellipse', ellipseAnchors);
}
