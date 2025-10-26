// @ts-nocheck
const FONT_MAP = {
    12: '\\small',
    16: '',
    20: '\\large',
};
const formatFontSizeCommand = value => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) {
        return null;
    }
    const ptSize = Number((numeric * 0.75).toFixed(1));
    if (!Number.isFinite(ptSize) || ptSize <= 0) {
        return null;
    }
    const baseline = Number((ptSize * 1.2).toFixed(1));
    if (!Number.isFinite(baseline) || baseline <= 0) {
        return null;
    }
    return `\\fontsize{${ptSize}}{${baseline}}\\selectfont`;
};
const DEFAULTS = {
    fill: '#f8fafc',
    draw: '#94a3b8',
    lineWidth: 3,
    fontSize: 16,
    cornerRadius: 16,
};
const SUPPORTED_NODE_KEYS = new Set([
    'id',
    'x',
    'y',
    'label',
    'shape',
    'fontSize',
    'color',
    'fill',
    'draw',
    'borderColor',
    'borderWidth',
    'borderStyle',
    'lineWidth',
    'cornerRadius',
    'opacity',
    'shadow',
    'size',
    'font',
    'fontFamily',
    'fontWeight',
    'rotate',
    'shapeBorderRotate',
    'minimumHeight',
    'minimumWidth',
    'aspect',
    'innerXsep',
    'innerYsep',
    'cylinderUsesCustomFill',
    'cylinderEndFill',
    'cylinderBodyFill',
    'rectangleSplitParts',
    'rectangleSplitCells',
]);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object ?? {}, key);
const coerceColor = value => {
    if (typeof value !== 'string')
        return null;
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
};
const coercePositiveNumber = value => {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
};
const coerceNonNegativeNumber = value => {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
};
const coerceOpacity = value => {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric >= 0 && numeric <= 1 ? numeric : null;
};
const coerceBoolean = value => {
    if (typeof value === 'boolean')
        return value;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized === 'true')
            return true;
        if (normalized === 'false')
            return false;
    }
    return null;
};
const normalizeSize = value => {
    if (value == null)
        return null;
    if (typeof value === 'number') {
        const numeric = coercePositiveNumber(value);
        return numeric ? { width: numeric, height: numeric } : null;
    }
    if (typeof value === 'object') {
        const width = coercePositiveNumber(value.width);
        const height = coercePositiveNumber(value.height);
        if (!width && !height) {
            return null;
        }
        return {
            width: width ?? height ?? null,
            height: height ?? width ?? null,
        };
    }
    return null;
};
const normalizeBorderStyle = value => {
    if (typeof value !== 'string') {
        return 'solid';
    }
    const normalized = value.trim().toLowerCase();
    if (normalized === 'dashed' || normalized === 'dotted') {
        return normalized;
    }
    return 'solid';
};
function sanitizeShapeName(rawName) {
    if (typeof rawName !== 'string') {
        return 'circle';
    }
    const trimmed = rawName.trim();
    return trimmed || 'circle';
}
export const rounding = value => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0) {
        return '0.00';
    }
    return (numeric * 0.1875).toFixed(2);
};
export const createSimpleShape = (options, libraries = []) => () => ({
    options,
    libraries,
});
function pickColor(node, primaryKey, fallbackKey, defaultValue) {
    if (hasOwn(node, primaryKey)) {
        const color = coerceColor(node[primaryKey]);
        if (color) {
            return { value: color, explicit: true };
        }
    }
    if (hasOwn(node, fallbackKey)) {
        const color = coerceColor(node[fallbackKey]);
        if (color) {
            return { value: color, explicit: true };
        }
    }
    return { value: defaultValue, explicit: false };
}
function pickPositiveNumber(node, primaryKey, fallbackKey, defaultValue) {
    if (hasOwn(node, primaryKey)) {
        const numeric = coercePositiveNumber(node[primaryKey]);
        if (numeric != null) {
            return { value: numeric, explicit: true };
        }
    }
    if (hasOwn(node, fallbackKey)) {
        const numeric = coercePositiveNumber(node[fallbackKey]);
        if (numeric != null) {
            return { value: numeric, explicit: true };
        }
    }
    if (defaultValue == null) {
        return { value: null, explicit: false };
    }
    return { value: defaultValue, explicit: false };
}
function pickCornerRadius(node) {
    if (hasOwn(node, 'cornerRadius')) {
        const numeric = coerceNonNegativeNumber(node.cornerRadius);
        if (numeric != null) {
            return { value: clamp(numeric, 0, 64), explicit: true };
        }
    }
    return { value: DEFAULTS.cornerRadius, explicit: false };
}
function pickFontSize(node) {
    if (hasOwn(node, 'fontSize')) {
        const numeric = Number(node.fontSize);
        if (Number.isFinite(numeric) && numeric > 0) {
            return { value: numeric, explicit: true };
        }
    }
    return { value: DEFAULTS.fontSize, explicit: false };
}
export function validateNodeParameters(node, { allowedKeys = [] } = {}) {
    if (!node || typeof node !== 'object') {
        throw new Error('Node parameters must be provided as an object.');
    }
    const allowed = new Set([...SUPPORTED_NODE_KEYS, ...allowedKeys]);
    const unknown = Object.keys(node).filter(key => !allowed.has(key));
    if (unknown.length) {
        throw new Error(`Unknown node parameter(s): ${unknown.join(', ')}`);
    }
}
export function normalizeNodeParameters(node = {}) {
    validateNodeParameters(node);
    const shape = sanitizeShapeName(node.shape);
    const { value: fill, explicit: hasExplicitFill } = pickColor(node, 'fill', 'color', DEFAULTS.fill);
    const { value: draw, explicit: hasExplicitDraw } = pickColor(node, 'draw', 'borderColor', DEFAULTS.draw);
    const { value: lineWidth, explicit: hasExplicitLineWidth } = pickPositiveNumber(node, 'lineWidth', 'borderWidth', DEFAULTS.lineWidth);
    const borderStyle = normalizeBorderStyle(node.borderStyle);
    const { value: cornerRadius, explicit: hasExplicitCornerRadius } = pickCornerRadius(node);
    const { value: fontSize, explicit: hasExplicitFontSize } = pickFontSize(node);
    const opacity = hasOwn(node, 'opacity') ? coerceOpacity(node.opacity) : null;
    const shadowValue = hasOwn(node, 'shadow') ? coerceBoolean(node.shadow) : null;
    const size = normalizeSize(node.size);
    const usesCustomCylinderFill = shape === 'cylinder' && node.cylinderUsesCustomFill !== false;
    const resolvedFill = usesCustomCylinderFill ? null : fill;
    return {
        shape,
        fill: resolvedFill,
        draw,
        lineWidth,
        borderStyle,
        cornerRadius,
        fontSize,
        opacity,
        shadow: shadowValue === true,
        size,
        label: node.label,
        flags: {
            hasExplicitFill,
            hasExplicitDraw,
            hasExplicitLineWidth,
            hasExplicitCornerRadius,
            hasExplicitFontSize,
            hasExplicitOpacity: hasOwn(node, 'opacity'),
            hasExplicitShadow: hasOwn(node, 'shadow'),
            hasExplicitSize: size != null && hasOwn(node, 'size'),
        },
    };
}
export function buildStyleOptions(normalized, { registerColor }) {
    const prefix = [];
    const suffix = [];
    const libraries = new Set();
    const strokeColorName = normalized.draw ? registerColor(normalized.draw) : null;
    prefix.push(strokeColorName ? `draw=${strokeColorName}` : 'draw');
    if (normalized.borderStyle === 'dashed' || normalized.borderStyle === 'dotted') {
        prefix.push(normalized.borderStyle);
    }
    if (normalized.fill) {
        const fillColorName = registerColor(normalized.fill);
        if (fillColorName) {
            suffix.push(`fill=${fillColorName}`);
        }
    }
    if (Number.isFinite(normalized.lineWidth) && normalized.lineWidth > 0) {
        suffix.push(`line width=${(normalized.lineWidth * 0.6).toFixed(2)}pt`);
    }
    const mappedFontCommand = FONT_MAP[String(normalized.fontSize)];
    if (mappedFontCommand) {
        suffix.push(`font=${mappedFontCommand}`);
    }
    else if (normalized.flags.hasExplicitFontSize) {
        const fallbackFont = formatFontSizeCommand(normalized.fontSize);
        if (fallbackFont) {
            suffix.push(`font=${fallbackFont}`);
        }
    }
    if (Number.isFinite(normalized.opacity) && normalized.opacity < 1) {
        suffix.push(`opacity=${normalized.opacity.toFixed(2)}`);
    }
    if (normalized.flags.hasExplicitShadow && normalized.shadow) {
        suffix.push('drop shadow');
        libraries.add('shadows');
    }
    return {
        prefix,
        suffix,
        libraries: Array.from(libraries),
    };
}
export { FONT_MAP };
