/**
 * ===========================================================================
 * A REDE DA PORTA — pontos que se ligam por raios de luz
 * ===========================================================================
 *
 * O mesmo fundo do login do Codex Flow (`features/landing/components/
 * RedeAnimada.tsx`, no outro repositório), aqui em LARANJA: pontos que
 * flutuam, acendem um raio entre si quando chegam perto, e de vez em quando
 * mandam um pulso de luz correndo por esse raio.
 *
 * Por que canvas numa tela que se orgulhava de ser só CSS: raio que liga dois
 * pontos em movimento não existe em CSS. Dá para desenhar linhas paradas e
 * animá-las, mas QUEM liga com quem muda a cada quadro — é conta, não
 * declaração. O custo é um arquivo que só a porta carrega; nenhuma biblioteca
 * entra no instalador por causa dele.
 *
 * ---------------------------------------------------------------------------
 * O QUE FAZ DIFERENÇA AQUI
 * ---------------------------------------------------------------------------
 *
 * - A COR SAI DO TOKEN, e não de um hex escrito à mão. O canvas recebe
 *   `text-ambar`, e a cor é lida de volta já resolvida pelo navegador — assim
 *   vale para o `--accent` em hex, em oklch ou no que ele virar, e trocar o
 *   laranja da marca leva a rede junto.
 * - `prefers-reduced-motion` desenha UM quadro e para. A tela continua com a
 *   rede, sem movimento contínuo para quem pediu menos movimento.
 * - A animação congela com a janela escondida: `requestAnimationFrame`
 *   rodando atrás é bateria da máquina da gráfica queimada à toa.
 * - O ponteiro só é seguido onde há mouse. No toque não há hover, e o ouvinte
 *   seria peso morto.
 */

import { useEffect, useRef } from "react";

type Ponto = { x: number; y: number; vx: number; vy: number };
type Pulso = { i: number; j: number; t: number; velocidade: number };

/** A partir de quantos pixels dois pontos param de se enxergar. */
const DISTANCIA_LIGACAO = 132;

/**
 * `className` existe porque a rede pode cobrir a janela (`fixed`) ou ficar
 * presa a uma coluna (`absolute`). Na porta é presa: fixa, ela passaria por
 * cima do cartão do formulário.
 */
export function RedeAnimada({
  className = "absolute inset-0",
  densidade = 15000,
  seguirPonteiro = true,
}: {
  className?: string;
  /*
    QUANTOS PIXELS DE ÁREA POR PONTO. Menor é mais cheio.

    Existe por causa da barra lateral: 236px de largura com o valor da porta
    dão catorze pontos numa coluna inteira, e catorze pontos não formam
    textura — formam um triângulo solto no meio do nada, que o olho lê como
    defeito. A coluna larga da porta, com os mesmos catorze por tela cheia,
    fica certa.
  */
  densidade?: number;
  /*
    SE A REDE REAGE AO CURSOR.

    Na porta, sim: o ponteiro acende os raios em volta e puxa os pontos de
    leve, e é o que faz a tela parecer viva enquanto alguém digita a senha.

    Na barra lateral, NÃO — e o motivo é que ali o cursor não está passeando,
    está indo para uma tela. Reagir faria a coluna acender toda vez que
    alguém fosse clicar em "Encaixe", e os pontos acabariam amontoados no
    caminho que o mouse faz todo dia.
  */
  seguirPonteiro?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const reduzir = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const temMouse = seguirPonteiro && window.matchMedia("(pointer: fine)").matches;

    /*
      O LARANJA, LIDO DO PRÓPRIO CANVAS.

      A classe `text-ambar` põe `color: var(--accent)` no elemento, e o
      navegador devolve isso já resolvido em `rgb(...)` — seja o token um hex,
      um oklch ou uma variável apontando para outra. Ler o token cru daria a
      string como está escrita, e `#ff531f` não entra num `rgba()`.
    */
    const canais = getComputedStyle(canvas).color.match(/[\d.]+/g) ?? [];
    const [r, g, b] = [canais[0] ?? "255", canais[1] ?? "83", canais[2] ?? "31"];
    const cor = (opacidade: number) => `rgba(${r}, ${g}, ${b}, ${opacidade})`;

    let largura = 0;
    let altura = 0;
    let pontos: Ponto[] = [];
    const pulsos: Pulso[] = [];
    const ponteiro = { x: -9999, y: -9999, ativo: false };

    const redimensionar = () => {
      // Teto de 2 no DPR: acima disso o ganho visual some e o custo dobra.
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      largura = canvas.clientWidth;
      altura = canvas.clientHeight;
      canvas.width = Math.floor(largura * dpr);
      canvas.height = Math.floor(altura * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // O teto de 82 é custo: cada ponto conversa com todos os outros, e a
      // conta é quadrática.
      const quantidade = Math.min(Math.round((largura * altura) / densidade), 82);

      pontos = Array.from({ length: quantidade }, () => ({
        x: Math.random() * largura,
        y: Math.random() * altura,
        vx: (Math.random() - 0.5) * 0.24,
        vy: (Math.random() - 0.5) * 0.24,
      }));
    };

    const desenhar = () => {
      ctx.clearRect(0, 0, largura, altura);

      for (const p of pontos) {
        p.x += p.vx;
        p.y += p.vy;

        // Atravessa a borda e reaparece do outro lado.
        if (p.x < -30) p.x = largura + 30;
        else if (p.x > largura + 30) p.x = -30;
        if (p.y < -30) p.y = altura + 30;
        else if (p.y > altura + 30) p.y = -30;

        // Uma atração fraquinha pelo cursor: a rede responde sem perseguir.
        if (ponteiro.ativo) {
          const dx = ponteiro.x - p.x;
          const dy = ponteiro.y - p.y;
          if (dx * dx + dy * dy < 26000) {
            p.x += dx * 0.0008;
            p.y += dy * 0.0008;
          }
        }
      }

      for (let i = 0; i < pontos.length; i++) {
        for (let j = i + 1; j < pontos.length; j++) {
          const a = pontos[i]!;
          const c = pontos[j]!;
          const dist = Math.hypot(a.x - c.x, a.y - c.y);
          if (dist >= DISTANCIA_LIGACAO) continue;

          // Quanto mais perto, mais forte o raio — é o que dá profundidade.
          let opacidade = (1 - dist / DISTANCIA_LIGACAO) * 0.34;

          // Perto do cursor os raios acendem: a rede reage a quem está ali.
          if (ponteiro.ativo) {
            const pd = Math.hypot((a.x + c.x) / 2 - ponteiro.x, (a.y + c.y) / 2 - ponteiro.y);
            if (pd < 170) opacidade = Math.min(0.8, opacidade + (1 - pd / 170) * 0.45);
          }

          ctx.strokeStyle = cor(opacidade);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(c.x, c.y);
          ctx.stroke();

          /*
            O PULSO NASCE RARO, e com teto de nove ao mesmo tempo. Frequente,
            vira pisca-pisca; sem teto, uma janela grande com muitos raios
            acenderia dezenas juntos e a coluna viraria festa.
          */
          if (!reduzir && pulsos.length < 9 && Math.random() < 0.0011) {
            pulsos.push({ i, j, t: 0, velocidade: 0.012 + Math.random() * 0.01 });
          }
        }
      }

      ctx.fillStyle = cor(0.75);
      for (const p of pontos) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.4, 0, Math.PI * 2);
        ctx.fill();
      }

      for (let k = pulsos.length - 1; k >= 0; k--) {
        const pulso = pulsos[k]!;
        pulso.t += pulso.velocidade;

        const a = pontos[pulso.i];
        const c = pontos[pulso.j];

        /*
          Chegou ao fim do raio — ou o ponto sumiu num redimensionamento no
          meio do caminho, que dá no mesmo: o pulso morre e some da lista.
        */
        if (pulso.t >= 1 || !a || !c) {
          pulsos.splice(k, 1);
          continue;
        }

        const x = a.x + (c.x - a.x) * pulso.t;
        const y = a.y + (c.y - a.y) * pulso.t;

        const brilho = ctx.createRadialGradient(x, y, 0, x, y, 7);
        brilho.addColorStop(0, cor(0.9));
        brilho.addColorStop(1, cor(0));

        ctx.fillStyle = brilho;
        ctx.beginPath();
        ctx.arc(x, y, 7, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    let quadro = 0;
    const laco = () => {
      desenhar();
      quadro = requestAnimationFrame(laco);
    };

    redimensionar();
    window.addEventListener("resize", redimensionar);

    const aoMover = (e: PointerEvent) => {
      /*
        `clientX/Y` é coordenada da JANELA, e a rede está presa a uma coluna:
        sem descontar o retângulo dela, os raios acendem deslocados do cursor.
      */
      const caixa = canvas.getBoundingClientRect();
      ponteiro.x = e.clientX - caixa.left;
      ponteiro.y = e.clientY - caixa.top;
      ponteiro.ativo = true;
    };
    const aoSair = () => {
      ponteiro.ativo = false;
    };

    if (temMouse) {
      window.addEventListener("pointermove", aoMover);
      window.addEventListener("pointerleave", aoSair);
    }

    const aoEsconder = () => {
      if (document.hidden) cancelAnimationFrame(quadro);
      else quadro = requestAnimationFrame(laco);
    };

    if (reduzir) {
      desenhar();
    } else {
      document.addEventListener("visibilitychange", aoEsconder);
      laco();
    }

    return () => {
      cancelAnimationFrame(quadro);
      window.removeEventListener("resize", redimensionar);
      window.removeEventListener("pointermove", aoMover);
      window.removeEventListener("pointerleave", aoSair);
      document.removeEventListener("visibilitychange", aoEsconder);
    };
  }, [densidade, seguirPonteiro]);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      /*
        SEM `z-` NA BASE, de propósito: quem chama decide a camada, e uma
        classe de z aqui empataria com a de lá — duas regras de mesma força,
        e quem vence passa a ser a ordem em que o Tailwind as escreveu no
        arquivo, não a intenção de ninguém. Foi assim que o `-z-10` da barra
        perdeu para um `z-0` que nem devia estar aqui.
      */
      className={`pointer-events-none h-full w-full text-ambar ${className}`}
    />
  );
}
