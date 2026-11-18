// Configuración compartida de Tailwind (CDN). Se carga justo después del script de Tailwind.
// Paleta "Apple limpio": fondo gris muy claro, tarjetas blancas, texto grafito.
// El naranja aparece solo en las acciones clave. Sin azules, sin degradados.
tailwind.config = {
  theme: {
    extend: {
      colors: {
        brand: { 50: '#fff7ed', 100: '#ffedd5', 300: '#fdba74', 500: '#fb8c3c', 600: '#f97316', 700: '#c2410c', 800: '#9a3412', 900: '#1d1d1f' },
        tang: { DEFAULT: '#ea580c', soft: '#ffedd5', text: '#9a3412' },
        // "navy" se conserva como nombre por compatibilidad: ahora es grafito
        navy: { DEFAULT: '#1d1d1f', soft: '#ececf0' },
        // "sun" = chips/realces: blanco y grises neutros (antes amarillo)
        sun: { 50: '#fafafa', 100: '#f5f5f7', 300: '#ececf0', 400: '#ffffff', 500: '#f5f5f7', DEFAULT: '#ffffff', soft: '#f5f5f7' },
        ok: { DEFAULT: '#15803d', strong: '#166534', soft: '#e6f4ea' },
        bad: { DEFAULT: '#b42318', soft: '#fdecea' },
        warn: { DEFAULT: '#92400e', soft: '#fef3c7' },
        // "info" = grafito: dato neutro (QR, números en el pedido)
        info: { DEFAULT: '#3a3a3c', soft: '#ececf0' },
        data: { 1: '#f97316', 2: '#3a3a3c', 3: '#c7c7cc' },
        pitahaya: { DEFAULT: '#ea580c', soft: '#ffedd5' },
        peach: '#ffedd5',
        ink: '#1d1d1f',
        muted: '#6e6e73',
        canvas: '#f5f5f7',
        line: '#e5e5ea',
        lime: { soft: '#f5f5f7' },
        teal: { soft: '#ececf0' },
        rose: { soft: '#f2f2f7' },
      },
      fontFamily: {
        sans: ['Figtree', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      borderRadius: { panel: '24px' },
    },
  },
};
