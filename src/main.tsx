/** Browser entry point: mounts the React shell. No analysis code runs here. */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './ui/tokens.css';
import './ui/fonts.css';
import { App } from './App.tsx';

const root = document.getElementById('root');
if (root === null) throw new Error('#root element missing from index.html');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
