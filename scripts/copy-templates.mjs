import { cp, mkdir, rm, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

async function copyTemplates() {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const projectRoot = resolve(__dirname, '..');
  const source = resolve(projectRoot, 'src', 'templates');
  const destination = resolve(projectRoot, 'dist', 'templates');

  try {
    await stat(source);
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.warn('Templates directory not found, skipping copy.');
      return;
    }
    throw error;
  }

  await rm(destination, { recursive: true, force: true });
  await mkdir(resolve(projectRoot, 'dist'), { recursive: true });
  await cp(source, destination, { recursive: true });
  console.log('Templates copied to dist/templates');
}

copyTemplates().catch(error => {
  console.error('Failed to copy templates:', error);
  process.exitCode = 1;
});
