/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  // Safelist dynamic color classes for environment banners
  safelist: [
    // Background colors
    { pattern: /^bg-(red|blue|green|yellow|purple|pink|orange|amber|lime|emerald|teal|cyan|sky|indigo|violet|fuchsia|rose|gray)-(100|900)$/ },
    // Text colors
    { pattern: /^text-(red|blue|green|yellow|purple|pink|orange|amber|lime|emerald|teal|cyan|sky|indigo|violet|fuchsia|rose|gray)-(300|800)$/ },
    // Border colors
    { pattern: /^border-(red|blue|green|yellow|purple|pink|orange|amber|lime|emerald|teal|cyan|sky|indigo|violet|fuchsia|rose|gray)-500$/ },
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // ═══════════════════════════════════════════════════════════════
        // BRAND COLORS - Extracted from Ushadow logo
        // ═══════════════════════════════════════════════════════════════

        // Primary Green (left arm of "U") - Main CTAs, success states
        primary: {
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',   // Hover/highlight
          400: '#4ade80',   // ← Logo color (main)
          500: '#22c55e',   // Active/pressed
          600: '#16a34a',
          700: '#15803d',
          800: '#166534',
          900: '#14532d',
          950: '#052e16',
        },

        // Accent Purple (right arm of "U") - Secondary actions, accents
        accent: {
          50: '#faf5ff',
          100: '#f3e8ff',
          200: '#e9d5ff',
          300: '#d8b4fe',
          400: '#c084fc',   // Hover/highlight
          500: '#a855f7',   // ← Logo color (main)
          600: '#9333ea',   // Active/pressed
          700: '#7e22ce',
          800: '#6b21a8',
          900: '#581c87',
          950: '#3b0764',
        },

        // ═══════════════════════════════════════════════════════════════
        // SURFACE COLORS - Dark theme backgrounds
        // ═══════════════════════════════════════════════════════════════
        surface: {
          // Main page background
          900: '#0f0f13',
          // Cards, panels, elevated surfaces
          800: '#1a1a21',
          // Input fields, nested elements
          700: '#252530',
          // Hover states on surfaces
          600: '#2d2d3a',
          // Borders, dividers
          500: '#3d3d4a',
          // Subtle borders
          400: '#52525b',
        },

        // ═══════════════════════════════════════════════════════════════
        // SEMANTIC COLORS - States and feedback
        // ═══════════════════════════════════════════════════════════════
        success: {
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
          800: '#166534',
          900: '#14532d',
        },
        warning: {
          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
          900: '#78350f',
        },
        error: {
          50: '#fef2f2',
          100: '#fee2e2',
          200: '#fecaca',
          300: '#fca5a5',
          400: '#f87171',
          500: '#ef4444',
          600: '#dc2626',
          700: '#b91c1c',
          800: '#991b1b',
          900: '#7f1d1d',
        },
        info: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },

        // ═══════════════════════════════════════════════════════════════
        // TEXT COLORS - For dark theme
        // ═══════════════════════════════════════════════════════════════
        text: {
          primary: '#f4f4f5',
          secondary: '#a1a1aa',
          muted: '#71717a',
          inverse: '#0f0f13',
        },
      },

      // ═══════════════════════════════════════════════════════════════
      // GRADIENTS - Brand gradients
      // ═══════════════════════════════════════════════════════════════
      backgroundImage: {
        // Hero gradient matching logo
        'gradient-brand': 'linear-gradient(135deg, #4ade80 0%, #a855f7 100%)',
        'gradient-brand-hover': 'linear-gradient(135deg, #86efac 0%, #c084fc 100%)',
        // Subtle glow effects for cards
        'glow-green': 'radial-gradient(ellipse at top, rgba(74, 222, 128, 0.1) 0%, transparent 50%)',
        'glow-purple': 'radial-gradient(ellipse at bottom right, rgba(168, 85, 247, 0.1) 0%, transparent 50%)',
        'glow-brand': 'radial-gradient(ellipse at top left, rgba(74, 222, 128, 0.08) 0%, transparent 40%), radial-gradient(ellipse at bottom right, rgba(168, 85, 247, 0.08) 0%, transparent 40%)',
      },

      // ═══════════════════════════════════════════════════════════════
      // BOX SHADOWS - Including glow effects
      // ═══════════════════════════════════════════════════════════════
      boxShadow: {
        'glow-green': '0 0 20px rgba(74, 222, 128, 0.3)',
        'glow-green-lg': '0 0 40px rgba(74, 222, 128, 0.4)',
        'glow-purple': '0 0 20px rgba(168, 85, 247, 0.3)',
        'glow-purple-lg': '0 0 40px rgba(168, 85, 247, 0.4)',
        'glow-brand': '0 0 20px rgba(74, 222, 128, 0.2), 0 0 40px rgba(168, 85, 247, 0.2)',
        // Dark theme card shadows
        'card': '0 4px 6px rgba(0, 0, 0, 0.4)',
        'card-lg': '0 10px 15px rgba(0, 0, 0, 0.5)',
        'card-hover': '0 10px 25px rgba(0, 0, 0, 0.5)',
      },

      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      zIndex: {
        'sticky': '40',
        'dropdown': '50',
        'modal': '60',
        'toast': '70',
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}
