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
 * - `base: "/"` — o painel é servido na raiz. Durante a migração ele morou em
 *   `/app`, para conviver com a tela antiga em `/`; quando o `public/` saiu, a
 *   raiz voltou a ser dele. O `server.js` ainda responde a `/app`, com um
 *   redirecionamento, por causa dos links antigos.
 * - `publicDir: "estatico"` — e não o `public/` que o Vite usaria por padrão,
 *   porque durante a migração esse nome já era da tela antiga. O nome ficou:
 *   os arquivos servidos como estão (o sprite de ícones, o `encaixe.wasm`, o
 *   `logo.png` e as redes da IA) moram em `estatico/`.
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
  base: "/",
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
      // O painel das impressoras é atualizado por evento. `ws: true` é o que
      // faz o WebSocket atravessar o proxy — sem isso ele cai para polling em
      // desenvolvimento e o progresso da varredura chega aos trancos.
      "/socket.io": { target: "http://localhost:8000", ws: true },
    },
  },
});
