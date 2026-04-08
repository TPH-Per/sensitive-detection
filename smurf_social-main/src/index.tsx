import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/index.css';
import { SkeletonProvider } from './components/ui/Skeleton';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <SkeletonProvider>
      <App />
    </SkeletonProvider>
  </React.StrictMode>
);
