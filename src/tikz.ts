// @ts-nocheck

import {
  buildStyleOptions,
  createShapeOptions,
  normalizeNodeParameters,
} from './shapes/index.js';
import { mapPort, resolveBendShape, resolveOrthogonalTikz, isCurvedShape } from './routingMaps.js';
import { isNodeInsideFrame, formatCm, pxToCm, PX_TO_CM } from './utils/sceneMetrics.js';
import { findShapeAnchor } from './shapes/anchorRegistry.js';
import { registerBuiltInShapes } from './shapes/definitions.js';

registerBuiltInShapes();

const TEXT_BLOCK_PADDING = 14;
const TEXT_BLOCK_CORNER_RADIUS = 12;
const TEXT_BLOCK_BORDER_WIDTH_DEFAULT = 2;
const TEXT_BLOCK_BORDER_STYLE_DEFAULT = 'solid';
const TEXT_BLOCK_OPACITY_RANGE = { min: 0.1, max: 1 };
const RECTANGLE_SPLIT_PART_NAMES = ['two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];

const formatCoordinate = (value) => {
  const cm = value * PX_TO_CM;
  const normalized = Math.abs(cm) < 1e-4 ? 0 : Number(cm.toFixed(2));
  return normalized.toString();
};

const formatPixelLength = (value, digits = 2) => {
  const formatted = formatCm(value, digits);
  return formatted || '0cm';
};

const formatFontSizePt = value => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }
  const pt = numeric * 0.75;
  const size = Number(pt.toFixed(1));
  if (!Number.isFinite(size) || size <= 0) {
    return null;
  }
  const baseline = Number((size * 1.2).toFixed(1));
  return { size, baseline };
};

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

const isBlockInsideFrame = (block, frame) => {
  if (!frame) return true;
  if (!block || !Number.isFinite(block.width) || !Number.isFinite(block.height)) {
    return false;
  }
  const topLeftInside = isPointInsideFrame({ x: block.x, y: block.y }, frame);
  const bottomRightInside = isPointInsideFrame(
    { x: block.x + block.width, y: block.y + block.height },
    frame
  );
  return topLeftInside && bottomRightInside;
};


export function generateTikzDocument(
  nodes,
  edges,
  lines = [],
  textBlocks = [],
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
  const formatShift = value => formatPixelLength(value);
  const frameOffsetX =
    frame && Number.isFinite(frame.x) ? Number(frame.x) : 0;
  const frameOffsetY =
    frame && Number.isFinite(frame.y) ? Number(frame.y) : 0;
  const normalizeX = value => {
    const numeric = Number(value);
    return (Number.isFinite(numeric) ? numeric : 0) - frameOffsetX;
  };
  const normalizeY = value => {
    const numeric = Number(value);
    return (Number.isFinite(numeric) ? numeric : 0) - frameOffsetY;
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
  let textIdSequence = 1;
  const filteredTextBlocks = Array.isArray(textBlocks)
    ? textBlocks
        .map(block => {
          const xValue = Number(block?.x);
          const yValue = Number(block?.y);
          const widthValue = Number(block?.width);
          const heightValue = Number(block?.height);
          const fontSizeValue = Number(block?.fontSize);
          const borderWidthValue = Number(block?.borderWidth);
          const opacityValue = Number(block?.opacity);
          const normalizedBorderStyle =
            typeof block?.borderStyle === 'string' ? block.borderStyle.trim().toLowerCase() : '';
          const showBackground = block?.showBackground === false ? false : true;
          return {
            id: typeof block?.id === 'string' ? block.id : `text-block-${textIdSequence++}`,
            x: Number.isFinite(xValue) ? xValue : 0,
            y: Number.isFinite(yValue) ? yValue : 0,
            width: Number.isFinite(widthValue) && widthValue > 0 ? widthValue : 200,
            height: Number.isFinite(heightValue) && heightValue > 0 ? heightValue : 120,
            text: block?.text != null ? String(block.text) : '',
            fontSize: Number.isFinite(fontSizeValue) && fontSizeValue > 0 ? fontSizeValue : 16,
            color: typeof block?.color === 'string' && block.color.trim() ? block.color.trim() : null,
            fillColor:
              typeof block?.fillColor === 'string' && block.fillColor.trim()
                ? block.fillColor.trim()
                : null,
            borderColor:
              typeof block?.borderColor === 'string' && block.borderColor.trim()
                ? block.borderColor.trim()
                : null,
            borderWidth:
              Number.isFinite(borderWidthValue) && borderWidthValue >= 0
                ? borderWidthValue
                : TEXT_BLOCK_BORDER_WIDTH_DEFAULT,
            borderStyle:
              normalizedBorderStyle === 'dashed' || normalizedBorderStyle === 'dotted'
                ? normalizedBorderStyle
                : TEXT_BLOCK_BORDER_STYLE_DEFAULT,
            showBackground,
            opacity: Number.isFinite(opacityValue)
              ? Math.min(
                  TEXT_BLOCK_OPACITY_RANGE.max,
                  Math.max(TEXT_BLOCK_OPACITY_RANGE.min, opacityValue)
                )
              : TEXT_BLOCK_OPACITY_RANGE.max,
          };
        })
        .filter(block => isBlockInsideFrame(block, frame))
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

  let body = '\\begin{tikzpicture}[node distance=2cm, auto, >=stealth]\n';

  filteredNodes.forEach(node => {
    const normalizedNode = normalizeNodeParameters(node);

    let labelOverride = null;
    const extraShapeOptions = [];

    if (node.shape === 'rectangle split' && Array.isArray(node.rectangleSplitCells)) {
      const cells = node.rectangleSplitCells;
      const fillEntries = [];
      const segments = [];
      cells.forEach((cell, index) => {
        const rawText = cell?.text != null ? String(cell.text) : '';
        const formattedText = formatNodeLabel(rawText) || '\\,';
        const textColorName = cell?.textColor ? registerColor(cell.textColor) : null;
        const coloredText = textColorName
          ? `\\textcolor{${textColorName}}{${formattedText}}`
          : formattedText;
        if (index === 0) {
          segments.push(coloredText);
        } else {
          const partName = RECTANGLE_SPLIT_PART_NAMES[index - 1] || `part${index + 1}`;
          segments.push(`\\nodepart{${partName}}${coloredText}`);
        }
        if (cell?.fill) {
          const fillName = registerColor(cell.fill);
          fillEntries.push(fillName || 'none');
        } else {
          fillEntries.push('');
        }
      });
      if (segments.length) {
        labelOverride = segments.join('');
      }
      if (fillEntries.some(entry => entry)) {
        const normalizedFills = fillEntries.map(entry => entry || 'none');
        extraShapeOptions.push(`rectangle split part fill={${normalizedFills.join(', ')}}`);
      }
    }

    if (normalizedNode.shape === 'rectangle') {
      if (!normalizedNode.flags.hasExplicitLineWidth) {
        normalizedNode.lineWidth = null;
      }
      if (!normalizedNode.flags.hasExplicitDraw) {
        normalizedNode.draw = null;
      }
      if (!normalizedNode.flags.hasExplicitFill) {
        normalizedNode.fill = null;
      }
    }

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
      ...extraShapeOptions,
      ...styleResult.suffix,
    ].filter(Boolean);

    const x = formatCoordinate(normalizeX(node.x));
    const y = formatCoordinate(-normalizeY(node.y));

    const labelContent =
      labelOverride != null ? labelOverride : formatNodeLabel(normalizedNode.label);
    body += `    \\node[${optionSegments.join(', ')}] (${node.id}) at (${x},${y}) {${labelContent}};\n`;
  });

  if (filteredEdges.length || filteredLines.length) {
    body += '\n';
  }

  if (filteredTextBlocks.length) {
    if (!body.endsWith('\n\n')) {
      body += '\n';
    }
    filteredTextBlocks.forEach(block => {
      const textWidthPx = Math.max(block.width - TEXT_BLOCK_PADDING * 2, 1);
      const textWidthOption = formatPixelLength(textWidthPx, 2);
      const fontSpec = formatFontSizePt(block.fontSize);
      const roundedCorner = formatPixelLength(TEXT_BLOCK_CORNER_RADIUS, 2);
      const paddingOption = formatPixelLength(TEXT_BLOCK_PADDING, 2);
      const styleOptions = [
        'rectangle',
        `rounded corners=${roundedCorner}`,
        'align=left',
        'anchor=north west',
        `text width=${textWidthOption}`,
        `inner sep=${paddingOption}`,
        `minimum width=${formatPixelLength(block.width, 2)}`,
        `minimum height=${formatPixelLength(block.height, 2)}`,
      ];
      const borderStyle = block.borderStyle === 'dashed'
        ? 'dashed'
        : block.borderStyle === 'dotted'
          ? 'dotted'
          : null;
      if (borderStyle) {
        styleOptions.push(borderStyle);
      }
      if (fontSpec) {
        styleOptions.push(`font=\\fontsize{${fontSpec.size}}{${fontSpec.baseline}}\\selectfont`);
      }
      if (block.color) {
        const colorName = registerColor(block.color);
        if (colorName) {
          styleOptions.push(`text=${colorName}`);
        }
      }
      const fillName = block.showBackground === false ? null : registerColor(block.fillColor);
      if (fillName) {
        styleOptions.push(`fill=${fillName}`);
      } else {
        styleOptions.push('fill=none');
      }
      const borderWidthValue = Number(block.borderWidth);
      const borderColorName = registerColor(block.borderColor);
      if (Number.isFinite(borderWidthValue) && borderWidthValue > 0) {
        styleOptions.push(borderColorName ? `draw=${borderColorName}` : 'draw');
        styleOptions.push(`line width=${(borderWidthValue * 0.6).toFixed(2)}pt`);
      } else {
        styleOptions.push('draw=none');
      }
      const blockOpacity = Number(block.opacity);
      if (Number.isFinite(blockOpacity) && blockOpacity > 0 && blockOpacity < 1) {
        styleOptions.push(`opacity=${Math.min(1, Math.max(0.05, blockOpacity)).toFixed(2)}`);
      }
      const x = formatCoordinate(normalizeX(block.x));
      const y = formatCoordinate(-normalizeY(block.y));
      const content = formatNodeLabel(block.text);
      body += `    \\node[${styleOptions.join(', ')}] (${block.id}) at (${x},${y}) {${content}};\n`;
    });
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
      const shiftXCm = pxToCm(offsetX);
      const shiftYCm = pxToCm(offsetY);
      const normalizedShiftX = Number.isFinite(shiftXCm) ? Number(shiftXCm.toFixed(2)) : 0;
      const normalizedShiftY = Number.isFinite(shiftYCm) ? Number((-shiftYCm).toFixed(2)) : 0;
      if (normalizedShiftX) {
        labelOptions.push(`xshift=${normalizedShiftX}cm`);
      }
      if (normalizedShiftY) {
        labelOptions.push(`yshift=${normalizedShiftY}cm`);
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
    const startX = formatCoordinate(normalizeX(line.start.x));
    const startY = formatCoordinate(-normalizeY(line.start.y));
    const endX = formatCoordinate(normalizeX(line.end.x));
    const endY = formatCoordinate(-normalizeY(line.end.y));
    body += `    \\draw${optionsClause} (${startX},${startY}) -- (${endX},${endY});\n`;
  });

  if (matrixBlocks.length) {
    body += '\n';
  }

  matrixBlocks.forEach((grid, index) => {
    const shiftX = formatShift(normalizeX(grid.x));
    const shiftY = formatShift(-normalizeY(grid.y));
    const cellSizeCm = pxToCm(grid.cellSize);
    if (!Number.isFinite(cellSizeCm) || cellSizeCm <= 0) {
      return;
    }
    const cellToken = Number(cellSizeCm.toFixed(2)).toString();
    body += `    \\begin{scope}[shift={(${shiftX},${shiftY})}]\n`;
    grid.data.forEach((row, rowIndex) => {
      row.forEach((value, colIndex) => {
        const key = String(value);
        const colorName = registerColor(grid.colorMap[key]) || 'black';
        const x = Number((colIndex * cellSizeCm).toFixed(2)).toString();
        const y = Number((-(rowIndex + 1) * cellSizeCm).toFixed(2)).toString();
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
