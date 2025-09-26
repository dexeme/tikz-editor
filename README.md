# Editor TikZ (Protótipo Vite + React)

Protótipo web de um editor TikZ com sincronização bidirecional entre o código fonte e um formulário estruturado para nós e arestas. O preview utiliza [TikZJax](https://tikzjax.com) diretamente no navegador.

## Pré-requisitos

- Node.js 18 ou superior
- npm (instalado junto com o Node)

## Como rodar

```bash
npm install
npm run dev
```

O Vite exibirá no terminal o endereço local (por padrão `http://localhost:5173`).

## Subconjunto suportado pelo parser

O parser implementado é propositalmente restrito e aceita apenas os comandos abaixo dentro de `\begin{tikzpicture} ... \end{tikzpicture}`:

- Nós no formato `\node (id) at (x,y) {Rótulo};` com suporte opcional a `[...]` para preservar opções originais.
- Arestas direcionais no formato `\draw[->] (idOrigem) -- (idDestino);` (opções adicionais podem ser mantidas desde que o `->` esteja presente).
- Comentários iniciados por `%` são ignorados.

Qualquer outro comando dentro do ambiente resulta em mensagem de erro amigável.

## Fluxo de uso

1. O exemplo inicial já renderiza um fluxograma linear simples.
2. Alterações manuais no código exigem clique em **Parsear & Renderizar** para atualizar o formulário e o preview.
3. Alterações via formulário (nós/arestas) atualizam automaticamente o código e o preview.
4. O TikZJax é recarregado a cada renderização para garantir consistência do SVG.

## Limitações conhecidas

- Não há suporte para bibliotecas adicionais (`\usetikzlibrary{...}`) ou comandos fora do subconjunto descrito.
- Labels com chaves internas (`{` `}`) não são tratados — apenas texto plano simples.
- O protótipo não realiza validação cruzada de arestas apontando para nós inexistentes durante a edição manual do código (o parser assumirá que os IDs existem).
- O recarregamento do TikZJax em cada renderização pode ser custoso para diagramas muito grandes, mas garante previsibilidade neste MVP.

## Possíveis extensões

- Implementar arraste direto dos nós no SVG com atualização das coordenadas.
- Acrescentar suporte a mais estilos de arestas (curvas, múltiplas setas, estilos com rótulos intermediários).
- Habilitar importação/exportação em SVG ou PNG de forma direta.
- Persistir automaticamente o último código editado no `localStorage`.
