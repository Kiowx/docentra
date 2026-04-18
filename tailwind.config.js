/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'grid-line': '#d1d5db',
        'grid-header': '#f3f4f6',
        'grid-header-hover': '#e5e7eb',
        'cell-selected': '#2563eb',
        'cell-range': '#dbeafe',
        'toolbar-bg': '#f9fafb',
        'chat-bg': '#ffffff',
        'chat-user': '#2563eb',
        'chat-ai': '#f3f4f6',
      },
      fontSize: {
        cell: ['13px', '20px'],
      },
    },
  },
  plugins: [],
}
