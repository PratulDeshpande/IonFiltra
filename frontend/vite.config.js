import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3000'
    },
    // Allow any ngrok-generated domain
    // (e.g., anything ending with .ngrok.app or .ngrok-free.app)
    allowedHosts: ['.ngrok.app', '.ngrok-free.app']
  }
})
