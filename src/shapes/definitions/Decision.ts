// @ts-nocheck

import { createSimpleShape } from '../core.js';
import { registerShape } from '../registry.js';
import { registerShapeAnchors } from '../anchorRegistry.js';
import { getNodeDimensions } from '../../utils/sceneMetrics.js';

const ALIGN_CENTER = 'align=center';

const decisionAnchors = [
  {
    id: 'center',
    tikz: 'center',
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
];

export function registerDecision() {
  registerShape(
    'decision',
    createSimpleShape(
      ['regular polygon', 'regular polygon sides=6', 'minimum size=1.8cm', ALIGN_CENTER],
      ['shapes.geometric']
    )
  );
  registerShapeAnchors('decision', decisionAnchors);
}
