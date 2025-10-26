// @ts-nocheck
import { registerCircle } from './definitions/Circle.js';
import { registerCloud } from './definitions/Cloud.js';
import { registerCylinder } from './definitions/Cylinder.js';
import { registerDecision } from './definitions/Decision.js';
import { registerDiamond } from './definitions/Diamond.js';
import { registerEllipse } from './definitions/Ellipse.js';
import { registerRoundedRectangle } from './definitions/RoundedRectangle.js';
import { registerRectangleSplit } from './definitions/RectangleSplit.js';
import { registerSemicircle } from './definitions/Semicircle.js';
import { registerRectangle } from './definitions/Rectangle.js';
import { registerTriangle } from './definitions/Triangle.js';
export function registerBuiltInShapes() {
    registerCircle();
    registerEllipse();
    registerSemicircle();
    registerDiamond();
    registerDecision();
    registerTriangle();
    registerCylinder();
    registerRoundedRectangle();
    registerRectangle();
    registerRectangleSplit();
    registerCloud();
}
