import { registerShape } from './registry.js';

const ALIGN_CENTER = 'align=center';

const rounding = value => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return '0.00';
  }
  return (numeric * 0.1875).toFixed(2);
};

const createSimpleShape = (options, libraries = []) => () => ({
  options,
  libraries,
});

export function registerBuiltInShapes() {
  registerShape('circle', createSimpleShape(['circle', ALIGN_CENTER]));

  registerShape('rectangle', params => {
    const radius = Number.isFinite(params.cornerRadius) ? params.cornerRadius : 16;
    return {
      options: [
        'rectangle',
        `rounded corners=${rounding(Math.max(0, radius))}pt`,
        'minimum width=2.4cm',
        'minimum height=1.2cm',
        ALIGN_CENTER,
      ],
    };
  });

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

  /**
   * To add a new shape:
   * registerShape('hexagon', params => ({
   *   options: ['regular polygon', 'regular polygon sides=6', ALIGN_CENTER],
   *   libraries: ['shapes.geometric'],
   * }));
   */
}
