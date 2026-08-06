import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // Cible de compilation LARGE : d'anciens iPad/iPhone tournent sur un Safari
  // qui ne comprend pas la syntaxe moderne (chaînage optionnel « ?. »,
  // coalescence « ?? », champs de classe…). Sans transpilation, tout le
  // bundle échoue au parsing → écran noir. On abaisse donc la cible pour
  // qu'esbuild réécrive cette syntaxe en équivalents compatibles.
  build: {
    target: ['es2015', 'safari11'],
  },
  server: {
    host: true, // accessible depuis le téléphone sur le même Wi-Fi
  },
});
