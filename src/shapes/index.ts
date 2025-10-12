// @ts-nocheck

import {
  DEFAULT_SHAPE,
  getShapeFactory,
  listRegisteredShapes,
  registerShape,
} from './registry.js';
import {
  FONT_MAP,
  buildStyleOptions,
  normalizeNodeParameters,
  validateNodeParameters,
} from './core.js';
import { registerBuiltInShapes } from './definitions.js';

let builtInsRegistered = false;

function ensureBuiltIns() {
  if (!builtInsRegistered) {
    registerBuiltInShapes();
    builtInsRegistered = true;
  }
}

export function createShapeOptions(shapeName, parameters, context = {}) {
  ensureBuiltIns();
  const factory = getShapeFactory(shapeName);
  if (!factory) {
    throw new Error(`Unknown shape "${shapeName}".`);
  }
  const result = factory(parameters, context) || {};
  const options = Array.isArray(result.options) ? result.options : [];
  const libraries = Array.isArray(result.libraries) ? result.libraries : [];
  return { options, libraries };
}

export {
  DEFAULT_SHAPE,
  FONT_MAP,
  buildStyleOptions,
  listRegisteredShapes,
  normalizeNodeParameters,
  registerShape,
  validateNodeParameters,
};
