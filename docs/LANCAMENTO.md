# Lançamento — como uma versão nova chega às lojas

Desde 2026-09-21, **o que entra na `main` vira versão nova sozinho**. Ninguém
precisa compilar, reinstalar nem deixar máquina ligada.

```
push na main  →  GitHub: compila e assina → hospeda no GitHub → publica → etiqueta v1.0.N
                 GitHub: confere (ao lado, sem atrasar o lançamento)
                                                              ↓
                     quem REABRE o programa se atualiza sozinho, 15 s depois
                     quem está com ele aberto continua na versão instalada
```

Quem faz isso é `.github/workflows/lancar.yml`, nas máquinas do GitHub
(repositório público: não custa nada). O lado das lojas já existia: o programa
pergunta ao backend logo depois de abrir e de cinco em cinco minutos.

**AS CONFERÊNCIAS CORREM AO LADO, e não no caminho.** Elas eram um passo do
lançamento e custavam 68 segundos a cada versão. Hoje moram em
`.github/workflows/conferir.yml`, disparadas pelo mesmo push: o instalador
começa a compilar no primeiro segundo e as provas contam o que acharam quando
terminam. **O preço é real: prova vermelha não para mais a publicação.** O que
continua parando é o que quebra a compilação, e a falta de assinatura, que o
`publicar` recusa.

Onde o tempo de um lançamento fica, medido na versão 1.1.160:

| Passo | Tempo |
|---|---|
| Compilar e assinar | 5 min 51 s |
| Dependências | 1 min 32 s |
| Resto (checkout, Node, Rust, cache, publicar, etiqueta) | ~1 min |

**A rodada da abertura instala sozinha; as seguintes não perguntam nada.** São dois
momentos com respostas diferentes para "posso reiniciar agora?": recém-aberto
não há encaixe na tela para perder; com o programa aberto há horas existe
trabalho na tela, e uma atualização que interrompe o serviço do cliente é pior
que uma que chega no dia seguinte (ver `cuidar_das_atualizacoes`, em
`src-tauri/src/main.rs`).

**Não existe mais caixa de "Atualizar agora".** Ela parava o expediente para
dar uma boa notícia. A regra agora cabe numa linha: a versão nova entra na
próxima vez que o Optmize abrir. Quem fecha no fim do dia abre atualizado sem
ver nada; quem nunca fecha continua na versão instalada até fechar — e é por
isso que a próxima peça é um aviso DISCRETO na barra, sem modal.

Os 15 s de espera antes da primeira checagem não são só para não disputar com
o arranque: **eles são a trava** que prova que a versão instalada abre. Sem
eles, uma versão que não sobe instalaria a seguinte por cima — e, se a seguinte
também estivesse quebrada, a loja se reinstalaria em laço sem ninguém para
dizer não.

## O que dispara, e o que não

Dispara: mudança em `src/`, `servidor/`, `estatico/`, `empacotar/`,
`src-tauri/`, `corel/`, `estilo/`, `index.html`, `vite.config.mts`,
`tsconfig.json`, `package.json`, `package-lock.json`, `.node-version`.

Não dispara: documentação, bancada, firmware do ESP — nada que vá para dentro
do instalador. Para relançar sem commit novo: aba **Actions → Lançar → Run
workflow**.

**A `main` é produção.** Tudo que entra nela chega a todas as lojas no mesmo
dia. Trabalho em andamento fica em branch, e entra por PR quando estiver pronto.

## O número da versão

`<maior>.<menor>.<quantos commits a main tem>` — ver
`empacotar/versao-do-lancamento.js`. Cresce sozinho a cada commit, dá o mesmo
número para o mesmo commit e não escreve nada de volta no repositório. O
`maior.menor` vem do `src-tauri/tauri.conf.json`; mudar para `1.1` é decisão de
gente, feita lá.

## A trava antes de publicar

Rodam `tipos`, `bancada:revisao`, `bancada:conferir` e `bancada:encolher`. Se
qualquer uma falhar — ou a compilação, ou a publicação —, nada é publicado e o
GitHub avisa por e-mail quem fez o push. O andamento e o motivo ficam na aba
**Actions**.

## Os Secrets (uma vez só)

Em **Settings → Secrets and variables → Actions → New repository secret**:

| Nome | O quê |
|---|---|
| `TAURI_SIGNING_PRIVATE_KEY` | o **conteúdo** do arquivo `optmize-updater.key` (na máquina de quem tem a chave: `Get-Content $HOME\.optmize\optmize-updater.key -Raw`) |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | a senha da chave, se ela tiver uma |
| `OPTMIZE_ADMIN_KEY` | a chave de administração do backend |

Sem eles, o lançamento para no primeiro minuto dizendo qual falta.

A chave de assinatura é a peça que não pode se perder: sem ela, nenhuma cópia
instalada aceita atualização nunca mais. O Secret **não serve de cópia de
segurança** — o GitHub não deixa ler de volta. Guarde o arquivo também fora
deste computador.

## A conta no programa (desde a 1.2)

O programa só funciona com uma conta, e quem diz se a máquina pode trabalhar é
um **atestado assinado pelo backend** (ver o cabeçalho de `servidor/sessao.js`).
Três variáveis no **Railway** sustentam isso:

| Nome | O quê |
|---|---|
| `OPTMIZE_CHAVE_DO_DISPOSITIVO` | o **conteúdo** de `optmize-dispositivo.key` (`Get-Content $HOME\.optmize\optmize-dispositivo.key -Raw`). Sem ela, **ninguém consegue entrar** no programa. |
| `GITHUB_TOKEN` | só com este repositório **privado**: um token de leitura dele, para o backend entregar o instalador da release. |
| `SITE_URL` | o endereço do site, se não for `https://optmize-desktop.vercel.app`. |

**A ordem importa.** A variável e o backend novo sobem ANTES de a 1.2 ir para
a `main`: uma 1.2 publicada contra um backend antigo não consegue entrar na
conta, e todo cliente que atualizar fica na tela de login.

A pública correspondente está escrita em `servidor/sessao.js`. Perder a
privada é ter de lançar uma versão com par novo; vazar a privada é qualquer um
poder emitir atestado — guarde-a como a do atualizador, fora do OneDrive e com
cópia fora deste computador.

As versões anteriores à 1.2 continuam recebendo atualização sem token (é ela
que traz o login). Quando não houver mais nenhuma lá fora,
`EXIGIR_TOKEN_NA_ATUALIZACAO=1` no Railway fecha essa porta.

## Voltar atrás

O atualizador só instala número maior que o instalado. Para desfazer uma versão
ruim, reverta o commit na `main`: o revert vira a versão seguinte, com o código
de antes.

## Lançar à mão (emergência)

Continua funcionando, na máquina que tem a chave — ver o cabeçalho de
`empacotar/publicar.js`:

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = "$HOME\.optmize\optmize-updater.key"
$env:OPTMIZE_ADMIN_KEY = "..."
npm run build:app
npm run publicar -- "o que mudou"
```

Cuidado: à mão, o número é o do `tauri.conf.json`, que o lançamento automático
não atualiza — ele fica para trás da contagem de commits, e uma versão lançada
à mão com ele seria ignorada pelas lojas. Para a emergência, rode antes
`node empacotar/versao-do-lancamento.js` (e não faça commit dos arquivos que ele
mexe).
