/** @type {import('tailwindcss').Config} */

// NomadKit palette — see docs/nomadkit-DESIGN.md
// We override Tailwind's built-in `amber`, `emerald`, and `slate` scales so the
// ~1100 existing hard-coded utility classes across every page/component re-map
// to NomadKit tones in one place, across all three themes.
// ponytail: recolor via palette override, not per-file edits. Add explicit
// `sand`/`ocean`/`forest` aliases for any new markup.

// Primary — Sand (#D4A373)
const sand = {
  50: '#faf5ee',
  100: '#f4e7d5',
  200: '#ebd3b3',
  300: '#e0bd8e',
  400: '#d4a373', // brand
  500: '#c5884f',
  600: '#b06f3d',
  700: '#8f5734',
  800: '#6f4530',
  900: '#5b3a2a',
  950: '#311d15',
};

// Secondary — Ocean (#0891B2)
const ocean = {
  50: '#ecfcff',
  100: '#cff6fd',
  200: '#a5ecfb',
  300: '#67ddf7',
  400: '#22c6ec',
  500: '#0891b2', // brand
  600: '#0a7495',
  700: '#0f5c78',
  800: '#164c62',
  900: '#164053',
  950: '#082a38',
};

// Success/Tertiary — Forest (#166534)
const forest = {
  50: '#eefaf1',
  100: '#d5f0dc',
  200: '#aee0bd',
  300: '#75ca92',
  400: '#40b46e',
  500: '#1f924b',
  600: '#166534', // brand
  700: '#12522c',
  800: '#104225',
  900: '#0d3620',
  950: '#051f10',
};

// Neutral — warm stone (replaces cold blue slate for NomadKit's warm feel)
const warmSlate = {
  50: '#faf9f7',
  100: '#f4f2ee',
  200: '#e7e3db',
  300: '#d3ccc0',
  400: '#a79f92',
  500: '#837b6e',
  600: '#635b50',
  700: '#4a443b',
  800: '#312c25',
  900: '#211d18',
  950: '#17130f',
};

module.exports = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        amber: sand,       // primary actions re-map to Sand
        emerald: forest,   // success states re-map to Forest
        slate: {
          50: 'rgb(var(--slate-50) / <alpha-value>)',
          100: 'rgb(var(--slate-100) / <alpha-value>)',
          200: 'rgb(var(--slate-200) / <alpha-value>)',
          300: 'rgb(var(--slate-300) / <alpha-value>)',
          400: 'rgb(var(--slate-400) / <alpha-value>)',
          500: 'rgb(var(--slate-500) / <alpha-value>)',
          600: 'rgb(var(--slate-600) / <alpha-value>)',
          700: 'rgb(var(--slate-700) / <alpha-value>)',
          800: 'rgb(var(--slate-800) / <alpha-value>)',
          850: 'rgb(var(--slate-850) / <alpha-value>)',
          900: 'rgb(var(--slate-900) / <alpha-value>)',
          950: 'rgb(var(--slate-950) / <alpha-value>)',
        },
        sand,
        ocean,
        forest,
        sepia: {
          50: '#fbf9f5',
          100: '#f7f3e9',
          200: '#efe5d2',
          300: '#e3d2b2',
          400: '#d5bb8c',
          500: '#c5a36b',
          600: '#b48c52',
          700: '#967142',
          800: '#7a5b39',
          900: '#644b31',
          950: '#382819',
        },
        slateDark: {
          900: '#211d18',
          950: '#17130f',
        },
      },
      fontFamily: {
        sans: ['var(--font-kanit)', 'Inter', 'sans-serif'],
        serif: ['var(--font-sarabun)', 'Cinzel', 'serif'],
        reading: ['Sarabun', 'serif'],
      },
    },
  },
  plugins: [],
}
