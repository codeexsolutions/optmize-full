/**
 * ===========================================================================
 * A IMPRESSORA 3D DA PORTA
 * ===========================================================================
 *
 * Uma impressora de grande formato (a de RIP, onde o trabalho da gráfica
 * termina) desenhada em Three.js, imprimindo a marca do Optmize num filme que
 * desce pela saída. Fica na coluna da esquerda da porta, POR CIMA da rede
 * animada: o fundo do WebGL é transparente, e a rede aparece atrás dela.
 *
 * O CICLO (8s), o mesmo da versão em CSS que veio antes:
 *
 *   0–64%   a cabeça vai e volta seis vezes, e o filme avança em passadas;
 *   64–90%  o filme pronto fica à mostra, a cabeça estacionada;
 *   90–100% o filme some, e a próxima impressão começa com a saída vazia.
 *
 * O FILME SAI DE DENTRO DA MÁQUINA por um plano de corte na altura da fenda:
 * tudo o que está acima dele não é desenhado, e o que se vê é o filme
 * nascendo da saída.
 *
 * Este arquivo é carregado SOB DEMANDA (`lazy` em `Porta.tsx`): o Three.js
 * só entra quando a porta aparece, e não pesa no resto do programa.
 *
 * Economia, porque a máquina do balcão é fraca: o laço para com a janela
 * escondida, a densidade de pixels tem teto de 2, e no modo leve ou com menos
 * movimento pedido ao sistema fica um quadro parado com o filme já impresso.
 */

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

import { modoLeve } from "../estado/leve";

const CICLO_S = 8;
const FIM_IMPRESSAO = 0.64;
const PASSADAS = 6;

/** Medidas da máquina, em unidades do mundo. */
const LARGURA = 4.4;
const CORPO_Y = 0.9;
const CORPO_ALTURA = 0.75;
const CORPO_FUNDO = 0.9;
const FENDA_Y = CORPO_Y - CORPO_ALTURA / 2;
const FILME_LARGURA = 3;
const FILME_ALTURA = 1.95;
const CURSO_CABECA = 1.25;

const suave = (x: number) => x * x * (3 - 2 * x);

function corDoToken(nome: string, reserva: string) {
  const valor = getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
  return new THREE.Color(valor || reserva);
}

/** A textura do filme: translúcido, com a marca no meio. */
function texturaDoFilme(logo: HTMLImageElement | null) {
  const largura = 512;
  const altura = Math.round((largura * FILME_ALTURA) / FILME_LARGURA);
  const tela = document.createElement("canvas");
  tela.width = largura;
  tela.height = altura;
  const ctx = tela.getContext("2d")!;

  const fundo = ctx.createLinearGradient(0, 0, 0, altura);
  fundo.addColorStop(0, "rgba(244,242,239,0.10)");
  fundo.addColorStop(1, "rgba(244,242,239,0.04)");
  ctx.fillStyle = fundo;
  ctx.fillRect(0, 0, largura, altura);

  // As bordas do filme, finas, para ele ler como uma folha e não um brilho.
  ctx.strokeStyle = "rgba(244,242,239,0.16)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(1, 0);
  ctx.lineTo(1, altura);
  ctx.moveTo(largura - 1, 0);
  ctx.lineTo(largura - 1, altura);
  ctx.stroke();

  if (logo) {
    const lado = altura * 0.5;
    ctx.drawImage(logo, (largura - lado) / 2, altura * 0.42 - lado / 2, lado, lado);
  }

  const textura = new THREE.CanvasTexture(tela);
  textura.colorSpace = THREE.SRGBColorSpace;
  textura.anisotropy = 4;
  return textura;
}

/** Um brilho redondo no chão, debaixo da máquina. */
function texturaDoBrilho(cor: THREE.Color) {
  const tela = document.createElement("canvas");
  tela.width = tela.height = 256;
  const ctx = tela.getContext("2d")!;
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  const rgb = `${Math.round(cor.r * 255)},${Math.round(cor.g * 255)},${Math.round(cor.b * 255)}`;
  g.addColorStop(0, `rgba(${rgb},0.35)`);
  g.addColorStop(0.5, `rgba(${rgb},0.08)`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const textura = new THREE.CanvasTexture(tela);
  textura.colorSpace = THREE.SRGBColorSpace;
  return textura;
}

export function Impressora3D({ className = "" }: { className?: string }) {
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
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.localClippingEnabled = true;
    renderer.domElement.style.display = "block";
    caixa.appendChild(renderer.domElement);

    const acento = corDoToken("--accent", "#ff531f");
    const cena = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    const DIRECAO_CAMERA = new THREE.Vector3(0.22, 0.2, 1).normalize();
    const ALVO = new THREE.Vector3(0, -0.05, 0);

    // ── Luzes ──────────────────────────────────────────────────────────────
    cena.add(new THREE.HemisphereLight(0xdedbe6, 0x1a1a1f, 2));
    const chave = new THREE.DirectionalLight(0xffffff, 3);
    chave.position.set(-3, 5, 6);
    cena.add(chave);
    // A luz de recorte, laranja e por trás: é o que separa a máquina do fundo.
    const recorte = new THREE.DirectionalLight(acento, 2.4);
    recorte.position.set(4, 2, -5);
    cena.add(recorte);

    // ── A máquina ──────────────────────────────────────────────────────────
    const maquina = new THREE.Group();
    cena.add(maquina);

    const metal = (cor: number, rugosidade = 0.5) =>
      new THREE.MeshStandardMaterial({ color: cor, metalness: 0.35, roughness: rugosidade });

    const corpo = new THREE.Mesh(
      new RoundedBoxGeometry(LARGURA, CORPO_ALTURA, CORPO_FUNDO, 4, 0.09),
      metal(0x2c2c33, 0.42),
    );
    corpo.position.y = CORPO_Y;
    maquina.add(corpo);

    const frente = CORPO_FUNDO / 2;

    // A linha da tampa, um terço abaixo do topo.
    const tampa = new THREE.Mesh(new THREE.BoxGeometry(LARGURA - 0.3, 0.012, 0.01), metal(0x34343b));
    tampa.position.set(0, CORPO_Y + 0.13, frente + 0.002);
    maquina.add(tampa);

    // A janela por onde se vê a cabeça correr.
    const janela = new THREE.Mesh(
      new THREE.BoxGeometry(CURSO_CABECA * 2 + 0.5, 0.2, 0.02),
      new THREE.MeshStandardMaterial({ color: 0x08080a, roughness: 0.2, metalness: 0.1 }),
    );
    janela.position.set(-0.4, CORPO_Y - 0.08, frente);
    maquina.add(janela);

    // A cabeça de impressão, com a tinta acesa embaixo e uma luz que pinta o filme.
    const cabeca = new THREE.Group();
    cabeca.position.set(-0.4, CORPO_Y - 0.08, frente + 0.02);
    const carro = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.13, 0.04), metal(0x4a4a52, 0.35));
    const tinta = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.018, 0.03),
      new THREE.MeshBasicMaterial({ color: acento }),
    );
    tinta.position.y = -0.075;
    const luzDaTinta = new THREE.PointLight(acento, 1.6, 2.2, 1.5);
    luzDaTinta.position.set(0, -0.25, 0.25);
    cabeca.add(carro, tinta, luzDaTinta);
    maquina.add(cabeca);

    // O painel do lado direito, com a tela e a luz de "imprimindo".
    const painel = new THREE.Mesh(
      new THREE.BoxGeometry(0.62, 0.28, 0.03),
      new THREE.MeshStandardMaterial({ color: 0x0e0e10, roughness: 0.3 }),
    );
    painel.position.set(1.62, CORPO_Y - 0.06, frente);
    maquina.add(painel);
    const visor = new THREE.Mesh(
      new THREE.PlaneGeometry(0.34, 0.14),
      new THREE.MeshBasicMaterial({ color: acento, transparent: true, opacity: 0.18 }),
    );
    visor.position.set(1.54, CORPO_Y - 0.06, frente + 0.017);
    maquina.add(visor);
    const ledMaterial = new THREE.MeshBasicMaterial({ color: acento, transparent: true });
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 12), ledMaterial);
    led.position.set(1.82, CORPO_Y - 0.06, frente + 0.02);
    maquina.add(led);

    // A fenda de saída, logo abaixo do corpo.
    const fenda = new THREE.Mesh(
      new THREE.BoxGeometry(FILME_LARGURA + 0.2, 0.04, 0.26),
      new THREE.MeshBasicMaterial({ color: 0x050506 }),
    );
    fenda.position.set(0, FENDA_Y - 0.01, 0.12);
    maquina.add(fenda);

    // Os pés, a barra de travamento entre eles e as sapatas.
    const PE_X = LARGURA / 2 - 0.3;
    const CHAO = -1.15;
    const alturaPe = FENDA_Y - CHAO;
    for (const lado of [-1, 1]) {
      const pe = new THREE.Mesh(new THREE.BoxGeometry(0.1, alturaPe, 0.12), metal(0x303038));
      pe.position.set(lado * PE_X, CHAO + alturaPe / 2, -0.1);
      const sapata = new THREE.Mesh(new RoundedBoxGeometry(0.16, 0.07, 0.95, 2, 0.03), metal(0x3a3a42));
      sapata.position.set(lado * PE_X, CHAO + 0.035, -0.1);
      maquina.add(pe, sapata);
    }
    const barra = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, PE_X * 2, 16), metal(0x3a3a42, 0.35));
    barra.rotation.z = Math.PI / 2;
    barra.position.set(0, CHAO + 0.45, -0.3);
    maquina.add(barra);

    // O brilho no chão.
    const texturaBrilho = texturaDoBrilho(acento);
    const brilho = new THREE.Mesh(
      new THREE.PlaneGeometry(6.5, 2.6),
      new THREE.MeshBasicMaterial({ map: texturaBrilho, transparent: true, depthWrite: false }),
    );
    brilho.rotation.x = -Math.PI / 2;
    brilho.position.y = CHAO + 0.002;
    maquina.add(brilho);

    // ── O filme ────────────────────────────────────────────────────────────
    // O plano de corte fica em coordenadas do mundo; como a máquina gira só
    // em torno do eixo vertical, a altura da fenda é a mesma nos dois.
    const corte = new THREE.Plane(new THREE.Vector3(0, -1, 0), FENDA_Y - 0.02);
    const filmeMaterial = new THREE.MeshBasicMaterial({
      map: texturaDoFilme(null),
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      clippingPlanes: [corte],
    });
    const filme = new THREE.Mesh(new THREE.PlaneGeometry(FILME_LARGURA, FILME_ALTURA), filmeMaterial);
    // Levemente para a frente, como o filme que sai de uma impressora de verdade.
    filme.rotation.x = -0.1;
    filme.position.z = 0.16;
    maquina.add(filme);

    let desmontado = false;
    const logo = new Image();
    logo.onload = () => {
      if (desmontado) return;
      filmeMaterial.map?.dispose();
      filmeMaterial.map = texturaDoFilme(logo);
      filmeMaterial.needsUpdate = true;
      pedirQuadro();
    };
    logo.src = `${import.meta.env.BASE_URL}icone.png`;

    // ── O ciclo ────────────────────────────────────────────────────────────
    const posicionar = (fase: number) => {
      let avanco: number;
      if (fase < FIM_IMPRESSAO) {
        const s = (fase / FIM_IMPRESSAO) * PASSADAS;
        const passada = Math.floor(s);
        const resto = s - passada;
        // A cabeça vai e volta uma vez por passada; o filme anda só na volta.
        cabeca.position.x = -0.4 - CURSO_CABECA * Math.cos(resto * Math.PI * 2);
        avanco = (passada + suave(Math.max(0, (resto - 0.55) / 0.45))) / PASSADAS;
        ledMaterial.opacity = Math.floor(resto * 4) % 2 === 0 ? 1 : 0.25;
      } else {
        cabeca.position.x = -0.4 - CURSO_CABECA;
        avanco = 1;
        ledMaterial.opacity = 1;
      }
      filme.position.y = FENDA_Y + FILME_ALTURA / 2 - avanco * (FILME_ALTURA + 0.05);
      filmeMaterial.opacity = fase < 0.9 ? 1 : Math.max(0, 1 - (fase - 0.9) / 0.07);
      luzDaTinta.intensity = fase < FIM_IMPRESSAO ? 1.6 : 0.4;
    };

    // ── Tamanho ────────────────────────────────────────────────────────────
    const ajustar = () => {
      const largura = caixa.clientWidth;
      const altura = caixa.clientHeight;
      if (largura === 0 || altura === 0) return;
      renderer.setSize(largura, altura, false);
      renderer.domElement.style.width = `${largura}px`;
      renderer.domElement.style.height = `${altura}px`;
      camera.aspect = largura / altura;
      // Afasta a câmera até a máquina inteira caber, na largura e na altura.
      const meiaAltura = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const distancia = Math.max(3.9, 5.6 / camera.aspect) / (2 * meiaAltura);
      camera.position.copy(DIRECAO_CAMERA).multiplyScalar(distancia).add(ALVO);
      camera.lookAt(ALVO);
      camera.updateProjectionMatrix();
    };
    ajustar();
    const observador = new ResizeObserver(() => {
      ajustar();
      pedirQuadro();
    });
    observador.observe(caixa);

    // A máquina vira um pouco na direção do mouse.
    const ponteiro = { x: 0, y: 0 };
    const aoMover = (e: PointerEvent) => {
      ponteiro.x = (e.clientX / window.innerWidth) * 2 - 1;
      ponteiro.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", aoMover);

    /*
      PARADO: quem pediu menos movimento ao sistema, e o MODO LEVE (`estado/leve.ts`)
      — acesso remoto e máquina sem placa de vídeo, onde o WebGL é o processador
      desenhando. Nos dois, um quadro com o filme já impresso, e só se redesenha
      quando a janela muda de tamanho ou a marca acaba de carregar.
    */
    const parado = window.matchMedia("(prefers-reduced-motion: reduce)").matches || modoLeve();
    const inicio = performance.now();
    let quadro = 0;

    const desenhar = (agora: number) => {
      const t = (agora - inicio) / 1000;
      posicionar(parado ? 0.75 : (t % CICLO_S) / CICLO_S);
      const giroAlvo = -0.32 + (parado ? 0 : Math.sin(t * 0.3) * 0.06 + ponteiro.x * 0.14);
      // Parado não há quadro seguinte para a aproximação terminar: vai direto.
      const passo = parado ? 1 : 0.06;
      maquina.rotation.y += (giroAlvo - maquina.rotation.y) * passo;
      maquina.rotation.x += ((parado ? 0 : ponteiro.y * 0.04) - maquina.rotation.x) * passo;
      maquina.position.y = parado ? 0 : Math.sin(t * 0.8) * 0.03;
      renderer.render(cena, camera);
    };

    const laco = (agora: number) => {
      quadro = 0;
      if (document.hidden) return;
      desenhar(agora);
      if (!parado) quadro = requestAnimationFrame(laco);
    };
    function pedirQuadro() {
      if (!desmontado && quadro === 0) quadro = requestAnimationFrame(laco);
    }
    const aoEsconder = () => {
      if (!document.hidden) pedirQuadro();
    };
    document.addEventListener("visibilitychange", aoEsconder);
    quadro = requestAnimationFrame(laco);

    return () => {
      desmontado = true;
      cancelAnimationFrame(quadro);
      observador.disconnect();
      window.removeEventListener("pointermove", aoMover);
      document.removeEventListener("visibilitychange", aoEsconder);
      cena.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          const material = obj.material as THREE.MeshBasicMaterial;
          material.map?.dispose();
          material.dispose();
        }
      });
      texturaBrilho.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return <div ref={ref} aria-hidden="true" className={`impressora-3d ${className}`} />;
}
