// @ts-nocheck

import assert from 'node:assert/strict';

import { generateTikzDocument } from '../src/tikz.js';
import {
  mapPort,
  resolveBendShape,
  resolveOrthogonalTikz,
  isCurvedShape,
  isOrthogonalShape,
} from '../src/routingMaps.js';

function makeNode(id, x, y) {
  return {
    id,
    x,
    y,
    label: id,
    shape: 'circle',
    fontSize: 16,
    color: '#ffffff',
    borderColor: '#1f2937',
  };
}

function makeBaseEdge(overrides = {}) {
  return {
    id: 'edge-test',
    from: 'A',
    to: 'B',
    fromAnchor: 'east',
    toAnchor: 'west',
    style: 'solid',
    direction: '->',
    shape: 'straight',
    bend: 30,
    label: { text: 'demo', position: 'auto' },
    ...overrides,
  };
}

const nodes = [makeNode('A', 0, 0), makeNode('B', 160, 80)];

// mapPort preserves orientation naming
assert.equal(mapPort.north, 'north');
assert.equal(mapPort.east, 'east');
assert.equal(mapPort.northeast, 'north east');
assert.equal(mapPort.northwest, 'north west');
assert.equal(mapPort.southeast, 'south east');
assert.equal(mapPort.southwest, 'south west');

// Orthogonal resolution should match expected TikZ codes
assert.equal(resolveOrthogonalTikz('90-vertical'), '|-');
assert.equal(resolveOrthogonalTikz('90-horizontal'), '-|');
assert.ok(isOrthogonalShape('90-vertical'));
assert.ok(!isOrthogonalShape('straight'));

// Curved resolution mirrors requested orientation mapping
assert.equal(resolveBendShape('curva-direita'), 'bend right');
assert.equal(resolveBendShape('curva-esquerda'), 'bend left');
assert.ok(isCurvedShape('curva-esquerda'));
assert.ok(!isCurvedShape('straight'));

// Exported TikZ document uses corrected orthogonal mapping
const verticalDoc = generateTikzDocument(nodes, [makeBaseEdge({ shape: '90-vertical' })]);
assert.ok(verticalDoc.includes(' |- '), 'Expected vertical orthogonal path to use |-');

const horizontalDoc = generateTikzDocument(nodes, [makeBaseEdge({ shape: '90-horizontal' })]);
assert.ok(horizontalDoc.includes(' -| '), 'Expected horizontal orthogonal path to use -|');

// Curved edges should keep bend orientation stable
const rightCurveDoc = generateTikzDocument(nodes, [makeBaseEdge({ shape: 'curva-direita' })]);
assert.ok(
  rightCurveDoc.includes('to[bend right=30]'),
  'Right curve should map to bend right'
);

const leftCurveDoc = generateTikzDocument(nodes, [makeBaseEdge({ shape: 'curva-esquerda' })]);
assert.ok(
  leftCurveDoc.includes('to[bend left=30]'),
  'Left curve should map to bend left'
);

const centerAlignedStraightDoc = generateTikzDocument(
  nodes,
  [makeBaseEdge()],
  [],
  [],
  null,
  { edgeLabelAlignment: 'center' }
);
assert.ok(
  centerAlignedStraightDoc.includes('node[pos=0.5, fill=white, inner sep=2pt]{demo}'),
  'Centered straight edges should place the label at the midpoint with pos=0.5'
);

const rightAlignedStraightDoc = generateTikzDocument(
  nodes,
  [makeBaseEdge()],
  [],
  [],
  null,
  { edgeLabelAlignment: 'right' }
);
assert.ok(
  rightAlignedStraightDoc.includes('node[pos=0.75, fill=white, inner sep=2pt]{demo}'),
  'Right alignment should move the label to the end with pos=0.75'
);

const leftAlignedStraightDoc = generateTikzDocument(
  nodes,
  [makeBaseEdge()],
  [],
  [],
  null,
  { edgeLabelAlignment: 'left' }
);
assert.ok(
  leftAlignedStraightDoc.includes('node[pos=0.25, fill=white, inner sep=2pt]{demo}'),
  'Left alignment should move the label to the start with pos=0.25'
);

const centerAlignedCurveDoc = generateTikzDocument(
  nodes,
  [makeBaseEdge({ shape: 'curva-direita' })],
  [],
  [],
  null,
  { edgeLabelAlignment: 'center' }
);
assert.ok(
  centerAlignedCurveDoc.includes('node[midway, fill=white, inner sep=2pt, sloped]{demo}'),
  'Centered curved edges should use midway and sloped to follow the curve'
);

const autoOffsetDoc = generateTikzDocument(
  nodes,
  [
    makeBaseEdge({
      label: { text: 'demo', offset: [10, -6] },
    }),
  ],
  [],
  [],
  null,
  { edgeLabelAlignment: 'auto' }
);
assert.ok(
  /node\[midway, fill=white, inner sep=2pt, (?:xshift=0\.5cm, yshift=0\.3cm|yshift=0\.3cm, xshift=0\.5cm)\]{demo}/.test(
    autoOffsetDoc
  ),
  'Automatic mode should respect configured label offsets'
);

const nodeBorderDoc = generateTikzDocument(nodes, [makeBaseEdge()], [], [], null, {
  edgeLabelAlignment: 'center',
});
assert.ok(
  /\\node\[draw=customColor\d+, [^\]]*fill=customColor\d+/.test(nodeBorderDoc),
  'Nodes should export the custom border color in TikZ'
);

const looseLineDoc = generateTikzDocument(
  [],
  [],
  [
    {
      id: 'line-test',
      start: { x: 0, y: 0 },
      end: { x: 160, y: 0 },
      color: '#ef4444',
      thickness: 3,
    },
  ]
);
assert.ok(
  /\\draw\[draw=customColor\d+, line width=2\.25pt\] \(0\.00,0\.00\) -- \(8\.00,0\.00\);/.test(
    looseLineDoc
  ),
  'Loose lines should export with custom color and converted thickness'
);

const dashedLineDoc = generateTikzDocument(
  [],
  [],
  [
    {
      id: 'line-dashed',
      start: { x: 0, y: 0 },
      end: { x: 0, y: 160 },
      color: '#22d3ee',
      thickness: 2,
      style: 'dashed',
    },
  ]
);
assert.ok(
  /\\draw\[dashed, draw=customColor\d+, line width=1\.50pt\]/.test(dashedLineDoc),
  'Dashed lines should export the dashed style'
);

const framedLineDoc = generateTikzDocument(
  [],
  [],
  [
    {
      id: 'line-outside',
      start: { x: -200, y: -200 },
      end: { x: -100, y: -200 },
      color: '#22c55e',
      thickness: 2,
    },
  ],
  [],
  { x: 0, y: 0, width: 120, height: 120 }
);
assert.ok(
  !framedLineDoc.includes('\\draw['),
  'Lines outside the frame should be ignored during export'
);

const multilineNodeDoc = generateTikzDocument(
  [
    {
      ...makeNode('C', 80, -40),
      label: 'First line\nSecond line',
    },
  ],
  []
);
assert.ok(
  multilineNodeDoc.includes('{First line \\\\ Second line}'),
  'Multi-line nodes should insert \\\\ before each new line in LaTeX'
);

const matrixDoc = generateTikzDocument(
  [],
  [],
  [],
  [
    {
      id: 'matrix-1',
      x: 100,
      y: 200,
      data: [
        ['0', '1'],
        ['1', '0'],
      ],
      colorMap: { '0': '#ffffff', '1': '#000000' },
      cellSize: 4,
    },
  ]
);
assert.ok(
  matrixDoc.includes('\\begin{scope}[shift={(5cm,-10cm)}]'),
  'The matrix should apply a shifted scope based on its canvas position'
);
assert.ok(
  /\\fill\[customColor\d+\] \(0\.00,-0\.20\) rectangle \+\+\(0\.20,0\.20\);/.test(
    matrixDoc
  ),
  'Matrix cells should export as filled rectangles with converted scale'
);
assert.ok(
  matrixDoc.includes('\\definecolor'),
  'Custom matrix colors should be declared in the preamble'
);

const textBlockAppearanceDoc = generateTikzDocument(
  [],
  [],
  [],
  [
    {
      id: 'text-appearance',
      x: 0,
      y: 0,
      width: 240,
      height: 120,
      text: 'Styled block',
      fontSize: 20,
      color: '#111827',
      fillColor: '#ffedd5',
      borderColor: '#f97316',
      borderWidth: 4,
      borderStyle: 'dashed',
      showBackground: true,
      opacity: 0.65,
    },
  ]
);
assert.ok(
  /text=customColor\d+/.test(textBlockAppearanceDoc) &&
    /fill=customColor\d+/.test(textBlockAppearanceDoc) &&
    /draw=customColor\d+/.test(textBlockAppearanceDoc),
  'Text blocks should export text, fill, and border colors'
);
assert.ok(
  /\[.*dashed/.test(textBlockAppearanceDoc),
  'Text block border style should propagate to TikZ output'
);
assert.ok(
  textBlockAppearanceDoc.includes('line width=2.40pt'),
  'Text block border width should be converted to pt units'
);
assert.ok(
  textBlockAppearanceDoc.includes('opacity=0.65'),
  'Semi-transparent text blocks should keep their opacity'
);

const rectangleBorderStyleDoc = generateTikzDocument(
  [
    {
      ...makeNode('R', 40, 40),
      shape: 'rectangle',
      borderStyle: 'dotted',
    },
  ],
  []
);
assert.ok(
  /\\node\[draw=customColor\d+, dotted/.test(rectangleBorderStyleDoc),
  'Rectangle nodes should include the requested border style in TikZ output'
);

console.log('All routing mapping tests passed');
