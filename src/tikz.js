import { mapPort, resolveBendShape, resolveOrthogonalTikz, isCurvedShape } from './routingMaps.js';
import { isNodeInsideFrame } from './utils/sceneMetrics.js';

const FONT_MAP = {
  12: '\\small',
  16: '',
  20: '\\large',
};

const SCALE = 0.05;

const SHAPE_OPTIONS = {
  circle: 'circle',
  rectangle: 'rectangle, rounded corners=3pt, minimum width=2.4cm, minimum height=1.2cm',
  diamond: 'diamond, aspect=2',
  decision: 'regular polygon, regular polygon sides=6, minimum size=1.8cm',
  triangle: 'regular polygon, regular polygon sides=3, minimum size=1.8cm',
};

export function generateTikzDocument(nodes, edges, frame = null, options = {}) {
  const definedColors = new Map();
  const colorDeclarations = [];
  let colorSequence = 1;
  const libraries = new Set(['arrows.meta']);
  const edgeThickness = Number.isFinite(options.edgeThickness) && options.edgeThickness > 0
    ? options.edgeThickness
    : 2.5;
  const lineWidthOption = edgeThickness ? `line width=${(edgeThickness * 0.75).toFixed(2)}pt` : null;
  const alignmentCandidates = new Set(['auto', 'left', 'center', 'right']);
  const edgeLabelAlignment = alignmentCandidates.has(options.edgeLabelAlignment)
    ? options.edgeLabelAlignment
    : 'right';
  const formatShift = value => {
    if (!Number.isFinite(value)) {
      return '0cm';
    }
    const normalized = Math.abs(value) < 1e-4 ? 0 : Number(value.toFixed(2));
    return `${normalized}cm`;
  };

  const registerColor = hex => {
    if (!hex) return null;
    const normalized = hex.replace('#', '').toLowerCase();
    if (!/^[0-9a-f]{6}$/i.test(normalized)) {
      return null;
    }
    if (!definedColors.has(normalized)) {
      const r = parseInt(normalized.slice(0, 2), 16);
      const g = parseInt(normalized.slice(2, 4), 16);
      const b = parseInt(normalized.slice(4, 6), 16);
      const name = `customColor${colorSequence++}`;
      definedColors.set(normalized, name);
      colorDeclarations.push(`\\definecolor{${name}}{RGB}{${r},${g},${b}}`);
    }
    return definedColors.get(normalized);
  };

  const formatNodeLabel = label => {
    if (!label) return '';
    return label.toString().split(/\n/).join(' \\ ');
  };

  const filteredNodes = nodes.filter(node => isNodeInsideFrame(node, frame));
  const nodeMap = new Map(filteredNodes.map(node => [node.id, node]));
  const filteredEdges = edges.filter(edge => nodeMap.has(edge.from) && nodeMap.has(edge.to));

  let body = '\\begin{tikzpicture}[node distance=2cm, auto, >=stealth]\n';

  filteredNodes.forEach(node => {
    const fillColorName = registerColor(node.color);
    const strokeColorName = registerColor(node.borderColor);
    const x = (node.x * SCALE).toFixed(2);
    const y = (-node.y * SCALE).toFixed(2);
    if (node.shape && ['diamond', 'decision', 'triangle'].includes(node.shape)) {
      libraries.add('shapes.geometric');
    }
    const shapeOption = SHAPE_OPTIONS[node.shape] || SHAPE_OPTIONS.circle;
    const options = [
      strokeColorName ? `draw=${strokeColorName}` : 'draw',
      shapeOption,
      fillColorName ? `fill=${fillColorName}` : null,
      FONT_MAP[node.fontSize] ? `font=${FONT_MAP[node.fontSize]}` : null,
    ].filter(Boolean).join(', ');
    body += `    \\node[${options}] (${node.id}) at (${x},${y}) {${formatNodeLabel(node.label)}};\n`;
  });

  if (filteredEdges.length) {
    body += '\n';
  }

  filteredEdges.forEach(edge => {
    const styleParts = [edge.direction || '->'];
    if (edge.style && edge.style !== 'solid') {
      styleParts.push(edge.style);
    }
    const colorName = registerColor(edge.color);
    if (colorName) {
      styleParts.push(`draw=${colorName}`);
    }
    if (lineWidthOption) {
      styleParts.push(lineWidthOption);
    }
    let path;
    if (isCurvedShape(edge.shape)) {
      const tikzBend = resolveBendShape(edge.shape) || 'bend left';
      path = `to[${tikzBend}=${edge.bend || 30}]`;
    } else if (resolveOrthogonalTikz(edge.shape)) {
      path = resolveOrthogonalTikz(edge.shape);
    } else {
      path = '--';
    }
    const labelOptions = ['fill=white', 'inner sep=2pt'];
    if (edge.label?.color) {
      const labelColor = registerColor(edge.label.color);
      if (labelColor) {
        labelOptions.push(`text=${labelColor}`);
      }
    }
    const hasLabelText = Boolean(edge.label?.text);
    const fromNodeId = edge.from || edge.source?.nodeId;
    const toNodeId = edge.to || edge.target?.nodeId;
    const labelAlignment = alignmentCandidates.has(edge.label?.alignment)
      ? edge.label.alignment
      : edgeLabelAlignment;
    if (hasLabelText) {
      if (labelAlignment === 'auto') {
        labelOptions.unshift('midway');
      } else if (labelAlignment === 'center') {
        if (isCurvedShape(edge.shape)) {
          labelOptions.unshift('midway');
          labelOptions.push('sloped');
        } else if (path === '--') {
          labelOptions.unshift('pos=0.5');
        } else if (path === '|-' || path === '-|') {
          const posValue = path === '|-' ? '0.25' : '0.75';
          labelOptions.unshift(`pos=${posValue}`);
        } else {
          labelOptions.unshift('midway');
        }
      } else {
        const isLeft = labelAlignment === 'left';
        if (isCurvedShape(edge.shape)) {
          labelOptions.unshift(`pos=${isLeft ? '0.35' : '0.65'}`);
          labelOptions.push('sloped');
        } else if (path === '--') {
          labelOptions.unshift(`pos=${isLeft ? '0.25' : '0.75'}`);
        } else if (path === '|-' || path === '-|') {
          const posValue = isLeft ? '0.25' : '0.75';
          labelOptions.unshift(`pos=${posValue}`);
        } else {
          labelOptions.unshift(`pos=${isLeft ? '0.35' : '0.65'}`);
        }
      }
    }
    if (labelAlignment === 'auto' && Array.isArray(edge.label?.offset)) {
      const [offsetX, offsetY] = edge.label.offset;
      const shiftX = Number((offsetX * SCALE).toFixed(2));
      const shiftY = Number((-offsetY * SCALE).toFixed(2));
      if (shiftX) {
        labelOptions.push(`xshift=${shiftX}cm`);
      }
      if (shiftY) {
        labelOptions.push(`yshift=${shiftY}cm`);
      }
    }
    const labelSegment = hasLabelText
      ? ` node[${labelOptions.join(', ')}]{${edge.label.text}}`
      : '';
    const fromAnchor = edge.fromAnchor || edge.source?.portId;
    const toAnchor = edge.toAnchor || edge.target?.portId;
    const fromRef = fromAnchor
      ? `${fromNodeId}.${mapPort[fromAnchor] || fromAnchor}`
      : fromNodeId;
    const toRef = toAnchor ? `${toNodeId}.${mapPort[toAnchor] || toAnchor}` : toNodeId;
    body += `    \\draw[${styleParts.join(', ')}] (${fromRef}) ${path}${labelSegment} (${toRef});\n`;
  });

  body += '\\end{tikzpicture}\n';

  const libraryLine = libraries.size ? `\\usetikzlibrary{${Array.from(libraries).join(', ')}}\n` : '';
  const colorBlock = colorDeclarations.length ? `${colorDeclarations.join('\n')}\n` : '';

  return `\\documentclass{standalone}\n\\usepackage{tikz}\n${libraryLine}${colorBlock}\n\\begin{document}\n${body}\\end{document}`;
}
