import React from 'react';
import { createRoot } from 'react-dom/client';
import './app/global.css';

const params = new URLSearchParams(location.search);
const root = createRoot(document.getElementById('root')!);

if (params.get('view') === 'board') {
  import('./board/PopoutBench').then(({ PopoutBench }) => root.render(<PopoutBench />));
} else {
  import('./app/App').then(({ App }) => root.render(<App />));
}
