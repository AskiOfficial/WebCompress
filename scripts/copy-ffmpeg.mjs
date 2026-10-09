import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(__dirname, '..');

const coreSrc = resolve(root, 'node_modules/@ffmpeg/core/dist/esm');
const coreMtSrc = resolve(root, 'node_modules/@ffmpeg/core-mt/dist/esm');

const coreDest = resolve(root, 'public/ffmpeg/core');
const coreMtDest = resolve(root, 'public/ffmpeg/core-mt');

if (existsSync(coreSrc)) {
  mkdirSync(coreDest, { recursive: true });
  cpSync(coreSrc, coreDest, { recursive: true });
  console.log('Copied ffmpeg core to public/ffmpeg/core');
}

if (existsSync(coreMtSrc)) {
  mkdirSync(coreMtDest, { recursive: true });
  cpSync(coreMtSrc, coreMtDest, { recursive: true });
  console.log('Copied ffmpeg core-mt to public/ffmpeg/core-mt');
}
