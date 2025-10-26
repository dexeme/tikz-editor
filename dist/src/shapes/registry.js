// @ts-nocheck
const shapeRegistry = new Map();
export const DEFAULT_SHAPE = 'circle';
function assertValidName(name) {
    if (typeof name !== 'string' || !name.trim()) {
        throw new Error('Shape names must be non-empty strings.');
    }
}
/**
 * Registers a shape factory under a unique name.
 * The factory must return an object with the signature:
 *   { options: string[], libraries?: string[] }
 * where `options` are TikZ option fragments and `libraries`
 * lists any `\\usetikzlibrary` entries the shape requires.
 */
export function registerShape(name, factory) {
    assertValidName(name);
    if (typeof factory !== 'function') {
        throw new Error(`Shape factory for "${name}" must be a function.`);
    }
    shapeRegistry.set(name, factory);
}
export function getShapeFactory(name) {
    assertValidName(name);
    return shapeRegistry.get(name);
}
export function listRegisteredShapes() {
    return Array.from(shapeRegistry.keys());
}
