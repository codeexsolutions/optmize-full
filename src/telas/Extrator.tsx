/**
 * ===========================================================================
 * O EXTRATOR — a foto vira cada logo, texto e estampa separados
 * ===========================================================================
 *
 * O operador manda a foto da camisa (ou o mockup), endireita se ela estiver de
 * lado, clica em cada elemento e guarda; cada elemento sai em vetor e PNG
 * grande (jeito Chapado) ou ampliado (jeito Foto). Tudo no computador: a rede
 * que acha o elemento e a que amplia rodam no servidor (`servidor/extrator-*.js`).
 *
 * O desenho é da spec `docs/superpowers/specs/2026-10-06-extrator-design.md`;
 * o estado mora em `extrator/useExtrator.ts`, a mesa em `extrator/MesaDoExtrator.tsx`.
 */
import { useMemo, useRef, useState } from "react";
import { Botao } from "../casca/Botao";
import { Cartao } from "../casca/Cartao";
import { Icone } from "../casca/Icone";
import { baixar, cacheDeVetores, zipDosElementos } from "./extrator/arquivos";
import { ListaDeElementos } from "./extrator/ListaDeElementos";
import { MesaDoExtrator } from "./extrator/MesaDoExtrator";
import { PainelDoElemento } from "./extrator/PainelDoElemento";
import type { Ponto } from "./extrator/tipos";
import { useExtrator } from "./extrator/useExtrator";

/** Os quatro cantos de começo: um retângulo a 10% da borda da foto. */
function cantosIniciais(largura: number, altura: number): Ponto[] {
  const mx = largura * 0.1, my = altura * 0.1;
  return [{ x: mx, y: my }, { x: largura - mx, y: my }, { x: largura - mx, y: altura - my }, { x: mx, y: altura - my }];
}

export function Extrator() {
  const x = useExtrator();
  const entrada = useRef<HTMLInputElement>(null);
  const [modo, setModo] = useState<"separar" | "cantos">("separar");
  const [cantos, setCantos] = useState<Ponto[]>([]);
  const [arquivoEmCima, setArquivoEmCima] = useState(false);
  const [zipando, setZipando] = useState("");
  // O vetor de cada elemento, guardado pelas opções enquanto a tela estiver aberta.
  const vetorDe = useMemo(() => cacheDeVetores(), []);

  const baixarZip = async () => {
    setZipando("Preparando o ZIP…");
    try {
      baixar(await zipDosElementos(x.elementos, vetorDe, setZipando), `${x.nomeDaFoto || "extrator"}.zip`);
    } catch (e) {
      x.setErro((e as Error).message);
    } finally {
      setZipando("");
    }
  };

  const comecarCantos = () => {
    if (!x.trabalho) return;
    setCantos(cantosIniciais(x.trabalho.largura, x.trabalho.altura));
    setModo("cantos");
  };
  const aplicarCantos = async () => {
    await x.endireitar(cantos);
    setModo("separar");
  };

  const semRede = x.estado && !x.estado.pronta ? x.estado.motivo : null;
  const elemento = x.elementos.find((e) => e.id === x.escolhido) ?? null;
  const temCliques = x.pontos.length > 0 || Boolean(x.caixa);
  const situacao = x.ocupado
    || (modo === "cantos" ? "Arraste os quatro cantos até os cantos da estampa e aperte Aplicar."
      : x.lendo ? "Lendo a foto…"
        : x.procurando ? "Procurando o elemento…"
          : x.mascara ? `Achei ${(x.mascara.cobertura * 100).toFixed(1).replace(".", ",")}% da foto. Mais cliques corrigem; Guardar leva para a lista.`
            : "");

  return (
    <div
      className="grid gap-3.5 xl:grid-cols-[minmax(0,1fr)_380px]"
      onDragOver={(e) => { e.preventDefault(); setArquivoEmCima(true); }}
      onDragLeave={() => setArquivoEmCima(false)}
      onDrop={(e) => {
        e.preventDefault();
        setArquivoEmCima(false);
        const f = e.dataTransfer?.files?.[0];
        if (f) void x.abrir(f);
      }}
    >
      <div className="min-w-0">
        <Cartao
          titulo="A foto"
          icone="icones.svg#wand-sparkles"
          apoio="Mande a foto da camisa ou do mockup e clique no que quer separar: esquerdo inclui, direito exclui, arrastar faz caixa."
          acao={(
            <Botao jeito="secundario" icone={<Icone referencia="icones.svg#image-plus" className="size-4" />} onClick={() => entrada.current?.click()}>
              Escolher foto
            </Botao>
          )}
        >
          <input
            ref={entrada}
            id="extrator-foto"
            type="file"
            accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void x.abrir(f);
              e.target.value = "";
            }}
          />

          {semRede && (
            <p id="extrator-sem-rede" className="mt-0 mb-3 flex items-start gap-2 text-[0.85rem] text-[var(--danger)]">
              <Icone referencia="icones.svg#triangle-alert" className="mt-0.5 size-4 shrink-0" />
              <span>{semRede} Sem ela, dá para endireitar a foto e guardar a imagem inteira.</span>
            </p>
          )}
          {x.erro && (
            <p id="extrator-erro" role="alert" className="mt-0 mb-3 flex items-start gap-2 text-[0.85rem] text-[var(--danger)]">
              <Icone referencia="icones.svg#triangle-alert" className="mt-0.5 size-4 shrink-0" />
              <span>{x.erro}</span>
            </p>
          )}

          {!x.trabalho ? (
            <div
              onClick={() => entrada.current?.click()}
              className={`cursor-pointer rounded-[10px] border border-dashed p-8 text-center transition-colors ${
                arquivoEmCima ? "border-ambar bg-[var(--accent-soft)]" : "border-linha"
              }`}
            >
              <Icone referencia="icones.svg#wand-sparkles" className="mx-auto size-8 text-tinta-apagada" />
              <p className="mt-2 mb-1 text-[0.9rem] font-semibold">
                {arquivoEmCima ? "Solte a foto aqui" : "Arraste a foto para cá, ou clique para escolher"}
              </p>
              <p className="m-0 text-[0.82rem] text-tinta-fraca">
                JPG, PNG ou WebP, até 40 megapixels. Foto de camisa pronta ou mockup; um PNG já recortado também entra.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <MesaDoExtrator
                trabalho={x.trabalho}
                mascara={x.mascara}
                pontos={x.pontos}
                caixa={x.caixa}
                modo={modo}
                cantos={cantos}
                aoMudarCantos={setCantos}
                aoClicar={x.clicar}
                aoPassarCaixa={x.passarCaixa}
                desligada={Boolean(x.ocupado) || (modo === "separar" && !x.estado?.pronta)}
              />
              <p id="extrator-situacao" className="m-0 min-h-5 text-[0.85rem] text-tinta-fraca">{situacao}</p>
              <div className="flex flex-wrap items-center gap-2">
                {modo === "separar" ? (
                  <>
                    <Botao id="extrator-guardar" jeito="primario" disabled={!x.mascara || Boolean(x.ocupado)} onClick={() => void x.guardar()}
                      icone={<Icone referencia="icones.svg#plus" className="size-4" />}>
                      Guardar elemento
                    </Botao>
                    <Botao jeito="secundario" disabled={!temCliques} onClick={x.desfazerClique}
                      icone={<Icone referencia="icones.svg#undo-2" className="size-4" />}>
                      Desfazer clique
                    </Botao>
                    <Botao id="extrator-limpar" jeito="fantasma" disabled={!temCliques} onClick={x.limparCliques}>Limpar</Botao>
                    <span className="flex-1" />
                    <Botao id="extrator-endireitar" jeito="secundario" disabled={Boolean(x.ocupado)} onClick={comecarCantos}
                      icone={<Icone referencia="icones.svg#scan" className="size-4" />}>
                      Endireitar
                    </Botao>
                    <Botao id="extrator-inteira" jeito="secundario" disabled={Boolean(x.ocupado)} onClick={() => void x.guardarInteira()}>
                      Guardar a imagem inteira
                    </Botao>
                  </>
                ) : (
                  <>
                    <Botao id="extrator-aplicar-cantos" jeito="primario" onClick={() => void aplicarCantos()}>Aplicar</Botao>
                    <Botao jeito="secundario" onClick={() => setModo("separar")}>Cancelar</Botao>
                  </>
                )}
              </div>
            </div>
          )}
        </Cartao>
      </div>

      <div className="min-w-0">
        <Cartao
          titulo="Elementos"
          icone="icones.svg#layers"
          apoio="O que você guardou desta foto. Escolha um para limpar e baixar."
          acao={x.elementos.length > 0 ? (
            <Botao id="extrator-zip" jeito="secundario" tamanho="pequeno" disabled={Boolean(zipando)} onClick={() => void baixarZip()}
              icone={<Icone referencia="icones.svg#file-archive" className="size-4" />}>
              Baixar todos (ZIP)
            </Botao>
          ) : undefined}
        >
          {zipando && <p id="extrator-zipando" className="mt-0 mb-2 text-[0.82rem] text-tinta-fraca">{zipando}</p>}
          <ListaDeElementos
            elementos={x.elementos}
            escolhido={x.escolhido}
            aoEscolher={x.setEscolhido}
            aoRenomear={(id, nome) => x.mudarElemento(id, { nome })}
            aoRemover={x.removerElemento}
          />
        </Cartao>
        {elemento && (
          <Cartao titulo={elemento.nome} icone="icones.svg#wand-sparkles" apoio="Limpe e baixe este elemento.">
            <PainelDoElemento
              key={elemento.id}
              elemento={elemento}
              aoMudar={(mudanca) => x.mudarElemento(elemento.id, mudanca)}
              aoErro={x.setErro}
              vetorDe={vetorDe}
            />
          </Cartao>
        )}
      </div>
    </div>
  );
}
