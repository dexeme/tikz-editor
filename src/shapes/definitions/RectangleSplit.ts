// @ts-nocheck

import { registerShape } from '../registry.js';
import { registerShapeAnchors } from '../anchorRegistry.js';
import { getNodeDimensions } from '../../utils/sceneMetrics.js';
import { createSimpleShape } from '../core.js';

const ALIGN_CENTER = 'align=center';
const toRadians = degrees => (degrees * Math.PI) / 180;

const clampParts = value => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 4;
  return Math.min(6, Math.max(4, Math.round(numeric)));
};

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

const getRectangleSplitMetrics = node => {
  const { halfWidth, halfHeight } = getNodeDimensions(node);
  const height = halfHeight * 2;
  const top = node.y - halfHeight;
  const parts = clampParts(node?.rectangleSplitParts);
  const partHeight = height / parts;
  return {
    halfWidth,
    halfHeight,
    parts,
    top,
    partHeight,
    height,
  };
};

const partCenter = (node, index) => {
  const metrics = getRectangleSplitMetrics(node);
  const clampedIndex = Math.min(Math.max(index, 0), metrics.parts - 1);
  const baseY = metrics.top + metrics.partHeight * (clampedIndex + 0.5);
  return {
    x: node.x,
    y: baseY,
  };
};

const partSplitY = (node, index) => {
  const metrics = getRectangleSplitMetrics(node);
  const clampedIndex = Math.min(Math.max(index, 1), metrics.parts);
  return metrics.top + metrics.partHeight * clampedIndex;
};

const rectangleSplitAnchors = [
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
    getPoint: node => partCenter(node, 0),
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
    id: 'text east',
    tikz: 'text east',
    isConnectable: true,
    getPoint: node => {
      const center = partCenter(node, 0);
      const { halfWidth } = getRectangleSplitMetrics(node);
      return { x: node.x + halfWidth, y: center.y };
    },
  },
  {
    id: 'text west',
    tikz: 'text west',
    isConnectable: true,
    getPoint: node => {
      const center = partCenter(node, 0);
      const { halfWidth } = getRectangleSplitMetrics(node);
      return { x: node.x - halfWidth, y: center.y };
    },
  },
  {
    id: 'two',
    tikz: 'two',
    isConnectable: true,
    getPoint: node => partCenter(node, 1),
  },
  {
    id: 'two east',
    tikz: 'two east',
    isConnectable: true,
    getPoint: node => {
      const center = partCenter(node, 1);
      const { halfWidth } = getRectangleSplitMetrics(node);
      return { x: node.x + halfWidth, y: center.y };
    },
  },
  {
    id: 'two west',
    tikz: 'two west',
    isConnectable: true,
    getPoint: node => {
      const center = partCenter(node, 1);
      const { halfWidth } = getRectangleSplitMetrics(node);
      return { x: node.x - halfWidth, y: center.y };
    },
  },
  {
    id: 'three',
    tikz: 'three',
    isConnectable: true,
    getPoint: node => partCenter(node, 2),
  },
  {
    id: 'three east',
    tikz: 'three east',
    isConnectable: true,
    getPoint: node => {
      const center = partCenter(node, 2);
      const { halfWidth } = getRectangleSplitMetrics(node);
      return { x: node.x + halfWidth, y: center.y };
    },
  },
  {
    id: 'three west',
    tikz: 'three west',
    isConnectable: true,
    getPoint: node => {
      const center = partCenter(node, 2);
      const { halfWidth } = getRectangleSplitMetrics(node);
      return { x: node.x - halfWidth, y: center.y };
    },
  },
  {
    id: 'four',
    tikz: 'four',
    isConnectable: true,
    getPoint: node => partCenter(node, 3),
  },
  {
    id: 'four east',
    tikz: 'four east',
    isConnectable: true,
    getPoint: node => {
      const center = partCenter(node, 3);
      const { halfWidth } = getRectangleSplitMetrics(node);
      return { x: node.x + halfWidth, y: center.y };
    },
  },
  {
    id: 'four west',
    tikz: 'four west',
    isConnectable: true,
    getPoint: node => {
      const center = partCenter(node, 3);
      const { halfWidth } = getRectangleSplitMetrics(node);
      return { x: node.x - halfWidth, y: center.y };
    },
  },
  {
    id: 'text split',
    tikz: 'text split',
    isConnectable: true,
    getPoint: node => ({ x: node.x, y: partSplitY(node, 1) }),
  },
  {
    id: 'text split east',
    tikz: 'text split east',
    isConnectable: true,
    getPoint: node => {
      const { halfWidth } = getRectangleSplitMetrics(node);
      return { x: node.x + halfWidth, y: partSplitY(node, 1) };
    },
  },
  {
    id: 'text split west',
    tikz: 'text split west',
    isConnectable: true,
    getPoint: node => {
      const { halfWidth } = getRectangleSplitMetrics(node);
      return { x: node.x - halfWidth, y: partSplitY(node, 1) };
    },
  },
  {
    id: 'two split',
    tikz: 'two split',
    isConnectable: true,
    getPoint: node => ({ x: node.x, y: partSplitY(node, 2) }),
  },
  {
    id: 'two split east',
    tikz: 'two split east',
    isConnectable: true,
    getPoint: node => {
      const { halfWidth } = getRectangleSplitMetrics(node);
      return { x: node.x + halfWidth, y: partSplitY(node, 2) };
    },
  },
  {
    id: 'two split west',
    tikz: 'two split west',
    isConnectable: true,
    getPoint: node => {
      const { halfWidth } = getRectangleSplitMetrics(node);
      return { x: node.x - halfWidth, y: partSplitY(node, 2) };
    },
  },
  {
    id: 'three split',
    tikz: 'three split',
    isConnectable: true,
    getPoint: node => ({ x: node.x, y: partSplitY(node, 3) }),
  },
  {
    id: 'three split east',
    tikz: 'three split east',
    isConnectable: true,
    getPoint: node => {
      const { halfWidth } = getRectangleSplitMetrics(node);
      return { x: node.x + halfWidth, y: partSplitY(node, 3) };
    },
  },
  {
    id: 'three split west',
    tikz: 'three split west',
    isConnectable: true,
    getPoint: node => {
      const { halfWidth } = getRectangleSplitMetrics(node);
      return { x: node.x - halfWidth, y: partSplitY(node, 3) };
    },
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
    id: '70',
    tikz: '70',
    isConnectable: true,
    getPoint: rectangleBorderPoint(70),
  },
];

export function registerRectangleSplit() {
  registerShape('rectangle split', params => {
    const raw = params?.raw ?? {};
    const parts = clampParts(raw.rectangleSplitParts);
    const options = [
      'rectangle split',
      `rectangle split parts=${parts}`,
      ALIGN_CENTER,
    ];
    return {
      options,
      libraries: ['shapes.multipart'],
    };
  });
  registerShapeAnchors('rectangle split', rectangleSplitAnchors);
}
