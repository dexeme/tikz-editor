import { useEffect, useMemo, useState } from 'react';
import './App.css';

const DEFAULT_CODE = `\\begin{tikzpicture}
  \\draw[->] (0,0) -- (2,0) node[right] {$x$};
  \\draw[->] (0,0) -- (0,2) node[above] {$y$};
  \\draw (0,0) circle (0.5cm);
\\end{tikzpicture}`;

const DEBOUNCE_MS = 400;

function App() {
  const [code, setCode] = useState(DEFAULT_CODE);
  const [svg, setSvg] = useState('');
  const [error, setError] = useState('');
  const [isRendering, setIsRendering] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const timer = setTimeout(async () => {
      if (cancelled) {
        return;
      }

      setIsRendering(true);
      setError('');

      try {
        const response = await fetch('/api/render', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
          signal: controller.signal
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          const message = typeof payload.error === 'string' ? payload.error : 'Erro ao renderizar o TikZ.';
          throw new Error(message);
        }

        const payload = await response.json();
        if (!cancelled) {
          setSvg(payload.svg ?? '');
        }
      } catch (err) {
        if (cancelled || err.name === 'AbortError') {
          return;
        }
        setSvg('');
        setError(err.message || 'Erro desconhecido ao renderizar.');
      } finally {
        if (!cancelled) {
          setIsRendering(false);
        }
      }
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [code]);

  const previewMarkup = useMemo(() => ({ __html: svg }), [svg]);

  return (
    <div className="app-shell">
      <header>
        <h1>Editor TikZ com preview em Docker</h1>
        <p>Edite o código à esquerda e veja o SVG compilado com LaTeX na direita.</p>
      </header>

      <main className="panels">
        <section className="panel editor-panel">
          <div className="panel-header">
            <h2>Editor</h2>
            <span className="hint">O código é compilado automaticamente.</span>
          </div>
          <textarea
            value={code}
            onChange={(event) => setCode(event.target.value)}
            spellCheck="false"
            aria-label="Editor de código TikZ"
          />
        </section>

        <section className="panel preview-panel">
          <div className="panel-header">
            <h2>Preview</h2>
            {isRendering && <span className="status compiling">Renderizando…</span>}
            {!isRendering && !error && svg && <span className="status ready">Pronto</span>}
            {!isRendering && error && <span className="status error">Erro</span>}
          </div>

          {error ? (
            <pre className="error-box" role="alert">{error}</pre>
          ) : (
            <div className="preview-surface" dangerouslySetInnerHTML={previewMarkup} />
          )}
        </section>
      </main>
    </div>
  );
}

export default App;
