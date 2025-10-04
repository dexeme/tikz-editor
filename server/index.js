import express from 'express';
import cors from 'cors';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import util from 'node:util';

const execFileAsync = util.promisify(execFile);

const app = express();
const port = process.env.PORT ? Number(process.env.PORT) : 3001;

app.use(cors());
app.use(express.json({ limit: '1mb' }));

const wrapTikzDocument = (code) => `\\documentclass[tikz,border=5mm]{standalone}
\\usepackage{tikz}
\\begin{document}
${code}
\\end{document}
`;

app.get('/api/health', (_request, response) => {
  response.json({ status: 'ok' });
});

app.post('/api/render', async (request, response) => {
  const { code } = request.body ?? {};

  if (typeof code !== 'string' || !code.trim()) {
    response.status(400).json({ error: 'O código TikZ não pode estar vazio.' });
    return;
  }

  const tmpBase = await fs.mkdtemp(path.join(os.tmpdir(), 'tikz-editor-'));
  const texPath = path.join(tmpBase, 'document.tex');
  const dviPath = path.join(tmpBase, 'document.dvi');
  const svgPath = path.join(tmpBase, 'document.svg');

  try {
    await fs.writeFile(texPath, wrapTikzDocument(code), 'utf8');

    await execFileAsync('latex', ['-interaction=nonstopmode', '-halt-on-error', 'document.tex'], {
      cwd: tmpBase
    });

    await execFileAsync('dvisvgm', ['--no-fonts', '--exact', '-o', 'document.svg', dviPath], {
      cwd: tmpBase
    });

    const svgContent = await fs.readFile(svgPath, 'utf8');
    response.json({ svg: svgContent });
  } catch (error) {
    const stderr = error?.stderr ?? '';
    const stdout = error?.stdout ?? '';
    const details = `${stdout}${stderr}`.trim();
    const message = details
      ? `Falha ao compilar o TikZ.\n${details}`
      : 'Falha ao compilar o TikZ.';
    response.status(400).json({ error: message });
  } finally {
    await fs.rm(tmpBase, { recursive: true, force: true });
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`TikZ renderer listening on http://0.0.0.0:${port}`);
});
