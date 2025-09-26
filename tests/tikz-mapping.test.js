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

const centerAlignedStraightDoc = generateTikzDocument(
  nodes,
  [makeBaseEdge()],
  null,
  { edgeLabelAlignment: 'center' }
);
assert.ok(
  centerAlignedStraightDoc.includes('node[pos=0.5, fill=white, inner sep=2pt]{demo}'),
  'Arestas retas centralizadas devem posicionar o label no ponto médio com pos=0.5'
);

const rightAlignedStraightDoc = generateTikzDocument(
  nodes,
  [makeBaseEdge()],
  null,
  { edgeLabelAlignment: 'right' }
);
assert.ok(
  rightAlignedStraightDoc.includes('node[pos=0.75, fill=white, inner sep=2pt]{demo}'),
  'Alinhamento à direita deve deslocar o label para a extremidade com pos=0.75'
);

const leftAlignedStraightDoc = generateTikzDocument(
  nodes,
  [makeBaseEdge()],
  null,
  { edgeLabelAlignment: 'left' }
);
assert.ok(
  leftAlignedStraightDoc.includes('node[pos=0.25, fill=white, inner sep=2pt]{demo}'),
  'Alinhamento à esquerda deve deslocar o label para o início com pos=0.25'
);

const centerAlignedCurveDoc = generateTikzDocument(
  nodes,
  [makeBaseEdge({ shape: 'curva-direita' })],
  null,
  { edgeLabelAlignment: 'center' }
);
assert.ok(
  centerAlignedCurveDoc.includes('node[midway, fill=white, inner sep=2pt, sloped]{demo}'),
  'Arestas curvas centralizadas devem usar midway e sloped para acompanhar a curva'
);

const autoOffsetDoc = generateTikzDocument(
  nodes,
  [
    makeBaseEdge({
      label: { text: 'demo', offset: [10, -6] },
    }),
  ],
  null,
  { edgeLabelAlignment: 'auto' }
);
assert.ok(
  /node\[midway, fill=white, inner sep=2pt, (?:xshift=0\.5cm, yshift=0\.3cm|yshift=0\.3cm, xshift=0\.5cm)\]{demo}/.test(
    autoOffsetDoc
  ),
  'Modo automático deve respeitar deslocamentos configurados nos labels'
);

const nodeBorderDoc = generateTikzDocument(nodes, [makeBaseEdge()], null, {
  edgeLabelAlignment: 'center',
});
assert.ok(
  /\\node\[draw=customColor\d+, circle, fill=customColor\d+/.test(nodeBorderDoc),
  'Nós devem exportar a cor da borda personalizada no TikZ'
);

console.log('All routing mapping tests passed');
