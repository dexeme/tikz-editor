// @ts-nocheck

import { rounding } from '../core.js';
import { registerShape } from '../registry.js';
import { registerShapeAnchors } from '../anchorRegistry.js';
import { getNodeDimensions, resolveNodeSize, formatCm } from '../../utils/sceneMetrics.js';

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
    const options = ['rectangle'];
    const flags = params?.flags ?? {};
    const radius = Number.isFinite(params?.cornerRadius) ? params.cornerRadius : 16;
    const size = resolveNodeSize(params?.raw);
    const minimumWidth = formatCm(size.width) || '1cm';
    const minimumHeight = formatCm(size.height) || '1cm';

    if (flags.hasExplicitCornerRadius) {
      options.push(`rounded corners=${rounding(Math.max(0, radius))}pt`);
    } else {
      options.push('rounded corners=8pt'); // Default rounded corner radius
    }

    if (!flags.hasExplicitDraw) {
      options.push('draw=purple'); // Default rectangle stroke
    }

    if (!flags.hasExplicitLineWidth) {
      options.push('line width=2pt'); // Default rectangle border thickness
    }

    //options.push('dash pattern=off 5pt off 3pt'); // Rectangle border dash pattern

    if (!flags.hasExplicitFill) {
      options.push('fill=cyan!15'); // Default rectangle fill
    }

    options.push(`minimum width=${minimumWidth}`);
    options.push(`minimum height=${minimumHeight}`);
    options.push('inner sep=12pt'); // Rectangle inner padding
    options.push('outer sep=5pt'); // Rectangle outer spacing
    options.push(ALIGN_CENTER);
    options.push('font=\\bfseries\\Large\\sffamily'); // Rectangle typography
    options.push('anchor=south west'); // Rectangle anchor requirement

    return { options };
  });

  registerShapeAnchors('rectangle', rectangleAnchors);
}
