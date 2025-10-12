import { rounding } from '../core.js';
import { registerShape } from '../registry.js';

const ALIGN_CENTER = 'align=center';

export function registerRectangle() {
  registerShape('rectangle', params => {
    const radius = Number.isFinite(params?.cornerRadius) ? params.cornerRadius : 16;
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
}
