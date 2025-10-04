import { getState } from './state.js';

export function generateTikz() {
    const { graphData } = getState();
    let header = '';
    let body = '\\begin{tikzpicture}[node distance=2cm, auto, >=stealth]\n';

    const scale = 0.05;
    const fontMap = {'12': '\\small', '16': '', '20': '\\large'};
    const definedColors = new Set();

    graphData.nodes.forEach(node => {
        const x = (node.x * scale).toFixed(2);
        const y = (-node.y * scale).toFixed(2);
        
        const colorName = `color${node.id}`;
        if (!definedColors.has(colorName)) {
            const hex = node.color.substring(1);
            const r = parseInt(hex.substring(0, 2), 16);
            const g = parseInt(hex.substring(2, 4), 16);
            const b = parseInt(hex.substring(4, 6), 16);
            header += `\\definecolor{${colorName}}{RGB}{${r},${g},${b}}\n`;
            definedColors.add(colorName);
        }

        let tikzOptions = `draw, ${node.shape}, fill=${colorName}`;
        if (fontMap[node.fontSize]) {
            tikzOptions += `, font=${fontMap[node.fontSize]}`;
        }
        if (node.shape === 'rectangle'){
            tikzOptions += `, minimum width=2cm, minimum height=1cm`;
        }

        body += `    \\node[${tikzOptions}] (${node.id}) at (${x},${y}) {${node.label}};\n`;
    });
    
    if (graphData.edges.length > 0) body += '\n';

    graphData.edges.forEach(edge => {
        let edgeOpts = [edge.direction || '->', edge.style].filter(Boolean).join(', ');
        let path = edge.shape || '--';
        if (path.startsWith('bend')) {
            path = `to[${path}=${edge.bend}]`;
        }
        body += `    \\draw[${edgeOpts}] (${edge.from}) ${path} (${edge.to});\n`;
    });
    
    body += '\\end{tikzpicture}\n';
    
    const finalCode = `\\documentclass{standalone}\n\\usepackage{tikz}\n${header}\n\\begin{document}\n${body}\\end{document}`;
    
    const tikzOutput = document.getElementById('tikzOutput');
    if (tikzOutput) {
        tikzOutput.value = finalCode;
    }
}
