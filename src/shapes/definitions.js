import { registerShape } from './registry.js';

const ALIGN_CENTER = 'align=center';

const rounding = value => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return '0.00';
  }
  return (numeric * 0.1875).toFixed(2);
};

const createSimpleShape = (options, libraries = []) => () => ({
  options,
  libraries,
});

export function registerBuiltInShapes() {
  registerShape('circle', createSimpleShape(['circle', ALIGN_CENTER]));

  registerShape('rectangle', params => {
    const radius = Number.isFinite(params.cornerRadius) ? params.cornerRadius : 16;
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

  registerShape(
    'diamond',
    createSimpleShape(['diamond', 'aspect=2', ALIGN_CENTER], ['shapes.geometric'])
  );

  registerShape(
    'decision',
    createSimpleShape(
      ['regular polygon', 'regular polygon sides=6', 'minimum size=1.8cm', ALIGN_CENTER],
      ['shapes.geometric']
    )
  );

  registerShape(
    'triangle',
    createSimpleShape(
      ['regular polygon', 'regular polygon sides=3', 'minimum size=1.8cm', ALIGN_CENTER],
      ['shapes.geometric']
    )
  );

  registerShape('cylinder', (params = {}, context = {}) => {
    const options = ['cylinder', ALIGN_CENTER];
    const libraries = ['shapes.geometric'];
    const raw = params?.raw ?? {};
    const registerColor = typeof context.registerColor === 'function' ? context.registerColor : null;

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
    let adjustedAngle = normalizedAngle + 90;
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

    const minHeight = sanitizeDimension(raw.minimumHeight);
    if (minHeight) {
      options.push(`minimum height=${minHeight}`);
    }
    const minWidth = sanitizeDimension(raw.minimumWidth);
    if (minWidth) {
      options.push(`minimum width=${minWidth}`);
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

  /**
   * To add a new shape:
   * registerShape('hexagon', params => ({
   *   options: ['regular polygon', 'regular polygon sides=6', ALIGN_CENTER],
   *   libraries: ['shapes.geometric'],
   * }));
   */
}
