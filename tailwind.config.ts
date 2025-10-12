import type { Config } from 'tailwindcss';

const config = {
  content: [
    './index.html',
    './main.ts',
    './src/**/*.ts',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
} satisfies Config;

export default config;
