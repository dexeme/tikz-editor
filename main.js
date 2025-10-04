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
    shape: '--',
    bend: 30,
  };
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
      { mode: 'addEdge', label: 'Nova aresta', icon: '🪢', accent: 'green' },
      { mode: 'addText', label: 'Caixa de texto', icon: '📝', accent: 'cyan' },
      { mode: 'move', label: 'Mover', icon: '✋', accent: 'amber' },
      { mode: 'delete', label: 'Remover', icon: '🗑️', accent: 'red' },
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
        case 'addEdge':
          return state.edgeDraft
            ? 'Solte sobre outro ponto de conexão para concluir a aresta.'
            : 'Clique em um ponto de conexão para iniciar uma nova aresta.';
        case 'addText':
          return 'Clique no canvas para posicionar uma nova caixa de texto.';
        case 'move':
          return 'Arraste nós, caixas de texto ou vértices selecionados.';
        case 'delete':
          return 'Clique em elementos para removê-los do diagrama.';
        default:
          return 'Selecione elementos ou use a barra de ferramentas para criar novos componentes.';
      }
    });

    const statusMessage = computed(() => feedback.value || defaultStatus.value);

    const currentHint = computed(() => {
      if (state.mode === 'addEdge' && state.edgeDraft) {
        return 'ligar a aresta ao nó de destino';
      }
      switch (state.mode) {
        case 'addEdge':
          return 'arrastar a partir de um conector visível';
        case 'addText':
          return 'inserir uma caixa de texto livre';
        case 'move':
          return 'reposicionar elementos mantendo Shift para alinhar';
        case 'delete':
          return 'remover elementos indesejados';
        default:
          return 'selecionar elementos ou arrastar nós';
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
      if (newMode !== 'addEdge') {
        state.edgeDraft = null;
        state.hoverNodeId = null;
        state.hoverAnchor = null;
        renderer.value?.draw();
      }
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

      if (state.mode === 'addEdge') {
        if (node) {
          const anchor = anchorHit?.anchor || determineAnchorForPointer(node, pointer);
          state.edgeDraft = {
            from: { nodeId: node.id, anchor },
            pointer,
            target: null,
          };
          state.hoverNodeId = node.id;
          state.hoverAnchor = anchor;
        } else {
          state.edgeDraft = null;
          state.hoverNodeId = null;
          state.hoverAnchor = null;
        }
        renderer.value?.draw();
        event.preventDefault();
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

      inlineEditor.value = edge.label || '';
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
        if (inlineEditor.target.label !== trimmed) {
          inlineEditor.target.label = trimmed;
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
        edges: state.edges.map(edge => ({ ...edge })),
        textBlocks: state.textBlocks.map(block => ({ ...block })),
      };
    }

    function applySnapshot(snap) {
      state.nodes = snap.nodes.map(node => ({ ...node }));
      state.edges = snap.edges.map(edge => ({ ...edge }));
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
