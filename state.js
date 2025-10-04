import { updateUI } from './ui.js';
import { draw } from './canvas.js';
import { generateTikz } from './tikz.js';

const state = {
    canvas: null,
    ctx: null,
    graphData: { nodes: [], edges: [] },
    mode: 'select', // 'select', 'addNode', 'addEdge', 'addEdgeEnd', 'move'
    selected: null, // { type: 'node' | 'edge', item: object }
};

export function getState() {
    return state;
}

export function setState(newState) {
    Object.assign(state, newState);
}

export function setMode(newMode) {
    state.mode = newMode;
    if (newMode !== 'select') {
        state.selected = null;
    }
    updateUI();
}

export function updateAndRedraw(newState) {
    Object.assign(state, newState);
    updateUI();
    draw();
    generateTikz();
}
