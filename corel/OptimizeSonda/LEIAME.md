# Sonda do Optimize

Um docker de teste para o CorelDRAW. Ele não faz nada de útil: existe para
responder o que roda dentro de um docker do Corel, e **já respondeu**. Fica no
repositório porque a resposta decide como a macro de encaixe é construída, e
porque o esqueleto dele é o do docker de verdade.

## A resposta

O Corel tem **dois** controles de navegador para addon, e a escolha entre eles
é um par de trocas — nenhum serve sozinho:

| | `type="browser"` | `type="browserEdge"` |
| --- | --- | --- |
| Motor | Internet Explorer 11 (`Trident/7.0`, `documentMode: 11`) | Chromium 152 (`Edg/152`, `chrome.webview` presente) |
| ES6 / módulos | não | sim |
| **WebAssembly** | **não** | **sim** |
| Web Worker | sim | sim |
| **Acesso ao desenho** | **`window.external.Application` completo** | **nenhum** |

No IE, medido: `Application.Version` = 26.2.0.170, `ActiveDocument.Name`,
`SelectionRange.Count`. Tudo o que uma macro precisa.

No WebView2, medido: `window.external` é o esqueleto padrão do Chromium
(`AddSearchProvider`, `IsSearchProviderInstalled`) e **`hostObjects` está
vazio** — só `prototype`, o mesmo em `hostObjects.sync`. A Corel não registrou
objeto nenhum com `AddHostObjectToScript`. O canal `chrome.webview.postMessage`
existe, mas sem objeto registrado e sem protocolo documentado, sondá-lo é
adivinhação.

**A conclusão:** o docker moderno é uma tela sem mãos. Para uma macro de
encaixe vale o outro — o trabalho pesado vai para o servidor de qualquer jeito
(ver `POST /api/encaixe/resolver`), e o que o docker precisa saber fazer é ler
curvas e devolver posições, o que o IE faz sem esforço.

## O que mais ficou provado

**CORS não é problema, desde que a página venha do servidor.** Em `file://`
falando com `http://localhost:8000`, o Chromium bloqueia (status 0) e o IE não.
Servida pelo próprio Optimize (`estatico/sonda.html`, em
`http://localhost:8000/sonda.html`), a página fica na mesma origem da API e não
há o que liberar — **nenhuma regra de CORS precisou ser afrouxada no
servidor**. É por isso que o `href` aponta para lá e não para o disco.

**O `UserUI.xslt` só é aplicado uma vez por workspace.** O framework migra o
menu de dockers para a configuração do usuário e, dali em diante, é ela que
manda: acrescentar um item neste arquivo não o faz aparecer num workspace já
migrado. Conferido abrindo `_default.cdws` (que é um ZIP) e lendo
`content/workspace.xml`. Consequência prática: para testar outro `type`,
troque-o no `AppUI.xslt` — que é relido a cada abertura — em vez de registrar
um docker novo.

**O `href` do controle novo é mais exigente.** Com
`[VGAppAddonsDir]/...?tipo=x`, que funciona no IE, o `browserEdge` abriu em
`ERR_FILE_NOT_FOUND` — mensagem do Chromium, e por isso já foi a primeira
prova de que o controle moderno havia subido.

## Instalando

Precisa de **PowerShell como administrador** (a pasta fica em
`C:\Program Files\`) e do **CorelDRAW fechado**. O Optimize precisa estar
rodando, porque é ele que serve a página.

```powershell
cd "...\corel\OptimizeSonda"
.\instalar-sonda.ps1
```

Depois: **Janela > Dockers > "Optimize (sonda)"**. Para tirar,
`.\instalar-sonda.ps1 -Remover`.

O script instala em toda versão do Corel que achar — e pula o que for resto de
desinstalação, conferindo se existe `CorelDRW.exe`. Sem isso ele anunciaria
"instalado na versão 25" e a pessoa procuraria um docker que nunca vai
aparecer, porque não há Corel ali para abrir.

## Os arquivos

| Arquivo | O que é |
| --- | --- |
| `Coreldrw.addon` | Marcador vazio. É por ele que o Corel reconhece a pasta como addon. |
| `AppUI.xslt` | Declara o botão, o controle de navegador e o docker. É onde se troca o `type`. |
| `UserUI.xslt` | Põe o item no menu Janela > Dockers. Aplicado uma vez só — ver acima. |
| `sonda.html` | A página do diagnóstico. Cópia da que o servidor entrega. |
| `instalar-sonda.ps1` | Copia a pasta para dentro do Corel (e desfaz). |

A página é escrita em **ES5** de propósito, e precisa continuar assim: uma
página que testa se o motor é velho, escrita em JavaScript novo, morre com erro
de sintaxe antes da primeira linha se o motor for velho — e o docker abre em
branco, que não responde nada. O teste de ES6 é feito com `eval` dentro de
`try`, a única forma de perguntar "você entende esta sintaxe?" sem a pergunta
derrubar quem não entende. O `X-UA-Compatible: IE=edge` no topo existe pela
mesma razão: sem ele o IE embutido abre em modo IE7 mesmo tendo IE11, e o
diagnóstico sairia pessimista.

## De onde veio o esqueleto

Do **exemplo oficial de addon da Corel**, publicado em
`community.coreldraw.com/sdk/w/articles/173`, sob licença que permite trabalho
derivado — o cabeçalho de licença vem junto no arquivo original.

O eCut usa esse mesmo exemplo, e foi vendo a instalação dele nesta máquina que
o caminho apareceu. **Nada do eCut foi copiado**: o `eCut.gms`, que é onde mora
o nesting deles, não foi aberto. O que se aproveitou foi a estrutura publicada
pela própria Corel, que é documentação pública. Os GUIDs daqui são novos.

## Quando isto pode sair

Quando o docker de verdade existir. A sonda já entregou o que tinha; o que
sobrevive dela é este arquivo e o esqueleto do addon, que vira o docker do
Encaixe trocando o `href` para a tela do produto.
