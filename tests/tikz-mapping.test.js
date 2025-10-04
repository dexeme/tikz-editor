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
  return { id, x, y, label: id, shape: 'circle', fontSize: 16 };
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
  'Curva para a direita deve mapear para bend right'
);

const leftCurveDoc = generateTikzDocument(nodes, [makeBaseEdge({ shape: 'curva-esquerda' })]);
assert.ok(
  leftCurveDoc.includes('to[bend left=30]'),
  'Curva para a esquerda deve mapear para bend left'
);

console.log('All routing mapping tests passed');
