// @ts-nocheck

import { registerShape } from '../registry.js';
import { registerShapeAnchors } from '../anchorRegistry.js';
import { getNodeDimensions, getDefaultNodeSize, formatCm } from '../../utils/sceneMetrics.js';

const ALIGN_CENTER = 'align=center';
const toRadians = degrees => (degrees * Math.PI) / 180;

const ratioPoint = (sx, sy) => node => {
  const { halfWidth, halfHeight } = getNodeDimensions(node);
  return {
    x: node.x + halfWidth * sx,
    y: node.y + halfHeight * sy,
  };
};

const semicircleArcPoint = angle => node => {
  const { halfWidth, halfHeight } = getNodeDimensions(node);
  const radians = toRadians(angle);
  return {
    x: node.x + Math.cos(radians) * halfWidth,
    y: node.y - Math.sin(radians) * halfHeight,
  };
};

const semicircleAnchors = [
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
    getPoint: ratioPoint(0, 1),
  },
  {
    id: 'north',
    tikz: 'north',
    isConnectable: true,
    aliases: ['n'],
    getPoint: semicircleArcPoint(90),
  },
  {
    id: 'apex',
    tikz: 'apex',
    isConnectable: true,
    getPoint: semicircleArcPoint(90),
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
    id: 'north east',
    tikz: 'north east',
    isConnectable: true,
    aliases: ['ne', 'northeast'],
    getPoint: semicircleArcPoint(45),
  },
  {
    id: 'north west',
    tikz: 'north west',
    isConnectable: true,
    aliases: ['nw', 'northwest'],
    getPoint: semicircleArcPoint(135),
  },
  {
    id: 'south east',
    tikz: 'south east',
    isConnectable: true,
    aliases: ['se', 'southeast'],
    getPoint: ratioPoint(1, 1),
  },
  {
    id: 'south west',
    tikz: 'south west',
    isConnectable: true,
    aliases: ['sw', 'southwest'],
    getPoint: ratioPoint(-1, 1),
  },
  {
    id: 'arc start',
    tikz: 'arc start',
    isConnectable: true,
    getPoint: ratioPoint(1, 1),
  },
  {
    id: 'arc end',
    tikz: 'arc end',
    isConnectable: true,
    getPoint: ratioPoint(-1, 1),
  },
  {
    id: 'chord center',
    tikz: 'chord center',
    isConnectable: true,
    getPoint: ratioPoint(0, 1),
  },
  {
    id: 'mid east',
    tikz: 'mid east',
    isConnectable: true,
    aliases: ['mideast'],
    getPoint: ratioPoint(1, 0),
  },
  {
    id: 'mid west',
    tikz: 'mid west',
    isConnectable: true,
    aliases: ['midwest'],
    getPoint: ratioPoint(-1, 0),
  },
  {
    id: 'base east',
    tikz: 'base east',
    isConnectable: true,
    getPoint: ratioPoint(1, 1),
  },
  {
    id: 'base west',
    tikz: 'base west',
    isConnectable: true,
    getPoint: ratioPoint(-1, 1),
  },
  {
    id: '30',
    tikz: '30',
    isConnectable: true,
    getPoint: semicircleArcPoint(30),
  },
  {
    id: '10',
    tikz: '10',
    isConnectable: true,
    getPoint: semicircleArcPoint(10),
  },
];

export function registerSemicircle() {
  registerShape('semicircle', () => {
    const defaults = getDefaultNodeSize('semicircle');
    const minimumWidth = formatCm(defaults.width) || '4cm';
    const minimumHeight = formatCm(defaults.height) || '2cm';
    return {
      options: ['semicircle', `minimum width=${minimumWidth}`, `minimum height=${minimumHeight}`, ALIGN_CENTER],
      libraries: ['shapes.geometric'],
    };
  });
  registerShapeAnchors('semicircle', semicircleAnchors);
}
