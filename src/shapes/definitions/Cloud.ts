// @ts-nocheck

// This shape is a cloud, drawn to tightly fit the node contents (strictly speaking, using an ellipse which tightly fits the node contents – including any inner sep).

// (-tikz- diagram)

// \usetikzlibrary {shapes.symbols}
// \begin{tikzpicture}
//   \node[cloud, draw, fill=gray!20, aspect=2] {ABC};
//   \node[cloud, draw, fill=gray!20] at (1.5,0) {D};
// \end{tikzpicture}
// A cloud should be thought of as having a number of “puffs”, which are the individual arcs drawn around the border. There are pgf keys to specify how the cloud is drawn (to use these keys in TikZ, simply remove the /pgf/ path).

// /pgf/cloud puffs=⟨integer⟩
// (no default, initially 10)

// Sets the number of puffs for the cloud.

// /pgf/cloud puff arc=⟨angle⟩
// (no default, initially 135)

// Sets the length of the puff arc (in degrees). A shorter arc can produce better looking joins between puffs for larger line widths.

// Like the diamond shape, the cloud shape also uses the aspect key to determine the ratio of the width and the height of the cloud. However, there may be circumstances where it may be undesirable to continually specify the aspect for the cloud. Therefore, the following key is implemented:

// /pgf/cloud ignores aspect=⟨boolean⟩
// (default true)

// Instruct pgf to ignore the aspect key. Internally, the TeX-if \ifpgfcloudignoresaspect is set appropriately. The initial value is false.

// (-tikz- diagram)

// \usetikzlibrary {shapes.symbols}
// \begin{tikzpicture}[aspect=1, every node/.style={cloud, cloud puffs=11, draw}]
//   \node [fill=gray!20]                                {rain};
//   \node [cloud ignores aspect, fill=white] at (1.5,0) {snow};
// \end{tikzpicture}
// Any minimum size requirements are applied to the “circum-ellipse”, which is the ellipse which passes through all the midpoints of the puff arcs. These requirements are considered after any aspect specification is applied.

// (-tikz- diagram)

// \usetikzlibrary {shapes.symbols}
// \begin{tikzpicture}
//   \draw [help lines] grid (3,2);
//   \draw [blue, dashed] (1.5, 1) ellipse (1.5cm and 1cm);
//   \node [cloud, cloud puffs=9, draw, minimum width=3cm, minimum height=2cm]
//     at (1.5, 1) {};
// \end{tikzpicture}
// The anchors for the cloud shape are shown below for a cloud with eleven puffs. Anchor 70 is an example of a border anchor.

// (-tikz- diagram)

// copy\usetikzlibrary {shapes.symbols}
// \Huge
// \begin{tikzpicture}
//   \node[name=s, shape=cloud, style=shape example, cloud puffs=11, aspect=1.5,
//        cloud puff arc=120,inner ysep=1cm] {Cloud\vrule width 1pt height 2cm};
//   \foreach \anchor/\placement in
//    {puff 1/above, puff 2/above,  puff 3/above,  puff 4/below,
//     puff 5/left,  puff 6/below,  puff 7/below,  puff 8/right,
//     puff 9/below, puff 10/above, puff 11/above, 70/right,
//     center/above, base/below,    mid/right,     text/left,
//     north/below,  south/below,   east/above,    west/above,
//     north west/left,             north east/right,
//     south west/below,            south east/below}
//      \draw[shift=(s.\anchor)] plot[mark=x] coordinates{(0,0)}
//        node[\placement] {\scriptsize\texttt{(s.\anchor)}};
// \end{tikzpicture}

import { createSimpleShape } from '../core.js';
import { registerShape } from '../registry.js';
import { registerShapeAnchors } from '../anchorRegistry.js';
import { getNodeDimensions } from '../../utils/sceneMetrics.js';

const ALIGN_CENTER = 'align=center';

const ratioPoint = (sx, sy) => node => {
  const { halfWidth = 0, halfHeight = 0 } = getNodeDimensions(node) ?? {};
  return {
    x: node.x + halfWidth * sx,
    y: node.y - halfHeight * sy,
  };
};

const MID_OFFSET = 0.075131;
const DIAGONAL_RATIO = 0.714476;
const DIAGONAL_VERTICAL_RATIO = 0.699002;
const PUFF_RATIOS = [
  { id: 'puff 1', sx: 0, sy: 1 },
  { id: 'puff 2', sx: -0.597326, sy: 0.810173 },
  { id: 'puff 3', sx: -0.967660, sy: 0.312055 },
  { id: 'puff 4', sx: -0.967660, sy: -0.312055 },
  { id: 'puff 5', sx: -0.597326, sy: -0.810173 },
  { id: 'puff 6', sx: 0, sy: -1 },
  { id: 'puff 7', sx: 0.597326, sy: -0.810173 },
  { id: 'puff 8', sx: 0.967660, sy: -0.312055 },
  { id: 'puff 9', sx: 0.967660, sy: 0.312055 },
  { id: 'puff 10', sx: 0.597326, sy: 0.810173 },
];

const cloudAnchors = [
  {
    id: 'center',
    tikz: 'center',
    isConnectable: false,
    getPoint: node => ({ x: node.x, y: node.y }),
  },
  {
    id: 'text',
    tikz: 'text',
    isConnectable: false,
    aliases: ['t'],
    getPoint: node => ({ x: node.x, y: node.y }),
  },
  {
    id: 'mid',
    tikz: 'mid',
    isConnectable: false,
    aliases: ['m'],
    getPoint: ratioPoint(0, MID_OFFSET),
  },
  {
    id: 'base',
    tikz: 'base',
    isConnectable: false,
    aliases: ['b'],
    getPoint: node => ({ x: node.x, y: node.y }),
  },
  {
    id: 'north',
    tikz: 'north',
    isConnectable: true,
    aliases: ['n'],
    getPoint: ratioPoint(0, 1),
  },
  {
    id: 'south',
    tikz: 'south',
    isConnectable: true,
    aliases: ['s'],
    getPoint: ratioPoint(0, -1),
  },
  {
    id: 'east',
    tikz: 'east',
    isConnectable: true,
    aliases: ['e'],
    getPoint: ratioPoint(1, 0),
  },
  {
    id: 'west',
    tikz: 'west',
    isConnectable: true,
    aliases: ['w'],
    getPoint: ratioPoint(-1, 0),
  },
  {
    id: 'north east',
    tikz: 'north east',
    isConnectable: true,
    aliases: ['ne', 'northeast'],
    getPoint: ratioPoint(DIAGONAL_RATIO, DIAGONAL_VERTICAL_RATIO),
  },
  {
    id: 'north west',
    tikz: 'north west',
    isConnectable: true,
    aliases: ['nw', 'northwest'],
    getPoint: ratioPoint(-DIAGONAL_RATIO, DIAGONAL_VERTICAL_RATIO),
  },
  {
    id: 'south east',
    tikz: 'south east',
    isConnectable: true,
    aliases: ['se', 'southeast'],
    getPoint: ratioPoint(DIAGONAL_RATIO, -DIAGONAL_VERTICAL_RATIO),
  },
  {
    id: 'south west',
    tikz: 'south west',
    isConnectable: true,
    aliases: ['sw', 'southwest'],
    getPoint: ratioPoint(-DIAGONAL_RATIO, -DIAGONAL_VERTICAL_RATIO),
  },
  {
    id: '70',
    tikz: '70',
    isConnectable: true,
    getPoint: ratioPoint(0.168649, 0.906704),
  },
  ...PUFF_RATIOS.map(anchor => ({
    id: anchor.id,
    tikz: anchor.id,
    isConnectable: true,
    getPoint: ratioPoint(anchor.sx, anchor.sy),
  })),
];

export function registerCloud() {
  registerShape(
    'cloud',
    createSimpleShape(
      [
        'cloud',
        'cloud puffs=18', // Cloud puff count requirement
        'minimum width=2.8cm',
        'minimum height=1.8cm',
        ALIGN_CENTER,
      ],
      ['shapes.symbols']
    )
  );
  registerShapeAnchors('cloud', cloudAnchors);
}
