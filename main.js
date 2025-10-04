import {
  createApp,
  ref,
  reactive,
  computed,
  watch,
  onMounted,
  onUnmounted,
} from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js';
import { createCanvasRenderer } from './src/canvas.js';
import { generateTikzDocument } from './src/tikz.js';

const defaultNode = () => ({
  label: 'Novo nó',
  color: '#f8fafc',
  shape: 'circle',
  fontSize: '16',
});

let nodeSequence = 1;
let edgeSequence = 1;

function makeNode(x, y) {
  return {
    id: `node-${nodeSequence++}`,
    x,
    y,
    ...defaultNode(),
  };
}

function makeEdge(from, to) {
  return {
    id: `edge-${edgeSequence++}`,
    from,
    to,
    style: 'solid',
    direction: '->',
    shape: '--',
    bend: 30,
  };
}

createApp({
  setup() {
    const state = reactive({
      nodes: [],
      edges: [],
      mode: 'select',
      selected: null,
      edgeStart: null,
      dragging: false,
      dragOffset: { x: 0, y: 0 },
      dragTarget: null,
    });

    const canvasRef = ref(null);
    const renderer = ref(null);
    const feedback = ref('');
    let feedbackTimeout = null;
    let resizeObserver = null;
    const handleResize = () => renderer.value?.resize();

    const tools = [
      { mode: 'select', label: 'Selecionar', icon: '🖱️', accent: 'purple' },
      { mode: 'addNode', label: 'Novo nó', icon: '➕', accent: 'blue' },
      { mode: 'addEdge', label: 'Nova aresta', icon: '🪢', accent: 'green' },
      { mode: 'move', label: 'Mover', icon: '✋', accent: 'amber' },
      { mode: 'delete', label: 'Remover', icon: '🗑️', accent: 'red' },
    ];

    const mode = computed(() => state.mode);
    const selected = computed(() => state.selected);

    function flash(message) {
      feedback.value = message;
      if (feedbackTimeout) {
        clearTimeout(feedbackTimeout);
      }
      feedbackTimeout = setTimeout(() => {
        feedback.value = '';
      }, 2800);
    }

    const defaultStatus = computed(() => {
      switch (state.mode) {
        case 'addNode':
          return 'Clique no canvas para criar um novo nó.';
        case 'addEdge':
          return state.edgeStart
            ? 'Escolha o nó de destino para finalizar a aresta.'
            : 'Selecione um nó inicial para a nova aresta.';
        case 'move':
          return 'Arraste nós existentes para reposicioná-los.';
        case 'delete':
          return 'Clique em nós ou arestas para removê-los.';
        default:
          return 'Selecione itens para editar ou use a barra de ferramentas para criar elementos.';
      }
    });

    const statusMessage = computed(() => feedback.value || defaultStatus.value);

    const currentHint = computed(() => {
      if (state.mode === 'addEdge' && state.edgeStart) {
        return 'ligar a aresta ao nó de destino';
      }
      switch (state.mode) {
        case 'addNode':
          return 'adicionar um novo nó';
        case 'addEdge':
          return 'escolher o nó inicial da aresta';
        case 'move':
          return 'reposicionar o nó selecionado';
        case 'delete':
          return 'remover elementos indesejados';
        default:
          return 'selecionar elementos ou arrastar nós';
      }
    });

    const canReset = computed(() => state.nodes.length > 0 || state.edges.length > 0);

    const tikzCode = ref('');

    function invalidateTikz() {
      tikzCode.value = generateTikzDocument(state.nodes, state.edges);
      renderer.value?.draw();
    }

    watch(
      () => [state.nodes, state.edges],
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

    function changeMode(newMode) {
      state.mode = newMode;
      if (newMode !== 'addEdge') {
        state.edgeStart = null;
      }
      flash(defaultStatus.value);
    }

    function resetGraph() {
      state.nodes = [];
      state.edges = [];
      state.selected = null;
      state.edgeStart = null;
      state.mode = 'select';
      flash('O diagrama foi limpo. Comece adicionando novos nós.');
      invalidateTikz();
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
      }
      state.selected = null;
      flash('Elemento removido do canvas.');
      invalidateTikz();
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

    function onCanvasMouseDown(event) {
      const { x, y } = getPointerPosition(event);
      const node = renderer.value?.getNodeAtPosition(x, y) || null;
      const edge = node ? null : renderer.value?.getEdgeAtPosition(x, y) || null;

      if (state.mode === 'select') {
        if (node) {
          setSelected({ type: 'node', item: node });
        } else if (edge) {
          setSelected({ type: 'edge', item: edge });
        } else {
          setSelected(null);
        }
        return;
      }

      if (state.mode === 'move') {
        if (node) {
          state.dragTarget = node;
          state.dragging = true;
          state.dragOffset = { x: x - node.x, y: y - node.y };
          setSelected({ type: 'node', item: node });
        } else {
          setSelected(null);
        }
        return;
      }

      if (state.mode === 'addNode') {
        const newNode = makeNode(x, y);
        state.nodes = [...state.nodes, newNode];
        setSelected({ type: 'node', item: newNode });
        flash('Novo nó criado. Ajuste os detalhes no painel ao lado.');
        state.mode = 'select';
        return;
      }

      if (state.mode === 'addEdge') {
        if (state.edgeStart && node && node.id !== state.edgeStart.id) {
          const newEdge = makeEdge(state.edgeStart.id, node.id);
          state.edges = [...state.edges, newEdge];
          setSelected({ type: 'edge', item: newEdge });
          flash('Aresta criada com sucesso.');
          state.edgeStart = null;
          state.mode = 'select';
        } else if (node) {
          state.edgeStart = node;
          flash('Agora clique no nó de destino para concluir.');
        } else {
          state.edgeStart = null;
        }
        return;
      }

      if (state.mode === 'delete') {
        if (node) {
          state.edges = state.edges.filter(edge => edge.from !== node.id && edge.to !== node.id);
          state.nodes = state.nodes.filter(item => item.id !== node.id);
          flash('Nó removido. As arestas conectadas também foram apagadas.');
        } else if (edge) {
          state.edges = state.edges.filter(item => item.id !== edge.id);
          flash('Aresta removida.');
        }
        setSelected(null);
        return;
      }
    }

    function onCanvasMouseMove(event) {
      if (!state.dragging || !state.dragTarget) return;
      const { x, y } = getPointerPosition(event);
      state.dragTarget.x = x - state.dragOffset.x;
      state.dragTarget.y = y - state.dragOffset.y;
    }

    function onCanvasMouseUp() {
      if (state.dragging) {
        state.dragging = false;
        state.dragTarget = null;
      }
    }

    async function copyToClipboard() {
      try {
        await navigator.clipboard.writeText(tikzCode.value);
        flash('Código TikZ copiado para a área de transferência.');
      } catch (error) {
        flash('Não foi possível copiar automaticamente. Selecione o texto manualmente.');
      }
    }

    onMounted(() => {
      const canvas = canvasRef.value;
      if (!canvas) return;
      renderer.value = createCanvasRenderer(canvas, state);
      if (canvas.parentElement && 'ResizeObserver' in window) {
        resizeObserver = new ResizeObserver(() => renderer.value?.resize());
        resizeObserver.observe(canvas.parentElement);
      }
      window.addEventListener('resize', handleResize);
      invalidateTikz();
    });

    onUnmounted(() => {
      if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
      }
      window.removeEventListener('resize', handleResize);
    });

    return {
      tools,
      mode,
      selected,
      statusMessage,
      currentHint,
      canReset,
      tikzCode,
      canvasRef,
      changeMode,
      resetGraph,
      copyToClipboard,
      onCanvasMouseDown,
      onCanvasMouseMove,
      onCanvasMouseUp,
      removeSelected,
      invalidateTikz,
    };
  },
}).mount('#app');
