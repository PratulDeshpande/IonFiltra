import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './app' // Removed .tsx extension here
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)