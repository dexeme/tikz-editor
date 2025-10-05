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
  borderWidth: 3,
  cornerRadius: 16,
});

let nodeSequence = 1;
let edgeSequence = 1;
let textSequence = 1;
let matrixSequence = 1;

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
    thickness: null,
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
  const thicknessValue = Number(edge.thickness);
  edge.thickness = Number.isFinite(thicknessValue) && thicknessValue > 0 ? thicknessValue : null;
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
  const widthValue = Number(normalized.borderWidth);
  normalized.borderWidth = Number.isFinite(widthValue) && widthValue > 0 ? widthValue : 3;
  const cornerRadiusValue = Number(normalized.cornerRadius);
  normalized.cornerRadius = Number.isFinite(cornerRadiusValue) && cornerRadiusValue >= 0
    ? Math.min(64, cornerRadiusValue)
    : 16;
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

function refreshSequencesFromState(nodes = [], edges = [], textBlocks = [], matrixGrids = []) {
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
  const maxMatrix = extractMax(matrixGrids, /^matrix-(\d+)$/);
  nodeSequence = Math.max(nodeSequence, maxNode + 1);
  edgeSequence = Math.max(edgeSequence, maxEdge + 1);
  textSequence = Math.max(textSequence, maxText + 1);
  matrixSequence = Math.max(matrixSequence, maxMatrix + 1);
}

createApp({
  setup() {
    const state = reactive({
      nodes: [],
      edges: [],
      textBlocks: [],
      matrixGrids: [],
      mode: 'select',
      selected: null,
      theme: 'dark',
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

    const showTemplateBrowser = ref(false);

    const formatClipboard = ref(null);
    const nodeToolbarRef = ref(null);
    const edgeToolbarRef = ref(null);
    const matrixFileInputRef = ref(null);
    const selectedNodes = computed(() => {
      if (state.selected?.type !== 'node') {
        return [];
      }
      const items = Array.isArray(state.selected.items)
        ? state.selected.items.filter(Boolean)
        : [];
      const primary = state.selected.item;
      if (primary && !items.some(item => item?.id === primary.id)) {
        return [...items, primary];
      }
      return items;
    });
    const selectedNode = computed(() => selectedNodes.value[0] || null);
    const selectedEdge = computed(() =>
      state.selected?.type === 'edge' ? state.selected.item : null
    );
    const inspectorVisible = computed(() => {
      const type = state.selected?.type;
      return type === 'node' || type === 'edge';
    });
    const nodeToolbarState = reactive({
      activePopover: null,
      hoveredOption: null,
      fillCustomColor: '#f8fafc',
      strokeCustomColor: '#94a3b8',
    });
    const edgeToolbarState = reactive({
      activePopover: null,
      hoveredOption: null,
      customColor: '#94a3b8',
    });
    const matrixImport = reactive({
      visible: false,
      fileName: '',
      data: [],
      values: [],
      colorMap: {},
    });
    const matrixImportQueue = reactive([]);
    const matrixPrompt = reactive({
      visible: false,
      text: '',
      error: '',
    });
    const matrixPromptTextAreaRef = ref(null);
    const DEFAULT_MATRIX_ZERO_COLOR = '#7d7d7d';
    const DEFAULT_MATRIX_ONE_COLOR = '#000000';
    const defaultMatrixPalette = [
      '#0f172a',
      '#f8fafc',
      '#38bdf8',
      '#f97316',
      '#facc15',
      '#22c55e',
      '#ef4444',
      '#a855f7',
      '#6366f1',
      '#14b8a6',
    ];
    const defaultFillSwatches = [
      '#f97316',
      '#fbbf24',
      '#34d399',
      '#38bdf8',
      '#a855f7',
      '#f87171',
      '#fef3c7',
      '#bbf7d0',
      '#bae6fd',
      '#c7d2fe',
      '#fde68a',
      '#fbcfe8',
    ];
    const defaultStrokeSwatches = [
      '#1f2937',
      '#334155',
      '#475569',
      '#94a3b8',
      '#0ea5e9',
      '#22c55e',
      '#f97316',
      '#eab308',
      '#7c3aed',
      '#ef4444',
    ];
    const customSwatches = reactive({
      fill: [],
      stroke: [],
    });
    const recentColors = reactive([]);
    const MAX_RECENT_COLORS = 6;
    const nodeFillPalette = computed(() => [
      ...defaultFillSwatches,
      ...customSwatches.fill.filter(Boolean),
    ]);
    const nodeStrokePalette = computed(() => [
      ...defaultStrokeSwatches,
      ...customSwatches.stroke.filter(Boolean),
    ]);
    const recentColorPalette = computed(() => [...recentColors]);
    const nodeToolbarLabels = {
      fill: 'Cor de preenchimento',
      stroke: 'Cor da borda',
      borderWidth: 'Espessura da borda',
      fontSize: 'Tamanho da fonte',
      shape: 'Formato do nó',
      copy: 'Copiar formatação',
      paste: 'Colar formatação',
      cornerRadius: 'Arredondamento',
      remove: 'Remover nó',
    };
    const edgeToolbarLabels = {
      color: 'Cor da aresta',
      style: 'Estilo da aresta',
      direction: 'Direção da flecha',
      thickness: 'Espessura da aresta',
      alignment: 'Alinhamento do rótulo',
      copy: 'Copiar formatação',
      paste: 'Colar formatação',
      remove: 'Remover aresta',
    };
    const fontSizeOptions = [
      { value: '12', label: 'Pequena' },
      { value: '16', label: 'Média' },
      { value: '20', label: 'Grande' },
    ];
    const nodeToolbarHint = computed(() => {
      if (nodeToolbarState.hoveredOption) {
        return nodeToolbarLabels[nodeToolbarState.hoveredOption] || '';
      }
      if (nodeToolbarState.activePopover) {
        return nodeToolbarLabels[nodeToolbarState.activePopover] || '';
      }
      return '';
    });
    const edgeToolbarHint = computed(() => {
      const showAlignmentReminder =
        (edgeToolbarState.hoveredOption === 'alignment' ||
          edgeToolbarState.activePopover === 'alignment') &&
        !hasSelectedEdgeLabel.value;
      if (showAlignmentReminder) {
        return 'Adicione um rótulo na aresta para ajustar o alinhamento.';
      }
      if (edgeToolbarState.hoveredOption) {
        return edgeToolbarLabels[edgeToolbarState.hoveredOption] || '';
      }
      if (edgeToolbarState.activePopover) {
        return edgeToolbarLabels[edgeToolbarState.activePopover] || '';
      }
      return '';
    });
    const nodeToolbarStyle = computed(() => {
      const node = selectedNode.value;
      state.camera.offsetX;
      state.camera.offsetY;
      state.camera.scale;
      if (!node || !renderer.value?.getNodeBounds || !renderer.value?.worldToScreen) {
        return {};
      }
      const bounds = renderer.value.getNodeBounds(node);
      if (!bounds) {
        return {};
      }
      const anchor = renderer.value.worldToScreen(bounds.right, bounds.top);
      const spacing = 16;
      return {
        left: `${anchor.x + spacing}px`,
        top: `${anchor.y - spacing}px`,
      };
    });
    const edgeToolbarStyle = computed(() => {
      const edge = selectedEdge.value;
      state.camera.offsetX;
      state.camera.offsetY;
      state.camera.scale;
      if (!edge || !renderer.value?.getEdgeGeometry || !renderer.value?.worldToScreen) {
        return {};
      }
      const geometry = renderer.value.getEdgeGeometry(edge);
      if (!geometry) {
        return {};
      }
      const points = [];
      if (geometry.startPoint) points.push(geometry.startPoint);
      if (geometry.endPoint) points.push(geometry.endPoint);
      if (geometry.control) points.push(geometry.control);
      if (geometry.elbow) points.push(geometry.elbow);
      if (geometry.labelPoint) points.push(geometry.labelPoint);
      if (Array.isArray(geometry.segments)) {
        geometry.segments.forEach(segment => {
          if (segment?.start) points.push(segment.start);
          if (segment?.end) points.push(segment.end);
        });
      }
      if (!points.length) {
        return {};
      }
      const maxX = Math.max(...points.map(point => point.x));
      const minY = Math.min(...points.map(point => point.y));
      const anchor = renderer.value.worldToScreen(maxX, minY);
      const spacing = 16;
      return {
        left: `${anchor.x + spacing}px`,
        top: `${anchor.y - spacing}px`,
      };
    });
    const canSubmitMatrixPrompt = computed(() => {
      if (!matrixPrompt.visible) {
        return false;
      }
      return matrixPrompt.text.trim().length > 0;
    });
    const canConfirmMatrixImport = computed(() => {
      if (!matrixImport.visible) {
        return false;
      }
      if (!matrixImport.values.length) {
        return false;
      }
      return matrixImport.values.every(value => {
        const color = matrixImport.colorMap[value];
        return typeof color === 'string' && color.trim().length > 0;
      });
    });
    const canPasteFormatting = computed(() => {
      const payload = formatClipboard.value;
      if (!payload) {
        return false;
      }
      if (payload.type === 'node') {
        return !!selectedNode.value;
      }
      if (payload.type === 'edge') {
        return !!selectedEdge.value;
      }
      return false;
    });

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
    const previewViewportRef = ref(null);
    const previewStageRef = ref(null);
    const preview = reactive({
      srcdoc: '',
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      drag: null,
      contentWidth: 0,
      contentHeight: 0,
    });
    const sidebarTab = ref('code');
    const lastRenderedTikz = ref('');
    const autoUpdateTikz = ref(true);
    const tikzUpdatePending = ref(false);
    const showNodeMenu = ref(false);
    const showEdgeThicknessMenu = ref(false);
    const showLabelAlignmentMenu = ref(false);
    const showHistoryMenu = ref(false);
    const showSettingsDialog = ref(false);
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

    const inlineEditorLineMarkers = computed(() => {
      if (inlineEditor.type !== 'node') {
        return null;
      }
      const rawValue = typeof inlineEditor.value === 'string'
        ? inlineEditor.value.replace(/\r\n/g, '\n')
        : '';
      const lines = rawValue.length ? rawValue.split('\n') : [''];
      if (!lines.length) {
        lines.push('');
      }
      return lines
        .map((_, index) => (index === 0 ? `${index + 1}` : `\\\\ ${index + 1}`))
        .join('\n');
    });
    const edgeThicknessMenuButtonRef = ref(null);
    const edgeThicknessMenuRef = ref(null);
    const labelAlignmentMenuButtonRef = ref(null);
    const labelAlignmentMenuRef = ref(null);
    const historyMenuButtonRef = ref(null);
    const historyMenuRef = ref(null);
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
    const currentTheme = computed(() => (state.theme === 'light' ? 'light' : 'dark'));
    const hasSelectedEdgeLabel = computed(() => {
      const text = selectedEdge.value?.label?.text;
      return typeof text === 'string' && text.trim().length > 0;
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

    function applyTheme(theme) {
      if (typeof document === 'undefined') {
        return;
      }
      document.documentElement.setAttribute('data-theme', theme);
      document.body.setAttribute('data-theme', theme);
    }

    function resolvePreferredTheme() {
      if (typeof window === 'undefined') {
        return null;
      }
      try {
        const stored = window.localStorage?.getItem('tikz-theme');
        if (stored === 'light' || stored === 'dark') {
          return stored;
        }
      } catch (storageError) {
        console.warn('Não foi possível ler o tema salvo:', storageError);
      }
      try {
        if (window.matchMedia?.('(prefers-color-scheme: light)').matches) {
          return 'light';
        }
      } catch (matchError) {
        console.warn('Falha ao consultar o tema preferido do sistema:', matchError);
      }
      return null;
    }

    function setTheme(theme) {
      state.theme = theme === 'light' ? 'light' : 'dark';
    }

    const preferredTheme = resolvePreferredTheme();
    if (preferredTheme) {
      state.theme = preferredTheme;
    }

    watch(
      currentTheme,
      theme => {
        applyTheme(theme);
        try {
          window.localStorage?.setItem('tikz-theme', theme);
        } catch (storageError) {
          console.warn('Não foi possível salvar o tema selecionado:', storageError);
        }
        renderer.value?.draw();
      },
      { immediate: true }
    );

    function normalizeHex(color) {
      if (typeof color !== 'string') {
        return null;
      }
      let value = color.trim();
      if (!value) {
        return null;
      }
      if (!value.startsWith('#')) {
        value = `#${value}`;
      }
      if (/^#[0-9a-fA-F]{3}$/.test(value)) {
        value = `#${value
          .slice(1)
          .split('')
          .map(char => char + char)
          .join('')}`;
      }
      if (/^#[0-9a-fA-F]{6}$/.test(value)) {
        return value.toLowerCase();
      }
      return null;
    }

    function parseMatrixFromText(raw) {
      if (typeof raw !== 'string') {
        throw new Error('Conteúdo inválido.');
      }
      const lines = raw
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean);
      if (!lines.length) {
        throw new Error('O arquivo não contém dados de matriz.');
      }
      const rows = lines
        .map(line =>
          line
            .split(/[;,\s]+/)
            .map(token => token.trim())
            .filter(Boolean)
        )
        .filter(cells => cells.length > 0);
      if (!rows.length) {
        throw new Error('O arquivo não contém dados de matriz.');
      }
      const columnCount = rows[0].length;
      const inconsistent = rows.some(row => row.length !== columnCount);
      if (inconsistent) {
        throw new Error('Todas as linhas devem ter o mesmo número de colunas.');
      }
      return rows.map(row => row.map(value => value));
    }

    function clearMatrixImportQueue() {
      matrixImportQueue.length = 0;
    }

    function resetMatrixImportState() {
      matrixImport.visible = false;
      matrixImport.fileName = '';
      matrixImport.data = [];
      matrixImport.values = [];
      matrixImport.colorMap = {};
    }

    function loadNextMatrixFromQueue() {
      if (!matrixImportQueue.length) {
        resetMatrixImportState();
        return;
      }
      const next = matrixImportQueue.shift();
      const cloned = next.data.map(row => [...row]);
      matrixImport.data = cloned;
      const valueSet = new Set();
      cloned.forEach(row => {
        row.forEach(cell => {
          valueSet.add(String(cell));
        });
      });
      const sortedValues = Array.from(valueSet).sort((a, b) =>
        a.localeCompare(b, 'pt-BR', { numeric: true })
      );
      let paletteIndex = 0;
      const colorMap = sortedValues.reduce((acc, value) => {
        if (value === '0') {
          acc[value] = DEFAULT_MATRIX_ZERO_COLOR;
          return acc;
        }
        if (value === '1') {
          acc[value] = DEFAULT_MATRIX_ONE_COLOR;
          return acc;
        }
        acc[value] = defaultMatrixPalette[paletteIndex % defaultMatrixPalette.length];
        paletteIndex += 1;
        return acc;
      }, {});
      matrixImport.values = sortedValues;
      matrixImport.colorMap = colorMap;
      matrixImport.fileName = next.fileName || '';
      matrixImport.visible = true;
    }

    function queueMatrixImports(entries, { replaceQueue = false } = {}) {
      if (!Array.isArray(entries) || !entries.length) {
        return 0;
      }
      if (replaceQueue) {
        clearMatrixImportQueue();
        resetMatrixImportState();
      }
      let enqueued = 0;
      entries.forEach(entry => {
        const rawData = Array.isArray(entry.data)
          ? entry.data.map(row =>
              Array.isArray(row) ? row.map(cell => String(cell)) : []
            )
          : [];
        if (!rawData.length) {
          return;
        }
        const columnCount = rawData[0]?.length || 0;
        if (!columnCount) {
          return;
        }
        const consistent = rawData.every(row => row.length === columnCount);
        if (!consistent) {
          return;
        }
        matrixImportQueue.push({
          data: rawData.map(row => [...row]),
          fileName: entry.fileName || '',
        });
        enqueued += 1;
      });
      if (!matrixImport.visible && enqueued > 0) {
        loadNextMatrixFromQueue();
      }
      return enqueued;
    }

    function prepareMatrixImport(data, fileName, options = {}) {
      return queueMatrixImports([{ data, fileName }], options);
    }

    function updateMatrixImportColor(value, color) {
      const normalized = normalizeHex(color);
      if (!normalized) {
        return;
      }
      matrixImport.colorMap = {
        ...matrixImport.colorMap,
        [value]: normalized,
      };
    }

    function normalizeMatrixGrid(grid = {}) {
      const rawData = Array.isArray(grid.data)
        ? grid.data
            .map(row => (Array.isArray(row) ? row.map(cell => String(cell)) : []))
            .filter(row => row.length > 0)
        : [];
      const columnCount = rawData[0]?.length || 0;
      const data =
        columnCount > 0
          ? rawData.filter(row => row.length === columnCount).map(row => [...row])
          : [];
      const colorMap =
        grid.colorMap && typeof grid.colorMap === 'object'
          ? Object.entries(grid.colorMap).reduce((acc, [key, value]) => {
              const normalized = normalizeHex(typeof value === 'string' ? value : '');
              if (normalized) {
                acc[String(key)] = normalized;
              }
              return acc;
            }, {})
          : {};
      const cellSizeValue = Number(grid.cellSize);
      const cellSize = Number.isFinite(cellSizeValue) && cellSizeValue > 0 ? cellSizeValue : 4;
      const xValue = Number(grid.x);
      const yValue = Number(grid.y);
      return {
        id: typeof grid.id === 'string' ? grid.id : `matrix-${matrixSequence++}`,
        x: Number.isFinite(xValue) ? xValue : 0,
        y: Number.isFinite(yValue) ? yValue : 0,
        data,
        colorMap,
        cellSize,
      };
    }

    function ensureCustomSwatch(type, color) {
      const normalized = normalizeHex(color);
      if (!normalized || !customSwatches[type]) {
        return false;
      }
      if (!customSwatches[type].includes(normalized)) {
        customSwatches[type].push(normalized);
        return true;
      }
      return false;
    }

    function registerRecentColor(color) {
      const normalized = normalizeHex(color);
      if (!normalized) {
        return;
      }
      const existingIndex = recentColors.indexOf(normalized);
      if (existingIndex !== -1) {
        recentColors.splice(existingIndex, 1);
      }
      recentColors.unshift(normalized);
      if (recentColors.length > MAX_RECENT_COLORS) {
        recentColors.length = MAX_RECENT_COLORS;
      }
    }

    function toggleNodePopover(id) {
      nodeToolbarState.activePopover = nodeToolbarState.activePopover === id ? null : id;
    }

    function setNodeToolbarHover(id) {
      nodeToolbarState.hoveredOption = id;
    }

    function applyNodeFill(color, options = {}) {
      const nodes = selectedNodes.value;
      const normalized = normalizeHex(color);
      if (!nodes.length || !normalized) {
        return;
      }
      nodeToolbarState.fillCustomColor = normalized;
      if (options.addToPalette) {
        ensureCustomSwatch('fill', normalized);
      }
      registerRecentColor(normalized);
      let changed = false;
      nodes.forEach(node => {
        if (node.color !== normalized) {
          node.color = normalized;
          changed = true;
        }
      });
      if ((options.commit !== false && changed) || options.forceCommit) {
        pushHistory();
      }
    }

    function applyNodeBorder(color, options = {}) {
      const nodes = selectedNodes.value;
      const normalized = normalizeHex(color);
      if (!nodes.length || !normalized) {
        return;
      }
      nodeToolbarState.strokeCustomColor = normalized;
      if (options.addToPalette) {
        ensureCustomSwatch('stroke', normalized);
      }
      registerRecentColor(normalized);
      let changed = false;
      nodes.forEach(node => {
        if (node.borderColor !== normalized) {
          node.borderColor = normalized;
          changed = true;
        }
      });
      if ((options.commit !== false && changed) || options.forceCommit) {
        pushHistory();
      }
    }

    function addCustomColor(type) {
      if (type === 'fill') {
        const added = ensureCustomSwatch('fill', nodeToolbarState.fillCustomColor);
        if (added) {
          flash('Cor adicionada à paleta de preenchimento.');
        } else {
          flash('Essa cor já está disponível na paleta.');
        }
      } else if (type === 'stroke') {
        const added = ensureCustomSwatch('stroke', nodeToolbarState.strokeCustomColor);
        if (added) {
          flash('Cor adicionada à paleta de borda.');
        } else {
          flash('Essa cor já está disponível na paleta.');
        }
      }
    }

    function updateNodeBorderWidth(value, options = {}) {
      const nodes = selectedNodes.value;
      if (!nodes.length) {
        return;
      }
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) {
        return;
      }
      const clamped = Math.min(Math.max(numeric, 1), 8);
      let changed = false;
      nodes.forEach(node => {
        const previous = Number(node.borderWidth) || 3;
        if (previous !== clamped) {
          node.borderWidth = clamped;
          changed = true;
        }
      });
      if ((options.commit !== false && changed) || options.forceCommit) {
        pushHistory();
      }
    }

    function updateNodeCornerRadius(value, options = {}) {
      const nodes = selectedNodes.value;
      if (!nodes.length) {
        return;
      }
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) {
        return;
      }
      const clamped = Math.min(Math.max(numeric, 0), 64);
      let changed = false;
      nodes.forEach(node => {
        const previous = Number(node.cornerRadius) || 16;
        if (previous !== clamped) {
          node.cornerRadius = clamped;
          changed = true;
        }
      });
      if ((options.commit !== false && changed) || options.forceCommit) {
        pushHistory();
      }
    }

    function setNodeFontSize(size) {
      const nodes = selectedNodes.value;
      if (!nodes.length) {
        return;
      }
      const normalized = String(size);
      let changed = false;
      nodes.forEach(node => {
        if (node.fontSize !== normalized) {
          node.fontSize = normalized;
          changed = true;
        }
      });
      if (changed) {
        pushHistory();
      }
    }

    function setNodeShape(shape) {
      const nodes = selectedNodes.value;
      if (!nodes.length) {
        return;
      }
      let changed = false;
      nodes.forEach(node => {
        if (node.shape !== shape) {
          node.shape = shape;
          changed = true;
        }
      });
      if (changed) {
        pushHistory();
      }
    }

    function copySelectedFormatting() {
      const node = selectedNode.value;
      const edge = selectedEdge.value;
      if (node) {
        formatClipboard.value = {
          type: 'node',
          color: normalizeHex(node.color) || '#f8fafc',
          borderColor: normalizeHex(node.borderColor) || '#94a3b8',
          borderWidth: Number(node.borderWidth) || 3,
          fontSize: String(node.fontSize || '16'),
          cornerRadius: Number(node.cornerRadius) || 16,
        };
        flash('Formatação do nó copiada.');
        return;
      }
      if (edge) {
        const rawThickness = Number(edge.thickness);
        formatClipboard.value = {
          type: 'edge',
          color: normalizeHex(edge.color) || '#94a3b8',
          style: edge.style || 'solid',
          direction: edge.direction || '->',
          thickness:
            Number.isFinite(rawThickness) && rawThickness > 0 ? rawThickness : null,
        };
        flash('Formatação da aresta copiada.');
      }
    }

    function pasteSelectedFormatting() {
      const payload = formatClipboard.value;
      if (!payload) {
        return;
      }
      if (payload.type === 'node') {
        const nodes = selectedNodes.value;
        if (!nodes.length) {
          return;
        }
        let changed = false;
        const fillColor = normalizeHex(payload.color);
        const strokeColor = normalizeHex(payload.borderColor);
        const borderWidth = Number(payload.borderWidth);
        const cornerRadius = Number(payload.cornerRadius);
        const fontSize = payload.fontSize ? String(payload.fontSize) : null;
        nodes.forEach(node => {
          if (fillColor && node.color !== fillColor) {
            node.color = fillColor;
            changed = true;
          }
          if (strokeColor && node.borderColor !== strokeColor) {
            node.borderColor = strokeColor;
            changed = true;
          }
          if (
            Number.isFinite(borderWidth) &&
            borderWidth > 0 &&
            node.borderWidth !== borderWidth
          ) {
            node.borderWidth = borderWidth;
            changed = true;
          }
          if (
            Number.isFinite(cornerRadius) &&
            cornerRadius >= 0
          ) {
            const clampedRadius = Math.min(cornerRadius, 64);
            if (node.cornerRadius !== clampedRadius) {
              node.cornerRadius = clampedRadius;
              changed = true;
            }
          }
          if (fontSize && node.fontSize !== fontSize) {
            node.fontSize = fontSize;
            changed = true;
          }
        });
        if (fillColor) {
          nodeToolbarState.fillCustomColor = fillColor;
          ensureCustomSwatch('fill', fillColor);
          registerRecentColor(fillColor);
        }
        if (strokeColor) {
          nodeToolbarState.strokeCustomColor = strokeColor;
          ensureCustomSwatch('stroke', strokeColor);
          registerRecentColor(strokeColor);
        }
        if (changed) {
          pushHistory();
          const message = nodes.length > 1
            ? 'Formatação aplicada aos nós selecionados.'
            : 'Formatação aplicada ao nó selecionado.';
          flash(message);
        } else {
          const message = nodes.length > 1
            ? 'Todos os nós selecionados já tinham essa formatação.'
            : 'A formatação já está aplicada neste nó.';
          flash(message);
        }
        return;
      }

      if (payload.type === 'edge') {
        const edge = selectedEdge.value;
        if (!edge) {
          return;
        }
        let changed = false;
        const edgeColor = normalizeHex(payload.color);
        if (edgeColor && edge.color !== edgeColor) {
          edge.color = edgeColor;
          edgeToolbarState.customColor = edgeColor;
          ensureCustomSwatch('stroke', edgeColor);
          registerRecentColor(edgeColor);
          changed = true;
        }
        const style = payload.style;
        if (style && edge.style !== style) {
          edge.style = style;
          changed = true;
        }
        const direction = payload.direction;
        if (direction && edge.direction !== direction) {
          edge.direction = direction;
          changed = true;
        }
        if (payload.thickness === null) {
          if (edge.thickness !== null) {
            edge.thickness = null;
            changed = true;
          }
        } else {
          const thicknessValue = Number(payload.thickness);
          if (
            Number.isFinite(thicknessValue) &&
            thicknessValue > 0 &&
            edge.thickness !== thicknessValue
          ) {
            edge.thickness = thicknessValue;
            changed = true;
          }
        }
        if (changed) {
          pushHistory();
          flash('Formatação aplicada à aresta selecionada.');
        } else {
          flash('A formatação já está aplicada nesta aresta.');
        }
      }
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

    function toggleEdgePopover(id) {
      if (id === 'alignment' && !hasSelectedEdgeLabel.value) {
        flash('Adicione um rótulo à aresta antes de ajustar o alinhamento.');
        return;
      }
      edgeToolbarState.activePopover = edgeToolbarState.activePopover === id ? null : id;
    }

    function setEdgeToolbarHover(id) {
      edgeToolbarState.hoveredOption = id;
    }

    function applyEdgeColor(color, options = {}) {
      const edge = selectedEdge.value;
      const normalized = normalizeHex(color);
      if (!edge || !normalized) {
        return;
      }
      const previous = edge.color;
      edge.color = normalized;
      edgeToolbarState.customColor = normalized;
      registerRecentColor(normalized);
      const hasChanged = previous !== normalized;
      if ((options.commit !== false && hasChanged) || options.forceCommit) {
        pushHistory();
      }
    }

    function setEdgeStyle(style) {
      const edge = selectedEdge.value;
      if (!edge || edge.style === style) {
        return;
      }
      edge.style = style;
      pushHistory();
    }

    function setEdgeDirection(direction) {
      const edge = selectedEdge.value;
      if (!edge || edge.direction === direction) {
        return;
      }
      edge.direction = direction;
      pushHistory();
    }

    function flipEdgeDirection() {
      const edge = selectedEdge.value;
      if (!edge) {
        return;
      }
      if (edge.direction === '->') {
        setEdgeDirection('<-');
      } else if (edge.direction === '<-') {
        setEdgeDirection('->');
      } else if (edge.direction === '<->') {
        setEdgeDirection('->');
      } else if (edge.direction === '-') {
        setEdgeDirection('<->');
      } else {
        setEdgeDirection('->');
      }
    }

    function updateSelectedEdgeThickness(value, options = {}) {
      const edge = selectedEdge.value;
      if (!edge) {
        return;
      }
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) {
        return;
      }
      const clamped = Math.min(Math.max(numeric, 1), 8);
      const previous = Number(edge.thickness) || null;
      edge.thickness = clamped;
      const hasChanged = previous !== clamped;
      if ((options.commit !== false && hasChanged) || options.forceCommit) {
        pushHistory();
      }
    }

    function clearEdgeThickness() {
      const edge = selectedEdge.value;
      if (!edge || edge.thickness == null) {
        return;
      }
      edge.thickness = null;
      pushHistory();
    }

    function setEdgeLabelAlignment(alignment) {
      const edge = selectedEdge.value;
      const label = edge?.label;
      if (!edge || !label || typeof label.text !== 'string' || !label.text.trim()) {
        flash('Adicione um rótulo à aresta antes de ajustar o alinhamento.');
        return;
      }
      const normalized = alignment || 'auto';
      if (label.alignment === normalized) {
        return;
      }
      edge.label = {
        ...label,
        alignment: normalized,
      };
      pushHistory();
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

    function triggerMatrixImport() {
      matrixPrompt.text = '';
      matrixPrompt.error = '';
      matrixPrompt.visible = true;
      nextTick(() => {
        matrixPromptTextAreaRef.value?.focus();
      });
    }

    function triggerMatrixFileSelection() {
      matrixPrompt.error = '';
      matrixFileInputRef.value?.click();
    }

    function closeMatrixPrompt() {
      matrixPrompt.visible = false;
      matrixPrompt.text = '';
      matrixPrompt.error = '';
    }

    function confirmMatrixPrompt() {
      const text = matrixPrompt.text.trim();
      if (!text) {
        matrixPrompt.error = 'Cole os dados da matriz ou selecione um arquivo.';
        return;
      }
      try {
        const matrix = parseMatrixFromText(text);
        prepareMatrixImport(matrix, 'entrada manual', { replaceQueue: true });
        closeMatrixPrompt();
      } catch (error) {
        console.error('Falha ao importar matriz colada', error);
        matrixPrompt.error =
          error instanceof Error && error.message
            ? error.message
            : 'Não foi possível interpretar o conteúdo informado.';
      }
    }

    async function handleMatrixFileChange(event) {
      const files = Array.from(event.target.files || []);
      if (!files.length) return;
      try {
        const sortedFiles = files.sort((a, b) =>
          a.name.localeCompare(b.name, 'pt-BR', { numeric: true, sensitivity: 'base' })
        );
        const successes = [];
        const failures = [];
        for (const file of sortedFiles) {
          try {
            const text = await file.text();
            const matrix = parseMatrixFromText(text);
            successes.push({ data: matrix, fileName: file.name });
          } catch (error) {
            console.error('Falha ao importar matriz', error);
            const message =
              error instanceof Error && error.message
                ? error.message
                : 'Não foi possível importar o arquivo selecionado. Verifique se é um CSV válido.';
            failures.push({ fileName: file.name, message });
          }
        }
        if (successes.length) {
          queueMatrixImports(successes, { replaceQueue: true });
          closeMatrixPrompt();
          if (failures.length) {
            const failedNames = failures.map(failure => failure.fileName).join(', ');
            flash(`Alguns arquivos não puderam ser importados: ${failedNames}.`);
          }
        } else if (failures.length) {
          const firstFailure = failures[0];
          const combinedMessage =
            failures.length === 1
              ? `Não foi possível importar ${firstFailure.fileName}: ${firstFailure.message}`
              : 'Não foi possível importar os arquivos selecionados. Verifique se são CSVs válidos.';
          if (matrixPrompt.visible) {
            matrixPrompt.error = combinedMessage;
          } else {
            flash(combinedMessage);
          }
          resetMatrixImportState();
          clearMatrixImportQueue();
        }
      } finally {
        event.target.value = '';
      }
    }

    function cancelMatrixImport() {
      resetMatrixImportState();
      clearMatrixImportQueue();
    }

    function confirmMatrixImport() {
      if (!matrixImport.visible || !matrixImport.values.length) {
        resetMatrixImportState();
        return;
      }
      const data = matrixImport.data.map(row => [...row]);
      const rows = data.length;
      const columns = rows > 0 ? data[0].length : 0;
      if (!rows || !columns) {
        flash('A matriz importada está vazia. Selecione outro arquivo.');
        resetMatrixImportState();
        return;
      }
      const colorMap = matrixImport.values.reduce((acc, value) => {
        const normalized = normalizeHex(matrixImport.colorMap[value]);
        if (normalized) {
          acc[value] = normalized;
        } else if (value === '0') {
          acc[value] = DEFAULT_MATRIX_ZERO_COLOR;
        } else if (value === '1') {
          acc[value] = DEFAULT_MATRIX_ONE_COLOR;
        } else {
          acc[value] = '#0f172a';
        }
        return acc;
      }, {});
      const cellSize = 4;
      const center = getViewportCenterWorld();
      const width = columns * cellSize;
      const height = rows * cellSize;
      const grid = {
        id: `matrix-${matrixSequence++}`,
        x: center.x - width / 2,
        y: center.y - height / 2,
        data,
        colorMap,
        cellSize,
      };
      clampMatrixGridToFrame(grid);
      state.matrixGrids = [...state.matrixGrids, grid];
      setSelected({ type: 'matrix', item: grid });
      refreshSequencesFromState(state.nodes, state.edges, state.textBlocks, state.matrixGrids);
      pushHistory();
      invalidateTikz();
      renderer.value?.draw();
      flash('Matriz importada. Arraste para reposicionar.');
      resetMatrixImportState();
      loadNextMatrixFromQueue();
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
      const matrixGrids = Array.isArray(payload.matrixGrids)
        ? payload.matrixGrids
            .map(grid => normalizeMatrixGrid({ ...grid }))
            .filter(grid => grid.data.length && grid.data[0]?.length)
        : [];
      const frame = payload.frame ? { ...payload.frame } : null;
      const thickness = Number(payload.edgeThickness);

      state.nodes = nodes;
      state.edges = edges;
      state.textBlocks = textBlocks;
      state.matrixGrids = matrixGrids;
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
      refreshSequencesFromState(state.nodes, state.edges, state.textBlocks, state.matrixGrids);
      invalidateTikz();
      pushHistory();
    }

    const mode = computed(() => state.mode);
    const selected = computed(() => state.selected);

    const previewZoomLevel = computed(() => Math.max(1, Math.round(preview.scale * 100)));
    const previewTransformStyle = computed(() => ({
      transform: `translate(${preview.offsetX}px, ${preview.offsetY}px) scale(${preview.scale})`,
      transformOrigin: '0 0',
      willChange: 'transform',
    }));
    const previewStageStyle = computed(() => {
      const width = Math.max(1, Number(preview.contentWidth) || 0);
      const height = Math.max(1, Number(preview.contentHeight) || 0);
      return {
        ...previewTransformStyle.value,
        width: `${width}px`,
        height: `${height}px`,
      };
    });
    const hasPreviewContent = computed(() => !!preview.srcdoc);
    const isPreviewDirty = computed(
      () => !!tikzCode.value && tikzCode.value !== lastRenderedTikz.value
    );
    const isPreviewPanning = computed(() => panModifierActive.value || !!preview.drag);

    let previewContentBounds = null;
    const PREVIEW_MIN_SCALE = 0.05;
    const PREVIEW_MAX_SCALE = 6;

    function clampPreviewScale(value) {
      if (!Number.isFinite(value) || value <= 0) {
        return PREVIEW_MIN_SCALE;
      }
      return Math.min(PREVIEW_MAX_SCALE, Math.max(PREVIEW_MIN_SCALE, value));
    }

    function buildTikzPreviewSrcdoc(rawCode) {
      if (!rawCode) {
        return '';
      }

      const documentMatch = rawCode.match(/\\begin{document}([\s\S]*)\\end{document}/);
      const body = documentMatch ? documentMatch[1].trim() : rawCode.trim();
      const preamble = documentMatch ? rawCode.slice(0, documentMatch.index).trim() : '';

      const preambleLines = preamble
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('\\documentclass') && !line.startsWith('\\usepackage'));

      const sanitizedPreamble = preambleLines.join('\n');

      const accentMap = {
        'á': "\\'{a}",
        'Á': "\\'{A}",
        'à': "\\`{a}",
        'À': "\\`{A}",
        'ã': "\\~{a}",
        'Ã': "\\~{A}",
        'â': "\\^{a}",
        'Â': "\\^{A}",
        'é': "\\'{e}",
        'É': "\\'{E}",
        'ê': "\\^{e}",
        'Ê': "\\^{E}",
        'í': "\\'{i}",
        'Í': "\\'{I}",
        'ó': "\\'{o}",
        'Ó': "\\'{O}",
        'ô': "\\^{o}",
        'Ô': "\\^{O}",
        'õ': "\\~{o}",
        'Õ': "\\~{O}",
        'ú': "\\'{u}",
        'Ú': "\\'{U}",
        'ü': '\\"{u}',
        'Ü': '\\"{U}',
        'ç': '\\c{c}',
        'Ç': '\\c{C}',
        'ñ': "\\~{n}",
        'Ñ': "\\~{N}",
      };

      const normalizeAccents = value => value.replace(/[\u0080-\uFFFF]/g, char => accentMap[char] ?? char);

      const sanitizeScript = content => content.replace(/<\/script/gi, '<\\/script');
      const scriptContents = sanitizeScript(
        normalizeAccents([sanitizedPreamble, body].filter(Boolean).join('\n\n'))
      );

      return [
        '<!DOCTYPE html>',
        '<html lang="pt-BR">',
        '<head>',
        '<meta charset="utf-8">',
        '<title>TikZ Preview</title>',
        '<link rel="stylesheet" href="https://tikzjax.com/v1/fonts.css">',
        '<script src="https://tikzjax.com/v1/tikzjax.js"></script>',
        '<style>body{margin:0;background:#ffffff;color:#0f172a;font-family:\'Inter\',system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;} .loading{color:#475569;font-size:0.9rem;}</style>',
        '</head>',
        '<body>',
        '<div class="loading">Carregando pré-visualização…</div>',
        '<script type="text/tikz" data-latex>',
        scriptContents,
        '</script>',
        '<script>',
        '  window.addEventListener(\'load\', () => {',
        '    const sendBounds = () => {',
        '      const svg = document.querySelector(\'svg\');',
        '      if (!svg) return;',
        '      try {',
        '        const bbox = svg.getBBox();',
        '        if (!bbox || !isFinite(bbox.width) || !isFinite(bbox.height)) {',
        '          return;',
        '        }',
        '        if (bbox.width > 0 && bbox.height > 0) {',
        '          const viewBox = [bbox.x, bbox.y, bbox.width, bbox.height].join(\' \');',
        '          svg.setAttribute(\'viewBox\', viewBox);',
        '        }',
        '        if (window.parent) {',
        '          window.parent.postMessage({',
        '            type: \'tikz-preview-bounds\',',
        '            bounds: { minX: bbox.x, minY: bbox.y, width: bbox.width, height: bbox.height },',
        '          }, "*");',
        '        }',
        '      } catch (error) {',
        '        console.error(\'Não foi possível calcular os limites do SVG gerado pelo TikZ\', error);',
        '      }',
        '    };',
        '    const observer = new MutationObserver(() => {',
        '      const svg = document.querySelector(\'svg\');',
        '      if (svg) {',
        '        document.querySelector(\'.loading\')?.remove();',
        '        observer.disconnect();',
        '        requestAnimationFrame(() => {',
        '          sendBounds();',
        '        });',
        '      }',
        '    });',
        '    observer.observe(document.body, { childList: true, subtree: true });',
        '    sendBounds();',
        '  });',
        '</script>',
        '</body>',
        '</html>',
      ].join('\n');
    }

    function resetPreviewTransform() {
      preview.scale = 1;
      preview.offsetX = 0;
      preview.offsetY = 0;
    }

    function renderPreview() {
      stopPreviewDrag();
      resetPreviewTransform();
      preview.contentWidth = 0;
      preview.contentHeight = 0;
      previewContentBounds = null;
      preview.srcdoc = buildTikzPreviewSrcdoc(tikzCode.value);
      lastRenderedTikz.value = tikzCode.value || '';
    }

    function getPreviewViewportRect() {
      const viewportEl = previewViewportRef.value;
      if (!viewportEl) {
        return { left: 0, top: 0, width: 0, height: 0 };
      }
      const rect = viewportEl.getBoundingClientRect();
      return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    }

    function getPreviewPointer(event) {
      const rect = getPreviewViewportRect();
      const screenX = event.clientX - rect.left;
      const screenY = event.clientY - rect.top;
      const x = (screenX - preview.offsetX) / preview.scale;
      const y = (screenY - preview.offsetY) / preview.scale;
      return { screenX, screenY, x, y };
    }

    function zoomPreviewAt(pointer, factor) {
      const nextScale = clampPreviewScale(preview.scale * factor);
      if (nextScale === preview.scale) {
        return;
      }
      preview.scale = nextScale;
      preview.offsetX = pointer.screenX - pointer.x * nextScale;
      preview.offsetY = pointer.screenY - pointer.y * nextScale;
    }

    function getPreviewCenterPointer() {
      const rect = getPreviewViewportRect();
      const screenX = rect.width / 2;
      const screenY = rect.height / 2;
      const x = (screenX - preview.offsetX) / preview.scale;
      const y = (screenY - preview.offsetY) / preview.scale;
      return { screenX, screenY, x, y };
    }

    function zoomPreviewIn() {
      if (!hasPreviewContent.value) return;
      const center = getPreviewCenterPointer();
      zoomPreviewAt(center, 1.2);
    }

    function zoomPreviewOut() {
      if (!hasPreviewContent.value) return;
      const center = getPreviewCenterPointer();
      zoomPreviewAt(center, 1 / 1.2);
    }

    function getPreviewStagePadding() {
      const stageEl = previewStageRef.value;
      if (!stageEl) {
        return { x: 0, y: 0 };
      }
      const style = window.getComputedStyle(stageEl);
      const paddingX =
        parseFloat(style.paddingLeft || '0') + parseFloat(style.paddingRight || '0');
      const paddingY =
        parseFloat(style.paddingTop || '0') + parseFloat(style.paddingBottom || '0');
      return { x: paddingX, y: paddingY };
    }

    function updatePreviewTransform() {
      if (!previewContentBounds) {
        return;
      }
      const viewportRect = getPreviewViewportRect();
      if (!viewportRect.width || !viewportRect.height) {
        return;
      }
      const { x: paddingX, y: paddingY } = getPreviewStagePadding();
      const availableWidth = Math.max(0, viewportRect.width - paddingX);
      const availableHeight = Math.max(0, viewportRect.height - paddingY);
      if (availableWidth <= 0 || availableHeight <= 0) {
        return;
      }
      const width = previewContentBounds.width || 1;
      const height = previewContentBounds.height || 1;
      const rawScale = Math.min(availableWidth / width, availableHeight / height);
      if (!(rawScale > 0)) {
        return;
      }
      const clampedScale = clampPreviewScale(rawScale);
      preview.scale = rawScale < PREVIEW_MIN_SCALE ? rawScale : clampedScale;
      const effectiveScale = preview.scale;
      const contentWidth = width * effectiveScale;
      const contentHeight = height * effectiveScale;
      preview.offsetX = (viewportRect.width - contentWidth) / 2;
      preview.offsetY = (viewportRect.height - contentHeight) / 2;
    }

    function applyPreviewBounds(bounds) {
      if (!bounds) {
        return;
      }
      const width = Math.max(1, Number(bounds.width) || 0);
      const height = Math.max(1, Number(bounds.height) || 0);
      previewContentBounds = {
        width,
        height,
      };
      preview.contentWidth = width;
      preview.contentHeight = height;
      nextTick(() => {
        updatePreviewTransform();
      });
    }

    function handlePreviewMessage(event) {
      if (!event || typeof event.data !== 'object' || event.data == null) {
        return;
      }
      if (event.data.type === 'tikz-preview-bounds' && event.data.bounds) {
        applyPreviewBounds(event.data.bounds);
      }
    }

    function startPreviewDrag(event) {
      const pointer = getPreviewPointer(event);
      preview.drag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        initialOffsetX: preview.offsetX,
        initialOffsetY: preview.offsetY,
        pointer,
      };
      event.currentTarget?.setPointerCapture?.(event.pointerId);
    }

    function stopPreviewDrag() {
      if (preview.drag?.pointerId != null) {
        const viewportEl = previewViewportRef.value;
        if (viewportEl?.hasPointerCapture?.(preview.drag.pointerId)) {
          viewportEl.releasePointerCapture(preview.drag.pointerId);
        }
      }
      preview.drag = null;
    }

    function onPreviewPointerDown(event) {
      if (!hasPreviewContent.value) return;
      if (shouldStartCameraPan(event)) {
        startPreviewDrag(event);
        event.preventDefault();
      }
    }

    function onPreviewPointerMove(event) {
      if (!preview.drag) return;
      const dx = event.clientX - preview.drag.startX;
      const dy = event.clientY - preview.drag.startY;
      preview.offsetX = preview.drag.initialOffsetX + dx;
      preview.offsetY = preview.drag.initialOffsetY + dy;
    }

    function onPreviewPointerUp(event) {
      if (preview.drag?.pointerId === event.pointerId) {
        stopPreviewDrag();
      }
    }

    function onPreviewPointerCancel(event) {
      if (preview.drag?.pointerId === event.pointerId) {
        stopPreviewDrag();
      }
    }

    function onPreviewWheel(event) {
      if (!hasPreviewContent.value) return;
      event.preventDefault();
      const pointer = getPreviewPointer(event);
      const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
      zoomPreviewAt(pointer, factor);
    }

    watch(tikzCode, value => {
      if (!value) {
        stopPreviewDrag();
        preview.srcdoc = '';
        lastRenderedTikz.value = '';
        resetPreviewTransform();
      }
    });

    const currentHint = computed(() => {
      if (state.mode === 'addText') {
        return 'inserir uma caixa de texto livre';
      }
      return state.edgeDraft
        ? 'ligar a aresta ao nó de destino'
        : 'selecionar elementos ou arrastar conectores para criar arestas';
    });

    const canReset = computed(
      () =>
        state.nodes.length > 0 ||
        state.edges.length > 0 ||
        state.textBlocks.length > 0 ||
        state.matrixGrids.length > 0
    );

    function invalidateTikz(options = {}) {
      renderer.value?.draw();
      if (!autoUpdateTikz.value && !options.force) {
        tikzUpdatePending.value = true;
        return;
      }

      tikzCode.value = generateTikzDocument(
        state.nodes,
        state.edges,
        state.matrixGrids,
        state.frame,
        {
          edgeThickness: state.edgeThickness,
          edgeLabelAlignment: state.edgeLabelAlignment,
        }
      );
      tikzUpdatePending.value = false;
    }

    watch(
      () => [state.nodes, state.edges, state.textBlocks, state.matrixGrids],
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

    function toggleAutoUpdateTikz() {
      autoUpdateTikz.value = !autoUpdateTikz.value;
      if (autoUpdateTikz.value) {
        invalidateTikz({ force: true });
      }
    }

    watch(
      () => matrixPrompt.visible,
      visible => {
        if (visible) {
          nextTick(() => {
            matrixPromptTextAreaRef.value?.focus();
          });
        }
      }
    );

    watch(
      () => matrixPrompt.text,
      () => {
        if (matrixPrompt.error) {
          matrixPrompt.error = '';
        }
      }
    );

    watch(
      () => state.selected?.item?.id,
      () => {
        renderer.value?.draw();
      }
    );

    watch(
      selectedNode,
      node => {
        if (!node) {
          nodeToolbarState.activePopover = null;
          nodeToolbarState.hoveredOption = null;
          nodeToolbarState.fillCustomColor = '#f8fafc';
          nodeToolbarState.strokeCustomColor = '#94a3b8';
          return;
        }
        nodeToolbarState.activePopover = null;
        nodeToolbarState.hoveredOption = null;
        nodeToolbarState.fillCustomColor = normalizeHex(node.color) || '#f8fafc';
        nodeToolbarState.strokeCustomColor = normalizeHex(node.borderColor) || '#94a3b8';
      }
    );

    watch(
      selectedEdge,
      edge => {
        if (!edge) {
          edgeToolbarState.activePopover = null;
          edgeToolbarState.hoveredOption = null;
          edgeToolbarState.customColor = '#94a3b8';
          return;
        }
        edgeToolbarState.activePopover = null;
        edgeToolbarState.hoveredOption = null;
        edgeToolbarState.customColor = normalizeHex(edge.color) || '#94a3b8';
      }
    );

    watch(
      inspectorVisible,
      visible => {
        if (visible) {
          sidebarTab.value = 'inspect';
        } else if (sidebarTab.value === 'inspect') {
          sidebarTab.value = 'code';
        }
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
    }

    function toggleNodeMenu() {
      const next = !showNodeMenu.value;
      showNodeMenu.value = next;
      if (next) {
        showEdgeThicknessMenu.value = false;
        showLabelAlignmentMenu.value = false;
        showHistoryMenu.value = false;
        showSettingsDialog.value = false;
      }
    }

    function closeNodeMenu() {
      showNodeMenu.value = false;
    }

    function toggleEdgeThicknessMenu() {
      const next = !showEdgeThicknessMenu.value;
      showEdgeThicknessMenu.value = next;
      if (next) {
        showNodeMenu.value = false;
        showLabelAlignmentMenu.value = false;
        showHistoryMenu.value = false;
        showSettingsDialog.value = false;
      }
    }

    function closeEdgeThicknessMenu() {
      showEdgeThicknessMenu.value = false;
    }

    function toggleLabelAlignmentMenu() {
      const next = !showLabelAlignmentMenu.value;
      showLabelAlignmentMenu.value = next;
      if (next) {
        showNodeMenu.value = false;
        showEdgeThicknessMenu.value = false;
        showHistoryMenu.value = false;
        showSettingsDialog.value = false;
      }
    }

    function closeLabelAlignmentMenu() {
      showLabelAlignmentMenu.value = false;
    }

    function toggleHistoryMenu() {
      const next = !showHistoryMenu.value;
      showHistoryMenu.value = next;
      if (next) {
        showNodeMenu.value = false;
        showEdgeThicknessMenu.value = false;
        showLabelAlignmentMenu.value = false;
        showSettingsDialog.value = false;
      }
    }

    function closeHistoryMenu() {
      showHistoryMenu.value = false;
    }

    function toggleSettingsDialog() {
      const next = !showSettingsDialog.value;
      showSettingsDialog.value = next;
      if (next) {
        showNodeMenu.value = false;
        showEdgeThicknessMenu.value = false;
        showLabelAlignmentMenu.value = false;
        showHistoryMenu.value = false;
      }
    }

    function closeSettingsDialog() {
      showSettingsDialog.value = false;
    }

    function toggleTemplateBrowser() {
      showTemplateBrowser.value = !showTemplateBrowser.value;
    }

    function closeTemplateBrowser() {
      showTemplateBrowser.value = false;
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

    function clampMatrixGridToFrame(grid) {
      if (!state.frame || !grid) return;
      const rows = Array.isArray(grid.data) ? grid.data.length : 0;
      const columns = rows > 0 && Array.isArray(grid.data[0]) ? grid.data[0].length : 0;
      const cellSize = Number(grid.cellSize) || 0;
      const rect = {
        x: grid.x,
        y: grid.y,
        width: columns * cellSize,
        height: rows * cellSize,
      };
      clampRectToFrame(rect);
      grid.x = rect.x;
      grid.y = rect.y;
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
      flash('Novo nó adicionado. Arraste para reposicionar e conecte pelos pontos azuis.');
    }

    function resetGraph() {
      state.nodes = [];
      state.edges = [];
      state.textBlocks = [];
      state.matrixGrids = [];
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
      state.matrixGrids = (template.matrixGrids || []).map(grid =>
        normalizeMatrixGrid({ ...grid })
      );
      state.selected = null;
      state.mode = 'select';
      state.edgeDraft = null;
      state.hoverNodeId = null;
      state.hoverAnchor = null;
      state.pointer = null;
      clearGuides();
      refreshSequencesFromState(state.nodes, state.edges, state.textBlocks, state.matrixGrids);

      pushHistory();
      invalidateTikz();
      renderer.value?.draw();
      showTemplateBrowser.value = false;
      flash(`Modelo "${template.name}" carregado. Ajuste conforme necessário.`);
    }

    function selectNode(node, options = {}) {
      if (!node) {
        setSelected(null);
        return;
      }
      if (options.additive) {
        const current = selectedNodes.value;
        const exists = current.some(item => item.id === node.id);
        const nextItems = exists
          ? current.filter(item => item.id !== node.id)
          : [...current, node];
        if (!nextItems.length) {
          setSelected(null);
          return;
        }
        const primary = exists ? nextItems[nextItems.length - 1] : node;
        setSelected({ type: 'node', items: nextItems, item: primary });
        return;
      }
      const current = selectedNodes.value;
      const alreadySelected = current.some(item => item.id === node.id);
      if (alreadySelected && current.length > 1) {
        setSelected({ type: 'node', items: current, item: node });
        return;
      }
      setSelected({ type: 'node', item: node });
    }

    function setSelected(payload) {
      if (!payload) {
        state.selected = null;
        return;
      }
      if (payload.type === 'node') {
        const items = [];
        if (Array.isArray(payload.items)) {
          payload.items.forEach(item => {
            if (item && typeof item.id === 'string' && !items.some(existing => existing.id === item.id)) {
              items.push(item);
            }
          });
        }
        if (payload.item && typeof payload.item.id === 'string' && !items.some(item => item.id === payload.item.id)) {
          items.push(payload.item);
        }
        if (!items.length) {
          state.selected = null;
          return;
        }
        const primary =
          payload.item && items.some(item => item.id === payload.item.id)
            ? payload.item
            : items[items.length - 1];
        state.selected = {
          type: 'node',
          item: primary,
          items,
        };
        return;
      }
      state.selected = payload;
    }

    function removeSelected() {
      const current = state.selected;
      if (!current) return;
      if (current.type === 'node') {
        const nodes = Array.isArray(current.items) && current.items.length
          ? current.items
          : current.item
            ? [current.item]
            : [];
        if (!nodes.length) {
          return;
        }
        const nodeIds = new Set(nodes.map(node => node.id));
        state.edges = state.edges.filter(
          edge => !nodeIds.has(edge.from) && !nodeIds.has(edge.to)
        );
        state.nodes = state.nodes.filter(node => !nodeIds.has(node.id));
      } else if (current.type === 'edge') {
        state.edges = state.edges.filter(edge => edge.id !== current.item.id);
      } else if (current.type === 'text') {
        state.textBlocks = state.textBlocks.filter(block => block.id !== current.item.id);
      } else if (current.type === 'matrix') {
        state.matrixGrids = state.matrixGrids.filter(grid => grid.id !== current.item.id);
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

      const skipIds = new Set();
      if (context.mode === 'move-node') {
        if (Array.isArray(context.selection) && context.selection.length) {
          context.selection.forEach(entry => {
            if (entry?.node?.id) {
              skipIds.add(entry.node.id);
            }
          });
        } else if (context.item?.id) {
          skipIds.add(context.item.id);
        }
      }

      state.nodes.forEach(node => {
        if (skipIds.has(node.id)) return;
        addBounds(renderer.value.getNodeBounds(node));
      });

      (state.textBlocks || []).forEach(block => {
        if (context.mode === 'move-text' && block.id === context.item.id) return;
        addBounds(renderer.value.getTextBlockBounds(block));
      });

      (state.matrixGrids || []).forEach(grid => {
        if (context.mode === 'move-matrix' && grid.id === context.item.id) return;
        const bounds = renderer.value?.getMatrixGridBounds?.(grid);
        addBounds(bounds);
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
      const matrixHit = !textHit
        ? renderer.value?.getMatrixGridAtPosition(pointer.x, pointer.y) || null
        : null;
      let node = textHit ? null : renderer.value?.getNodeAtPosition(pointer.x, pointer.y) || null;
      const edge = !node && !textHit && !matrixHit
        ? renderer.value?.getEdgeAtPosition(pointer.x, pointer.y) || null
        : null;
      const labelHit = !node && !textHit && !matrixHit
        ? renderer.value?.getEdgeLabelAtPosition(pointer.x, pointer.y) || null
        : null;
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
        } else if (matrixHit) {
          state.matrixGrids = state.matrixGrids.filter(grid => grid.id !== matrixHit.id);
          flash('Grade de matriz removida.');
        } else if (edge) {
          state.edges = state.edges.filter(item => item.id !== edge.id);
          flash('Aresta removida.');
        }
        if (textHit || node || matrixHit || edge) {
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

      if (matrixHit && !node) {
        setSelected({ type: 'matrix', item: matrixHit });
        if (allowDrag) {
          startDrag({
            type: 'matrix',
            mode: 'move-matrix',
            item: matrixHit,
            pointerStart: pointer,
            initial: { x: matrixHit.x, y: matrixHit.y },
            bounds: renderer.value?.getMatrixGridBounds?.(matrixHit),
          });
          event.preventDefault();
        }
        renderer.value?.draw();
        return;
      }

      if (node) {
        selectNode(node, { additive: event.shiftKey });
        if (allowDrag) {
          const selection = selectedNodes.value;
          const stillSelected = selection.some(item => item.id === node.id);
          if (!stillSelected) {
            renderer.value?.draw();
            return;
          }
          const selectionEntries = selection.map(item => ({
            node: item,
            initial: { x: item.x, y: item.y },
          }));
          let bounds = renderer.value?.getNodeBounds(node) || null;
          if (selection.length > 1 && renderer.value) {
            let left = Infinity;
            let right = -Infinity;
            let top = Infinity;
            let bottom = -Infinity;
            selection.forEach(item => {
              const nodeBounds = renderer.value?.getNodeBounds(item);
              if (!nodeBounds) {
                return;
              }
              left = Math.min(left, nodeBounds.left);
              right = Math.max(right, nodeBounds.right);
              top = Math.min(top, nodeBounds.top);
              bottom = Math.max(bottom, nodeBounds.bottom);
            });
            if (Number.isFinite(left) && Number.isFinite(right) && Number.isFinite(top) && Number.isFinite(bottom)) {
              bounds = {
                left,
                right,
                top,
                bottom,
                centerX: left + (right - left) / 2,
                centerY: top + (bottom - top) / 2,
              };
            }
          }
          startDrag({
            type: 'node',
            mode: 'move-node',
            item: node,
            pointerStart: pointer,
            initial: { x: node.x, y: node.y },
            bounds,
            selection: selectionEntries,
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
          if (Array.isArray(context.selection) && context.selection.length) {
            context.selection.forEach(entry => {
              if (!entry?.node || !entry.initial) return;
              entry.node.x = entry.initial.x + dx;
              entry.node.y = entry.initial.y + dy;
            });
          } else {
            context.item.x = context.initial.x + dx;
            context.item.y = context.initial.y + dy;
          }
        } else if (context.mode === 'move-text') {
          context.item.x = context.initial.x + dx;
          context.item.y = context.initial.y + dy;
        } else if (context.mode === 'move-matrix') {
          context.item.x = context.initial.x + dx;
          context.item.y = context.initial.y + dy;
          clampMatrixGridToFrame(context.item);
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
      const margin = 16;
      const baseLeft = point.x + canvasRect.left - wrapperRect.left - width / 2;
      const baseTop = point.y + canvasRect.top - wrapperRect.top - height / 2;
      const maxLeft = wrapperRect.width - width - margin;
      const maxTop = wrapperRect.height - height - margin;
      const left = Math.min(Math.max(baseLeft, margin), Math.max(margin, maxLeft));
      const top = Math.min(Math.max(baseTop, margin), Math.max(margin, maxTop));
      return { left, top };
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
      inlineEditor.width = 350;
      inlineEditor.height = 220;
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
      inlineEditor.width = 350;
      inlineEditor.height = 220;
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
        matrixGrids: state.matrixGrids.map(grid => ({
          ...grid,
          data: Array.isArray(grid.data) ? grid.data.map(row => [...row]) : [],
          colorMap: { ...(grid.colorMap || {}) },
        })),
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
      state.matrixGrids = (snap.matrixGrids || []).map(grid =>
        normalizeMatrixGrid({ ...grid })
      );
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
      refreshSequencesFromState(state.nodes, state.edges, state.textBlocks, state.matrixGrids);
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
        matrixGrids: state.matrixGrids.map(grid => ({
          ...grid,
          data: Array.isArray(grid.data) ? grid.data.map(row => [...row]) : [],
          colorMap: { ...(grid.colorMap || {}) },
        })),
        frame: state.frame ? { ...state.frame } : null,
        edgeThickness: state.edgeThickness,
        camera: { ...state.camera },
        edgeLabelAlignment: state.edgeLabelAlignment,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const defaultName = `diagrama-${timestamp}`;
      const requestedName = window.prompt(
        'Informe o nome do arquivo (sem extensão):',
        defaultName
      );
      const sanitizedName = (() => {
        if (typeof requestedName !== 'string') {
          return defaultName;
        }
        const trimmed = requestedName.trim();
        if (!trimmed) {
          return defaultName;
        }
        const cleaned = trimmed.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '-');
        const limited = cleaned.slice(0, 80);
        return limited || defaultName;
      })();
      const link = document.createElement('a');
      link.href = url;
      link.download = `${sanitizedName}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      flash(`Diagrama exportado como ${sanitizedName}.json.`);
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
      if (previewContentBounds) {
        nextTick(() => {
          updatePreviewTransform();
        });
      }
    };

    function handleKeyDown(event) {
      const target = event.target;
      const isTextInput =
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);

      if (event.key === 'Escape') {
        if (showSettingsDialog.value) {
          closeSettingsDialog();
          return;
        }
        if (showHistoryMenu.value) {
          closeHistoryMenu();
          return;
        }
        if (showEdgeThicknessMenu.value) {
          closeEdgeThicknessMenu();
          return;
        }
        if (showLabelAlignmentMenu.value) {
          closeLabelAlignmentMenu();
          return;
        }
        if (showNodeMenu.value) {
          closeNodeMenu();
          return;
        }
        if (showTemplateBrowser.value) {
          closeTemplateBrowser();
          return;
        }
        if (inlineEditor.visible) {
          closeInlineEditor();
          return;
        }
        if (state.selected) {
          setSelected(null);
          renderer.value?.draw();
          return;
        }
        return;
      }

      if (event.code === 'Space') {
        if (isTextInput) {
          return;
        }
        if (!event.repeat) {
          panModifierActive.value = true;
        }
        event.preventDefault();
      }
      if (isTextInput && inlineEditor.visible) {
        return;
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
      if (event.key === 'Delete' && !isTextInput) {
        if (state.selected) {
          event.preventDefault();
          removeSelected();
        }
      }
    }

    function handleKeyUp(event) {
      if (event.code === 'Space') {
        panModifierActive.value = false;
        if (state.cameraDrag) {
          endCameraDrag();
          renderer.value?.draw();
        }
        if (preview.drag) {
          stopPreviewDrag();
        }
      }
    }

    function handleDocumentPointer(event) {
      if (showEdgeThicknessMenu.value) {
        const menuEl = edgeThicknessMenuRef.value;
        const buttonEl = edgeThicknessMenuButtonRef.value;
        if (!(menuEl?.contains(event.target) || buttonEl?.contains(event.target))) {
          closeEdgeThicknessMenu();
        }
      }

      if (showHistoryMenu.value) {
        const menuEl = historyMenuRef.value;
        const buttonEl = historyMenuButtonRef.value;
        if (!(menuEl?.contains(event.target) || buttonEl?.contains(event.target))) {
          closeHistoryMenu();
        }
      }

      if (showLabelAlignmentMenu.value) {
        const menuEl = labelAlignmentMenuRef.value;
        const buttonEl = labelAlignmentMenuButtonRef.value;
        if (!(menuEl?.contains(event.target) || buttonEl?.contains(event.target))) {
          closeLabelAlignmentMenu();
        }
      }

      if (showNodeMenu.value) {
        const menuEl = nodeMenuRef.value;
        const buttonEl = nodeMenuButtonRef.value;
        if (!(menuEl?.contains(event.target) || buttonEl?.contains(event.target))) {
          closeNodeMenu();
        }
      }

      if (nodeToolbarState.activePopover) {
        const toolbarEl = nodeToolbarRef.value;
        if (!(toolbarEl?.contains(event.target))) {
          nodeToolbarState.activePopover = null;
        }
      }

      if (edgeToolbarState.activePopover) {
        const toolbarEl = edgeToolbarRef.value;
        if (!(toolbarEl?.contains(event.target))) {
          edgeToolbarState.activePopover = null;
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
      window.addEventListener('message', handlePreviewMessage);
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
      window.removeEventListener('message', handlePreviewMessage);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('pointerdown', handleDocumentPointer);
    });

    function setSidebarTab(tab) {
      const allowed = ['inspect', 'code', 'preview'];
      sidebarTab.value = allowed.includes(tab) ? tab : 'inspect';
    }

    return {
      availableShapes,
      templates,
      selectedNodes,
      selectedNode,
      nodeToolbarRef,
      edgeToolbarRef,
      nodeToolbarState,
      edgeToolbarState,
      nodeFillPalette,
      nodeStrokePalette,
      recentColorPalette,
      nodeToolbarHint,
      nodeToolbarStyle,
      edgeToolbarHint,
      edgeToolbarStyle,
      hasSelectedEdgeLabel,
      fontSizeOptions,
      canPasteFormatting,
      toggleNodePopover,
      setNodeToolbarHover,
      applyNodeFill,
      applyNodeBorder,
      addCustomColor,
      updateNodeBorderWidth,
      updateNodeCornerRadius,
      setNodeFontSize,
      setNodeShape,
      copySelectedFormatting,
      pasteSelectedFormatting,
      selectedEdge,
      toggleEdgePopover,
      setEdgeToolbarHover,
      applyEdgeColor,
      setEdgeStyle,
      setEdgeDirection,
      flipEdgeDirection,
      updateSelectedEdgeThickness,
      clearEdgeThickness,
      setEdgeLabelAlignment,
      mode,
      selected,
      canUndo,
      canRedo,
      currentHint,
      canReset,
      frame,
      zoomLevel,
      isPanningActive,
      tikzCode,
      preview,
      autoUpdateTikz,
      tikzUpdatePending,
      previewViewportRef,
      previewStageRef,
      previewStageStyle,
      previewZoomLevel,
      hasPreviewContent,
      isPreviewDirty,
      isPreviewPanning,
      sidebarTab,
      currentTheme,
      setTheme,
      renderPreview,
      zoomPreviewIn,
      zoomPreviewOut,
      onPreviewPointerDown,
      onPreviewPointerMove,
      onPreviewPointerUp,
      onPreviewPointerCancel,
      onPreviewWheel,
      feedback,
      edgeThickness,
      edgeLabelAlignment,
      inspectorVisible,
      canvasRef,
      canvasWrapperRef,
      nodeMenuButtonRef,
      nodeMenuRef,
      edgeThicknessMenuButtonRef,
      edgeThicknessMenuRef,
      labelAlignmentMenuButtonRef,
      labelAlignmentMenuRef,
      historyMenuButtonRef,
      historyMenuRef,
      showTemplateBrowser,
      diagramFileInputRef,
      matrixFileInputRef,
      inlineEditor,
      inlineEditorLineMarkers,
      inlineEditorRef,
      showNodeMenu,
      showEdgeThicknessMenu,
      showLabelAlignmentMenu,
      showHistoryMenu,
      showSettingsDialog,
      changeMode,
      toggleNodeMenu,
      toggleEdgeThicknessMenu,
      toggleLabelAlignmentMenu,
      toggleHistoryMenu,
      toggleSettingsDialog,
      toggleTemplateBrowser,
      closeTemplateBrowser,
      closeEdgeThicknessMenu,
      closeLabelAlignmentMenu,
      closeHistoryMenu,
      closeSettingsDialog,
      createNodeFromMenu,
      resetGraph,
      applyTemplate,
      saveDiagram,
      copyToClipboard,
      matrixImport,
      matrixPrompt,
      matrixPromptTextAreaRef,
      canSubmitMatrixPrompt,
      canConfirmMatrixImport,
      triggerMatrixImport,
      triggerMatrixFileSelection,
      closeMatrixPrompt,
      confirmMatrixPrompt,
      handleMatrixFileChange,
      cancelMatrixImport,
      confirmMatrixImport,
      updateMatrixImportColor,
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
      toggleAutoUpdateTikz,
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
      setSidebarTab,
    };
  },
}).mount('#app');
