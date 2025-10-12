// @ts-nocheck

import {
  buildStyleOptions,
  createShapeOptions,
  normalizeNodeParameters,
} from './shapes/index.js';
import { mapPort, resolveBendShape, resolveOrthogonalTikz, isCurvedShape } from './routingMaps.js';
import { isNodeInsideFrame } from './utils/sceneMetrics.js';
import { findShapeAnchor } from './shapes/anchorRegistry.js';
import { registerBuiltInShapes } from './shapes/definitions.js';

registerBuiltInShapes();

const SCALE = 0.05;

const resolveTikzAnchor = (node, anchorId) => {
  if (!anchorId) {
    return null;
  }
  if (node && typeof node.shape === 'string') {
    try {
      const definition = findShapeAnchor(node.shape, anchorId);
      if (definition) {
        return definition.tikz;
      }
    } catch (error) {
      // ignore lookup errors and fall back to defaults
    }
  }
  return mapPort[anchorId] || anchorId;
};

const isPointInsideFrame = (point, frame) => {
  if (!frame) return true;
  const frameX = Number(frame?.x);
  const frameY = Number(frame?.y);
  const frameWidth = Number(frame?.width);
  const frameHeight = Number(frame?.height);
  if (
    !Number.isFinite(frameX) ||
    !Number.isFinite(frameY) ||
    !Number.isFinite(frameWidth) ||
    !Number.isFinite(frameHeight)
  ) {
    return false;
  }
  const x = Number(point?.x);
  const y = Number(point?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return false;
  }
  const frameRight = frameX + frameWidth;
  const frameBottom = frameY + frameHeight;
  return x >= frameX && x <= frameRight && y >= frameY && y <= frameBottom;
};

export function generateTikzDocument(
  nodes,
  edges,
  lines = [],
  matrixGrids = [],
  frame = null,
  options = {}
) {
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
  const filteredLines = Array.isArray(lines)
    ? lines
        .map(line => ({
          id: line.id,
          start: {
            x: Number(line.start?.x) || 0,
            y: Number(line.start?.y) || 0,
          },
          end: {
            x: Number(line.end?.x) || 0,
            y: Number(line.end?.y) || 0,
          },
          color: line.color,
          style:
            line.style === 'dashed' || line.style === 'dotted'
              ? line.style
              : 'solid',
          thickness: line.thickness,
        }))
        .filter(line => isPointInsideFrame(line.start, frame) && isPointInsideFrame(line.end, frame))
    : [];
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
    const normalizedNode = normalizeNodeParameters(node);
    const styleResult = buildStyleOptions(normalizedNode, { registerColor });
    styleResult.libraries.forEach(lib => libraries.add(lib));

    const shapeParameters = {
      id: node.id,
      label: normalizedNode.label,
      fill: normalizedNode.fill,
      draw: normalizedNode.draw,
      lineWidth: normalizedNode.lineWidth,
      fontSize: normalizedNode.fontSize,
      cornerRadius: normalizedNode.cornerRadius,
      opacity: normalizedNode.opacity,
      shadow: normalizedNode.shadow,
      size: normalizedNode.size,
      flags: normalizedNode.flags,
      raw: node,
    };

    const shapeResult = createShapeOptions(normalizedNode.shape, shapeParameters, {
      registerColor,
    });
    shapeResult.libraries.forEach(lib => libraries.add(lib));

    const optionSegments = [
      ...styleResult.prefix,
      ...shapeResult.options,
      ...styleResult.suffix,
    ].filter(Boolean);

    const x = (node.x * SCALE).toFixed(2);
    const y = (-node.y * SCALE).toFixed(2);

    body += `    \\node[${optionSegments.join(', ')}] (${node.id}) at (${x},${y}) {${formatNodeLabel(normalizedNode.label)}};\n`;
  });

  if (filteredEdges.length || filteredLines.length) {
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
    const fromNode = nodeMap.get(fromNodeId);
    const toNode = nodeMap.get(toNodeId);
    const fromAnchor = edge.fromAnchor || edge.source?.portId;
    const toAnchor = edge.toAnchor || edge.target?.portId;
    const fromAnchorName = fromAnchor ? resolveTikzAnchor(fromNode, fromAnchor) : null;
    const toAnchorName = toAnchor ? resolveTikzAnchor(toNode, toAnchor) : null;
    const fromRef = fromAnchor ? `${fromNodeId}.${fromAnchorName}` : fromNodeId;
    const toRef = toAnchor ? `${toNodeId}.${toAnchorName}` : toNodeId;
    body += `    \\draw[${styleParts.join(', ')}] (${fromRef}) ${path}${labelSegment} (${toRef});\n`;
  });

  filteredLines.forEach(line => {
    const colorName = registerColor(line.color);
    const thicknessValue = Number(line.thickness);
    const parts = [];
    if (line.style === 'dashed' || line.style === 'dotted') {
      parts.push(line.style);
    }
    if (colorName) {
      parts.push(`draw=${colorName}`);
    }
    if (Number.isFinite(thicknessValue) && thicknessValue > 0) {
      parts.push(`line width=${(thicknessValue * 0.75).toFixed(2)}pt`);
    } else if (lineWidthOption) {
      parts.push(lineWidthOption);
    }
    const optionsClause = parts.length ? `[${parts.join(', ')}]` : '';
    const startX = (line.start.x * SCALE).toFixed(2);
    const startY = (-line.start.y * SCALE).toFixed(2);
    const endX = (line.end.x * SCALE).toFixed(2);
    const endY = (-line.end.y * SCALE).toFixed(2);
    body += `    \\draw${optionsClause} (${startX},${startY}) -- (${endX},${endY});\n`;
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
