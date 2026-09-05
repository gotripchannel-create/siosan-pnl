import React from 'react';

// Без этого компонента любая необработанная ошибка в рендере (а при 6000+
// строках React-кода такие рано или поздно случаются) роняла ВСЁ приложение
// в белый экран без единого объяснения, что произошло и как восстановиться —
// кроме "попробовать перезагрузить страницу и понадеяться, что заработает".
//
// Ограничение React: Error Boundary ловит ошибки только в рендере/жизненном
// цикле дочерних компонентов, но НЕ ловит ошибки внутри асинхронных обработчиков
// (async onClick, setTimeout и т.п.) и не ловит ошибки в самом себе — такие
// ошибки по-прежнему нужно оборачивать в try/catch на месте.
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('Необработанная ошибка рендера:', error, info?.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          minHeight: '100vh', padding: 24, fontFamily: 'system-ui, sans-serif', textAlign: 'center', gap: 16,
        }}>
          <div style={{ fontSize: 40 }}>⚠️</div>
          <h1 style={{ fontSize: 20, margin: 0 }}>Что-то сломалось</h1>
          <p style={{ color: '#666', maxWidth: 480, margin: 0 }}>
            Приложение столкнулось с неожиданной ошибкой и не может продолжить работу в этом состоянии.
            Ваши данные в облаке не пострадали — попробуйте обновить страницу.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '10px 20px', borderRadius: 8, border: 'none', background: '#111',
              color: '#fff', fontSize: 14, cursor: 'pointer',
            }}
          >
            Обновить страницу
          </button>
          <details style={{ marginTop: 16, maxWidth: 640, textAlign: 'left', color: '#999', fontSize: 12 }}>
            <summary style={{ cursor: 'pointer' }}>Техническая информация (для разработчика)</summary>
            <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{String(this.state.error?.stack || this.state.error)}</pre>
          </details>
        </div>
      );
    }
    return this.props.children;
  }
}
