import {
  createApp,
  ref,
  reactive,
  computed,
  watch,
  onMounted,
  onUnmounted,
  nextTick,
} from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js';
import { createCanvasRenderer, TEXT_BLOCK_CONSTRAINTS } from './src/canvas.js';
import { generateTikzDocument } from './src/tikz.js';

const defaultNode = shape => ({
  label: 'Novo nó',
  color: '#f8fafc',
  borderColor: '#94a3b8',
  shape: shape || 'circle',
  fontSize: '16',
});

let nodeSequence = 1;
let edgeSequence = 1;
let textSequence = 1;

const DEFAULT_EDGE_THICKNESS = 2.5;

function makeNode(x, y, shape) {
  return normalizeNode({
    id: `node-${nodeSequence++}`,
    x,
    y,
    ...defaultNode(shape),
  });
}

function makeEdge(from, to) {
  return {
    id: `edge-${edgeSequence++}`,
    from,
    to,
    style: 'solid',
    direction: '->',
    shape: 'straight',
    bend: 30,
    label: null,
    color: '#94a3b8',
  };
}

function normalizeEdge(edge) {
  const legacyShapeMap = {
    '--': 'straight',
    '|-': '90-horizontal',
    '-|': '90-vertical',
    'bend left': 'curva-esquerda',
    'bend right': 'curva-direita',
  };
  if (legacyShapeMap[edge.shape]) {
    edge.shape = legacyShapeMap[edge.shape];
  }
  if (!edge.shape) {
    edge.shape = 'straight';
  }
  if (typeof edge.label === 'string') {
    edge.label = edge.label ? { text: edge.label, position: 'auto' } : null;
  }
  if (!edge.color) {
    edge.color = '#94a3b8';
  }
  return edge;
}

function normalizeNode(node = {}) {
  const normalized = { ...node };
  if (!normalized.color) {
    normalized.color = '#f8fafc';
  }
  if (!normalized.borderColor) {
    normalized.borderColor = '#94a3b8';
  }
  if (!normalized.shape) {
    normalized.shape = 'circle';
  }
  if (!normalized.fontSize) {
    normalized.fontSize = '16';
  }
  return normalized;
}

function makeTextBlock(x, y, width, height) {
  return {
    id: `text-${textSequence++}`,
    x,
    y,
    width,
    height,
    text: 'Novo texto',
    fontSize: 16,
    fontWeight: 500,
  };
}

function refreshSequencesFromState(nodes = [], edges = [], textBlocks = []) {
  const extractMax = (items, pattern) => {
    return items.reduce((max, item) => {
      if (typeof item.id !== 'string') return max;
      const match = item.id.match(pattern);
      if (!match) return max;
      const value = Number(match[1]);
      return Number.isFinite(value) ? Math.max(max, value) : max;
    }, 0);
  };
  const maxNode = extractMax(nodes, /^node-(\d+)$/);
  const maxEdge = extractMax(edges, /^edge-(\d+)$/);
  const maxText = extractMax(textBlocks, /^text-(\d+)$/);
  nodeSequence = Math.max(nodeSequence, maxNode + 1);
  edgeSequence = Math.max(edgeSequence, maxEdge + 1);
  textSequence = Math.max(textSequence, maxText + 1);
}

createApp({
  setup() {
    const state = reactive({
      nodes: [],
      edges: [],
      textBlocks: [],
      mode: 'select',
      selected: null,
      edgeStart: null,
      dragContext: null,
      dragMoved: false,
      pointer: null,
      frame: null,
      camera: {
        scale: 1,
        offsetX: 0,
        offsetY: 0,
      },
      cameraDrag: null,
      guides: { vertical: null, horizontal: null },
      edgeThickness: DEFAULT_EDGE_THICKNESS,
      edgeLabelAlignment: 'right',
    });

    const panModifierActive = ref(false);

    const history = reactive({
      past: [],
      future: [],
    });

    const canUndo = computed(() => history.past.length > 1);
    const canRedo = computed(() => history.future.length > 0);

    const availableShapes = [
      { id: 'rectangle', label: 'Retângulo' },
      { id: 'circle', label: 'Círculo' },
      { id: 'decision', label: 'Nó de decisão' },
      { id: 'diamond', label: 'Losango' },
      { id: 'triangle', label: 'Triângulo' },
    ];

    const tools = [
      { mode: 'select', label: 'Selecionar', icon: '🖱️', accent: 'purple' },
      { mode: 'addText', label: 'Caixa de texto', icon: '📝', accent: 'cyan' },
      { mode: 'move', label: 'Mover', icon: '✋', accent: 'amber' },
      { mode: 'delete', label: 'Remover', icon: '🗑️', accent: 'red' },
    ];

    const templates = [
      {
        id: 'blank-canvas',
        name: 'Canvas em branco',
        description: 'Limpe o editor e comece um diagrama do zero.',
        nodes: [],
        edges: [],
        textBlocks: [],
      },
      {
        id: 'linear-flow',
        name: 'Fluxo linear de etapas',
        description: 'Modelo com três estágios sequenciais para fluxos simples.',
        nodes: [
          {
            id: 'tpl-linear-start',
            label: 'Ideia inicial',
            color: '#bae6fd',
            shape: 'rectangle',
            fontSize: '16',
            x: 260,
            y: 220,
          },
          {
            id: 'tpl-linear-review',
            label: 'Revisão e ajuste',
            color: '#fef3c7',
            shape: 'rectangle',
            fontSize: '16',
            x: 520,
            y: 220,
          },
          {
            id: 'tpl-linear-delivery',
            label: 'Entrega final',
            color: '#bbf7d0',
            shape: 'rectangle',
            fontSize: '16',
            x: 780,
            y: 220,
          },
        ],
        edges: [
          {
            id: 'tpl-linear-e1',
            from: 'tpl-linear-start',
            to: 'tpl-linear-review',
            fromAnchor: 'east',
            toAnchor: 'west',
            style: 'solid',
            direction: '->',
            shape: 'straight',
            bend: 30,
            label: { text: 'Planejar', position: 'auto' },
          },
          {
            id: 'tpl-linear-e2',
            from: 'tpl-linear-review',
            to: 'tpl-linear-delivery',
            fromAnchor: 'east',
            toAnchor: 'west',
            style: 'solid',
            direction: '->',
            shape: 'straight',
            bend: 30,
            label: { text: 'Executar', position: 'auto' },
          },
        ],
        textBlocks: [
          {
            id: 'tpl-linear-note',
            x: 240,
            y: 320,
            width: 360,
            height: 120,
            text: 'Use este fluxo para documentar rapidamente pipelines simples. Dê duplo clique para adaptar os rótulos.',
            fontSize: 16,
            fontWeight: 500,
          },
        ],
      },
      {
        id: 'decision-tree',
        name: 'Árvore de decisão',
        description: 'Estrutura ramificada com decisão e dois resultados.',
        nodes: [
          {
            id: 'tpl-decision-start',
            label: 'Situação atual',
            color: '#e0f2fe',
            shape: 'circle',
            fontSize: '16',
            x: 360,
            y: 220,
          },
          {
            id: 'tpl-decision-choice',
            label: 'Tomar decisão?',
            color: '#fde68a',
            shape: 'decision',
            fontSize: '16',
            x: 560,
            y: 220,
          },
          {
            id: 'tpl-decision-yes',
            label: 'Resultado positivo',
            color: '#bbf7d0',
            shape: 'rectangle',
            fontSize: '16',
            x: 760,
            y: 140,
          },
          {
            id: 'tpl-decision-no',
            label: 'Plano alternativo',
            color: '#fecdd3',
            shape: 'rectangle',
            fontSize: '16',
            x: 760,
            y: 300,
          },
        ],
        edges: [
          {
            id: 'tpl-decision-e1',
            from: 'tpl-decision-start',
            to: 'tpl-decision-choice',
            fromAnchor: 'east',
            toAnchor: 'west',
            style: 'solid',
            direction: '->',
            shape: 'straight',
            bend: 30,
            label: null,
          },
          {
            id: 'tpl-decision-e2',
            from: 'tpl-decision-choice',
            to: 'tpl-decision-yes',
            fromAnchor: 'north',
            toAnchor: 'west',
            style: 'solid',
            direction: '->',
            shape: '90-horizontal',
            bend: 30,
            label: { text: 'Sim', position: 'auto' },
          },
          {
            id: 'tpl-decision-e3',
            from: 'tpl-decision-choice',
            to: 'tpl-decision-no',
            fromAnchor: 'south',
            toAnchor: 'west',
            style: 'solid',
            direction: '->',
            shape: '90-horizontal',
            bend: 30,
            label: { text: 'Não', position: 'auto' },
          },
        ],
        textBlocks: [],
      },
      {
        id: 'pseudoentropy-views',
        name: 'Pseudoentropia: visões clássicas',
        description: 'Diagrama comparando as visões de Yao, Hill e Métrica.',
        nodes: [
          {
            id: 'tpl-pseudo-source',
            label: "Distribuição de Probabilidade\n'X'",
            color: '#f0f0f0',
            shape: 'rectangle',
            fontSize: '16',
            x: 220,
            y: 260,
          },
          {
            id: 'tpl-pseudo-goal',
            label: 'Qual o objetivo\ndo adversário?',
            color: '#ffe6cc',
            shape: 'diamond',
            fontSize: '16',
            x: 500,
            y: 260,
          },
          {
            id: 'tpl-pseudo-yao',
            label: 'Visão de YAO\n(Pseudoentropia via Compressão)\nAtacante: Construtivo',
            color: '#e6e6ff',
            shape: 'rectangle',
            fontSize: '16',
            x: 780,
            y: 180,
          },
          {
            id: 'tpl-pseudo-choice',
            label: 'Comparação:\nUMA vs. CONJUNTO?',
            color: '#ffe6cc',
            shape: 'diamond',
            fontSize: '16',
            x: 780,
            y: 340,
          },
          {
            id: 'tpl-pseudo-hill',
            label: 'Visão de HILL\n(Pseudoentropia via Indistinguibilidade)\nAtacante: Decisório',
            color: '#e6e6ff',
            shape: 'rectangle',
            fontSize: '16',
            x: 1060,
            y: 240,
          },
          {
            id: 'tpl-pseudo-metric',
            label: 'Visão MÉTRICA\n(Pseudoentropia via Métrica)\nAtacante: Decisório',
            color: '#e6e6ff',
            shape: 'rectangle',
            fontSize: '16',
            x: 1060,
            y: 400,
          },
        ],
        edges: [
          {
            id: 'tpl-pseudo-e1',
            from: 'tpl-pseudo-source',
            to: 'tpl-pseudo-goal',
            fromAnchor: 'east',
            toAnchor: 'west',
            style: 'solid',
            direction: '->',
            shape: 'straight',
            bend: 30,
            label: null,
          },
          {
            id: 'tpl-pseudo-e2',
            from: 'tpl-pseudo-goal',
            to: 'tpl-pseudo-yao',
            fromAnchor: 'north',
            toAnchor: 'west',
            style: 'solid',
            direction: '->',
            shape: '90-vertical',
            bend: 30,
            label: { text: 'COMPRIMIR', position: 'auto' },
          },
          {
            id: 'tpl-pseudo-e3',
            from: 'tpl-pseudo-goal',
            to: 'tpl-pseudo-choice',
            fromAnchor: 'south',
            toAnchor: 'west',
            style: 'solid',
            direction: '->',
            shape: '90-horizontal',
            bend: 30,
            label: { text: 'DISTINGUIR', position: 'auto' },
          },
          {
            id: 'tpl-pseudo-e4',
            from: 'tpl-pseudo-choice',
            to: 'tpl-pseudo-hill',
            fromAnchor: 'east',
            toAnchor: 'west',
            style: 'solid',
            direction: '->',
            shape: 'straight',
            bend: 30,
            label: { text: 'Contra UMA', position: 'auto' },
          },
          {
            id: 'tpl-pseudo-e5',
            from: 'tpl-pseudo-choice',
            to: 'tpl-pseudo-metric',
            fromAnchor: 'south',
            toAnchor: 'west',
            style: 'solid',
            direction: '->',
            shape: '90-horizontal',
            bend: 30,
            label: { text: 'Contra o CONJUNTO', position: 'auto' },
          },
          {
            id: 'tpl-pseudo-e6',
            from: 'tpl-pseudo-hill',
            to: 'tpl-pseudo-metric',
            fromAnchor: 'south',
            toAnchor: 'north',
            style: 'dashed',
            direction: '->',
            shape: 'straight',
            bend: 30,
            label: { text: 'implica', position: 'auto' },
          },
          {
            id: 'tpl-pseudo-e7',
            from: 'tpl-pseudo-metric',
            to: 'tpl-pseudo-yao',
            fromAnchor: 'north',
            toAnchor: 'south',
            style: 'dashed',
            direction: '->',
            shape: 'straight',
            bend: 30,
            label: { text: 'implica', position: 'auto' },
          },
        ],
        textBlocks: [],
      },
    ];

    const canvasRef = ref(null);
    const canvasWrapperRef = ref(null);
    const nodeMenuButtonRef = ref(null);
    const nodeMenuRef = ref(null);
    const inlineEditorRef = ref(null);
    const renderer = ref(null);
    const diagramFileInputRef = ref(null);
    const feedback = ref('');
    const tikzCode = ref('');
    const showNodeMenu = ref(false);
    const inlineEditor = reactive({
      visible: false,
      value: '',
      left: 0,
      top: 0,
      width: 200,
      height: 64,
      type: null,
      target: null,
    });
    const viewport = ref({ width: 0, height: 0 });
    const zoomLevel = computed(() => Math.round(state.camera.scale * 100));
    const edgeThicknessDisplay = computed(() => state.edgeThickness.toFixed(1));
    const edgeThickness = computed(() => state.edgeThickness);
    const edgeLabelAlignment = computed({
      get: () => state.edgeLabelAlignment,
      set: value => {
        state.edgeLabelAlignment = value;
      },
    });
    const isPanningActive = computed(() => panModifierActive.value || !!state.cameraDrag);
    const frame = computed(() => state.frame);
    const MIN_ZOOM = 0.25;
    const MAX_ZOOM = 4;

    let feedbackTimeout = null;
    let resizeObserver = null;

    function flash(message) {
      feedback.value = message;
      if (feedbackTimeout) {
        clearTimeout(feedbackTimeout);
      }
      feedbackTimeout = setTimeout(() => {
        feedback.value = '';
      }, 2800);
    }

    function commitHistory() {
      pushHistory();
    }

    function onOptionChange() {
      invalidateTikz();
      pushHistory();
    }

    function updateEdgeLabelColor(color) {
      const edge = state.selected?.type === 'edge' ? state.selected.item : null;
      if (!edge || !edge.label) return;
      edge.label.color = color;
      invalidateTikz();
    }

    function updateEdgeThickness(value) {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) {
        return;
      }
      const clamped = Math.min(Math.max(numeric, 1), 8);
      state.edgeThickness = clamped;
    }

    function onEdgeLabelAlignmentChange(value) {
      state.edgeLabelAlignment = value;
      pushHistory();
    }

    function triggerLoadDiagram() {
      diagramFileInputRef.value?.click();
    }

    async function handleDiagramFileChange(event) {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const payload = JSON.parse(text);
        applyDiagramPayload(payload);
        flash('Diagrama carregado a partir do arquivo JSON.');
      } catch (error) {
        console.error('Falha ao carregar diagrama', error);
        flash('Não foi possível carregar o arquivo. Verifique se é um JSON válido.');
      } finally {
        event.target.value = '';
      }
    }

    function applyDiagramPayload(payload) {
      if (!payload || typeof payload !== 'object') {
        throw new Error('Payload inválido');
      }
      const nodes = Array.isArray(payload.nodes)
        ? payload.nodes.map(node => normalizeNode({ ...node }))
        : [];
      const edges = Array.isArray(payload.edges)
        ? payload.edges.map(edge => normalizeEdge({ ...edge }))
        : [];
      const textBlocks = Array.isArray(payload.textBlocks)
        ? payload.textBlocks.map(block => ({ ...block }))
        : [];
      const frame = payload.frame ? { ...payload.frame } : null;
      const thickness = Number(payload.edgeThickness);

      state.nodes = nodes;
      state.edges = edges;
      state.textBlocks = textBlocks;
      state.frame = frame;
      if (Number.isFinite(thickness) && thickness > 0) {
        state.edgeThickness = thickness;
      } else {
        state.edgeThickness = DEFAULT_EDGE_THICKNESS;
      }
      const alignmentCandidates = ['auto', 'left', 'center', 'right'];
      const payloadAlignment = typeof payload.edgeLabelAlignment === 'string'
        ? payload.edgeLabelAlignment.toLowerCase()
        : null;
      if (payloadAlignment && alignmentCandidates.includes(payloadAlignment)) {
        state.edgeLabelAlignment = payloadAlignment;
      } else if (typeof payload.centerEdgeLabels === 'boolean') {
        state.edgeLabelAlignment = payload.centerEdgeLabels ? 'center' : 'right';
      } else {
        state.edgeLabelAlignment = 'right';
      }
      state.selected = null;
      state.mode = 'select';
      state.edgeDraft = null;
      state.hoverNodeId = null;
      state.hoverAnchor = null;
      state.pointer = null;
      state.cameraDrag = null;
      if (payload.camera) {
        state.camera.scale = payload.camera.scale ?? 1;
        state.camera.offsetX = payload.camera.offsetX ?? 0;
        state.camera.offsetY = payload.camera.offsetY ?? 0;
      } else {
        state.camera.scale = 1;
        state.camera.offsetX = 0;
        state.camera.offsetY = 0;
      }
      clearGuides();
      refreshSequencesFromState(state.nodes, state.edges, state.textBlocks);
      invalidateTikz();
      pushHistory();
    }

    const mode = computed(() => state.mode);
    const selected = computed(() => state.selected);

    const defaultStatus = computed(() => {
      switch (state.mode) {
        case 'addText':
          return 'Clique no canvas para posicionar uma nova caixa de texto.';
        case 'move':
          return 'Arraste nós, caixas de texto ou vértices selecionados.';
        case 'delete':
          return 'Clique em elementos para removê-los do diagrama.';
        default:
          return 'Arraste conectores para criar arestas ou mova elementos livremente.';
      }
    });

    const statusMessage = computed(() => feedback.value || defaultStatus.value);

    const currentHint = computed(() => {
      switch (state.mode) {
        case 'addText':
          return 'inserir uma caixa de texto livre';
        case 'move':
          return 'reposicionar elementos mantendo Shift para alinhar';
        case 'delete':
          return 'remover elementos indesejados';
        default:
          return state.edgeDraft
            ? 'ligar a aresta ao nó de destino'
            : 'selecionar elementos ou arrastar conectores para criar arestas';
      }
    });

    const canReset = computed(
      () => state.nodes.length > 0 || state.edges.length > 0 || state.textBlocks.length > 0
    );

    function invalidateTikz() {
      tikzCode.value = generateTikzDocument(state.nodes, state.edges, state.frame, {
        edgeThickness: state.edgeThickness,
        edgeLabelAlignment: state.edgeLabelAlignment,
      });
      renderer.value?.draw();
    }

    watch(
      () => [state.nodes, state.edges, state.textBlocks],
      () => {
        invalidateTikz();
      },
      { deep: true, immediate: true }
    );

    watch(
      () => state.edgeThickness,
      () => {
        invalidateTikz();
      }
    );

    watch(
      () => state.edgeLabelAlignment,
      () => {
        invalidateTikz();
      }
    );

    watch(
      () => state.selected?.item?.id,
      () => {
        renderer.value?.draw();
      }
    );

    watch(
      () => state.textBlocks,
      blocks => {
        blocks.forEach(block => {
          if (block.width < TEXT_BLOCK_CONSTRAINTS.minWidth) {
            block.width = TEXT_BLOCK_CONSTRAINTS.minWidth;
          }
          if (block.height < TEXT_BLOCK_CONSTRAINTS.minHeight) {
            block.height = TEXT_BLOCK_CONSTRAINTS.minHeight;
          }
        });
      },
      { deep: true }
    );

    watch(
      () => state.frame,
      frame => {
        if (frame) {
          if (frame.width < 64) frame.width = 64;
          if (frame.height < 64) frame.height = 64;
        }
        renderer.value?.draw();
        invalidateTikz();
      },
      { deep: true }
    );

    function changeMode(newMode) {
      state.mode = newMode;
      state.edgeDraft = null;
      state.hoverNodeId = null;
      state.hoverAnchor = null;
      renderer.value?.draw();
      showNodeMenu.value = false;
      flash(defaultStatus.value);
    }

    function toggleNodeMenu() {
      showNodeMenu.value = !showNodeMenu.value;
    }

    function closeNodeMenu() {
      showNodeMenu.value = false;
    }

    function currentViewport() {
      const view = renderer.value?.getViewport();
      if (view?.width && view?.height) {
        return view;
      }
      const canvas = canvasRef.value;
      if (!canvas) {
        return { width: 640, height: 360 };
      }
      const rect = canvas.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    }

    function screenToWorld(screenX, screenY) {
      const scale = state.camera.scale;
      const offsetX = state.camera.offsetX;
      const offsetY = state.camera.offsetY;
      return {
        x: (screenX - offsetX) / scale,
        y: (screenY - offsetY) / scale,
      };
    }

    function getViewportCenterPointer() {
      const size = renderer.value?.getViewport() || currentViewport();
      const screenX = size.width / 2;
      const screenY = size.height / 2;
      const world = screenToWorld(screenX, screenY);
      return { ...world, screenX, screenY };
    }

    function getViewportCenterWorld() {
      const center = getViewportCenterPointer();
      return { x: center.x, y: center.y };
    }

    function clampScale(value) {
      return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
    }

    function zoomAt(point, factor) {
      const nextScale = clampScale(state.camera.scale * factor);
      if (nextScale === state.camera.scale) {
        return;
      }
      state.camera.scale = nextScale;
      state.camera.offsetX = point.screenX - point.x * nextScale;
      state.camera.offsetY = point.screenY - point.y * nextScale;
      renderer.value?.draw();
    }

    function focusOnPoint(point) {
      const size = renderer.value?.getViewport() || currentViewport();
      state.camera.offsetX = size.width / 2 - point.x * state.camera.scale;
      state.camera.offsetY = size.height / 2 - point.y * state.camera.scale;
      renderer.value?.draw();
    }

    function fitFrameInView() {
      if (!state.frame) return;
      const size = renderer.value?.getViewport() || currentViewport();
      const padding = 64;
      const availableWidth = Math.max(1, size.width - padding * 2);
      const availableHeight = Math.max(1, size.height - padding * 2);
      const scaleX = availableWidth / state.frame.width;
      const scaleY = availableHeight / state.frame.height;
      const targetScale = clampScale(Math.min(scaleX, scaleY));
      state.camera.scale = targetScale;
      state.camera.offsetX = (size.width - state.frame.width * targetScale) / 2 - state.frame.x * targetScale;
      state.camera.offsetY = (size.height - state.frame.height * targetScale) / 2 - state.frame.y * targetScale;
      renderer.value?.draw();
    }

    function clampRectToFrame(rect) {
      if (!state.frame) return;
      const minX = state.frame.x;
      const minY = state.frame.y;
      const maxX = Math.max(minX, state.frame.x + state.frame.width - rect.width);
      const maxY = Math.max(minY, state.frame.y + state.frame.height - rect.height);
      rect.x = Math.min(Math.max(rect.x, minX), maxX);
      rect.y = Math.min(Math.max(rect.y, minY), maxY);
    }

    function shouldStartCameraPan(event) {
      return panModifierActive.value || event.button === 1 || event.button === 2;
    }

    function startCameraDrag(pointer) {
      state.cameraDrag = {
        startScreenX: pointer.screenX,
        startScreenY: pointer.screenY,
        initialOffsetX: state.camera.offsetX,
        initialOffsetY: state.camera.offsetY,
      };
    }

    function endCameraDrag() {
      state.cameraDrag = null;
    }

    function onCanvasWheel(event) {
      event.preventDefault();
      const pointer = getPointerPosition(event);
      const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
      zoomAt(pointer, factor);
    }

    function zoomIn() {
      const center = getViewportCenterPointer();
      zoomAt(center, 1.2);
    }

    function zoomOut() {
      const center = getViewportCenterPointer();
      zoomAt(center, 1 / 1.2);
    }

    function resetView() {
      const center = getViewportCenterWorld();
      state.camera.scale = 1;
      focusOnPoint(center);
    }

    function focusFrame() {
      fitFrameInView();
    }

    function createNodeFromMenu(shape) {
      closeNodeMenu();
      const center = getViewportCenterWorld();
      const node = makeNode(center.x, center.y, shape);
      state.nodes = [...state.nodes, node];
      setSelected({ type: 'node', item: node });
      pushHistory();
      flash('Novo nó adicionado. Utilize a ferramenta Mover para reposicioná-lo.');
    }

    function resetGraph() {
      state.nodes = [];
      state.edges = [];
      state.textBlocks = [];
      state.selected = null;
      state.edgeDraft = null;
      state.hoverNodeId = null;
      state.hoverAnchor = null;
      state.pointer = null;
      state.mode = 'select';
      clearGuides();
      pushHistory();
      flash('O diagrama foi limpo. Comece adicionando novos elementos.');
      renderer.value?.draw();
    }

    function applyTemplate(templateId) {
      const template = templates.find(item => item.id === templateId);
      if (!template) return;

      const requiresConfirmation = canReset.value;
      if (requiresConfirmation) {
        const confirmed = window.confirm(
          'Carregar um modelo substituirá o diagrama atual. Deseja continuar?'
        );
        if (!confirmed) {
          return;
        }
      }

      closeInlineEditor();
      closeNodeMenu();

      state.nodes = template.nodes.map(node => normalizeNode({ ...node }));
      state.edges = template.edges.map(edge => normalizeEdge({ ...edge }));
      state.textBlocks = (template.textBlocks || []).map(block => ({ ...block }));
      state.selected = null;
      state.mode = 'select';
      state.edgeDraft = null;
      state.hoverNodeId = null;
      state.hoverAnchor = null;
      state.pointer = null;
      clearGuides();
      refreshSequencesFromState(state.nodes, state.edges, state.textBlocks);

      pushHistory();
      invalidateTikz();
      renderer.value?.draw();
      flash(`Modelo "${template.name}" carregado. Ajuste conforme necessário.`);
    }

    function setSelected(payload) {
      state.selected = payload;
    }

    function removeSelected() {
      const current = state.selected;
      if (!current) return;
      if (current.type === 'node') {
        state.edges = state.edges.filter(edge => edge.from !== current.item.id && edge.to !== current.item.id);
        state.nodes = state.nodes.filter(node => node.id !== current.item.id);
      } else if (current.type === 'edge') {
        state.edges = state.edges.filter(edge => edge.id !== current.item.id);
      } else if (current.type === 'text') {
        state.textBlocks = state.textBlocks.filter(block => block.id !== current.item.id);
      }
      state.selected = null;
      pushHistory();
      flash('Elemento removido do canvas.');
    }

    function createFrame() {
      if (state.frame) return;
      const center = getViewportCenterWorld();
      const defaultWidth = 640;
      const defaultHeight = 480;
      state.frame = {
        x: center.x - defaultWidth / 2,
        y: center.y - defaultHeight / 2,
        width: defaultWidth,
        height: defaultHeight,
      };
      nextTick(() => {
        fitFrameInView();
        pushHistory();
        flash('Frame criado. Ajuste as dimensões conforme necessário.');
      });
    }

    function removeFrame() {
      if (!state.frame) return;
      state.frame = null;
      clearGuides();
      renderer.value?.draw();
      pushHistory();
      flash('Frame removido. O canvas volta a mostrar todo o conteúdo.');
    }

    function getPointerPosition(event) {
      const canvas = canvasRef.value;
      if (!canvas) return { x: 0, y: 0, screenX: 0, screenY: 0 };
      const rect = canvas.getBoundingClientRect();
      const clientX = 'clientX' in event ? event.clientX : rect.left + rect.width / 2;
      const clientY = 'clientY' in event ? event.clientY : rect.top + rect.height / 2;
      const screenX = clientX - rect.left;
      const screenY = clientY - rect.top;
      const world = screenToWorld(screenX, screenY);
      return {
        ...world,
        screenX,
        screenY,
      };
    }

    function determineAnchorForPointer(node, point) {
      const dx = point.x - node.x;
      const dy = point.y - node.y;
      if (Math.abs(dx) > Math.abs(dy)) {
        return dx >= 0 ? 'east' : 'west';
      }
      return dy >= 0 ? 'south' : 'north';
    }

    function startDrag(context) {
      state.dragContext = {
        ...context,
      };
      state.dragMoved = false;
      clearGuides();
    }

    function clearGuides() {
      if (!state.guides) return;
      state.guides.vertical = null;
      state.guides.horizontal = null;
    }

    function applyGuides(vertical, horizontal) {
      if (!state.guides) return;
      state.guides.vertical = vertical ?? null;
      state.guides.horizontal = horizontal ?? null;
    }

    function collectGuideCandidates(context) {
      const result = { vertical: [], horizontal: [] };
      if (!renderer.value) {
        return result;
      }

      const addBounds = bounds => {
        if (!bounds) return;
        result.vertical.push(bounds.left, bounds.centerX, bounds.right);
        result.horizontal.push(bounds.top, bounds.centerY, bounds.bottom);
      };

      state.nodes.forEach(node => {
        if (context.mode === 'move-node' && node.id === context.item.id) return;
        addBounds(renderer.value.getNodeBounds(node));
      });

      (state.textBlocks || []).forEach(block => {
        if (context.mode === 'move-text' && block.id === context.item.id) return;
        addBounds(renderer.value.getTextBlockBounds(block));
      });

      if (state.frame) {
        addBounds(renderer.value.getFrameBounds(state.frame));
      }

      result.vertical = Array.from(new Set(result.vertical));
      result.horizontal = Array.from(new Set(result.horizontal));
      return result;
    }

    function computeGuideSnap(context, dx, dy) {
      if (!renderer.value || !context.bounds) {
        return null;
      }
      const candidates = collectGuideCandidates(context);
      const tolerance = 12;
      let snappedDx = dx;
      let snappedDy = dy;
      let verticalGuide = null;
      let horizontalGuide = null;

      const initial = context.bounds;

      const evaluateAxis = (lines, projections, axis) => {
        let best = null;
        lines.forEach(line => {
          projections.forEach(projection => {
            const delta = Math.abs(line - (projection.base + projection.offset));
            if (delta <= tolerance && (!best || delta < best.delta)) {
              best = { line, projection, delta };
            }
          });
        });
        if (!best) return null;
        if (axis === 'x') {
          const current = best.projection.base + best.projection.offset;
          snappedDx += best.line - current;
          verticalGuide = best.line;
        } else {
          const current = best.projection.base + best.projection.offset;
          snappedDy += best.line - current;
          horizontalGuide = best.line;
        }
        return best.line;
      };

      const verticalProjections = [
        { base: initial.left, offset: snappedDx },
        { base: initial.centerX, offset: snappedDx },
        { base: initial.right, offset: snappedDx },
      ];
      evaluateAxis(candidates.vertical, verticalProjections, 'x');

      const horizontalProjections = [
        { base: initial.top, offset: snappedDy },
        { base: initial.centerY, offset: snappedDy },
        { base: initial.bottom, offset: snappedDy },
      ];
      evaluateAxis(candidates.horizontal, horizontalProjections, 'y');

      return {
        dx: snappedDx,
        dy: snappedDy,
        vertical: verticalGuide,
        horizontal: horizontalGuide,
      };
    }

    function applyFrameResize(context, dx, dy) {
      if (!state.frame) return;
      const minSize = 64;
      const initial = context.initial;
      let x = initial.x;
      let y = initial.y;
      let width = initial.width;
      let height = initial.height;
      const handle = context.handle || '';

      if (handle.includes('e')) {
        width = Math.max(minSize, initial.width + dx);
      }
      if (handle.includes('s')) {
        height = Math.max(minSize, initial.height + dy);
      }
      if (handle.includes('w')) {
        const maxX = initial.x + initial.width - minSize;
        const newX = Math.min(initial.x + dx, maxX);
        x = newX;
        width = Math.max(minSize, initial.width + (initial.x - newX));
      }
      if (handle.includes('n')) {
        const maxY = initial.y + initial.height - minSize;
        const newY = Math.min(initial.y + dy, maxY);
        y = newY;
        height = Math.max(minSize, initial.height + (initial.y - newY));
      }

      state.frame.x = x;
      state.frame.y = y;
      state.frame.width = width;
      state.frame.height = height;
    }

    function onCanvasMouseDown(event) {
      const pointer = getPointerPosition(event);
      state.pointer = pointer;
      const frameHandle = renderer.value?.getFrameHandleAtPosition(pointer.x, pointer.y) || null;
      if (shouldStartCameraPan(event)) {
        closeNodeMenu();
        startCameraDrag(pointer);
        event.preventDefault();
        return;
      }
      if (
        frameHandle?.type === 'resize' &&
        state.frame &&
        state.mode !== 'addText' &&
        state.mode !== 'delete'
      ) {
        closeNodeMenu();
        startDrag({
          mode: 'resize-frame',
          pointerStart: pointer,
          initial: {
            x: state.frame.x,
            y: state.frame.y,
            width: state.frame.width,
            height: state.frame.height,
          },
          handle: frameHandle.handle,
        });
        event.preventDefault();
        return;
      }
      const anchorHit = renderer.value?.getAnchorAtPosition(pointer.x, pointer.y) || null;
      const textHit = renderer.value?.getTextBlockAtPosition(pointer.x, pointer.y) || null;
      let node = textHit ? null : renderer.value?.getNodeAtPosition(pointer.x, pointer.y) || null;
      const edge = !node && !textHit ? renderer.value?.getEdgeAtPosition(pointer.x, pointer.y) || null : null;
      const labelHit = !node && !textHit ? renderer.value?.getEdgeLabelAtPosition(pointer.x, pointer.y) || null : null;
      if (!node && anchorHit) {
        node = anchorHit.node;
      }
      closeNodeMenu();

      const canStartEdgeFromAnchor =
        !!anchorHit && state.mode !== 'addText' && state.mode !== 'delete';

      if (canStartEdgeFromAnchor) {
        const anchor = anchorHit.anchor;
        const selectedEdge = state.selected?.type === 'edge' ? state.selected.item : null;
        if (selectedEdge) {
          const isFromMatch =
            selectedEdge.from === anchorHit.node.id && selectedEdge.fromAnchor === anchor;
          const isToMatch = selectedEdge.to === anchorHit.node.id && selectedEdge.toAnchor === anchor;
          if (isFromMatch || isToMatch) {
            state.edgeDraft = {
              mode: 'rewire',
              edgeId: selectedEdge.id,
              endpoint: isFromMatch ? 'from' : 'to',
              from: { nodeId: isFromMatch ? selectedEdge.from : selectedEdge.to, anchor },
              counterpart: isFromMatch
                ? { nodeId: selectedEdge.to, anchor: selectedEdge.toAnchor }
                : { nodeId: selectedEdge.from, anchor: selectedEdge.fromAnchor },
              pointer,
              target: null,
            };
            state.hoverNodeId = isFromMatch
              ? selectedEdge.to
              : selectedEdge.from;
            state.hoverAnchor = isFromMatch
              ? selectedEdge.toAnchor
              : selectedEdge.fromAnchor;
            renderer.value?.draw();
            event.preventDefault();
            return;
          }
        }

        if (!selectedEdge) {
          const connected = state.edges.filter(edgeItem => {
            return (
              (edgeItem.from === anchorHit.node.id && edgeItem.fromAnchor === anchor) ||
              (edgeItem.to === anchorHit.node.id && edgeItem.toAnchor === anchor)
            );
          });
          if (connected.length) {
            const targetEdge = connected[connected.length - 1];
            const isFrom = targetEdge.from === anchorHit.node.id && targetEdge.fromAnchor === anchor;
            state.edgeDraft = {
              mode: 'rewire',
              edgeId: targetEdge.id,
              endpoint: isFrom ? 'from' : 'to',
              from: { nodeId: isFrom ? targetEdge.from : targetEdge.to, anchor },
              counterpart: isFrom
                ? { nodeId: targetEdge.to, anchor: targetEdge.toAnchor }
                : { nodeId: targetEdge.from, anchor: targetEdge.fromAnchor },
              pointer,
              target: null,
            };
            state.hoverNodeId = isFrom ? targetEdge.to : targetEdge.from;
            state.hoverAnchor = isFrom ? targetEdge.toAnchor : targetEdge.fromAnchor;
            setSelected({ type: 'edge', item: targetEdge });
            renderer.value?.draw();
            event.preventDefault();
            return;
          }
        }

        state.edgeDraft = {
          mode: 'new',
          from: { nodeId: anchorHit.node.id, anchor },
          pointer,
          target: null,
        };
        state.hoverNodeId = anchorHit.node.id;
        state.hoverAnchor = anchor;
        renderer.value?.draw();
        event.preventDefault();
        return;
      }

      if (state.mode === 'addText') {
        const width = 240;
        const height = 120;
        const block = makeTextBlock(pointer.x - width / 2, pointer.y - height / 2, width, height);
        clampRectToFrame(block);
        state.textBlocks = [...state.textBlocks, block];
        setSelected({ type: 'text', item: block });
        state.mode = 'select';
        pushHistory();
        flash('Caixa de texto criada. Use duplo clique para editar o conteúdo.');
        renderer.value?.draw();
        return;
      }

      if (state.mode === 'delete') {
        if (textHit) {
          state.textBlocks = state.textBlocks.filter(block => block.id !== textHit.block.id);
          flash('Caixa de texto removida.');
        } else if (node) {
          state.edges = state.edges.filter(edge => edge.from !== node.id && edge.to !== node.id);
          state.nodes = state.nodes.filter(item => item.id !== node.id);
          flash('Nó removido. As arestas conectadas também foram apagadas.');
        } else if (edge) {
          state.edges = state.edges.filter(item => item.id !== edge.id);
          flash('Aresta removida.');
        }
        if (textHit || node || edge) {
          setSelected(null);
          pushHistory();
          renderer.value?.draw();
        }
        return;
      }

      const allowDrag = state.mode === 'move' || state.mode === 'select';

      if (labelHit) {
        const edgeForLabel = labelHit.edge;
        setSelected({ type: 'edge', item: edgeForLabel });
        if (allowDrag) {
          if (!edgeForLabel.label.offset) {
            edgeForLabel.label.offset = [0, 0];
          }
          startDrag({
            mode: 'move-edge-label',
            item: edgeForLabel,
            pointerStart: pointer,
            initialOffset: [...edgeForLabel.label.offset],
          });
          event.preventDefault();
        }
        renderer.value?.draw();
        return;
      }

      if (textHit) {
        setSelected({ type: 'text', item: textHit.block });
        if (allowDrag) {
          if (textHit.mode === 'resize') {
            startDrag({
              type: 'text',
              mode: 'resize-text',
              item: textHit.block,
              pointerStart: pointer,
              initial: {
                width: textHit.block.width,
                height: textHit.block.height,
              },
            });
          } else {
            startDrag({
              type: 'text',
              mode: 'move-text',
              item: textHit.block,
              pointerStart: pointer,
              initial: {
                x: textHit.block.x,
                y: textHit.block.y,
              },
              bounds: renderer.value?.getTextBlockBounds(textHit.block),
            });
          }
          event.preventDefault();
        }
        renderer.value?.draw();
        return;
      }

      if (node) {
        setSelected({ type: 'node', item: node });
        if (allowDrag) {
          startDrag({
            type: 'node',
            mode: 'move-node',
            item: node,
            pointerStart: pointer,
            initial: { x: node.x, y: node.y },
            bounds: renderer.value?.getNodeBounds(node),
          });
          event.preventDefault();
        }
        renderer.value?.draw();
        return;
      }

      if (
        frameHandle?.type === 'move' &&
        state.frame &&
        allowDrag &&
        state.mode !== 'delete' &&
        !edge
      ) {
        startDrag({
          mode: 'move-frame',
          pointerStart: pointer,
          initial: { x: state.frame.x, y: state.frame.y },
        });
        event.preventDefault();
        return;
      }

      if (edge) {
        setSelected({ type: 'edge', item: edge });
        renderer.value?.draw();
        return;
      }

      setSelected(null);
      renderer.value?.draw();
    }

    function updateHoverState(pointer) {
      if (!renderer.value || !pointer) {
        state.hoverNodeId = null;
        state.hoverAnchor = null;
        return;
      }
      const anchor = renderer.value.getAnchorAtPosition(pointer.x, pointer.y);
      if (anchor) {
        state.hoverNodeId = anchor.node.id;
        state.hoverAnchor = anchor.anchor;
        return;
      }
      const node = renderer.value.getNodeAtPosition(pointer.x, pointer.y);
      if (node) {
        state.hoverNodeId = node.id;
        state.hoverAnchor = null;
        return;
      }
      state.hoverNodeId = null;
      state.hoverAnchor = null;
    }

    function onCanvasMouseMove(event) {
      const pointer = getPointerPosition(event);
      state.pointer = pointer;

      if (state.cameraDrag) {
        state.camera.offsetX = state.cameraDrag.initialOffsetX + (pointer.screenX - state.cameraDrag.startScreenX);
        state.camera.offsetY = state.cameraDrag.initialOffsetY + (pointer.screenY - state.cameraDrag.startScreenY);
        renderer.value?.draw();
        event.preventDefault();
        return;
      }

      if (state.edgeDraft) {
        const draft = state.edgeDraft;
        draft.pointer = pointer;
        const anchorHit = renderer.value?.getAnchorAtPosition(pointer.x, pointer.y) || null;
        const hoveredNode = renderer.value?.getNodeAtPosition(pointer.x, pointer.y) || null;

        const buildTarget = (nodeId, anchor) => {
          let valid = true;
          if (draft.mode === 'rewire' && draft.counterpart) {
            valid = nodeId !== draft.counterpart.nodeId;
          } else if (draft.mode === 'new' && draft.from) {
            valid = nodeId !== draft.from.nodeId;
          }
          return { nodeId, anchor, valid };
        };

        let target = null;
        let hoverNodeId = null;
        let hoverAnchor = null;

        if (anchorHit) {
          target = buildTarget(anchorHit.node.id, anchorHit.anchor);
          hoverNodeId = anchorHit.node.id;
          hoverAnchor = anchorHit.anchor;
        } else if (hoveredNode) {
          const suggested = determineAnchorForPointer(hoveredNode, pointer);
          target = buildTarget(hoveredNode.id, suggested);
          hoverNodeId = hoveredNode.id;
          hoverAnchor = suggested;
        }

        if (!hoverNodeId) {
          if (draft.mode === 'rewire') {
            if (draft.endpoint === 'to' && draft.counterpart) {
              hoverNodeId = draft.counterpart.nodeId;
              hoverAnchor = draft.counterpart.anchor;
            } else if (draft.endpoint === 'from' && draft.from) {
              hoverNodeId = draft.from.nodeId;
              hoverAnchor = draft.from.anchor;
            }
          } else if (draft.from) {
            hoverNodeId = draft.from.nodeId;
            hoverAnchor = draft.from.anchor;
          }
        }

        draft.target = target;
        state.hoverNodeId = hoverNodeId;
        state.hoverAnchor = hoverAnchor;
        renderer.value?.draw();
        return;
      }

      const context = state.dragContext;
      if (context) {
        let dx = pointer.x - context.pointerStart.x;
        let dy = pointer.y - context.pointerStart.y;
        const supportsGuides = context.mode === 'move-node' || context.mode === 'move-text';
        if (supportsGuides && event.shiftKey) {
          const guides = computeGuideSnap(context, dx, dy);
          if (guides) {
            ({ dx, dy } = guides);
            applyGuides(guides.vertical, guides.horizontal);
          } else {
            clearGuides();
          }
        } else {
          clearGuides();
        }

        if (context.mode === 'move-node') {
          context.item.x = context.initial.x + dx;
          context.item.y = context.initial.y + dy;
        } else if (context.mode === 'move-text') {
          context.item.x = context.initial.x + dx;
          context.item.y = context.initial.y + dy;
        } else if (context.mode === 'resize-text') {
          const nextWidth = Math.max(TEXT_BLOCK_CONSTRAINTS.minWidth, context.initial.width + dx);
          const nextHeight = Math.max(TEXT_BLOCK_CONSTRAINTS.minHeight, context.initial.height + dy);
          context.item.width = nextWidth;
          context.item.height = nextHeight;
        } else if (context.mode === 'move-frame' && state.frame) {
          state.frame.x = context.initial.x + dx;
          state.frame.y = context.initial.y + dy;
        } else if (context.mode === 'resize-frame' && state.frame) {
          applyFrameResize(context, dx, dy);
        } else if (context.mode === 'move-edge-label') {
          const offsetX = context.initialOffset[0] + dx;
          const offsetY = context.initialOffset[1] + dy;
          context.item.label.offset = [offsetX, offsetY];
        }

        state.dragMoved = true;
        event.preventDefault();
        renderer.value?.draw();
        return;
      }

      updateHoverState(pointer);
      renderer.value?.draw();
    }

    function onCanvasMouseUp(event) {
      if (state.cameraDrag) {
        endCameraDrag();
        event?.preventDefault();
        renderer.value?.draw();
        return;
      }
      if (event) {
        state.pointer = getPointerPosition(event);
      }
      if (state.edgeDraft) {
        const draft = state.edgeDraft;
        const target = draft.target;
        if (draft.mode === 'rewire') {
          const edge = state.edges.find(item => item.id === draft.edgeId);
          if (edge && target?.valid) {
            let changed = false;
            if (draft.endpoint === 'from') {
              if (edge.from !== target.nodeId || edge.fromAnchor !== target.anchor) {
                edge.from = target.nodeId;
                edge.fromAnchor = target.anchor;
                changed = true;
              }
            } else if (draft.endpoint === 'to') {
              if (edge.to !== target.nodeId || edge.toAnchor !== target.anchor) {
                edge.to = target.nodeId;
                edge.toAnchor = target.anchor;
                changed = true;
              }
            }
            if (changed) {
              pushHistory();
              flash('Conexão da aresta atualizada.');
            }
            setSelected({ type: 'edge', item: edge });
          }
        } else if (target?.valid && draft.from) {
          const newEdge = makeEdge(draft.from.nodeId, target.nodeId);
          newEdge.fromAnchor = draft.from.anchor;
          newEdge.toAnchor = target.anchor;
          state.edges = [...state.edges, newEdge];
          setSelected({ type: 'edge', item: newEdge });
          state.mode = 'select';
          pushHistory();
          flash('Aresta criada com sucesso.');
        }
        state.edgeDraft = null;
        renderer.value?.draw();
        updateHoverState(state.pointer);
        return;
      }

      if (!state.dragContext) {
        clearGuides();
        updateHoverState(state.pointer);
        renderer.value?.draw();
        return;
      }
      if (state.dragMoved) {
        pushHistory();
      }
      state.dragContext = null;
      state.dragMoved = false;
      clearGuides();
      renderer.value?.draw();
      updateHoverState(state.pointer);
    }

    function onCanvasDblClick(event) {
      const pointer = getPointerPosition(event);
      const textHit = renderer.value?.getTextBlockAtPosition(pointer.x, pointer.y);
      if (textHit) {
        openTextBlockEditor(textHit.block);
        return;
      }
      const labelHit = renderer.value?.getEdgeLabelAtPosition(pointer.x, pointer.y);
      if (labelHit) {
        setSelected({ type: 'edge', item: labelHit.edge });
        openEdgeEditor(labelHit.edge, labelHit.center);
        return;
      }
      const node = renderer.value?.getNodeAtPosition(pointer.x, pointer.y);
      if (node) {
        setSelected({ type: 'node', item: node });
        openNodeEditor(node);
        return;
      }
      const edge = renderer.value?.getEdgeAtPosition(pointer.x, pointer.y);
      if (edge) {
        openEdgeEditor(edge);
      }
    }

    function positionInlineEditor(point, width, height) {
      const wrapperRect = canvasWrapperRef.value?.getBoundingClientRect();
      const canvasRect = canvasRef.value?.getBoundingClientRect();
      if (!wrapperRect || !canvasRect) {
        return { left: 0, top: 0 };
      }
      return {
        left: point.x + canvasRect.left - wrapperRect.left - width / 2,
        top: point.y + canvasRect.top - wrapperRect.top - height / 2,
      };
    }

    function openEdgeEditor(edge, preferredPoint = null) {
      const geometry = renderer.value?.getEdgeGeometry(edge);
      let point = preferredPoint || geometry?.labelPoint;
      if (!point) {
        const from = state.nodes.find(node => node.id === edge.from);
        const to = state.nodes.find(node => node.id === edge.to);
        if (from && to) {
          point = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
        } else {
          point = { x: 0, y: 0 };
        }
      }

      inlineEditor.value = edge.label?.text || '';
      inlineEditor.width = 220;
      inlineEditor.height = 110;
      inlineEditor.type = 'edge';
      inlineEditor.target = edge;
      const position = positionInlineEditor(point, inlineEditor.width, inlineEditor.height);
      inlineEditor.left = position.left;
      inlineEditor.top = position.top;
      inlineEditor.visible = true;
      nextTick(() => {
        inlineEditorRef.value?.focus();
        inlineEditorRef.value?.select();
      });
    }

    function openNodeEditor(node) {
      inlineEditor.value = node.label || '';
      inlineEditor.width = 220;
      inlineEditor.height = 120;
      inlineEditor.type = 'node';
      inlineEditor.target = node;
      const point = { x: node.x, y: node.y };
      const position = positionInlineEditor(point, inlineEditor.width, inlineEditor.height);
      inlineEditor.left = position.left;
      inlineEditor.top = position.top;
      inlineEditor.visible = true;
      nextTick(() => {
        inlineEditorRef.value?.focus();
        inlineEditorRef.value?.select();
      });
    }

    function openTextBlockEditor(block) {
      inlineEditor.value = block.text || '';
      inlineEditor.width = Math.max(block.width, 220);
      inlineEditor.height = Math.max(block.height, 120);
      inlineEditor.type = 'text';
      inlineEditor.target = block;
      const centerPoint = {
        x: block.x + block.width / 2,
        y: block.y + block.height / 2,
      };
      const position = positionInlineEditor(centerPoint, inlineEditor.width, inlineEditor.height);
      inlineEditor.left = position.left;
      inlineEditor.top = position.top;
      inlineEditor.visible = true;
      nextTick(() => {
        inlineEditorRef.value?.focus();
        inlineEditorRef.value?.select();
      });
    }

    function closeInlineEditor() {
      inlineEditor.visible = false;
      inlineEditor.value = '';
      inlineEditor.type = null;
      inlineEditor.target = null;
    }

    function confirmInlineEditor() {
      if (!inlineEditor.visible || !inlineEditor.target) {
        closeInlineEditor();
        return;
      }
      if (inlineEditor.type === 'edge') {
        const trimmed = inlineEditor.value.trim();
        const target = inlineEditor.target;
        const currentText = target.label?.text || '';
        if (currentText !== trimmed) {
          target.label = target.label || { text: '', position: 'auto' };
          if (!target.label.offset) {
            target.label.offset = [0, 0];
          }
          if (!target.label.color) {
            target.label.color = '#e2e8f0';
          }
          target.label.text = trimmed;
          pushHistory();
        }
      } else if (inlineEditor.type === 'node') {
        const value = inlineEditor.value.trim();
        if (inlineEditor.target.label !== value) {
          inlineEditor.target.label = value;
          pushHistory();
        }
      } else if (inlineEditor.type === 'text') {
        if (inlineEditor.target.text !== inlineEditor.value) {
          inlineEditor.target.text = inlineEditor.value;
          pushHistory();
        }
      }
      renderer.value?.draw();
      closeInlineEditor();
    }

    function handleEditorKeydown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeInlineEditor();
        return;
      }
      if (inlineEditor.type !== 'text' && event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        confirmInlineEditor();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'enter') {
        event.preventDefault();
        confirmInlineEditor();
      }
    }

    function snapshot() {
      return {
        nodes: state.nodes.map(node => ({ ...node })),
        edges: state.edges.map(edge => normalizeEdge({ ...edge })),
        textBlocks: state.textBlocks.map(block => ({ ...block })),
        frame: state.frame ? { ...state.frame } : null,
        camera: { ...state.camera },
        edgeThickness: state.edgeThickness,
        edgeLabelAlignment: state.edgeLabelAlignment,
      };
    }

    function applySnapshot(snap) {
      state.nodes = snap.nodes.map(node => normalizeNode({ ...node }));
      state.edges = snap.edges.map(edge => normalizeEdge({ ...edge }));
      state.textBlocks = snap.textBlocks.map(block => ({ ...block }));
      state.frame = snap.frame ? { ...snap.frame } : null;
      state.camera.scale = snap.camera?.scale ?? 1;
      state.camera.offsetX = snap.camera?.offsetX ?? 0;
      state.camera.offsetY = snap.camera?.offsetY ?? 0;
      state.edgeThickness = Number.isFinite(snap.edgeThickness)
        ? snap.edgeThickness
        : DEFAULT_EDGE_THICKNESS;
      const alignmentCandidates = ['auto', 'left', 'center', 'right'];
      if (alignmentCandidates.includes(snap.edgeLabelAlignment)) {
        state.edgeLabelAlignment = snap.edgeLabelAlignment;
      } else {
        state.edgeLabelAlignment = 'right';
      }
      state.selected = null;
      state.edgeDraft = null;
      state.hoverNodeId = null;
      state.hoverAnchor = null;
      state.pointer = null;
      state.cameraDrag = null;
      clearGuides();
      refreshSequencesFromState(state.nodes, state.edges, state.textBlocks);
      invalidateTikz();
    }
    function pushHistory() {
      const current = snapshot();
      history.past.push(current);
      if (history.past.length > 60) {
        history.past.shift();
      }
      history.future = [];
    }

    function undo() {
      if (history.past.length <= 1) return;
      const current = history.past.pop();
      history.future.push(current);
      const previous = history.past[history.past.length - 1];
      applySnapshot(previous);
      flash('Ação desfeita.');
    }

    function redo() {
      if (!history.future.length) return;
      const nextState = history.future.pop();
      history.past.push(nextState);
      applySnapshot(nextState);
      flash('Ação refeita.');
    }

    function saveDiagram() {
      const payload = {
        nodes: state.nodes.map(node => ({ ...node })),
        edges: state.edges.map(edge => ({ ...edge })),
        textBlocks: state.textBlocks.map(block => ({ ...block })),
        frame: state.frame ? { ...state.frame } : null,
        edgeThickness: state.edgeThickness,
        camera: { ...state.camera },
        edgeLabelAlignment: state.edgeLabelAlignment,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const link = document.createElement('a');
      link.href = url;
      link.download = `diagrama-${timestamp}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      flash('Diagrama exportado como arquivo JSON.');
    }

    async function copyToClipboard() {
      try {
        await navigator.clipboard.writeText(tikzCode.value);
        flash('Código TikZ copiado para a área de transferência.');
      } catch (error) {
        const textarea = document.createElement('textarea');
        textarea.value = tikzCode.value;
        textarea.setAttribute('readonly', 'readonly');
        textarea.style.position = 'absolute';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        try {
          const success = document.execCommand('copy');
          flash(
            success
              ? 'Código TikZ copiado para a área de transferência.'
              : 'Não foi possível copiar automaticamente. Selecione o texto manualmente.'
          );
        } catch (fallbackError) {
          console.error('Falha ao copiar', fallbackError);
          flash('Não foi possível copiar automaticamente. Selecione o texto manualmente.');
        } finally {
          document.body.removeChild(textarea);
        }
      }
    }

    const handleResize = () => {
      if (!renderer.value) return;
      const center = getViewportCenterWorld();
      renderer.value.resize();
      viewport.value = renderer.value.getViewport();
      focusOnPoint(center);
    };

    function handleKeyDown(event) {
      if (event.code === 'Space') {
        if (!event.repeat) {
          panModifierActive.value = true;
        }
        event.preventDefault();
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) {
          redo();
        } else {
          undo();
        }
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        redo();
      }
    }

    function handleKeyUp(event) {
      if (event.code === 'Space') {
        panModifierActive.value = false;
        if (state.cameraDrag) {
          endCameraDrag();
          renderer.value?.draw();
        }
      }
    }

    function handleDocumentPointer(event) {
      if (showNodeMenu.value) {
        const menuEl = nodeMenuRef.value;
        const buttonEl = nodeMenuButtonRef.value;
        if (!(menuEl?.contains(event.target) || buttonEl?.contains(event.target))) {
          showNodeMenu.value = false;
        }
      }

      if (inlineEditor.visible) {
        const editorEl = inlineEditorRef.value?.closest?.('.inline-editor');
        if (editorEl && !editorEl.contains(event.target)) {
          confirmInlineEditor();
        }
      }
    }

    onMounted(() => {
      const canvas = canvasRef.value;
      if (!canvas) return;
      renderer.value = createCanvasRenderer(canvas, state);
      renderer.value.resize();
      viewport.value = renderer.value.getViewport();
      pushHistory();
      if (canvas.parentElement && 'ResizeObserver' in window) {
        resizeObserver = new ResizeObserver(handleResize);
        resizeObserver.observe(canvas.parentElement);
      }
      window.addEventListener('resize', handleResize);
      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('keyup', handleKeyUp);
      window.addEventListener('pointerdown', handleDocumentPointer);
      invalidateTikz();
    });

    onUnmounted(() => {
      if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
      }
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('pointerdown', handleDocumentPointer);
    });

    return {
      tools,
      availableShapes,
      templates,
      mode,
      selected,
      canUndo,
      canRedo,
      statusMessage,
      currentHint,
      canReset,
      frame,
      zoomLevel,
      isPanningActive,
      tikzCode,
      edgeThickness,
      edgeLabelAlignment,
      canvasRef,
      canvasWrapperRef,
      nodeMenuButtonRef,
      nodeMenuRef,
      diagramFileInputRef,
      inlineEditor,
      inlineEditorRef,
      showNodeMenu,
      changeMode,
      toggleNodeMenu,
      createNodeFromMenu,
      resetGraph,
      applyTemplate,
      saveDiagram,
      copyToClipboard,
      onCanvasMouseDown,
      onCanvasMouseMove,
      onCanvasMouseUp,
      onCanvasWheel,
      onCanvasDblClick,
      removeSelected,
      createFrame,
      removeFrame,
      focusFrame,
      zoomIn,
      zoomOut,
      resetView,
      invalidateTikz,
      closeInlineEditor,
      confirmInlineEditor,
      handleEditorKeydown,
      openTextBlockEditor,
      commitHistory,
      onOptionChange,
      updateEdgeLabelColor,
      updateEdgeThickness,
      onEdgeLabelAlignmentChange,
      undo,
      redo,
      triggerLoadDiagram,
      handleDiagramFileChange,
      edgeThicknessDisplay,
    };
  },
}).mount('#app');
