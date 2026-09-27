import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Основной экран не должен ждать загрузки тяжёлых библиотек для диаграмм,
// экспорта Excel и облачной базы. Отдельные стабильные чанки также хорошо
// кэшируются браузером телефона между открытиями приложения.
export default defineConfig({
  plugins: [react()],
  build: {
    // Ярлык «На экран Домой» на старых iPhone использует более старый WebKit,
    // чем обычный Safari. ES2018 покрывает такие версии и не даёт приложению
    // упасть до первого рендера из-за неподдерживаемого синтаксиса.
    target: 'es2018',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/recharts/')) return 'charts';
          if (id.includes('/node_modules/xlsx/')) return 'excel';
          if (id.includes('/node_modules/@supabase/')) return 'supabase';
          if (id.includes('/node_modules/react/') || id.includes('/node_modules/react-dom/')) return 'react';
        },
      },
    },
  },
});
