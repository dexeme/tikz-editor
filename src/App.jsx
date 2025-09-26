import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './App.css';

const INITIAL_CODE = `\\begin{tikzpicture}[>=stealth]
  % Nós
  \\node (start) at (0,0) {Início};
  \\node (proc)  at (3,0) {Processo};
  \\node (end)   at (6,0) {Fim};
  % Setas
  \\draw[->] (start) -- (proc);
  \\draw[->] (proc) -- (end);
\\end{tikzpicture}`;

// Regex principais para capturar o subconjunto do TikZ suportado.
const NODE_REGEX = /\\node\s*\((?<id>[A-Za-z0-9_]+)\)\s*(?:\[(?<opts>[^\]]+)\])?\s*at\s*\((?<x>-?\d+(?:\.\d+)?)\s*,\s*(?<y>-?\d+(?:\.\d+)?)\)\s*\{(?<label>[^}]*)\}\s*;/g;
const EDGE_REGEX = /\\draw\s*\[(?<style>[^\]]*?->[^\]]*?)\]\s*\((?<from>[A-Za-z0-9_]+)\)\s*--\s*\((?<to>[A-Za-z0-9_]+)\)\s*;/g;
const NODE_CLEAN_REGEX = new RegExp(NODE_REGEX.source, 'g');
const EDGE_CLEAN_REGEX = new RegExp(EDGE_REGEX.source, 'g');

const emptyModel = () => ({ nodes: [], edges: [] });

// Garante que as fontes do TikZJax sejam carregadas apenas uma vez.
function ensureFontsLoaded() {
  if (!document.getElementById('tikzjax-fonts')) {
    const link = document.createElement('link');
    link.id = 'tikzjax-fonts';
    link.rel = 'stylesheet';
    link.href = 'https://tikzjax.com/v1/fonts.css';
    document.head.appendChild(link);
  }
}

// Realiza o parse de um código TikZ limitado a nós e arestas direcionais.
function parseTikz(code) {
  const withoutComments = code.replace(/%[^\n]*\n?/g, '\n');
  const match = withoutComments.match(/\\begin\{tikzpicture\}([\s\S]*?)\\end\{tikzpicture\}/);
  if (!match) {
    throw new Error('Não encontrei um ambiente \\begin{tikzpicture} ... \\end{tikzpicture}.');
  }

  const content = match[1];

  const nodes = [];
  const edges = [];

  NODE_REGEX.lastIndex = 0;
  EDGE_REGEX.lastIndex = 0;

  let nodeMatch;
  while ((nodeMatch = NODE_REGEX.exec(content)) !== null) {
    const { id, opts, x, y, label } = nodeMatch.groups;
    nodes.push({
      id,
      label: label.trim(),
      x: parseFloat(x),
      y: parseFloat(y),
      options: opts ? opts.trim() : ''
    });
  }

  let edgeMatch;
  while ((edgeMatch = EDGE_REGEX.exec(content)) !== null) {
    const { from, to } = edgeMatch.groups;
    edges.push({ from, to });
  }

  const stripped = content
    .replace(NODE_CLEAN_REGEX, '')
    .replace(EDGE_CLEAN_REGEX, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (stripped.length > 0) {
    throw new Error('Este parser suporta apenas nós (\\node) e arestas direcionais simples (\\draw[->]).');
  }

  if (nodes.length === 0) {
    throw new Error('Nenhum nó encontrado. O protótipo precisa de pelo menos um nó.');
  }

  return { nodes, edges };
}

// Reconstroi o ambiente tikzpicture a partir do modelo em memória.
function buildTikz(model) {
  const lines = ['\\begin{tikzpicture}[>=stealth]', '  % Nós'];

  model.nodes.forEach((node) => {
    const coordX = Number.isFinite(node.x) ? node.x : 0;
    const coordY = Number.isFinite(node.y) ? node.y : 0;
    const options = node.options ? ` [${node.options}]` : '';
    lines.push(
      `  \\node (${node.id})${options} at (${coordX},${coordY}) {${node.label}};`
    );
  });

  lines.push('  % Setas');

  model.edges.forEach((edge) => {
    lines.push(`  \\draw[->] (${edge.from}) -- (${edge.to});`);
  });

  lines.push('\\end{tikzpicture}');
  return lines.join('\n');
}

// Gera um ID único ao adicionar novos nós automaticamente.
function nextNodeId(nodes) {
  const base = 'node';
  let counter = nodes.length + 1;
  let candidate = `${base}${counter}`;
  const existing = new Set(nodes.map((n) => n.id));
  while (existing.has(candidate)) {
    counter += 1;
    candidate = `${base}${counter}`;
  }
  return candidate;
}

// Normaliza entradas numéricas vindas dos inputs do formulário.
function sanitizeNumber(value) {
  if (value === '' || value === null || value === undefined) {
    return 0;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

export default function App() {
  const previewRef = useRef(null);
  const [code, setCode] = useState(INITIAL_CODE);
  const [model, setModel] = useState(() => {
    try {
      return parseTikz(INITIAL_CODE);
    } catch (err) {
      console.error('Falha ao parsear o exemplo inicial', err);
      return emptyModel();
    }
  });
  const [error, setError] = useState('');
  const [engineStatus, setEngineStatus] = useState('carregando motor...');

  const renderTikz = useCallback(
    (tikzCode) => {
      if (!previewRef.current) {
        return;
      }

      setEngineStatus('carregando motor...');
      const container = previewRef.current;
      container.innerHTML = '';

      const script = document.createElement('script');
      script.type = 'text/tikz';
      script.textContent = tikzCode;
      container.appendChild(script);

      const existing = document.getElementById('tikzjax-runtime');
      if (existing) {
        existing.remove();
      }

      const loader = document.createElement('script');
      loader.id = 'tikzjax-runtime';
      loader.src = 'https://tikzjax.com/v1/tikzjax.js';
      loader.async = true;
      loader.onload = () => setEngineStatus('motor carregado');
      loader.onerror = () => {
        setEngineStatus('falha ao carregar');
        setError('Não foi possível carregar o motor TikZJax. Verifique sua conexão.');
      };

      document.body.appendChild(loader);
    },
    [setError]
  );

  useEffect(() => {
    ensureFontsLoaded();
    renderTikz(INITIAL_CODE);
  }, [renderTikz]);

  const syncFromModel = useCallback(
    (updater) => {
      setModel((current) => {
        const nextModel = typeof updater === 'function' ? updater(current) : updater;
        const nextCode = buildTikz(nextModel);
        setCode(nextCode);
        setError('');
        renderTikz(nextCode);
        return nextModel;
      });
    },
    [renderTikz]
  );

  const handleParse = useCallback(() => {
    try {
      const nextModel = parseTikz(code);
      setModel(nextModel);
      setError('');
      renderTikz(code);
    } catch (err) {
      setError(err.message);
    }
  }, [code, renderTikz]);

  const addNode = useCallback(() => {
    syncFromModel((current) => {
      const id = nextNodeId(current.nodes);
      const newNode = {
        id,
        label: 'Novo nó',
        x: 0,
        y: 0,
        options: ''
      };
      return {
        nodes: [...current.nodes, newNode],
        edges: current.edges
      };
    });
  }, [syncFromModel]);

  const removeNode = useCallback(
    (index) => {
      syncFromModel((current) => {
        const target = current.nodes[index];
        const remainingNodes = current.nodes.filter((_, idx) => idx !== index);
        const remainingEdges = current.edges.filter(
          (edge) => edge.from !== target.id && edge.to !== target.id
        );
        return { nodes: remainingNodes, edges: remainingEdges };
      });
    },
    [syncFromModel]
  );

  const updateNodeField = useCallback(
    (index, field, rawValue) => {
      syncFromModel((current) => {
        const nextNodes = current.nodes.map((node, idx) => {
          if (idx !== index) return node;

          if (field === 'x' || field === 'y') {
            return { ...node, [field]: sanitizeNumber(rawValue) };
          }

          if (field === 'id') {
            const nextId = rawValue.trim() || node.id;
            return { ...node, id: nextId };
          }

          if (field === 'options') {
            return { ...node, options: rawValue };
          }

          return { ...node, [field]: rawValue };
        });

        const oldId = current.nodes[index].id;
        const newId = nextNodes[index].id;

        const nextEdges = oldId === newId
          ? current.edges
          : current.edges.map((edge) => ({
              from: edge.from === oldId ? newId : edge.from,
              to: edge.to === oldId ? newId : edge.to
            }));

        return { nodes: nextNodes, edges: nextEdges };
      });
    },
    [syncFromModel]
  );

  const addEdge = useCallback(() => {
    if (model.nodes.length === 0) {
      setError('Adicione ao menos um nó antes de criar uma aresta.');
      return;
    }

    syncFromModel((current) => {
      const [first, second] = current.nodes;
      const from = first ? first.id : '';
      const to = second ? second.id : from;
      const newEdge = { from, to };
      return {
        nodes: current.nodes,
        edges: [...current.edges, newEdge]
      };
    });
  }, [model.nodes.length, setError, syncFromModel]);

  const updateEdge = useCallback(
    (index, field, value) => {
      syncFromModel((current) => {
        const nextEdges = current.edges.map((edge, idx) =>
          idx === index ? { ...edge, [field]: value } : edge
        );
        return { nodes: current.nodes, edges: nextEdges };
      });
    },
    [syncFromModel]
  );

  const removeEdge = useCallback(
    (index) => {
      syncFromModel((current) => {
        const nextEdges = current.edges.filter((_, idx) => idx !== index);
        return { nodes: current.nodes, edges: nextEdges };
      });
    },
    [syncFromModel]
  );

  const nodeOptions = useMemo(
    () => model.nodes.map((node) => ({ value: node.id, label: node.id })),
    [model.nodes]
  );

  return (
    <div className="app-shell">
      <header className="header">
        <h1>Editor TikZ (Protótipo)</h1>
        <p>
          Cole ou edite o código TikZ para fluxogramas simples, sincronize com o formulário e veja o
          SVG renderizado pelo TikZJax.
        </p>
      </header>

      <div className="app-grid">
        <section className="panel">
          <div>
            <h2 className="section-title">Código TikZ</h2>
            <p className="helper-text">
              Este protótipo suporta nós (<code>\node</code>) e arestas direcionais
              (<code>\draw[-&gt;]</code>). Clique em "Parsear &amp; Renderizar" para sincronizar o
              formulário.
            </p>
          </div>

          <textarea
            className="code-area"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            spellCheck={false}
          />

          <div className="button-row">
            <button className="primary" type="button" onClick={handleParse}>
              Parsear &amp; Renderizar
            </button>
            <button className="secondary" type="button" onClick={addNode}>
              + Nó
            </button>
            <button className="secondary" type="button" onClick={addEdge}>
              + Aresta
            </button>
          </div>

          {error && <div className="error-box">{error}</div>}

          <section>
            <h2 className="section-title">Nós</h2>
            {model.nodes.length === 0 ? (
              <p className="empty-state">Nenhum nó cadastrado até o momento.</p>
            ) : (
              <div className="list">
                {model.nodes.map((node, index) => (
                  <div className="card" key={node.id}>
                    <h3>Nó {node.id}</h3>
                    <div className="field-row">
                      <label>
                        ID
                        <input
                          value={node.id}
                          onChange={(event) => updateNodeField(index, 'id', event.target.value)}
                        />
                      </label>
                      <label>
                        Rótulo
                        <input
                          value={node.label}
                          onChange={(event) => updateNodeField(index, 'label', event.target.value)}
                        />
                      </label>
                      <label>
                        X
                        <input
                          type="number"
                          step="0.1"
                          value={node.x}
                          onChange={(event) => updateNodeField(index, 'x', event.target.value)}
                        />
                      </label>
                      <label>
                        Y
                        <input
                          type="number"
                          step="0.1"
                          value={node.y}
                          onChange={(event) => updateNodeField(index, 'y', event.target.value)}
                        />
                      </label>
                      <label>
                        Opções (opcional)
                        <input
                          placeholder="ex.: draw, rectangle"
                          value={node.options}
                          onChange={(event) => updateNodeField(index, 'options', event.target.value)}
                        />
                      </label>
                    </div>
                    <button
                      type="button"
                      className="remove-button"
                      onClick={() => removeNode(index)}
                    >
                      Remover nó
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="section-title">Arestas</h2>
            {model.edges.length === 0 ? (
              <p className="empty-state">Nenhuma aresta cadastrada.</p>
            ) : (
              <div className="list">
                {model.edges.map((edge, index) => (
                  <div className="card" key={`${edge.from}-${edge.to}-${index}`}>
                    <h3>Aresta {index + 1}</h3>
                    <div className="field-row">
                      <label>
                        De
                        <select
                          value={edge.from}
                          onChange={(event) => updateEdge(index, 'from', event.target.value)}
                        >
                          {nodeOptions.map((option) => (
                            <option key={`from-${option.value}`} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Para
                        <select
                          value={edge.to}
                          onChange={(event) => updateEdge(index, 'to', event.target.value)}
                        >
                          {nodeOptions.map((option) => (
                            <option key={`to-${option.value}`} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <button
                      type="button"
                      className="remove-button"
                      onClick={() => removeEdge(index)}
                    >
                      Remover aresta
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </section>

        <aside className="panel preview-panel">
          <h2 className="section-title">Preview SVG</h2>
          <p className="helper-text">
            O contêiner é limpo e o TikZJax é recarregado a cada renderização para garantir consistência.
          </p>
          <div className="preview-container">
            <span className="status-label">Status do motor: {engineStatus}</span>
            <div ref={previewRef} style={{ width: '100%' }} />
          </div>
        </aside>
      </div>

      <footer>
        Protótipo experimental — ideal para validar interação bidirecional entre TikZ e formulários.
      </footer>
    </div>
  );
}
