/* Loads public/data/*.json for Node scripts. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assembleData, DATA_FILES } from '../../src/evp/data.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.join(here, '..', '..', 'public', 'data');

export function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, `${name}.json`), 'utf8'));
}

export function loadData() {
  const raw = Object.fromEntries(DATA_FILES.map((f) => [f, readJson(f)]));
  return assembleData(raw);
}
