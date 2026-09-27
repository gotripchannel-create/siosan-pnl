import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { ErrorBoundary } from './ErrorBoundary.jsx';

const rootNode = document.getElementById('root');
const bootScreen = document.getElementById('boot-screen');
const bootMessage = document.getElementById('boot-message');

// Не убираем стартовый экран сразу после вызова render: в iOS WebView React может
// очистить контейнер, а затем упасть до первого кадра. Скрываем его только когда
// в приложении действительно появился текстовый интерфейс.
const hideBootWhenReady = () => {
  if (rootNode?.textContent?.trim()) {
    if (bootScreen) bootScreen.style.display = 'none';
    return;
  }
  window.setTimeout(hideBootWhenReady, 100);
};

window.addEventListener('error', () => {
  if (bootMessage) bootMessage.textContent = 'Не удалось запустить приложение. Откройте сайт в Safari и обновите страницу.';
});
window.addEventListener('unhandledrejection', () => {
  if (bootMessage) bootMessage.textContent = 'Ошибка запуска. Откройте сайт в Safari и обновите страницу.';
});

ReactDOM.createRoot(rootNode).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);

window.setTimeout(hideBootWhenReady, 0);
