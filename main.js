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
  shape: shape || 'circle',
  fontSize: '16',
});

let nodeSequence = 1;
let edgeSequence = 1;
let textSequence = 1;

function makeNode(x, y, shape) {
  return {
    id: `node-${nodeSequence++}`,
    x,
    y,
    ...defaultNode(shape),
  };
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
  return edge;
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
    });

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
      tikzCode.value = generateTikzDocument(state.nodes, state.edges);
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

    function createNodeFromMenu(shape) {
      closeNodeMenu();
      const { width, height } = currentViewport();
      const node = makeNode(width / 2, height / 2, shape);
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

      state.nodes = template.nodes.map(node => ({ ...node }));
      state.edges = template.edges.map(edge => normalizeEdge({ ...edge }));
      state.textBlocks = (template.textBlocks || []).map(block => ({ ...block }));
      state.selected = null;
      state.mode = 'select';
      state.edgeDraft = null;
      state.hoverNodeId = null;
      state.hoverAnchor = null;
      state.pointer = null;

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

    function getPointerPosition(event) {
      const canvas = canvasRef.value;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
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
        axisLock: null,
      };
      state.dragMoved = false;
    }

    function onCanvasMouseDown(event) {
      const pointer = getPointerPosition(event);
      state.pointer = pointer;
      const anchorHit = renderer.value?.getAnchorAtPosition(pointer.x, pointer.y) || null;
      const textHit = renderer.value?.getTextBlockAtPosition(pointer.x, pointer.y) || null;
      let node = textHit ? null : renderer.value?.getNodeAtPosition(pointer.x, pointer.y) || null;
      const edge = !node && !textHit ? renderer.value?.getEdgeAtPosition(pointer.x, pointer.y) || null : null;
      if (!node && anchorHit) {
        node = anchorHit.node;
      }
      closeNodeMenu();

      const canStartEdgeFromAnchor =
        !!anchorHit && state.mode !== 'addText' && state.mode !== 'delete';

      if (canStartEdgeFromAnchor) {
        const anchor = anchorHit.anchor;
        state.edgeDraft = {
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
        const { width: viewWidth, height: viewHeight } = currentViewport();
        block.x = Math.min(Math.max(block.x, 16), Math.max(16, viewWidth - width - 16));
        block.y = Math.min(Math.max(block.y, 16), Math.max(16, viewHeight - height - 16));
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
          });
          event.preventDefault();
        }
        renderer.value?.draw();
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

      if (state.edgeDraft) {
        state.edgeDraft.pointer = pointer;
        const anchorHit = renderer.value?.getAnchorAtPosition(pointer.x, pointer.y) || null;
        const hoveredNode = renderer.value?.getNodeAtPosition(pointer.x, pointer.y) || null;
        let target = null;
        let hoverNodeId = state.edgeDraft.from.nodeId;
        let hoverAnchor = state.edgeDraft.from.anchor;

        if (anchorHit) {
          target = {
            nodeId: anchorHit.node.id,
            anchor: anchorHit.anchor,
            valid: anchorHit.node.id !== state.edgeDraft.from.nodeId,
          };
          hoverNodeId = anchorHit.node.id;
          hoverAnchor = anchorHit.anchor;
        } else if (hoveredNode) {
          const suggested = determineAnchorForPointer(hoveredNode, pointer);
          target = {
            nodeId: hoveredNode.id,
            anchor: suggested,
            valid: hoveredNode.id !== state.edgeDraft.from.nodeId,
          };
          hoverNodeId = hoveredNode.id;
          hoverAnchor = suggested;
        } else {
          target = null;
        }

        state.edgeDraft.target = target;
        state.hoverNodeId = hoverNodeId;
        state.hoverAnchor = hoverAnchor;
        renderer.value?.draw();
        return;
      }

      const context = state.dragContext;
      if (context) {
        let dx = pointer.x - context.pointerStart.x;
        let dy = pointer.y - context.pointerStart.y;

        if (event.shiftKey) {
          if (!context.axisLock) {
            context.axisLock = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
          }
        } else {
          context.axisLock = null;
        }

        if (context.axisLock === 'x') {
          dy = 0;
        } else if (context.axisLock === 'y') {
          dx = 0;
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
      if (event) {
        state.pointer = getPointerPosition(event);
      }
      if (state.edgeDraft) {
        const draft = state.edgeDraft;
        const target = draft.target;
        if (target?.valid) {
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
        updateHoverState(state.pointer);
        renderer.value?.draw();
        return;
      }
      if (state.dragMoved) {
        pushHistory();
      }
      state.dragContext = null;
      state.dragMoved = false;
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

    function openEdgeEditor(edge) {
      const geometry = renderer.value?.getEdgeGeometry(edge);
      let point = geometry?.labelPoint;
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
          target.label.text = trimmed;
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
      if (inlineEditor.type === 'edge' && event.key === 'Enter' && !event.shiftKey) {
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
      };
    }

    function applySnapshot(snap) {
      state.nodes = snap.nodes.map(node => ({ ...node }));
      state.edges = snap.edges.map(edge => normalizeEdge({ ...edge }));
      state.textBlocks = snap.textBlocks.map(block => ({ ...block }));
      state.selected = null;
      state.edgeDraft = null;
      state.hoverNodeId = null;
      state.hoverAnchor = null;
      state.pointer = null;
      renderer.value?.draw();
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

    async function copyToClipboard() {
      try {
        await navigator.clipboard.writeText(tikzCode.value);
        flash('Código TikZ copiado para a área de transferência.');
      } catch (error) {
        flash('Não foi possível copiar automaticamente. Selecione o texto manualmente.');
      }
    }

    const handleResize = () => {
      if (!renderer.value) return;
      const previous = { ...viewport.value };
      renderer.value.resize();
      const next = renderer.value.getViewport();
      if (previous.width && previous.height && (previous.width !== next.width || previous.height !== next.height)) {
        const scaleX = next.width / previous.width;
        const scaleY = next.height / previous.height;
        state.nodes.forEach(node => {
          node.x *= scaleX;
          node.y *= scaleY;
        });
        state.textBlocks.forEach(block => {
          block.x *= scaleX;
          block.y *= scaleY;
          block.width *= scaleX;
          block.height *= scaleY;
        });
        renderer.value.draw();
      }
      viewport.value = next;
    };

    function handleKeyDown(event) {
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
      tikzCode,
      canvasRef,
      canvasWrapperRef,
      nodeMenuButtonRef,
      nodeMenuRef,
      inlineEditor,
      inlineEditorRef,
      showNodeMenu,
      changeMode,
      toggleNodeMenu,
      createNodeFromMenu,
      resetGraph,
      applyTemplate,
      copyToClipboard,
      onCanvasMouseDown,
      onCanvasMouseMove,
      onCanvasMouseUp,
      onCanvasDblClick,
      removeSelected,
      invalidateTikz,
      closeInlineEditor,
      confirmInlineEditor,
      handleEditorKeydown,
      openTextBlockEditor,
      commitHistory,
      onOptionChange,
      undo,
      redo,
    };
  },
}).mount('#app');
