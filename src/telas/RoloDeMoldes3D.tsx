/**
 * ===========================================================================
 * O ROLO DE MOLDES DA PORTA
 * ===========================================================================
 *
 * A mesma abertura do site (`optmize-site/site/fundo3d.js`): um rolo de tecido
 * em 3D, com as peças de um encaixe de verdade desenhadas em linha, passando
 * devagar sob o cabeçote — uma linha laranja parada atravessando o rolo. As
 * peças são as da simulação do site (`encaixeDoSite.js`: 14 camisas P, M e G,
 * rolo de 160 cm), em centímetros: x na largura do rolo, z no comprimento.
 * Três cópias do encaixe em fila fazem o rolo parecer sem fim.
 *
 * Veio no lugar da impressora 3D (pedido do dono em 2026-10-21): a porta passa
 * a mostrar o que o programa faz — encaixar —, e quem conhece o site
 * reconhece a casa.
 *
 * Fica na coluna da esquerda da porta, POR CIMA da rede animada: o fundo do
 * WebGL é transparente, e o rolo some nas bordas da caixa por uma máscara
 * suave (`.rolo-de-moldes-3d`, em `estilo/entrada.css`). No site isso é a
 * névoa; aqui não dá — a coluna tem brilho e rede atrás, e névoa da cor do
 * fundo virava uma mancha escura onde o rolo acaba. As cores saem dos tokens
 * (`estilo/tokens.css`) e acompanham a troca de tema.
 *
 * Este arquivo é carregado SOB DEMANDA (`lazy` em `Porta.tsx`): o Three.js só
 * entra quando a porta aparece.
 *
 * Economia, porque a máquina do balcão é fraca: só linhas e planos chapados,
 * sem luz, sombra nem textura; o laço para com a janela escondida; a densidade
 * de pixels tem teto de 1,75; e no modo leve ou com menos movimento pedido ao
 * sistema fica um quadro parado.
 */

import { useEffect, useRef } from "react";
import * as THREE from "three";

import { modoLeve } from "../estado/leve";
import dados from "./encaixeDoSite.js";

type Peca = { t: string; p: number[][] };

const LARG = dados.largura as number; // 160 cm
const COMP = (dados.metros as number) * 100; // o comprimento de um encaixe, em cm
const COPIAS = 3;
const VELOCIDADE = 24; // cm por segundo, como no site

function corDoToken(nome: string, reserva: string) {
  const valor = getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
  try {
    return new THREE.Color(valor || reserva);
  } catch {
    return new THREE.Color(reserva);
  }
}

/** Segmentos (pares de pontos) do contorno de cada peça do tipo pedido. */
function contornos(filtro: (tipo: string) => boolean) {
  const pos: number[] = [];
  for (let k = 0; k < COPIAS; k++) {
    const dz = -k * COMP;
    for (const peca of dados.pecas as Peca[]) {
      if (!filtro(peca.t)) continue;
      const p = peca.p;
      for (let i = 0; i < p.length; i++) {
        const [x1, y1] = p[i] as [number, number];
        const [x2, y2] = p[(i + 1) % p.length] as [number, number];
        pos.push(x1 - LARG / 2, 0, -y1 + dz, x2 - LARG / 2, 0, -y2 + dz);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

/** As bordas do rolo e as marcas de cada metro. */
function bordas() {
  const pos: number[] = [];
  const fim = -COPIAS * COMP;
  pos.push(-LARG / 2, 0, 0, -LARG / 2, 0, fim, LARG / 2, 0, 0, LARG / 2, 0, fim);
  for (let z = 0; z > fim; z -= 100) {
    pos.push(-LARG / 2 - 6, 0, z, -LARG / 2, 0, z, LARG / 2, 0, z, LARG / 2 + 6, 0, z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

export function RoloDeMoldes3D({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const caixa = ref.current;
    if (!caixa) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
    } catch {
      // Sem WebGL (driver antigo, máquina virtual): a porta fica só com a rede.
      return;
    }
    let desmontado = false;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.display = "block";
    caixa.appendChild(renderer.domElement);

    const cena = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 1, 4000);

    // O rolo: tudo dentro de um grupo que anda na direção da câmera.
    const rolo = new THREE.Group();
    const tecido = new THREE.MeshBasicMaterial();
    for (let k = 0; k < COPIAS; k++) {
      const plano = new THREE.Mesh(new THREE.PlaneGeometry(LARG, COMP), tecido);
      plano.rotation.x = -Math.PI / 2;
      plano.position.set(0, -0.3, -COMP / 2 - k * COMP);
      rolo.add(plano);
    }
    const linha = (opacidade: number) => new THREE.LineBasicMaterial({ transparent: true, opacity: opacidade });
    const materialCorpo = linha(0.46);
    const materialManga = linha(0.8);
    const materialGola = linha(0.6);
    const materialBorda = linha(0.35);
    const materialCabecote = new THREE.LineBasicMaterial();
    rolo.add(
      new THREE.LineSegments(contornos((t) => t === "frente" || t === "costas"), materialCorpo),
      new THREE.LineSegments(contornos((t) => t === "manga"), materialManga),
      new THREE.LineSegments(contornos((t) => t === "gola"), materialGola),
      new THREE.LineSegments(bordas(), materialBorda),
    );

    // O cabeçote: uma linha laranja parada, atravessando o rolo.
    const cabecote = new THREE.BufferGeometry();
    cabecote.setAttribute("position",
      new THREE.Float32BufferAttribute([-LARG / 2 - 14, 0.4, -90, LARG / 2 + 14, 0.4, -90], 3));
    const linhaCabecote = new THREE.LineSegments(cabecote, materialCabecote);

    // O conjunto girado na diagonal, como no site.
    const palco = new THREE.Group();
    palco.add(rolo, linhaCabecote);
    palco.rotation.y = -0.5;
    cena.add(palco);

    /*
      AS CORES DO TEMA. O tecido vai para a cor dos cartões; as linhas, para o
      texto e o laranja da marca. Relidas quando o tema troca (`optmize:tema`,
      de `estado/tema.ts`).
    */
    const pintar = () => {
      tecido.color.copy(corDoToken("--card-bg", "#161618"));
      materialCorpo.color.copy(corDoToken("--text", "#f4f2ef"));
      materialManga.color.copy(corDoToken("--accent-bright", "#ff8556"));
      materialGola.color.copy(corDoToken("--accent", "#ff531f"));
      materialBorda.color.copy(corDoToken("--accent", "#ff531f"));
      materialCabecote.color.copy(corDoToken("--accent", "#ff531f"));
    };
    pintar();

    // A coluna inteira da porta: o rolo atravessa a caixa, visto de cima e de lado.
    const base = { x: 0, y: 175, z: 285 };
    const olho = { x: 0, y: 0, z: -170 };
    const ajustar = () => {
      const w = caixa.clientWidth;
      const h = caixa.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = `${w}px`;
      renderer.domElement.style.height = `${h}px`;
      camera.aspect = w / h;
      // Caixa estreita (janela pequena): afasta para a largura do rolo caber.
      const afastar = Math.max(0.78, 0.95 / camera.aspect);
      base.y = 175 * afastar;
      base.z = 285 * afastar;
      camera.updateProjectionMatrix();
    };
    ajustar();

    // A câmera segue o mouse de leve, como no site.
    const alvo = { x: 0, y: 0 };
    const atual = { x: 0, y: 0 };
    const aoMover = (e: PointerEvent) => {
      alvo.x = (e.clientX / window.innerWidth - 0.5) * 2;
      alvo.y = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener("pointermove", aoMover, { passive: true });

    const desenhar = (dt: number) => {
      rolo.position.z = (rolo.position.z + VELOCIDADE * dt) % COMP;
      atual.x += (alvo.x - atual.x) * 0.04;
      atual.y += (alvo.y - atual.y) * 0.04;
      camera.position.set(base.x + atual.x * 22, base.y - atual.y * 12, base.z);
      camera.lookAt(olho.x, olho.y, olho.z);
      renderer.render(cena, camera);
    };

    /*
      PARADO: quem pediu menos movimento ao sistema, e o MODO LEVE (`estado/leve.ts`)
      — acesso remoto e máquina sem placa de vídeo, onde o WebGL é o processador
      desenhando. Nos dois, um quadro só, redesenhado quando a janela muda de
      tamanho ou o tema troca.
    */
    const parado = window.matchMedia("(prefers-reduced-motion: reduce)").matches || modoLeve();
    let quadro = 0;
    let antes = 0;
    const laco = (agora: number) => {
      quadro = 0;
      if (document.hidden) return;
      const dt = antes ? Math.min((agora - antes) / 1000, 0.05) : 0;
      antes = agora;
      desenhar(parado ? 0 : dt);
      if (!parado) quadro = requestAnimationFrame(laco);
    };
    function pedirQuadro() {
      if (!desmontado && quadro === 0) {
        antes = 0;
        quadro = requestAnimationFrame(laco);
      }
    }

    const observador = new ResizeObserver(() => {
      ajustar();
      pedirQuadro();
    });
    observador.observe(caixa);
    const aoTrocarTema = () => {
      pintar();
      pedirQuadro();
    };
    window.addEventListener("optmize:tema", aoTrocarTema);
    const aoEsconder = () => {
      if (!document.hidden) pedirQuadro();
    };
    document.addEventListener("visibilitychange", aoEsconder);
    pedirQuadro();

    return () => {
      desmontado = true;
      cancelAnimationFrame(quadro);
      observador.disconnect();
      window.removeEventListener("pointermove", aoMover);
      window.removeEventListener("optmize:tema", aoTrocarTema);
      document.removeEventListener("visibilitychange", aoEsconder);
      cena.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) {
          obj.geometry.dispose();
          (obj.material as THREE.Material).dispose();
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return <div ref={ref} aria-hidden="true" className={`rolo-de-moldes-3d ${className}`} />;
}
