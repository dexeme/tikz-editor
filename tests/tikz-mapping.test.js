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
  [],
  [],
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
  [],
  [],
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
  [],
  [],
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
  [],
  [],
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
  [],
  [],
  null,
  { edgeLabelAlignment: 'auto' }
);
assert.ok(
  /node\[midway, fill=white, inner sep=2pt, (?:xshift=0\.5cm, yshift=0\.3cm|yshift=0\.3cm, xshift=0\.5cm)\]{demo}/.test(
    autoOffsetDoc
  ),
  'Modo automático deve respeitar deslocamentos configurados nos labels'
);

const nodeBorderDoc = generateTikzDocument(nodes, [makeBaseEdge()], [], [], null, {
  edgeLabelAlignment: 'center',
});
assert.ok(
  /\\node\[draw=customColor\d+, [^\]]*fill=customColor\d+/.test(nodeBorderDoc),
  'Nós devem exportar a cor da borda personalizada no TikZ'
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
  'Linhas livres devem exportar com cor personalizada e espessura convertida'
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
  'Linhas tracejadas devem exportar o estilo dashed'
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
  'Linhas fora do frame devem ser ignoradas na exportação'
);

const multilineNodeDoc = generateTikzDocument(
  [
    {
      ...makeNode('C', 80, -40),
      label: 'Primeira linha\nSegunda linha',
    },
  ],
  []
);
assert.ok(
  multilineNodeDoc.includes('{Primeira linha \\\\ Segunda linha}'),
  'Nós com múltiplas linhas devem inserir \\ antes de cada nova linha no LaTeX'
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
  'A matriz deve aplicar um escopo deslocado conforme a posição no canvas'
);
assert.ok(
  /\\fill\[customColor\d+\] \(0\.00,-0\.20\) rectangle \+\+\(0\.20,0\.20\);/.test(
    matrixDoc
  ),
  'As células da matriz devem ser exportadas como retângulos preenchidos com escala convertida'
);
assert.ok(
  matrixDoc.includes('\\definecolor'),
  'As cores personalizadas das matrizes devem ser declaradas no preâmbulo'
);

console.log('All routing mapping tests passed');
