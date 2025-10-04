const FONT_MAP = {
  12: '\\small',
  16: '',
  20: '\\large',
};

const SCALE = 0.05;

export function generateTikzDocument(nodes, edges) {
  const definedColors = new Map();
  let colorDeclarations = '';

  nodes.forEach(node => {
    if (!node.color) return;
    const hex = node.color.replace('#', '');
    const key = `color${node.id}`;
    if (!definedColors.has(key)) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      definedColors.set(key, { r, g, b });
      colorDeclarations += `\\definecolor{${key}}{RGB}{${r},${g},${b}}\n`;
    }
  });

  let body = '\\begin{tikzpicture}[node distance=2cm, auto, >=stealth]\n';

  nodes.forEach(node => {
    const colorName = `color${node.id}`;
    const x = (node.x * SCALE).toFixed(2);
    const y = (-node.y * SCALE).toFixed(2);
    const options = [
      'draw',
      node.shape === 'rectangle' ? 'rectangle, rounded corners=3pt, minimum width=2.4cm, minimum height=1.2cm' : 'circle',
      node.color ? `fill=${colorName}` : null,
      FONT_MAP[node.fontSize] ? `font=${FONT_MAP[node.fontSize]}` : null,
    ].filter(Boolean).join(', ');
    body += `    \\node[${options}] (${node.id}) at (${x},${y}) {${node.label || ''}};\n`;
  });

  if (edges.length) {
    body += '\n';
  }

  edges.forEach(edge => {
    const styleParts = [edge.direction || '->'];
    if (edge.style && edge.style !== 'solid') {
      styleParts.push(edge.style);
    }
    const path = edge.shape?.startsWith('bend')
      ? `to[${edge.shape}=${edge.bend || 30}]`
      : (edge.shape || '--');
    body += `    \\draw[${styleParts.join(', ')}] (${edge.from}) ${path} (${edge.to});\n`;
  });

  body += '\\end{tikzpicture}\n';

  return `\\documentclass{standalone}\n\\usepackage{tikz}\n${colorDeclarations}\n\\begin{document}\n${body}\\end{document}`;
}
