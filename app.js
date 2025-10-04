import { setMode, getState, setState } from './state.js';
import { initUI, updateUI } from './ui.js';
import { initCanvas, draw, getNodeAt, getEdgeAt } from './canvas.js';
import { generateTikz } from './tikz.js';
import { distToSegment } from './geometry.js';

// --- Global State for this module ---
let movingNode = null;
let isDragging = false;
let startX, startY;
let edgeStartNode = null;

// --- Event Handlers ---
function handleMouseDown(e) {
    const { canvas } = getState();
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const state = getState();
    const clickedNode = getNodeAt(x, y);

    switch (state.mode) {
        case 'select':
            const clickedEdge = !clickedNode && getEdgeAt(x, y);
            if (clickedNode) {
                setState({ selected: { type: 'node', item: clickedNode } });
            } else if (clickedEdge) {
                setState({ selected: { type: 'edge', item: clickedEdge } });
            } else {
                setState({ selected: null });
            }
            break;
        case 'move':
            movingNode = clickedNode;
            if (movingNode) {
                isDragging = true;
                startX = x;
                startY = y;
            }
            break;
        case 'addNode':
            if (!clickedNode) {
                const newNode = {
                    id: `node${Date.now()}`, x, y,
                    label: 'Novo Nó', color: '#d1d5db', shape: 'circle', fontSize: '16'
                };
                state.graphData.nodes.push(newNode);
                setState({ selected: { type: 'node', item: newNode }, mode: 'select' });
            }
            break;
        case 'addEdge':
            if (clickedNode) {
                edgeStartNode = clickedNode;
                setMode('addEdgeEnd');
            }
            break;
        case 'addEdgeEnd':
            if (clickedNode && clickedNode.id !== edgeStartNode.id) {
                const newEdge = {
                    id: `edge${Date.now()}`,
                    from: edgeStartNode.id, to: clickedNode.id,
                    style: 'solid', direction: '->', shape: '--', bend: '30'
                };
                state.graphData.edges.push(newEdge);
                setState({ selected: { type: 'edge', item: newEdge }, mode: 'select' });
            } else {
                setMode('addEdge');
            }
            break;
    }
    updateUI();
}

function handleMouseMove(e) {
    if (!isDragging || !movingNode) return;
    const { canvas } = getState();
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    movingNode.x += x - startX;
    movingNode.y += y - startY;
    startX = x;
    startY = y;
    
    draw();
    generateTikz();
}

function handleMouseUp() {
    if (isDragging) {
        isDragging = false;
        movingNode = null;
        draw();
    }
}

// --- Initialization ---
function init() {
    const canvas = document.getElementById('tikzCanvas');
    const ctx = canvas.getContext('2d');
    setState({ canvas, ctx });

    initUI();
    initCanvas();
    
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('mouseout', handleMouseUp);
    window.addEventListener('resize', () => {
        const { resizeCanvas } = require('./canvas.js');
        resizeCanvas();
    });

    setMode('select'); // Initial mode
}

// Start the application
init();
