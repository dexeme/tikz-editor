# Base TikZ com React e Docker

Projeto base para editar código TikZ no navegador e renderizar o resultado via LaTeX/TeX Live dentro de um backend Node.js. O ambiente completo roda em Docker e expõe uma interface com editor (esquerda) e visualização SVG (direita).

## Visão geral

- **Frontend:** React + Vite, textarea simples com atualização automática do preview.
- **Backend:** Express, compila TikZ com `latex` + `dvisvgm` a partir do TeX Live.
- **Container:** imagem Node.js com TeX Live completo instalada via APT.

## Pré-requisitos

- Docker
- Docker Compose (v2 ou superior)

## Como rodar com Docker

```bash
docker compose up --build
```

Após o build inicial, acesse o frontend em [http://localhost:5173](http://localhost:5173). O servidor de renderização roda em [http://localhost:3001](http://localhost:3001) e é utilizado automaticamente pelo frontend via proxy do Vite.

Use `Ctrl+C` para encerrar e `docker compose down` para remover os containers.

## Desenvolvimento sem Docker

Caso já tenha o TeX Live instalado localmente:

```bash
npm install
npm run dev
```

O script `dev` executa simultaneamente o backend (`http://localhost:3001`) e o frontend (`http://localhost:5173`).

## Executando o build do frontend

```bash
npm run build
```

Gera os arquivos estáticos em `dist/` (sem empacotar o backend).

## Estrutura de pastas

```
.
├── Dockerfile
├── docker-compose.yml
├── package.json
├── server/
│   └── index.js
├── src/
│   ├── App.css
│   ├── App.jsx
│   ├── index.css
│   └── main.jsx
└── vite.config.js
```

## Fluxo do renderizador

1. O frontend envia o código TikZ para `POST /api/render`.
2. O backend cria um diretório temporário, grava um documento LaTeX mínimo e roda:
   - `latex -interaction=nonstopmode -halt-on-error document.tex`
   - `dvisvgm --no-fonts --exact document.dvi`
3. O SVG gerado é devolvido ao cliente.

Mensagens de erro do LaTeX são retornadas ao usuário para facilitar o debug.
