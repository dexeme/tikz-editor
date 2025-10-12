import { createSimpleShape } from '../core.js';
import { registerShape } from '../registry.js';

const ALIGN_CENTER = 'align=center';

export function registerPrimitives() {
  registerShape('circle', createSimpleShape(['circle', ALIGN_CENTER]));

  registerShape(
    'diamond',
    createSimpleShape(['diamond', 'aspect=2', ALIGN_CENTER], ['shapes.geometric'])
  );

  registerShape(
    'decision',
    createSimpleShape(
      ['regular polygon', 'regular polygon sides=6', 'minimum size=1.8cm', ALIGN_CENTER],
      ['shapes.geometric']
    )
  );

  registerShape(
    'triangle',
    createSimpleShape(
      ['regular polygon', 'regular polygon sides=3', 'minimum size=1.8cm', ALIGN_CENTER],
      ['shapes.geometric']
    )
  );
}
