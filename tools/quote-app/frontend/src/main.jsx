import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Initialize Tailwind CSS
document.addEventListener('DOMContentLoaded', () => {
  // Nothing needed here since we're using Tailwind via CDN
  // This is just a placeholder for future initialization code
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
