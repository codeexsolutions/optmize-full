# Lançamento — como uma versão nova chega às lojas

Desde 2026-09-21, **o que entra na `main` vira versão nova sozinho**. Ninguém
precisa compilar, reinstalar nem deixar máquina ligada.

```
push na main  →  GitHub: conferências → compila e assina → publica → etiqueta v1.0.N
                                                              ↓
                          cada Optimize instalado pergunta a cada 2 h → "Atualizar agora"
```

Quem faz isso é `.github/workflows/lancar.yml`, nas máquinas do GitHub
(repositório público: não custa nada). O lado das lojas já existia: o programa
pergunta ao backend 90 s depois de abrir e a cada 2 horas, e oferece a
atualização em vez de instalar sozinho — reiniciar no meio de um encaixe perderia
o trabalho da tela (ver `procurar_atualizacao`, em `src-tauri/src/main.rs`).

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
