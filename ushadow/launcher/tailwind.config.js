/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    // Include shared components from main frontend
    "../frontend/src/components/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      // Reuse brand colors from main frontend
      colors: {
        // Primary Green (left arm of "U") - Main CTAs, success states
        primary: {
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
          950: '#052e16',
        },
        // Accent Purple (right arm of "U") - Secondary actions, accents
        accent: {
          50: '#faf5ff',
          100: '#f3e8ff',
          200: '#e9d5ff',
          300: '#d8b4fe',
          400: '#c084fc',
          500: '#a855f7',
          600: '#9333ea',
          700: '#7e22ce',
          800: '#6b21a8',
          900: '#581c87',
          950: '#3b0764',
        },
        // Surface colors - Dark theme backgrounds
        surface: {
          900: '#0f0f13',
          800: '#1a1a21',
          700: '#252530',
          600: '#2d2d3a',
          500: '#3d3d4a',
          400: '#52525b',
        },
        // Semantic colors
        success: {
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
        },
        warning: {
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
        },
        error: {
          400: '#f87171',
          500: '#ef4444',
          600: '#dc2626',
        },
        info: {
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
        },
        // Text colors for dark theme
        text: {
          primary: '#f4f4f5',
          secondary: '#a1a1aa',
          muted: '#71717a',
          inverse: '#0f0f13',
        },
      },
      backgroundImage: {
        'gradient-brand': 'linear-gradient(135deg, #4ade80 0%, #a855f7 100%)',
        'glow-brand': 'radial-gradient(ellipse at top left, rgba(74, 222, 128, 0.08) 0%, transparent 40%), radial-gradient(ellipse at bottom right, rgba(168, 85, 247, 0.08) 0%, transparent 40%)',
      },
      boxShadow: {
        'glow-green': '0 0 20px rgba(74, 222, 128, 0.3)',
        'glow-purple': '0 0 20px rgba(168, 85, 247, 0.3)',
        'card': '0 4px 6px rgba(0, 0, 0, 0.4)',
        'card-hover': '0 10px 25px rgba(0, 0, 0, 0.5)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
