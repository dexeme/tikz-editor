import { setMode, getState, updateAndRedraw } from './state.js';
import { generateTikz } from './tikz.js';
import { draw } from './canvas.js';

const dom = {};

function queryElements() {
    dom.modeButtons = {
        select: document.getElementById('selectBtn'),
        addNode: document.getElementById('addNodeBtn'),
        addEdge: document.getElementById('addEdgeBtn'),
        move: document.getElementById('moveBtn'),
    };
    dom.deleteBtn = document.getElementById('deleteBtn');
    dom.clearBtn = document.getElementById('clearBtn');
    dom.copyBtn = document.getElementById('copyBtn');
    dom.tikzOutput = document.getElementById('tikzOutput');
    dom.status = document.getElementById('status');
    
    dom.nodeControls = document.getElementById('node-controls');
    dom.edgeControls = document.getElementById('edge-controls');
    
    dom.nodeLabelInput = document.getElementById('nodeLabel');
    dom.nodeColorInput = document.getElementById('nodeColor');
    dom.nodeShapeInput = document.getElementById('nodeShape');
    dom.fontSizeInput = document.getElementById('fontSize');
    
    dom.edgeStyleInput = document.getElementById('edgeStyle');
    dom.edgeDirInput = document.getElementById('edgeDir');
    dom.edgeShapeInput = document.getElementById('edgeShape');
    dom.edgeBendInput = document.getElementById('edgeBend');
}

function populateNodeControls(node) {
    dom.nodeLabelInput.value = node.label;
    dom.nodeColorInput.value = node.color;
    dom.nodeShapeInput.value = node.shape;
    dom.fontSizeInput.value = node.fontSize;
}

function populateEdgeControls(edge) {
    dom.edgeStyleInput.value = edge.style;
    dom.edgeDirInput.value = edge.direction;
    dom.edgeShapeInput.value = edge.shape;
    dom.edgeBendInput.value = edge.bend;
}

function updateSelectedProperties() {
    const { selected } = getState();
    if (!selected) return;

    if (selected.type === 'node') {
        const node = selected.item;
        node.label = dom.nodeLabelInput.value;
        node.color = dom.nodeColorInput.value;
        node.shape = dom.nodeShapeInput.value;
        node.fontSize = dom.fontSizeInput.value;
    } else if (selected.type === 'edge') {
        const edge = selected.item;
        edge.style = dom.edgeStyleInput.value;
        edge.direction = dom.edgeDirInput.value;
        edge.shape = dom.edgeShapeInput.value;
        edge.bend = dom.edgeBendInput.value;
    }
    draw();
    generateTikz();
}

export function updateUI() {
    const { mode, selected, canvas } = getState();

    Object.values(dom.modeButtons).forEach(btn => btn.classList.remove('ring-2', 'ring-offset-2', 'ring-offset-gray-800', 'ring-white'));
    if (dom.modeButtons[mode]) {
        dom.modeButtons[mode].classList.add('ring-2', 'ring-offset-2', 'ring-offset-gray-800', 'ring-white');
    }

    canvas.style.cursor = 'default';
    if (mode === 'addNode') canvas.style.cursor = 'crosshair';
    if (mode === 'move') canvas.style.cursor = 'move';
    if (mode === 'addEdge' || mode === 'addEdgeEnd') canvas.style.cursor = 'pointer';

    const statusMessages = {
        select: 'Clique em um elemento para selecioná-lo.',
        addNode: 'Clique no canvas para adicionar um nó.',
        addEdge: 'Clique no nó de origem.',
        addEdgeEnd: `Selecione o nó de destino.`,
        move: 'Clique e arraste um nó para movê-lo.'
    };
    dom.status.textContent = statusMessages[mode] || '';
    
    dom.deleteBtn.disabled = !selected;
    
    dom.nodeControls.classList.remove('active');
    dom.edgeControls.classList.remove('active');

    if (selected) {
        if (selected.type === 'node') {
            dom.nodeControls.classList.add('active');
            populateNodeControls(selected.item);
        } else if (selected.type === 'edge') {
            dom.edgeControls.classList.add('active');
            populateEdgeControls(selected.item);
        }
    }
    
    draw();
    generateTikz();
}

function setupEventListeners() {
    Object.keys(dom.modeButtons).forEach(key => {
        dom.modeButtons[key].addEventListener('click', () => setMode(key));
    });

    dom.clearBtn.addEventListener('click', () => {
        updateAndRedraw({
            graphData: { nodes: [], edges: [] },
            selected: null,
            mode: 'select'
        });
    });

    dom.deleteBtn.addEventListener('click', () => {
        const { selected, graphData } = getState();
        if (!selected) return;
        if (selected.type === 'node') {
            graphData.nodes = graphData.nodes.filter(n => n.id !== selected.item.id);
            graphData.edges = graphData.edges.filter(e => e.from !== selected.item.id && e.to !== selected.item.id);
        } else if (selected.type === 'edge') {
            graphData.edges = graphData.edges.filter(e => e.id !== selected.item.id);
        }
        updateAndRedraw({ selected: null });
    });

    dom.copyBtn.addEventListener('click', () => {
        dom.tikzOutput.select();
        document.execCommand('copy');
        dom.copyBtn.textContent = 'Copiado!';
        setTimeout(() => { dom.copyBtn.textContent = 'Copiar'; }, 2000);
    });
    
    [dom.nodeLabelInput, dom.nodeColorInput, dom.nodeShapeInput, dom.fontSizeInput, dom.edgeStyleInput, dom.edgeDirInput, dom.edgeShapeInput, dom.edgeBendInput]
        .forEach(el => el.addEventListener('input', updateSelectedProperties));
}

export function initUI() {
    queryElements();
    setupEventListeners();
}
