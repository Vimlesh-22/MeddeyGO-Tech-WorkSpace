import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import ErrorBoundary from '../../../_shared/components/ErrorBoundary';

createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
