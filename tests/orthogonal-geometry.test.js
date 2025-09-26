import assert from 'node:assert/strict';

import { computeOrthogonalGeometry } from '../src/geometry/orthogonal.js';

const baseStart = { x: 0, y: 0 };
const baseEnd = { x: 100, y: 60 };

const vertical = computeOrthogonalGeometry(baseStart, baseEnd, '90-vertical');
assert.equal(vertical.segments.length, 2, 'Vertical orthogonal edge should keep two segments');
assert.deepEqual(vertical.elbow, { x: 0, y: 60 });
assert.equal(vertical.segments[0].end.x, vertical.segments[1].start.x);
assert.equal(vertical.segments[0].end.y, vertical.segments[1].start.y);
assert.ok(Math.abs(vertical.startAngle - Math.PI / 2) < 1e-6, 'Start angle should be vertical when first leg has length');
assert.ok(Math.abs(vertical.endAngle) < 1e-6, 'End angle should be horizontal heading right');

const horizontal = computeOrthogonalGeometry(baseStart, baseEnd, '90-horizontal');
assert.equal(horizontal.segments.length, 2, 'Horizontal orthogonal edge should keep two segments');
assert.deepEqual(horizontal.elbow, { x: 100, y: 0 });
assert.ok(Math.abs(horizontal.startAngle) < 1e-6, 'Start angle should be horizontal when first leg has length');
assert.ok(Math.abs(horizontal.endAngle - Math.PI / 2) < 1e-6, 'End angle should be vertical heading down');

const verticalAligned = computeOrthogonalGeometry({ x: 40, y: 20 }, { x: 40, y: 80 }, '90-horizontal');
assert.equal(verticalAligned.segments.length, 2);
assert.deepEqual(verticalAligned.elbow, { x: 40, y: 20 });
assert.ok(Math.abs(verticalAligned.endAngle - Math.PI / 2) < 1e-6, 'End angle should remain vertical even with zero-length first segment');

const horizontalAligned = computeOrthogonalGeometry({ x: 10, y: 40 }, { x: 70, y: 40 }, '90-vertical');
assert.equal(horizontalAligned.segments.length, 2);
assert.deepEqual(horizontalAligned.elbow, { x: 10, y: 40 });
assert.ok(Math.abs(horizontalAligned.startAngle) < 1e-6, 'Start angle should fall back to horizontal when vertical leg collapses');

console.log('Orthogonal geometry tests passed');
