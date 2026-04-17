/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class', // Enable dark mode support
  theme: {
    extend: {
      colors: {
        primary: { 
          DEFAULT: '#0ea5e9', 
          500: '#0ea5e9', 
          600: '#0284c7' 
        }, 
        slate: { 
          850: '#151f32', 
          900: '#0f172a' 
        } 
      },
      fontFamily: { 
        sans: ['Inter', 'sans-serif'] 
      }
    },
  },
  plugins: [],
}