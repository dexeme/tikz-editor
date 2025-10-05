export const mapPort = {
  north: 'north',
  south: 'south',
  east: 'east',
  west: 'west',
  northeast: 'north east',
  southeast: 'south east',
  southwest: 'south west',
  northwest: 'north west',
};

export const mapBend = {
  'curva-direita': 'bend right',
  'curva-esquerda': 'bend left',
};

export const mapOrtho = {
  '90-vertical': '|-',
  '90-horizontal': '-|',
};

export function isCurvedShape(shape) {
  return shape === 'curva-direita' || shape === 'curva-esquerda';
}

export function isOrthogonalShape(shape) {
  return shape === '90-vertical' || shape === '90-horizontal';
}

export function resolveBendShape(shape) {
  return mapBend[shape] || null;
}

export function resolveOrthogonalTikz(shape) {
  return mapOrtho[shape] || null;
}

