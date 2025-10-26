// @ts-nocheck

import { registerShape } from '../registry.js';
import { registerShapeAnchors } from '../anchorRegistry.js';
import { getCylinderMetrics, formatCm } from '../../utils/sceneMetrics.js';

const ALIGN_CENTER = 'align=center';
const toRadians = degrees => (degrees * Math.PI) / 180;

const ellipsePoint = (cx, cy, rx, ry, angle) => {
  const radians = toRadians(angle);
  return {
    x: cx + Math.cos(radians) * rx,
    y: cy - Math.sin(radians) * ry,
  };
};

const cylinderAnchors = [
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
      const { halfHeight } = getCylinderMetrics(node);
      return { x: node.x, y: node.y - halfHeight };
    },
  },
  {
    id: 'south',
    tikz: 'south',
    isConnectable: true,
    aliases: ['s'],
    getPoint: node => {
      const { halfHeight } = getCylinderMetrics(node);
      return { x: node.x, y: node.y + halfHeight };
    },
  },
  {
    id: 'east',
    tikz: 'east',
    isConnectable: true,
    aliases: ['e'],
    getPoint: node => {
      const { halfWidth } = getCylinderMetrics(node);
      return { x: node.x + halfWidth, y: node.y };
    },
  },
  {
    id: 'west',
    tikz: 'west',
    isConnectable: true,
    aliases: ['w'],
    getPoint: node => {
      const { halfWidth } = getCylinderMetrics(node);
      return { x: node.x - halfWidth, y: node.y };
    },
  },
  {
    id: 'north west',
    tikz: 'north west',
    isConnectable: true,
    aliases: ['northwest'],
    getPoint: node => {
      const metrics = getCylinderMetrics(node);
      const topCenterY = node.y - metrics.bodyHeight / 2;
      return ellipsePoint(node.x, topCenterY, metrics.rx, metrics.ry, 135);
    },
  },
  {
    id: 'north east',
    tikz: 'north east',
    isConnectable: true,
    aliases: ['northeast'],
    getPoint: node => {
      const metrics = getCylinderMetrics(node);
      const topCenterY = node.y - metrics.bodyHeight / 2;
      return ellipsePoint(node.x, topCenterY, metrics.rx, metrics.ry, 45);
    },
  },
  {
    id: 'south west',
    tikz: 'south west',
    isConnectable: true,
    aliases: ['southwest'],
    getPoint: node => {
      const metrics = getCylinderMetrics(node);
      const bottomCenterY = node.y + metrics.bodyHeight / 2;
      return ellipsePoint(node.x, bottomCenterY, metrics.rx, metrics.ry, 225);
    },
  },
  {
    id: 'south east',
    tikz: 'south east',
    isConnectable: true,
    aliases: ['southeast'],
    getPoint: node => {
      const metrics = getCylinderMetrics(node);
      const bottomCenterY = node.y + metrics.bodyHeight / 2;
      return ellipsePoint(node.x, bottomCenterY, metrics.rx, metrics.ry, 315);
    },
  },
  {
    id: 'top',
    tikz: 'top',
    isConnectable: true,
    getPoint: node => {
      const metrics = getCylinderMetrics(node);
      const topCenterY = node.y - metrics.bodyHeight / 2;
      return ellipsePoint(node.x, topCenterY, metrics.rx, metrics.ry, 90);
    },
  },
  {
    id: 'bottom',
    tikz: 'bottom',
    isConnectable: true,
    getPoint: node => {
      const metrics = getCylinderMetrics(node);
      const bottomCenterY = node.y + metrics.bodyHeight / 2;
      return ellipsePoint(node.x, bottomCenterY, metrics.rx, metrics.ry, 270);
    },
  },
  {
    id: 'after top',
    tikz: 'after top',
    isConnectable: true,
    getPoint: node => {
      const metrics = getCylinderMetrics(node);
      const topCenterY = node.y - metrics.bodyHeight / 2;
      return ellipsePoint(node.x, topCenterY, metrics.rx, metrics.ry, 15);
    },
  },
  {
    id: 'before top',
    tikz: 'before top',
    isConnectable: true,
    getPoint: node => {
      const metrics = getCylinderMetrics(node);
      const topCenterY = node.y - metrics.bodyHeight / 2;
      return ellipsePoint(node.x, topCenterY, metrics.rx, metrics.ry, 165);
    },
  },
  {
    id: 'after bottom',
    tikz: 'after bottom',
    isConnectable: true,
    getPoint: node => {
      const metrics = getCylinderMetrics(node);
      const bottomCenterY = node.y + metrics.bodyHeight / 2;
      return ellipsePoint(node.x, bottomCenterY, metrics.rx, metrics.ry, 345);
    },
  },
  {
    id: 'before bottom',
    tikz: 'before bottom',
    isConnectable: true,
    getPoint: node => {
      const metrics = getCylinderMetrics(node);
      const bottomCenterY = node.y + metrics.bodyHeight / 2;
      return ellipsePoint(node.x, bottomCenterY, metrics.rx, metrics.ry, 195);
    },
  },
  {
    id: '160',
    tikz: '160',
    isConnectable: true,
    getPoint: node => {
      const metrics = getCylinderMetrics(node);
      const topCenterY = node.y - metrics.bodyHeight / 2;
      return ellipsePoint(node.x, topCenterY, metrics.rx, metrics.ry, 160);
    },
  },
  {
    id: 'mid west',
    tikz: 'mid west',
    isConnectable: true,
    aliases: ['midwest'],
    getPoint: node => {
      const { halfWidth } = getCylinderMetrics(node);
      return { x: node.x - halfWidth, y: node.y };
    },
  },
  {
    id: 'base west',
    tikz: 'base west',
    isConnectable: true,
    getPoint: node => {
      const metrics = getCylinderMetrics(node);
      const bottomCenterY = node.y + metrics.bodyHeight / 2;
      return ellipsePoint(node.x, bottomCenterY, metrics.rx, metrics.ry, 210);
    },
  },
  {
    id: 'mid east',
    tikz: 'mid east',
    isConnectable: true,
    aliases: ['mideast'],
    getPoint: node => {
      const { halfWidth } = getCylinderMetrics(node);
      return { x: node.x + halfWidth, y: node.y };
    },
  },
  {
    id: 'base east',
    tikz: 'base east',
    isConnectable: true,
    getPoint: node => {
      const metrics = getCylinderMetrics(node);
      const bottomCenterY = node.y + metrics.bodyHeight / 2;
      return ellipsePoint(node.x, bottomCenterY, metrics.rx, metrics.ry, 330);
    },
  },
];

export function registerCylinder() {
  registerShape('cylinder', (params = {}, context = {}) => {
    const options = ['cylinder', ALIGN_CENTER];
    const libraries = ['shapes.geometric'];
    const raw = params?.raw ?? {};
    const registerColor = typeof context.registerColor === 'function' ? context.registerColor : null;
    const metrics = getCylinderMetrics(raw);
    const minimumWidth = formatCm(metrics.contentWidth) || '4cm';
    const minimumHeight = formatCm(metrics.bodyHeight) || '4cm';
    options.push(`minimum width=${minimumWidth}`);
    options.push(`minimum height=${minimumHeight}`);

    const formatNumber = (value, digits = 2) => {
      const fixed = Number(value);
      if (!Number.isFinite(fixed)) return null;
      const normalized = Number(fixed.toFixed(digits));
      return Number.isFinite(normalized) ? normalized.toString() : null;
    };

    const sanitizeDimension = value => {
      if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed || null;
      }
      if (Number.isFinite(Number(value))) {
        return String(value);
      }
      return null;
    };

    const sanitizeColor = value => {
      if (typeof value !== 'string') return null;
      const trimmed = value.trim();
      return trimmed || null;
    };

    const angle = Number(raw.rotate);
    const normalizedAngle = Number.isFinite(angle) ? angle : 0;
    let adjustedAngle = 90 - normalizedAngle;
    if (Number.isFinite(adjustedAngle)) {
      adjustedAngle %= 360;
      if (adjustedAngle < -180) {
        adjustedAngle += 360;
      } else if (adjustedAngle > 180) {
        adjustedAngle -= 360;
      }
    } else {
      adjustedAngle = 0;
    }
    if (Math.abs(adjustedAngle) > 0.0001) {
      options.push(`rotate=${formatNumber(adjustedAngle, 2)}`);
    }

    const borderRotate = Number(raw.shapeBorderRotate);
    if (Number.isFinite(borderRotate) && borderRotate % 360 !== 0) {
      options.push(`shape border rotate=${formatNumber(borderRotate, 2)}`);
    }

    const aspectValue = Number(raw.aspect);
    if (Number.isFinite(aspectValue) && aspectValue > 0) {
      const formatted = formatNumber(aspectValue, 2);
      if (formatted) {
        options.push(`shape aspect=${formatted}`);
      }
    }

    const innerXsep = sanitizeDimension(raw.innerXsep);
    if (innerXsep) {
      options.push(`inner xsep=${innerXsep}`);
    }
    const innerYsep = sanitizeDimension(raw.innerYsep);
    if (innerYsep) {
      options.push(`inner ysep=${innerYsep}`);
    }

    const usesCustomFill =
      raw.cylinderUsesCustomFill === false || raw.cylinderUsesCustomFill === 'false'
        ? false
        : true;
    options.push(
      usesCustomFill ? 'cylinder uses custom fill' : 'cylinder uses custom fill=false'
    );

    const appendColorOption = (value, key) => {
      const sanitized = sanitizeColor(value);
      if (!sanitized) return;
      const registered = registerColor ? registerColor(sanitized) : null;
      options.push(`${key}=${registered || sanitized}`);
    };

    if (usesCustomFill) {
      appendColorOption(raw.cylinderEndFill, 'cylinder end fill');
      appendColorOption(raw.cylinderBodyFill, 'cylinder body fill');
    }

    return { options, libraries };
  });

  registerShapeAnchors('cylinder', cylinderAnchors);
}
