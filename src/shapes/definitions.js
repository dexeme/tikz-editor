import { registerCylinder } from './definitions/Cylinder.js';
import { registerPrimitives } from './definitions/Primitives.js';
import { registerRectangle } from './definitions/Rectangle.js';

export function registerBuiltInShapes() {
  registerPrimitives();
  registerCylinder();
  registerRectangle();
}
