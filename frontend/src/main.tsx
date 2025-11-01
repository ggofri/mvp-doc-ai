import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

const ROOT_ELEMENT_ID = 'root';

ReactDOM.createRoot(document.getElementById(ROOT_ELEMENT_ID)!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
