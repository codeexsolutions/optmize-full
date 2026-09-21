# Identidade no Full — conta, máquina e token de dispositivo

Data: 2026-09-21 · Estado: aprovado · Pedaço **A** de quatro

## Por que

O Optmize Full abre sozinho. Não há conta, não há empresa, não há nada que
distinga a máquina da gráfica que pagou da cópia que alguém levou para casa.
`src/casca/usuario.ts` já diz isso em voz alta: existe um `USUARIO_DE_TESTE`
fixo segurando o lugar de uma conta que não existe, e um comentário apontando
onde a autenticação entra quando existir. Este documento é essa entrada.

O destino, descrito em `Arquitetura_Sistema_Local_Painel_Web.docx`, é maior:
conta, permissão por tela, painel do dono, painel administrativo e publicação
de versões pelo painel. É grande demais para uma spec só, e foi decomposto em
quatro pedaços:

| | O quê | Depende de |
|---|---|---|
| **A** | Identidade no Full: login, Device ID, vínculo, token de 48 h, bloqueio | — |
| B | Permissão por tela valendo no menu **e na API local** | A |
| C | Painel do dono: funcionários, máquinas, licença, downloads | A, B |
| D | Admin e versões: limite de contas, desvincular, publicar pelo painel | — |

**Esta spec é só o A.**

## O que já existia, e que o documento não sabia

O `optmize-backend` (Fastify + Postgres/Supabase, no Railway) já tem quase
tudo o que o documento pede: `/auth/*`, `/licenses/activate`, `/licenses/check`,
`/team/members` com `scopes`, `/admin/customers`, `/admin/licenses`,
`/admin/plans`, `/app/update/tauri/...` e `/download`. O `optmize-painel` já é
o painel administrativo da seção 5. O `optmize-lite` é o PWA.

**O buraco é o Full.** Ele não fala com nada disso. O `servidor/licenca.js`
que o backend cita como o par da sua chave pública Ed25519 nunca foi escrito.

## Decisões tomadas

**Login substitui a chave.** O modelo de hoje no backend é uma chave
`OPTM-9F2A-4C81-7QK4` ditada por telefone, presa a uma máquina, revalidada a
cada 24 h com 2 dias de tolerância offline. Ela fica de pé e sem uso; o vínculo
passa a ser conta + máquina. Arrancá-la é um passo posterior, depois de o novo
estar rodando em cliente.

**48 horas duras.** Passou de 48 h sem renovar, tranca. Registrado o custo, que
é real: link caído na sexta é gráfica parada na segunda. A peça que resolveria
isso existe no backend (`LICENSE_POLICY`, com `graceDays`) e custaria um campo
a mais na resposta. Decisão de negócio, tomada com o custo à vista.

**O aviso de versão vem de carona no token.** A resposta da renovação traz o
número da versão publicada; o Full compara com a instalada. O **download**
continua no endpoint separado que já existe — o aviso vem junto, a falha do
serviço de atualização não contamina a validação da licença (seção 6.3 do
documento).

**O Full segura um token de DISPOSITIVO, não uma sessão de usuário.** É o
coração desta spec. `auth.service.ts`, em `issueSession`, derruba **todas** as
sessões anteriores da conta a cada login — e a regra é global, não do plano do
Lite:

```js
const anteriores = await this.repos.sessions.listActiveOfUser(userId);
await this.repos.sessions.revokeAllOfUser(userId);
```

Com o Full segurando sessão, o dono derrubaria a produção ao abrir o painel
web, perderia a aba do painel ao entrar no Full, e não usaria duas máquinas.
Nenhum dos três é aceitável num programa que fica aberto o dia inteiro. A saída
não é contornar a regra: é o Full nunca criar sessão. O token dele vive em
outra tabela e a regra "uma tela ativa por conta" segue intocada, sem falar do
Full — como já não fala da chave `OPTM-…`.

**Sem código de transição.** As instalações que existem lá fora são de teste, e
a publicação passa a ser deliberada (pedaço D): o código entra na `main` sem
chegar a ninguém, e a versão com login sai no dia em que as contas existirem.

**Trocar a senha não desliga dispositivo.** O token é do dispositivo e morre em
48 h de qualquer jeito. Desvincular é o botão explícito no painel.

## Onde cada peça mora

O Tauri **não** entra em A — ele continua cuidando só de atualização. E não
poderia: a interface é servida pelo Node em `127.0.0.1:<porta>`, uma origem
remota aos olhos do Tauri, que não fala com o IPC dele (ver o cabeçalho de
`tauri-plugin-dialog` em `src-tauri/Cargo.toml`). O React não alcança o Rust.

Quem está no caminho de tudo é o **servidor Node local** — ele serve a
interface e atende `/api/*`. Token no React seria token em `localStorage` de
uma página que a rede inteira da gráfica alcança.

**`servidor/licenca.js`** (novo) — o único que fala com o backend sobre
licença. Guarda o token, sabe quando vence, renova em segundo plano, responde
"esta instalação está liberada?". O nome é o que o backend já usa ao se referir
a ele.

**`servidor/sessao.js`** (novo) — expõe ao React só o perfil: quem entrou, de
qual empresa, quais telas. Três rotas: entrar, sair, quem sou eu. O React nunca
vê o token de licença.

```
React                  servidor/sessao.js         servidor/licenca.js        backend
  |  e-mail e senha ------->  |                          |                      |
  |                           |  entrar ---------------> |  credencial ------>  |
  |                           |                          |  <---- código        |
  |                           |                          |  código + DeviceID-> |
  |                           |                          |  <---- token 48h     |
  |                           |                          |    (grava em disco)  |
  |  <------ perfil ----------|  <------ perfil ---------|                      |
  |                           |                          |                      |
  |                           |    (24 h antes de vencer, a cada 3 h) -------> |
  |                           |                          |  <---- token novo    |
  |                           |                          |        + versão      |
```

### O Device ID

Nasce no Full, na primeira execução: um número aleatório guardado ao lado do
banco, na pasta do app. **Não** é impressão digital de hardware, de propósito —
o backend já pede um identificador opaco (`license.routes.ts`: "Guardar
impressão digital de hardware seria dado pessoal de máquina alheia sem nenhuma
necessidade"), e derivar de placa-mãe ou disco faz troca de HD desvincular a
máquina sozinha, virando chamado de suporte. Aleatório e estável resolve o
mesmo problema; desvincular vira botão no painel, que é onde o documento já o
coloca.

### Onde o token fica

Arquivo na pasta de dados do app, legível só pela conta do Windows que instalou
(o instalador é `currentUser`).

**Não é cofre, e a spec não finge que é.** Quem tem a senha da máquina lê o
arquivo. O que segura o risco são as 48 h — um token roubado morre depois de
amanhã, e desvincular mata antes. Guardar de verdade exigiria DPAPI, que o Node
não tem, e passaria o token para o Rust, que não está no caminho de nada.

## Os estados

Quatro, e só quatro.

```
        primeira execução
                │
                ▼
         ┌─────────────┐   entrou e vinculou    ┌─────────────┐
         │  SEM CONTA  │ ─────────────────────► │  LIBERADO   │
         └─────────────┘                        └─────────────┘
                ▲                                  │        ▲
                │ saiu, ou máquina desvinculada    │        │ renovou
                │                       vence em   ▼        │
                │                         < 24 h  ┌──────────────┐
                │                                 │  RENOVANDO   │
                │                                 └──────────────┘
                │          vencido sem renovar     │  (tarja nas últimas 12 h)
                │                                  ▼
                │                        ┌────────────────────┐
                └──────────────────────  │     BLOQUEADO      │
                     entrou de novo      └────────────────────┘
```

**SEM CONTA** — a tela de login, e nada mais. O React não monta o menu **e o
servidor local não atende `/api/*`**. Não é decoração: `server.js` faz
`listen(PORT, "0.0.0.0")`, então a API responde para a rede inteira da gráfica.
Deixá-la aberta enquanto a tela pede senha seria tranca com a janela ao lado.

**LIBERADO** — o programa de sempre. Nenhuma tela nova, nenhum aviso.
Indistinguível do Optmize de hoje: é nesse estado que a pessoa vive.

**RENOVANDO** — não é tela, é trabalho de fundo. Começa **24 h antes** do
vencimento — metade da vida do token — e tenta **a cada 3 h**. São oito
tentativas antes de virar problema, e cobrem a noite de uma gráfica que desliga
a máquina às 18 h. Dando certo na primeira, ninguém sabe que existiu.

**BLOQUEADO** — venceu e não renovou. A tela diz o motivo em português e
oferece entrar de novo.

**A tarja, nas últimas 12 h.** Entre RENOVANDO e BLOQUEADO não pode haver
surpresa: faltando menos de 12 h para vencer e com a última tentativa falhada,
aparece "sem contato com o servidor desde ontem — o acesso trava em X horas".

Os dois números precisam ser diferentes, e é por isso que são: com a renovação
começando 12 h antes, 12 h de falha cairiam no instante exato do bloqueio e a
tarja apareceria junto com a tranca — aviso nenhum. Começando 24 h antes, a
tarja tem **12 h inteiras de antecedência**, que é um expediente de sobra para
alguém olhar o roteador ou ligar para o suporte.

Bloquear sem avisar transforma problema de rede em acusação de golpe, e quem
apanha é quem estava trabalhando. É esta tarja que torna as 48 h duras
vivíveis.

### O que o servidor responde, e o que o Full faz

| O servidor diz | O Full faz |
|---|---|
| token novo | grava, segue, ninguém vê nada |
| não alcancei o servidor | tenta de novo em 3 h; tarja nas últimas 12 h |
| `conta_bloqueada` | bloqueia **na hora**, sem esperar as 48 h, e diz que é a conta |
| `maquina_desvinculada` | volta para SEM CONTA — é o caminho da troca de computador |
| `licenca_vencida` | bloqueia, e o texto fala de pagamento, não de erro |

A diferença entre as três últimas e "sem rede" é o que mais evita chamado de
suporte. "Não foi possível validar" obriga a pessoa a ligar; "sua assinatura
venceu em 12/03" resolve sozinho.

### O relógio

Nada depende só do relógio do Windows, que a pessoa pode atrasar. Vale a
validade assinada que veio do servidor, e o Full guarda junto o horário da
última conversa: relógio para trás, usa o maior dos dois. Sem isso, "48 h
duras" vira "48 h até alguém mexer na data".

### A senha

Não fica guardada; o que fica é o token. "Sair" perde o token e volta para SEM
CONTA — e por isso o botão avisa que vai precisar da senha de novo, senão vira
clique acidental no fim do expediente.

## O contrato com o backend

Duas rotas novas, ao lado das que já existem.

**`POST /device/authorize`** — confere e-mail e senha, devolve um código curto
de uso único, **válido por 5 minutos** (é o `expiraEm: 300` da resposta; o
número está num lugar só, no servidor, e o Full obedece ao que vier).
**Não chama `issueSession`**, não toca
em `sessions`, não derruba ninguém. Reaproveita `verifyPassword` e o limite de
10 tentativas por 5 minutos que o `/auth/login` já tem.

```
→ { email, senha }
← { codigo, expiraEm: 300 }
```

**`POST /device/token`** — troca o código pelo token de 48 h e grava o vínculo.

```
→ { codigo, deviceId, deviceName }
← { token, expira, empresa, usuario: { nome, papel }, telas: [...], versao }
```

Carrega tudo: licença, quem é a pessoa, as telas (o pedaço B usa; em A a lista
chega e fica guardada) e a versão publicada.

**A renovação é a mesma rota, com o token atual no lugar do código** — mesma
forma de resposta, para o Full ter um caminho só de tratamento.

**Por que duas rotas e não uma.** É o que paga a abordagem escolhida: hoje quem
emite o código é `/device/authorize`; amanhã é a janela web de autorização da
seção 4.1 do documento, e `/device/token`, o vínculo e a renovação não mudam
nada. A janela web inteira agora seria construir a página de autorização antes
da página em que ela deveria morar.

**No banco**, uma tabela de dispositivos: `device_id`, empresa, usuário que
ativou, nome da máquina, versão instalada, última conversa, hash do token,
revogação. Deliberadamente parecida com o que `/admin/licenses` já mostra — o
painel lista máquinas hoje e vai continuar listando, lendo daqui.
`/admin/licenses/:id/unbind` ganha o irmão que desvincula um dispositivo.

**Intocados:** `/auth/*`, `/licenses/*`, a emissão do token Ed25519 offline
(`domain/offline-token.ts`) e a regra de uma tela ativa por conta.

## Como isso se prova

Duas casas, dois jeitos. No backend, `node --test test/*.test.ts`. No Full,
`bancada/conferir-licenca.cjs`, novo, entrando no `bancada:revisao` — que é o
que o lançamento já roda antes de compilar.

Testa-se a **regra**, não o encanamento:

- **O código de autorização vale uma vez.** A segunda tentativa falha. É a
  propriedade que impede um código copiado de virar uma segunda máquina.
- **`/device/authorize` não derruba sessão nenhuma.** Sessão web aberta, login
  do Full, sessão web viva. Sem este teste, um refactor reintroduz o bug que
  esta spec existe para evitar.
- **A contagem das 48 h resiste ao relógio.** Relógio para trás não estica a
  validade.
- **Cada recusa leva ao estado certo.** A tabela acima, direto contra a máquina
  de estados.

Não se testa a tela: formulário, tarja e bloqueio se conferem abrindo o
programa, e um teste de DOM custaria mais para manter do que pega.

## Fora de A

- **Permissão por tela valendo.** A resposta já traz `telas`; quem obedece é B.
- **A trava na API local**, e a porta em `0.0.0.0`. É B.
- **O painel do dono**, funcionários, máquinas. É C.
- **A Central de Versões e publicar pelo painel.** É D. Em A só se usa o campo
  `versao` que vem de carona.
- **Tirar a chave `OPTM-…`.** Fica de pé, sem uso.

Uma consequência a dizer em voz alta: **enquanto B não existir, o login não
protege nada além da tela de entrada.** Quem estiver na rede da gráfica alcança
`/api/*` direto. A ordem A → B é o que fecha isso, e B não deve demorar atrás
de A.
