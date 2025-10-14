// @ts-nocheck

import { createSimpleShape } from '../core.js';
import { registerShape } from '../registry.js';
import { registerShapeAnchors } from '../anchorRegistry.js';
import { getNodeDimensions } from '../../utils/sceneMetrics.js';



const ellipseAnchors = [
    {
        id: 'center',
        tikz: 'center',
        isConnectable: false,
        getPoint: node => ({ x: node.x, y: node.y }),
    },
    {
        id: 'text',
        tikz: 'text',
        isConnectable: false,
        aliases: ['t'],
        getPoint: node => ({ x: node.x, y: node.y }),
    },
    {
        id: 'south',
        tikz: 'south',
        isConnectable: true,
        aliases: ['s'],
        getPoint: node => {
            const { halfHeight } = getNodeDimensions(node);
            return { x: node.x, y: node.y + halfHeight };
        },
    },
    {
        id: 'north',
        tikz: 'north',
        isConnectable: true,
        aliases: ['n'],
        getPoint: node => {
            const { halfHeight } = getNodeDimensions(node);
            return { x: node.x, y: node.y - halfHeight };
        },
    },
    {
        id: 'east',
        tikz: 'east',
        isConnectable: true,
        aliases: ['e'],
        getPoint: node => {
            const { halfWidth } = getNodeDimensions(node);
            return { x: node.x + halfWidth, y: node.y };
        },
    },
    {
        id: 'west',
        tikz: 'west',
        isConnectable: true,
        aliases: ['w'],
        getPoint: node => {
            const { halfWidth } = getNodeDimensions(node);
            return { x: node.x - halfWidth, y: node.y };
        },
    },
    {
        id: 'north east',
        tikz: 'north east',
        isConnectable: true,
        aliases: ['ne'],
        getPoint: node => {
            const { halfWidth, halfHeight } = getNodeDimensions(node);
            return { x: node.x + halfWidth * Math.SQRT1_2, y: node.y - halfHeight * Math.SQRT1_2 };
        }
    },
    {
        id: 'north west',
        tikz: 'north west',
        isConnectable: true,
        aliases: ['nw'],
        getPoint: node => {
            const { halfWidth, halfHeight } = getNodeDimensions(node);
            return { x: node.x - halfWidth * Math.SQRT1_2, y: node.y - halfHeight * Math.SQRT1_2 };
        }
    },
    {
        id: 'south east',
        tikz: 'south east',
        isConnectable: true,
        aliases: ['se'],
        getPoint: node => {
            const { halfWidth, halfHeight } = getNodeDimensions(node);
            return { x: node.x + halfWidth * Math.SQRT1_2, y: node.y + halfHeight * Math.SQRT1_2 };
        }
    },
    {
        id: 'south west',
        tikz: 'south west',
        isConnectable: true,
        aliases: ['sw'],
        getPoint: node => {
            const { halfWidth, halfHeight } = getNodeDimensions(node);
            return { x: node.x - halfWidth * Math.SQRT1_2, y: node.y + halfHeight * Math.SQRT1_2 };
        }
    },
    {
        id: 'base',
        tikz: 'base',
        isConnectable: false,
        aliases: ['b'],
        getPoint: node => {
            const { halfHeight } = getNodeDimensions(node);
            return { x: node.x, y: node.y + halfHeight / 2 };
        }
    },
    {
        id: 'mid',
        tikz: 'mid',
        isConnectable: false,
        aliases: ['m'],
        getPoint: node => ({ x: node.x, y: node.y }),
    },
];

export function registerEllipse() {

} 

    