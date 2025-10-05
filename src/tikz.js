import { mapPort, resolveBendShape, resolveOrthogonalTikz, isCurvedShape } from './routingMaps.js';
import { isNodeInsideFrame } from './utils/sceneMetrics.js';

const FONT_MAP = {
  12: '\\small',
  16: '',
  20: '\\large',
};

const SCALE = 0.05;

const SHAPE_OPTIONS = {
  circle: 'circle, align=center',
  rectangle: 'rectangle, rounded corners=3pt, minimum width=2.4cm, minimum height=1.2cm, align=center',
  diamond: 'diamond, aspect=2, align=center',
  decision: 'regular polygon, regular polygon sides=6, minimum size=1.8cm, align=center',
  triangle: 'regular polygon, regular polygon sides=3, minimum size=1.8cm, align=center',
};

export function generateTikzDocument(nodes, edges, matrixGrids = [], frame = null, options = {}) {
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
    if (label == null) return '';
    const parts = label.toString().split(/\n/);
    return parts.reduce((acc, part, index) => {
      if (index === 0) {
        return part;
      }
      if (!acc) {
        return `\\\\ ${part}`;
      }
      return `${acc} \\\\ ${part}`;
    }, '');
  };

  const filteredNodes = nodes.filter(node => isNodeInsideFrame(node, frame));
  const nodeMap = new Map(filteredNodes.map(node => [node.id, node]));
  const filteredEdges = edges.filter(edge => nodeMap.has(edge.from) && nodeMap.has(edge.to));
  const matrixBlocks = Array.isArray(matrixGrids)
    ? matrixGrids
        .map(grid => {
          const rawData = Array.isArray(grid?.data)
            ? grid.data
                .map(row => (Array.isArray(row) ? row.map(cell => String(cell)) : []))
                .filter(row => row.length > 0)
            : [];
          const columnCount = rawData[0]?.length || 0;
          if (!columnCount) {
            return null;
          }
          const data = rawData.filter(row => row.length === columnCount);
          if (!data.length) {
            return null;
          }
          const cellSizeValue = Number(grid.cellSize);
          const cellSize = Number.isFinite(cellSizeValue) && cellSizeValue > 0 ? cellSizeValue : 4;
          const xValue = Number(grid.x);
          const yValue = Number(grid.y);
          const colorMap =
            grid.colorMap && typeof grid.colorMap === 'object'
              ? Object.entries(grid.colorMap).reduce((acc, [key, value]) => {
                  if (typeof value === 'string' && value) {
                    acc[String(key)] = value;
                  }
                  return acc;
                }, {})
              : {};
          return {
            data,
            colorMap,
            cellSize,
            x: Number.isFinite(xValue) ? xValue : 0,
            y: Number.isFinite(yValue) ? yValue : 0,
          };
        })
        .filter(Boolean)
    : [];

  let body = '\\begin{tikzpicture}[node distance=2cm, auto, >=stealth]\n';

  filteredNodes.forEach(node => {
    const fillColorName = registerColor(node.color);
    const strokeColorName = registerColor(node.borderColor);
    const x = (node.x * SCALE).toFixed(2);
    const y = (-node.y * SCALE).toFixed(2);
    if (node.shape && ['diamond', 'decision', 'triangle'].includes(node.shape)) {
      libraries.add('shapes.geometric');
    }
    let shapeOption = SHAPE_OPTIONS[node.shape] || SHAPE_OPTIONS.circle;
    if (node.shape === 'rectangle') {
      const radius = Math.max(0, Number(node.cornerRadius) || 16);
      const roundedCorners = (radius * 0.1875).toFixed(2);
      shapeOption = `rectangle, rounded corners=${roundedCorners}pt, minimum width=2.4cm, minimum height=1.2cm, align=center`;
    }
    const borderWidth = Number(node.borderWidth);
    const lineWidthOption = Number.isFinite(borderWidth) && borderWidth > 0
      ? `line width=${(borderWidth * 0.6).toFixed(2)}pt`
      : null;
    const options = [
      strokeColorName ? `draw=${strokeColorName}` : 'draw',
      shapeOption,
      fillColorName ? `fill=${fillColorName}` : null,
      lineWidthOption,
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
    const localThickness = Number(edge.thickness);
    if (Number.isFinite(localThickness) && localThickness > 0) {
      styleParts.push(`line width=${(localThickness * 0.75).toFixed(2)}pt`);
    } else if (lineWidthOption) {
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

  if (matrixBlocks.length) {
    body += '\n';
  }

  matrixBlocks.forEach((grid, index) => {
    const shiftX = formatShift(grid.x * SCALE);
    const shiftY = formatShift(-grid.y * SCALE);
    const cellScaleValue = Number((grid.cellSize * SCALE).toFixed(2));
    if (!cellScaleValue) {
      return;
    }
    const cellToken = cellScaleValue.toFixed(2);
    body += `    \\begin{scope}[shift={(${shiftX},${shiftY})}]\n`;
    grid.data.forEach((row, rowIndex) => {
      row.forEach((value, colIndex) => {
        const key = String(value);
        const colorName = registerColor(grid.colorMap[key]) || 'black';
        const x = (colIndex * cellScaleValue).toFixed(2);
        const y = (-(rowIndex + 1) * cellScaleValue).toFixed(2);
        body += `      \\fill[${colorName}] (${x},${y}) rectangle ++(${cellToken},${cellToken});\n`;
      });
    });
    body += '    \\end{scope}\n';
    if (index < matrixBlocks.length - 1) {
      body += '\n';
    }
  });

  body += '\\end{tikzpicture}\n';

  const libraryLine = libraries.size ? `\\usetikzlibrary{${Array.from(libraries).join(', ')}}\n` : '';
  const colorBlock = colorDeclarations.length ? `${colorDeclarations.join('\n')}\n` : '';

  return `\\documentclass{standalone}\n\\usepackage{tikz}\n\\usepackage{amsmath}\n\\usepackage{amssymb}\n${libraryLine}${colorBlock}\n\\begin{document}\n${body}\\end{document}`;
}
