/**
 * ===========================================================================
 * VITE — o build da tela nova
 * ===========================================================================
 *
 * Este arquivo existe para que o Tauri não precise saber que o front mudou.
 * O instalador continua fazendo o que sempre fez: sobe o `server.js` com o
 * `node.exe` embutido e abre uma janela nele. O que o Vite faz é gerar HTML,
 * CSS e JS estáticos em `dist/`, que o Express serve como servia o `public/`.
 * Nenhuma linha do `tauri.conf.json` muda por causa do React.
 *
 * Três decisões que este arquivo carrega:
 *
 * - `base: "/app/"` — a tela nova mora numa rota separada enquanto a antiga
 *   continua de pé em `/`. É o que permite migrar tela por tela sem deixar o
 *   sistema quebrado no meio do caminho. No dia em que a última tela migrar,
 *   isto vira `"/"` e o `public/` inteiro é apagado; como todo caminho é
 *   montado a partir de `import.meta.env.BASE_URL`, nada mais precisa mudar.
 *
 * - `publicDir: "estatico"` — o `public/` é a tela ANTIGA, não a pasta de
 *   arquivos crus do Vite. Os arquivos que as duas telas servem como estão
 *   (o sprite de ícones e o `encaixe.wasm`) moram em `estatico/`.
 *
 * A extensão é `.mts` e não `.ts` de propósito: o `package.json` declara o
 * projeto como CommonJS, porque o servidor Express é CommonJS e continua
 * sendo. O `.mts` diz ao Node que ESTE arquivo é módulo, sem obrigar o resto
 * do projeto a virar módulo junto.
 *
 * - `proxy` — em desenvolvimento o Vite atende em 5173 e o Express em 8000.
 *   O proxy faz `/api` e `/uploads` chegarem no Express, então o código da
 *   tela chama sempre caminho relativo e não sabe em que porta está rodando.
 */

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";

export default defineConfig({
  base: "/app/",
  publicDir: "estatico",
  plugins: [react(), tailwind()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8000",
      "/uploads": "http://localhost:8000",
    },
  },
});
