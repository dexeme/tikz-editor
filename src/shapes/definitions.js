import { registerCircle } from './definitions/Circle.js';
import { registerCylinder } from './definitions/Cylinder.js';
import { registerDecision } from './definitions/Decision.js';
import { registerDiamond } from './definitions/Diamond.js';
import { registerRectangle } from './definitions/Rectangle.js';
import { registerTriangle } from './definitions/Triangle.js';

export function registerBuiltInShapes() {
  registerCircle();
  registerDiamond();
  registerDecision();
  registerTriangle();
  registerCylinder();
  registerRectangle();
}
