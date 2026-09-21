# Identidade no Full — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o Optmize Full exigir conta, vincular-se à máquina e manter-se liberado por um token de dispositivo de 48 h renovado sozinho.

**Architecture:** O Full nunca segura sessão de usuário — ele segura um **token de dispositivo**, emitido em duas etapas (senha → código de uso único → token). O token vive no **servidor Node local** (`servidor/licenca.js`), que é o único ponto por onde a interface e a API passam; o React só enxerga um perfil, nunca o token. No backend, a regra mora em `domain/devices.ts` (pura, testável sem banco e sem HTTP), como já acontece com `domain/licenses.ts`.

**Tech Stack:** `optmize-backend` — Node 24, TypeScript com `--experimental-strip-types`, Fastify, Zod, Postgres/Supabase, testes com `node --test`. `optmize-full` — Node 24, CommonJS, Express, React 19 + Vite, testes com scripts `bancada/conferir-*.cjs`.

**Spec:** `docs/superpowers/specs/2026-09-21-identidade-no-full-design.md` (no repositório `optmize-full`)

## Global Constraints

Valores exatos, copiados da spec. Valem para todas as tarefas.

- **Validade do token de dispositivo:** 48 horas. Duras — não há tolerância offline.
- **Início da renovação:** 24 horas antes de vencer. **Intervalo entre tentativas:** 3 horas.
- **Tarja de aviso:** nas últimas 12 horas antes do bloqueio, quando a última tentativa falhou.
- **Validade do código de autorização:** 300 segundos (5 minutos), de uso único.
- **Limite de tentativas de senha:** 10 por 5 minutos (o mesmo do `/auth/login`).
- **`/device/authorize` NUNCA chama `issueSession`** e nunca toca na tabela `sessions`. É a razão de esta spec existir.
- **Nenhuma dependência nova** em nenhum dos dois repositórios.
- **Nomes e comentários em português**, seguindo a casa. Comentário explica *por quê*, não *o quê*.
- **Códigos de recusa**, exatos: `conta_bloqueada`, `maquina_desvinculada`, `licenca_vencida`, `codigo_invalido`, `codigo_expirado`, `codigo_usado`.
- **Dois repositórios, dois `git`.** As tarefas 1–4 são commitadas em `optmize-backend`; as 5–9 em `optmize-full`. Nunca misture.

## Estrutura de arquivos

**`optmize-backend`**

| Arquivo | Responsabilidade |
|---|---|
| `src/domain/devices.ts` *(criar)* | A regra: prazos, decisão de liberar, mapa de recusas. Sem banco, sem HTTP. |
| `test/devices.test.ts` *(criar)* | Testa a regra acima, com objetos em memória. |
| `src/infra/db/postgres/schema.sql` *(modificar)* | Tabelas `devices` e `device_codes`. |
| `src/domain/ports/repositories.ts` *(modificar)* | `DeviceRepository`, `DeviceCodeRepository`. |
| `src/infra/db/supabase.repositories.ts` *(modificar)* | Implementação das duas interfaces. |
| `src/services/device.service.ts` *(criar)* | Orquestra: confere senha, emite código, troca por token, renova. |
| `src/dto/device.dto.ts` *(criar)* | Os schemas Zod da entrada e a forma da resposta. |
| `src/http/routes/device.routes.ts` *(criar)* | `POST /device/authorize`, `POST /device/token`. |
| `src/app.ts` *(modificar)* | Compõe o serviço e registra as rotas. |
| `src/http/routes/admin.routes.ts` *(modificar)* | `GET /admin/devices`, `POST /admin/devices/:id/unbind`. |

**`optmize-full`**

| Arquivo | Responsabilidade |
|---|---|
| `servidor/licenca.js` *(criar)* | Device ID, token em disco, relógio, máquina de estados, renovação. |
| `servidor/sessao.js` *(criar)* | As três rotas que o React usa: entrar, sair, quem sou eu. |
| `servidor/server.js` *(modificar)* | Monta `sessao.js` e põe o portão antes de `/api/*`. |
| `bancada/conferir-licenca.cjs` *(criar)* | Os testes da regra do lado do Full. |
| `package.json` *(modificar)* | `bancada:licenca`, e ele dentro de `bancada:revisao`. |
| `src/casca/usuario.ts` *(modificar)* | Troca o `USUARIO_DE_TESTE` por leitura de `/api/sessao/eu`. |
| `src/telas/Entrar.tsx` *(criar)* | A tela de login. |
| `src/casca/Bloqueado.tsx` *(criar)* | A tela de bloqueio e a tarja de aviso. |
| `src/casca/Casca.tsx` *(modificar)* | Escolhe entre login, bloqueio e o programa. |
| `docs/LANCAMENTO.md` *(modificar)* | Registra que o Full passou a exigir conta. |

---

### Task 1: A regra do dispositivo (backend, pura)

**Files:**
- Create: `optmize-backend/src/domain/devices.ts`
- Test: `optmize-backend/test/devices.test.ts`

**Interfaces:**
- Consumes: `AccessDecision` de `src/domain/entities.ts` (campos `allowed`, `reason`, `pendingRelease`).
- Produces: `DEVICE_POLICY`, `TOKEN_HOURS`, `RENEW_BEFORE_HOURS`, `WARN_BEFORE_HOURS`, `CODE_SECONDS`, `interface Device`, `interface DeviceDecision`, `evaluateDevice(device, acesso, agora)`, `tokenExpiraEm(agora)`, `codigoExpiraEm(agora)`.

- [ ] **Step 1: Escreva o teste que falha**

Crie `optmize-backend/test/devices.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { evaluateDevice, tokenExpiraEm, TOKEN_HOURS } from "../src/domain/devices.ts";
import type { Device } from "../src/domain/devices.ts";
import type { AccessDecision } from "../src/domain/entities.ts";

const AGORA = new Date("2026-09-21T12:00:00.000Z");

/** Horas somadas a AGORA. */
const em = (horas: number) => new Date(AGORA.getTime() + horas * 3_600_000);

function dispositivo(overrides: Partial<Device> = {}): Device {
  return {
    id: "d1",
    userId: "u1",
    organizationId: "o1",
    deviceId: "maquina-aleatoria-1",
    deviceName: "PC-BALCAO",
    appVersion: "1.0.30",
    tokenHash: "hash",
    expiresAt: em(24),
    lastSeenAt: AGORA,
    revokedAt: null,
    createdAt: AGORA,
    ...overrides,
  };
}

function acesso(overrides: Partial<AccessDecision> = {}): AccessDecision {
  return {
    allowed: true,
    trialing: false,
    trialDaysLeft: null,
    reason: null,
    pendingRelease: false,
    ...overrides,
  };
}

describe("regra do dispositivo", () => {
  it("libera dispositivo vivo com acesso em dia", () => {
    const decisao = evaluateDevice(dispositivo(), acesso(), AGORA);
    assert.equal(decisao.allowed, true);
    assert.equal(decisao.code, null);
  });

  it("recusa dispositivo desvinculado, e diz qual foi o motivo", () => {
    const decisao = evaluateDevice(
      dispositivo({ revokedAt: em(-1) }),
      acesso(),
      AGORA,
    );
    assert.equal(decisao.allowed, false);
    assert.equal(decisao.code, "maquina_desvinculada");
  });

  it("separa conta esperando liberação de assinatura vencida", () => {
    const esperando = evaluateDevice(
      dispositivo(),
      acesso({ allowed: false, pendingRelease: true }),
      AGORA,
    );
    assert.equal(esperando.code, "conta_bloqueada");

    const vencida = evaluateDevice(
      dispositivo(),
      acesso({ allowed: false, pendingRelease: false }),
      AGORA,
    );
    assert.equal(vencida.code, "licenca_vencida");
  });

  it("desvinculada vence conta bloqueada: a máquina some antes do dinheiro", () => {
    const decisao = evaluateDevice(
      dispositivo({ revokedAt: em(-1) }),
      acesso({ allowed: false, pendingRelease: true }),
      AGORA,
    );
    assert.equal(decisao.code, "maquina_desvinculada");
  });

  it("o token novo vale exatamente 48 horas", () => {
    const expira = tokenExpiraEm(AGORA);
    assert.equal(TOKEN_HOURS, 48);
    assert.equal(expira.getTime() - AGORA.getTime(), 48 * 3_600_000);
  });
});
```

- [ ] **Step 2: Rode o teste e confirme que ele falha**

```bash
cd optmize-backend && node --experimental-strip-types --test test/devices.test.ts
```

Esperado: FALHA, com `Cannot find module '../src/domain/devices.ts'`.

- [ ] **Step 3: Escreva a implementação mínima**

Crie `optmize-backend/src/domain/devices.ts`:

```ts
/**
 * ===========================================================================
 * O DISPOSITIVO DO OPTMIZE FULL
 * ===========================================================================
 *
 * O Full é instalado na máquina da gráfica e fica aberto o dia inteiro. O que
 * o libera NÃO é uma sessão de usuário: é um token preso a esta máquina.
 *
 * A diferença não é de gosto. `auth.service.ts`, em `issueSession`, derruba
 * todas as sessões anteriores da conta a cada login — uma tela ativa por
 * conta. Com o Full segurando sessão, o dono derrubaria a produção ao abrir o
 * painel web, e não usaria duas máquinas. O token de dispositivo vive em outra
 * tabela, e aquela regra segue valendo para a web sem falar do Full.
 *
 * Aqui mora só a REGRA: prazos e decisão. Sem banco e sem HTTP, como em
 * `licenses.ts` — é o que deixa isto testável com objetos em memória.
 */

import type { AccessDecision } from "./entities.ts";

/** Quanto vale um token recém-emitido. */
export const TOKEN_HOURS = 48;

/**
 * Quando a renovação começa a tentar, antes de vencer.
 *
 * METADE da vida do token, e não a última hora: são oito tentativas de 3 em 3
 * horas antes de virar problema, e cobrem a noite de uma gráfica que desliga a
 * máquina às 18 h.
 */
export const RENEW_BEFORE_HOURS = 24;

/**
 * Quando a tarja de aviso aparece, se a última tentativa falhou.
 *
 * Tem que ser MENOR que `RENEW_BEFORE_HOURS`, e é por isso que são 12 contra
 * 24: fossem iguais, a tarja apareceria no mesmo instante do bloqueio, que é
 * aviso nenhum. Assim ela tem 12 horas de antecedência — um expediente inteiro
 * para alguém olhar o roteador.
 */
export const WARN_BEFORE_HOURS = 12;

/** Quanto vale o código de autorização, em segundos. */
export const CODE_SECONDS = 300;

/**
 * A política que vai na resposta, junto do token.
 *
 * Os prazos moram no SERVIDOR e viajam para o programa, como em
 * `LICENSE_POLICY`. Mudar a regra é subir o servidor; nenhuma instalação
 * precisa ser atualizada.
 */
export const DEVICE_POLICY = {
  tokenHours: TOKEN_HOURS,
  renewBeforeHours: RENEW_BEFORE_HOURS,
  warnBeforeHours: WARN_BEFORE_HOURS,
} as const;

export interface Device {
  id: string;
  userId: string;
  organizationId: string;
  /** Opaco para o servidor: aleatório, gerado pelo Full na primeira execução. */
  deviceId: string;
  deviceName: string;
  /** A versão instalada, atualizada a cada renovação. O painel mostra. */
  appVersion: string;
  tokenHash: string;
  expiresAt: Date;
  lastSeenAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

export interface DeviceDecision {
  allowed: boolean;
  code: string | null;
  reason: string | null;
}

const recusa = (code: string, reason: string): DeviceDecision => ({
  allowed: false,
  code,
  reason,
});

/**
 * Este dispositivo pode continuar aberto?
 *
 * A ORDEM DAS PERGUNTAS É A REGRA. A desvinculação vem antes do dinheiro
 * porque as duas levam o programa a lugares opostos: máquina desvinculada
 * devolve a pessoa ao login (é o caminho da troca de computador), e assinatura
 * vencida mostra a tela de pagamento. Perguntar na ordem contrária mandaria
 * pagar quem só trocou de máquina.
 */
export function evaluateDevice(
  dispositivo: Device,
  acesso: AccessDecision,
  _agora: Date,
): DeviceDecision {
  if (dispositivo.revokedAt !== null) {
    return recusa(
      "maquina_desvinculada",
      "Esta máquina foi desvinculada. Entre de novo para vinculá-la.",
    );
  }

  if (!acesso.allowed) {
    return acesso.pendingRelease
      ? recusa(
          "conta_bloqueada",
          acesso.reason ?? "Esta conta ainda não foi liberada.",
        )
      : recusa(
          "licenca_vencida",
          acesso.reason ?? "A assinatura desta conta não está em dia.",
        );
  }

  return { allowed: true, code: null, reason: null };
}

/**
 * Quando um token emitido agora vence.
 *
 * O vencimento é CALCULADO NO SERVIDOR e viaja pronto. O Full não soma 48
 * horas ao relógio dele — se somasse, atrasar a data do Windows esticaria a
 * licença.
 */
export function tokenExpiraEm(agora: Date): Date {
  return new Date(agora.getTime() + TOKEN_HOURS * 3_600_000);
}

/** Quando um código de autorização emitido agora vence. */
export function codigoExpiraEm(agora: Date): Date {
  return new Date(agora.getTime() + CODE_SECONDS * 1000);
}
```

- [ ] **Step 4: Rode o teste e confirme que ele passa**

```bash
cd optmize-backend && node --experimental-strip-types --test test/devices.test.ts
```

Esperado: PASSA, 5 testes.

- [ ] **Step 5: Confira os tipos**

```bash
cd optmize-backend && npm run typecheck
```

Esperado: sem erro.

- [ ] **Step 6: Commit**

```bash
cd optmize-backend
git add src/domain/devices.ts test/devices.test.ts
git commit -m "A regra do dispositivo do Full: 48 h, e a ordem das recusas"
```

---

### Task 2: As tabelas e os repositórios

**Files:**
- Modify: `optmize-backend/src/infra/db/postgres/schema.sql` (acrescentar ao fim)
- Modify: `optmize-backend/src/domain/ports/repositories.ts`
- Modify: `optmize-backend/src/infra/db/supabase.repositories.ts`

**Interfaces:**
- Consumes: `Device` da Task 1.
- Produces: `DeviceRepository` com `create`, `findByTokenHash`, `findByDeviceId`, `rotateToken`, `revoke`, `listOfOrganization`; `DeviceCodeRepository` com `create`, `consume`. Ambos entram em `Repositories` como `devices` e `deviceCodes`.

- [ ] **Step 1: Acrescente as tabelas ao schema**

No fim de `optmize-backend/src/infra/db/postgres/schema.sql`:

```sql
-- ── Dispositivos do Optmize Full ─────────────────────────────────────────────
--
-- O que libera o Full instalado. NÃO é uma sessão: `sessions` tem a regra de
-- uma tela ativa por conta, e aplicá-la aqui faria o dono derrubar a produção
-- ao abrir o painel web. Ver src/domain/devices.ts.
create table if not exists devices (
  id              text primary key,
  user_id         text not null references users (id) on delete cascade,
  organization_id text references organizations (id) on delete cascade,
  -- Gerado pelo programa, aleatório e opaco. NÃO é impressão digital de
  -- hardware: derivar de disco ou placa-mãe faria uma troca de HD desvincular
  -- a máquina sozinha, virando chamado de suporte.
  device_id       text not null,
  device_name     text not null default '',
  -- A versão instalada, reescrita a cada renovação. É o que o painel mostra.
  app_version     text not null default '',
  -- Só o hash: um vazamento do banco não entrega token nenhum.
  token_hash      text not null unique,
  expires_at      timestamptz not null,
  last_seen_at    timestamptz,
  revoked_at      timestamptz,
  created_at      timestamptz not null default now()
);

-- Uma máquina, um vínculo vivo: reinstalar reusa a linha em vez de empilhar.
create unique index if not exists devices_machine_idx
  on devices (user_id, device_id);
-- O caminho quente: toda renovação chega com o token e nada mais.
create index if not exists devices_token_idx on devices (token_hash);
create index if not exists devices_org_idx   on devices (organization_id, created_at desc);

-- O código de autorização: nasce do login, vive 5 minutos, vale UMA vez.
--
-- É a peça que permite a janela web da seção 4.1 do documento entrar depois
-- sem mexer em nada abaixo dela: hoje quem emite é /device/authorize, amanhã é
-- a página de autorização, e /device/token não muda.
create table if not exists device_codes (
  code_hash  text primary key,
  user_id    text not null references users (id) on delete cascade,
  expires_at timestamptz not null,
  -- Carimbado no consumo. A gravação é CONDICIONAL em `used_at is null`, e é
  -- isso que faz o código valer uma vez só mesmo com dois pedidos ao mesmo
  -- tempo — a segunda escrita não acha linha e a troca é recusada.
  used_at    timestamptz,
  created_at timestamptz not null default now()
);
```

- [ ] **Step 2: Declare as interfaces**

Em `optmize-backend/src/domain/ports/repositories.ts`, acrescente antes do `export interface Repositories`:

```ts
// ─── Dispositivos do Full ────────────────────────────────────────────────────

export interface CreateDeviceInput {
  id: string;
  userId: string;
  organizationId: string | null;
  deviceId: string;
  deviceName: string;
  appVersion: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface DeviceRepository {
  /** Cria o vínculo, ou reaproveita o da mesma máquina (reinstalação). */
  create(input: CreateDeviceInput): Promise<Device>;
  findByTokenHash(tokenHash: string): Promise<Device | null>;
  /** Troca o token por um novo e carimba `last_seen_at`. */
  rotateToken(
    id: string,
    tokenHash: string,
    expiresAt: Date,
    appVersion: string,
  ): Promise<void>;
  revoke(id: string): Promise<void>;
  listOfOrganization(organizationId: string): Promise<Device[]>;
}

export interface DeviceCodeRepository {
  create(input: {
    codeHash: string;
    userId: string;
    expiresAt: Date;
  }): Promise<void>;
  /**
   * Gasta o código e devolve de quem ele era — ou `null` se não existir, já
   * tiver sido usado ou estiver vencido.
   *
   * Gastar e ler são a MESMA operação de propósito: separadas, dois pedidos
   * simultâneos leriam o mesmo código válido antes de qualquer um marcá-lo.
   */
  consume(codeHash: string, agora: Date): Promise<{ userId: string } | null>;
}
```

E acrescente ao `import type { ... }` do topo do arquivo o tipo `Device`:

```ts
import type { Device } from "../devices.ts";
```

Depois, dentro de `export interface Repositories`, acrescente as duas linhas:

```ts
  devices: DeviceRepository;
  deviceCodes: DeviceCodeRepository;
```

- [ ] **Step 3: Implemente no repositório do Supabase**

Em `optmize-backend/src/infra/db/supabase.repositories.ts`, siga o formato das implementações vizinhas (as de `licenses` são o modelo mais próximo) e acrescente os dois objetos ao que a fábrica devolve:

```ts
  devices: {
    async create(input) {
      const { data, error } = await client
        .from("devices")
        .upsert(
          {
            id: input.id,
            user_id: input.userId,
            organization_id: input.organizationId,
            device_id: input.deviceId,
            device_name: input.deviceName,
            app_version: input.appVersion,
            token_hash: input.tokenHash,
            expires_at: input.expiresAt.toISOString(),
            last_seen_at: new Date().toISOString(),
            // Reinstalar na mesma máquina RESSUSCITA o vínculo. Sem isto, a
            // pessoa entraria de novo e continuaria recusada, porque a linha
            // revogada ainda estaria lá.
            revoked_at: null,
          },
          { onConflict: "user_id,device_id" },
        )
        .select()
        .single();
      if (error) throw error;
      return toDevice(data);
    },

    async findByTokenHash(tokenHash) {
      const { data, error } = await client
        .from("devices")
        .select()
        .eq("token_hash", tokenHash)
        .maybeSingle();
      if (error) throw error;
      return data ? toDevice(data) : null;
    },

    async rotateToken(id, tokenHash, expiresAt, appVersion) {
      const { error } = await client
        .from("devices")
        .update({
          token_hash: tokenHash,
          expires_at: expiresAt.toISOString(),
          last_seen_at: new Date().toISOString(),
          app_version: appVersion,
        })
        .eq("id", id);
      if (error) throw error;
    },

    async revoke(id) {
      const { error } = await client
        .from("devices")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },

    async listOfOrganization(organizationId) {
      const { data, error } = await client
        .from("devices")
        .select()
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map(toDevice);
    },
  },

  deviceCodes: {
    async create(input) {
      const { error } = await client.from("device_codes").insert({
        code_hash: input.codeHash,
        user_id: input.userId,
        expires_at: input.expiresAt.toISOString(),
      });
      if (error) throw error;
    },

    async consume(codeHash, agora) {
      // A condição `used_at is null` mora no UPDATE, e não numa leitura antes
      // dele: é ela que faz o código valer uma vez só sob concorrência.
      const { data, error } = await client
        .from("device_codes")
        .update({ used_at: agora.toISOString() })
        .eq("code_hash", codeHash)
        .is("used_at", null)
        .gt("expires_at", agora.toISOString())
        .select("user_id")
        .maybeSingle();
      if (error) throw error;
      return data ? { userId: data.user_id as string } : null;
    },
  },
```

E, junto das outras funções de conversão do arquivo, a que traduz a linha:

```ts
function toDevice(row: Record<string, unknown>): Device {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    organizationId: (row.organization_id as string) ?? "",
    deviceId: row.device_id as string,
    deviceName: (row.device_name as string) ?? "",
    appVersion: (row.app_version as string) ?? "",
    tokenHash: row.token_hash as string,
    expiresAt: new Date(row.expires_at as string),
    lastSeenAt: row.last_seen_at ? new Date(row.last_seen_at as string) : null,
    revokedAt: row.revoked_at ? new Date(row.revoked_at as string) : null,
    createdAt: new Date(row.created_at as string),
  };
}
```

- [ ] **Step 4: Confira os tipos**

```bash
cd optmize-backend && npm run typecheck
```

Esperado: sem erro. Se acusar `Property 'devices' is missing`, falta acrescentar os dois objetos ao retorno da fábrica.

- [ ] **Step 5: Aplique o schema e confira**

```bash
cd optmize-backend && npm run db:migrate && npm run doctor
```

Esperado: a migração é idempotente e o `doctor` lista as tabelas sem reclamar.

- [ ] **Step 6: Commit**

```bash
cd optmize-backend
git add src/infra/db/postgres/schema.sql src/domain/ports/repositories.ts src/infra/db/supabase.repositories.ts
git commit -m "Onde o vinculo da maquina mora: devices e device_codes"
```

---

### Task 3: O serviço e as duas rotas

**Files:**
- Create: `optmize-backend/src/services/device.service.ts`
- Create: `optmize-backend/src/dto/device.dto.ts`
- Create: `optmize-backend/src/http/routes/device.routes.ts`
- Modify: `optmize-backend/src/app.ts`
- Test: `optmize-backend/test/device.service.test.ts`

**Interfaces:**
- Consumes: `evaluateDevice`, `tokenExpiraEm`, `codigoExpiraEm`, `CODE_SECONDS`, `DEVICE_POLICY` (Task 1); `DeviceRepository`, `DeviceCodeRepository` (Task 2); `verifyPassword`, `hashToken`, `newId`, `newOpaqueToken` de `src/infra/crypto/index.ts`; `evaluateAccountAccess` de `src/domain/access.ts`.
- Produces: `class DeviceService` com `autorizar(email, senha)` → `{ codigo, expiraEm }` e `emitir(entrada)` → `RespostaDoDispositivo`.

- [ ] **Step 1: Escreva o teste que falha**

Crie `optmize-backend/test/device.service.test.ts`. O teste do meio é o que esta spec existe para garantir.

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DeviceService } from "../src/services/device.service.ts";
import { hashPassword } from "../src/infra/crypto/index.ts";

/**
 * Repositórios de mentira, em memória.
 *
 * É o que as interfaces de `ports/repositories.ts` existem para permitir: a
 * regra do serviço se testa sem Postgres e sem rede.
 */
function fabricarRepos(passwordHash: string) {
  const codigos = new Map<string, { userId: string; expiresAt: Date; usedAt: Date | null }>();
  const dispositivos: Record<string, unknown>[] = [];
  /** Conta quantas vezes alguém mexeu em `sessions`. Tem que ficar em zero. */
  const toquesEmSessoes = { revokeAllOfUser: 0, listActiveOfUser: 0 };

  const dona = {
    id: "u1",
    email: "dono@grafica.com",
    name: "Dona da Gráfica",
    passwordHash,
    role: "owner",
    isActive: true,
    organizationId: "o1",
    scopes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  return {
    toquesEmSessoes,
    dispositivos,
    repos: {
      users: {
        async findByEmail(email: string) {
          return email === "dono@grafica.com" ? dona : null;
        },
        async findById(id: string) {
          return id === "u1" ? dona : null;
        },
      },
      sessions: {
        async revokeAllOfUser() {
          toquesEmSessoes.revokeAllOfUser++;
        },
        async listActiveOfUser() {
          toquesEmSessoes.listActiveOfUser++;
          return [];
        },
      },
      deviceCodes: {
        async create(input: { codeHash: string; userId: string; expiresAt: Date }) {
          codigos.set(input.codeHash, {
            userId: input.userId,
            expiresAt: input.expiresAt,
            usedAt: null,
          });
        },
        async consume(codeHash: string, agora: Date) {
          const linha = codigos.get(codeHash);
          if (!linha || linha.usedAt !== null || linha.expiresAt <= agora) return null;
          linha.usedAt = agora;
          return { userId: linha.userId };
        },
      },
      subscriptions: {
        // Em dia: o que este teste exercita é o caminho do dispositivo, não a
        // regra de assinatura — essa já é testada em `access.test.ts`.
        async findByUser() {
          return {
            userId: "u1",
            status: "active",
            planId: "optmize-full",
            preapprovalId: null,
            payerId: null,
            trialEndsAt: null,
            currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
            cancelAtPeriodEnd: false,
            updatedAt: new Date(),
          };
        },
      },
      organizations: {
        async findById() {
          return { id: "o1", name: "Gráfica", ownerUserId: "u1", createdAt: new Date() };
        },
      },
      devices: {
        async create(input: Record<string, unknown>) {
          dispositivos.push(input);
          return {
            ...input,
            lastSeenAt: new Date(),
            revokedAt: null,
            createdAt: new Date(),
          };
        },
        async findByTokenHash() {
          return null;
        },
        async rotateToken() {},
        async revoke() {},
        async listOfOrganization() {
          return [];
        },
      },
    } as never,
  };
}

describe("serviço de dispositivo", () => {
  it("troca senha por código e código por token", async () => {
    const hash = await hashPassword("senha-bem-comprida");
    const { repos, dispositivos } = fabricarRepos(hash);
    const servico = new DeviceService(repos);

    const { codigo, expiraEm } = await servico.autorizar(
      "dono@grafica.com",
      "senha-bem-comprida",
    );
    assert.equal(expiraEm, 300);
    assert.ok(codigo.length > 10);

    const resposta = await servico.emitir({
      codigo,
      deviceId: "maquina-aleatoria-1",
      deviceName: "PC-BALCAO",
      appVersion: "1.0.30",
    });
    assert.ok(resposta.token);
    assert.equal(resposta.usuario.nome, "Dona da Gráfica");
    assert.equal(dispositivos.length, 1);
  });

  it("NÃO derruba sessão nenhuma — é a razão de este serviço existir", async () => {
    const hash = await hashPassword("senha-bem-comprida");
    const { repos, toquesEmSessoes } = fabricarRepos(hash);
    const servico = new DeviceService(repos);

    await servico.autorizar("dono@grafica.com", "senha-bem-comprida");

    assert.equal(toquesEmSessoes.revokeAllOfUser, 0);
    assert.equal(toquesEmSessoes.listActiveOfUser, 0);
  });

  it("o código vale uma vez só", async () => {
    const hash = await hashPassword("senha-bem-comprida");
    const { repos } = fabricarRepos(hash);
    const servico = new DeviceService(repos);

    const { codigo } = await servico.autorizar(
      "dono@grafica.com",
      "senha-bem-comprida",
    );
    const entrada = {
      codigo,
      deviceId: "maquina-aleatoria-1",
      deviceName: "PC-BALCAO",
      appVersion: "1.0.30",
    };

    await servico.emitir(entrada);
    await assert.rejects(
      () => servico.emitir(entrada),
      (erro: { code: string }) => erro.code === "codigo_invalido",
    );
  });

  it("senha errada não diz se o e-mail existe", async () => {
    const hash = await hashPassword("senha-bem-comprida");
    const { repos } = fabricarRepos(hash);
    const servico = new DeviceService(repos);

    const semConta = await servico
      .autorizar("ninguem@lugar.com", "seja-la-o-que-for")
      .then(() => null, (erro: { message: string }) => erro.message);
    const senhaErrada = await servico
      .autorizar("dono@grafica.com", "outra-coisa-qualquer")
      .then(() => null, (erro: { message: string }) => erro.message);

    assert.equal(semConta, senhaErrada);
  });
});
```

- [ ] **Step 2: Rode o teste e confirme que ele falha**

```bash
cd optmize-backend && node --experimental-strip-types --test test/device.service.test.ts
```

Esperado: FALHA, com `Cannot find module '../src/services/device.service.ts'`.

- [ ] **Step 3: Escreva o serviço**

Crie `optmize-backend/src/services/device.service.ts`:

```ts
/**
 * ===========================================================================
 * O SERVIÇO DO DISPOSITIVO
 * ===========================================================================
 *
 * Duas etapas, e não uma: a senha vira um CÓDIGO de uso único, e o código vira
 * o TOKEN preso à máquina.
 *
 * Parece um passo a mais sem necessidade enquanto quem confere a senha é este
 * mesmo serviço. O passo existe pelo que vem depois: a janela web de
 * autorização (seção 4.1 do documento de arquitetura) entra como mais um
 * emissor de código, ao lado deste, e `emitir` não muda uma linha. Juntar as
 * duas etapas hoje é ter de separá-las no dia da janela, com instalações já
 * em campo falando o formato antigo.
 *
 * O QUE ESTE SERVIÇO NÃO FAZ, e é o motivo de ele não ser o `AuthService`:
 * **não cria sessão**. `issueSession` derruba todas as sessões da conta a cada
 * login, e o Full herdando isso faria o dono derrubar a produção ao abrir o
 * painel web. Nada aqui toca em `sessions`.
 */

import { badRequest, unauthorized } from "../domain/errors.ts";
import { evaluateAccountAccess } from "../domain/access.ts";
import {
  CODE_SECONDS,
  DEVICE_POLICY,
  codigoExpiraEm,
  evaluateDevice,
  tokenExpiraEm,
} from "../domain/devices.ts";
import type { User } from "../domain/entities.ts";
import type { Repositories } from "../domain/ports/repositories.ts";
import {
  hashToken,
  newId,
  newOpaqueToken,
  verifyPassword,
} from "../infra/crypto/index.ts";

/** Hash de uma senha que ninguém tem — ver a mesma constante em auth.service. */
const DUMMY_HASH =
  "scrypt$131072$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

export interface EntradaDoToken {
  /** O código do `autorizar`, na ativação. */
  codigo?: string;
  /** O token atual, na renovação. Um dos dois, nunca os dois. */
  token?: string;
  deviceId: string;
  deviceName: string;
  appVersion: string;
}

export interface RespostaDoDispositivo {
  token: string;
  expira: string;
  empresa: string;
  usuario: { nome: string; papel: string };
  /** As telas que esta pessoa vê. O pedaço B do plano é quem obedece. */
  telas: string[] | null;
  /** A versão publicada. Vai de carona para o Full não precisar de outra ida. */
  versao: string;
  politica: typeof DEVICE_POLICY;
}

export class DeviceService {
  constructor(
    private readonly repos: Repositories,
    /** De onde sai a versão publicada. Injetada para o teste não precisar dela. */
    private readonly versaoPublicada: () => Promise<string> = async () => "",
  ) {}

  /**
   * Confere a senha e devolve um código de uso único.
   *
   * O mesmo erro para e-mail inexistente e senha errada, e o `verifyPassword`
   * contra um hash de mentira no caminho de quem não existe: sem ele, a
   * resposta voltaria rápido demais para quem não tem conta e o tempo entregaria
   * quais e-mails existem.
   */
  async autorizar(
    email: string,
    senha: string,
  ): Promise<{ codigo: string; expiraEm: number }> {
    const usuario = await this.repos.users.findByEmail(email);
    if (!usuario) {
      await verifyPassword(senha, DUMMY_HASH);
      throw unauthorized("invalid_credentials", "E-mail ou senha incorretos.");
    }
    if (!(await verifyPassword(senha, usuario.passwordHash))) {
      throw unauthorized("invalid_credentials", "E-mail ou senha incorretos.");
    }

    /*
      Conta não liberada ENTRA aqui, como no `/auth/login`: barrar na porta
      devolveria "conta desativada" e deixaria a pessoa na tela de login sem
      para onde ir. Quem decide é `evaluateDevice`, na emissão — e lá a recusa
      vem com um código que o programa sabe explicar.
    */

    const codigo = newOpaqueToken();
    await this.repos.deviceCodes.create({
      codeHash: hashToken(codigo),
      userId: usuario.id,
      expiresAt: codigoExpiraEm(new Date()),
    });

    return { codigo, expiraEm: CODE_SECONDS };
  }

  /** Ativação (com `codigo`) e renovação (com `token`) — a mesma resposta. */
  async emitir(entrada: EntradaDoToken): Promise<RespostaDoDispositivo> {
    const agora = new Date();

    const userId = entrada.codigo
      ? await this.donoDoCodigo(entrada.codigo, agora)
      : await this.donoDoToken(entrada.token ?? "", entrada, agora);

    const usuario = await this.repos.users.findById(userId);
    if (!usuario) {
      throw unauthorized("conta_bloqueada", "Conta inválida ou removida.");
    }

    /*
      A ASSINATURA É DO DONO, não de quem está entrando.

      É a convenção da casa (ver o comentário de `credit_accounts`, no schema):
      quem paga é o dono da organização, e a equipe dele opera sob a assinatura
      dele. Procurar pela chave do funcionário devolveria `null` e trancaria a
      gráfica inteira menos uma pessoa.

      Sem organização, a conta é o próprio pagante — é o caso do Full comprado
      por quem trabalha sozinho.
    */
    const pagante = usuario.organizationId
      ? await this.donoDaOrganizacao(usuario.organizationId, usuario)
      : usuario;
    const assinatura = await this.repos.subscriptions.findByUser(pagante.id);
    const acesso = evaluateAccountAccess(
      { user: usuario, subscription: assinatura },
      agora,
    );

    const token = newOpaqueToken();
    const expira = tokenExpiraEm(agora);

    const dispositivo = await this.repos.devices.create({
      id: newId(),
      userId: usuario.id,
      organizationId: usuario.organizationId ?? null,
      deviceId: entrada.deviceId,
      deviceName: entrada.deviceName,
      appVersion: entrada.appVersion,
      tokenHash: hashToken(token),
      expiresAt: expira,
    });

    const decisao = evaluateDevice(dispositivo, acesso, agora);
    if (!decisao.allowed) {
      throw unauthorized(
        decisao.code ?? "conta_bloqueada",
        decisao.reason ?? "Sem acesso.",
      );
    }

    return {
      token,
      expira: expira.toISOString(),
      empresa: usuario.organizationId ?? "",
      usuario: { nome: usuario.name, papel: usuario.role },
      telas: usuario.scopes ?? null,
      versao: await this.versaoPublicada(),
      politica: DEVICE_POLICY,
    };
  }

  /**
   * O dono da organização — quem paga. Cai de volta em quem entrou se a
   * organização sumiu ou se o dono foi removido: é melhor avaliar o acesso da
   * própria pessoa do que estourar no meio de uma renovação.
   */
  private async donoDaOrganizacao(
    organizationId: string,
    entrando: User,
  ): Promise<User> {
    const organizacao = await this.repos.organizations.findById(organizationId);
    if (!organizacao) return entrando;
    if (organizacao.ownerUserId === entrando.id) return entrando;
    return (await this.repos.users.findById(organizacao.ownerUserId)) ?? entrando;
  }

  private async donoDoCodigo(codigo: string, agora: Date): Promise<string> {
    const gasto = await this.repos.deviceCodes.consume(hashToken(codigo), agora);
    if (!gasto) {
      // Um erro só para inexistente, vencido e já usado: distinguir contaria a
      // quem tenta adivinhar qual dos três aconteceu.
      throw badRequest(
        "codigo_invalido",
        "Este código não vale mais. Entre de novo.",
      );
    }
    return gasto.userId;
  }

  private async donoDoToken(
    token: string,
    entrada: EntradaDoToken,
    agora: Date,
  ): Promise<string> {
    const atual = await this.repos.devices.findByTokenHash(hashToken(token));
    if (!atual) {
      throw unauthorized(
        "maquina_desvinculada",
        "Esta máquina não está mais vinculada. Entre de novo.",
      );
    }
    if (atual.revokedAt !== null) {
      throw unauthorized(
        "maquina_desvinculada",
        "Esta máquina foi desvinculada. Entre de novo para vinculá-la.",
      );
    }
    if (atual.expiresAt <= agora) {
      throw unauthorized(
        "maquina_desvinculada",
        "O acesso desta máquina expirou. Entre de novo.",
      );
    }
    if (atual.deviceId !== entrada.deviceId) {
      throw unauthorized(
        "maquina_desvinculada",
        "Este acesso pertence a outro computador.",
      );
    }
    return atual.userId;
  }
}
```

- [ ] **Step 4: Rode o teste e confirme que ele passa**

```bash
cd optmize-backend && node --experimental-strip-types --test test/device.service.test.ts
```

Esperado: PASSA, 4 testes.

- [ ] **Step 5: Escreva o DTO**

Crie `optmize-backend/src/dto/device.dto.ts`:

```ts
import { z } from "zod";

export const autorizarSchema = z.object({
  email: z.string().trim().toLowerCase().email("E-mail inválido.").max(320),
  senha: z.string().min(1).max(200),
});

export const tokenSchema = z
  .object({
    codigo: z.string().min(10).max(200).optional(),
    token: z.string().min(10).max(200).optional(),
    /** Opaco para o servidor — ver o comentário em `devices.ts`. */
    deviceId: z.string().min(8).max(200),
    deviceName: z.string().max(120).default(""),
    appVersion: z.string().max(40).default(""),
  })
  // Um dos dois, nunca os dois: com os dois, não haveria resposta óbvia para
  // "qual deles manda" e o servidor decidiria por conta própria.
  .refine((c) => Boolean(c.codigo) !== Boolean(c.token), {
    message: "Informe o código (ativação) ou o token (renovação), não os dois.",
  });
```

- [ ] **Step 6: Escreva as rotas**

Crie `optmize-backend/src/http/routes/device.routes.ts`:

```ts
import type { FastifyInstance } from "fastify";

import { autorizarSchema, tokenSchema } from "../../dto/device.dto.ts";

/**
 * As duas rotas que o Optmize Full instalado chama.
 *
 * Sem sessão e sem `requireUser`: a credencial do Full é o token de
 * dispositivo, e ele não é uma sessão de usuário. Ver `services/device.service`.
 */
export async function deviceRoutes(app: FastifyInstance): Promise<void> {
  const { deviceService } = app.services;

  app.post(
    "/device/authorize",
    {
      // A mesma trava do /auth/login: é a superfície de força bruta de senha.
      config: { rateLimit: { max: 10, timeWindow: "5 minutes" } },
    },
    async (request) => {
      const { email, senha } = autorizarSchema.parse(request.body);
      return deviceService.autorizar(email, senha);
    },
  );

  app.post("/device/token", async (request) => {
    const corpo = tokenSchema.parse(request.body);
    return deviceService.emitir(corpo);
  });
}
```

- [ ] **Step 7: Componha no `app.ts`**

Em `optmize-backend/src/app.ts`:

1. Acrescente os imports, junto dos outros:

```ts
import { DeviceService } from "./services/device.service.ts";
import { deviceRoutes } from "./http/routes/device.routes.ts";
```

2. Acrescente o campo em `export interface Services`:

```ts
  /** O que libera o Optmize Full instalado. */
  deviceService: DeviceService;
```

3. Onde os outros serviços são construídos, acrescente:

```ts
  const deviceService = new DeviceService(repos);
```

e inclua `deviceService` no objeto `services`.

4. Registre a rota, ao lado de `licenseRoutes`:

```ts
  await app.register(deviceRoutes);
```

- [ ] **Step 8: Confira tudo**

```bash
cd optmize-backend && npm run typecheck && npm test
```

Esperado: sem erro de tipo, e toda a suíte passando — inclusive os testes que já existiam.

- [ ] **Step 9: Commit**

```bash
cd optmize-backend
git add src/services/device.service.ts src/dto/device.dto.ts src/http/routes/device.routes.ts src/app.ts test/device.service.test.ts
git commit -m "A senha vira codigo, o codigo vira token — e nenhuma sessao cai"
```

---

### Task 4: Ver e desvincular máquinas no painel administrativo

**Files:**
- Modify: `optmize-backend/src/http/routes/admin.routes.ts`

**Interfaces:**
- Consumes: `repos.devices` (Task 2).
- Produces: `GET /admin/devices?organizationId=…`, `POST /admin/devices/:id/unbind`.

- [ ] **Step 1: Acrescente as duas rotas**

Em `optmize-backend/src/http/routes/admin.routes.ts`, seguindo o formato das rotas de licença que já estão lá (elas já usam `app.requireAdmin`):

```ts
  /**
   * As máquinas de uma empresa: o que a seção 5.1 do documento chama de
   * "visualizar máquinas vinculadas, última validação e versão instalada".
   */
  app.get(
    "/admin/devices",
    { preHandler: app.requireAdmin },
    async (request) => {
      const { organizationId } = request.query as { organizationId?: string };
      if (!organizationId) {
        throw badRequest("invalid_query", "Informe a empresa.");
      }
      const maquinas = await repos.devices.listOfOrganization(organizationId);
      return maquinas.map((maquina) => ({
        id: maquina.id,
        nome: maquina.deviceName,
        versao: maquina.appVersion,
        expira: maquina.expiresAt.toISOString(),
        ultimaConversa: maquina.lastSeenAt?.toISOString() ?? null,
        desvinculada: maquina.revokedAt !== null,
      }));
    },
  );

  /**
   * Desvincular: o caminho da troca de computador e do suporte.
   *
   * Não derruba o programa na hora — o token que a máquina tem na mão continua
   * valendo até vencer. É a consequência de 48 h sem tolerância: a janela é
   * curta o bastante para não valer a pena um canal de revogação imediata, que
   * exigiria o Full perguntando de minuto em minuto.
   */
  app.post(
    "/admin/devices/:id/unbind",
    { preHandler: app.requireAdmin },
    async (request) => {
      const { id } = request.params as { id: string };
      await repos.devices.revoke(id);
      return { ok: true };
    },
  );
```

Confira que `badRequest` já está importado no topo do arquivo; se não estiver, acrescente-o ao import de `../../domain/errors.ts`.

- [ ] **Step 2: Confira os tipos e a suíte**

```bash
cd optmize-backend && npm run typecheck && npm test
```

Esperado: sem erro.

- [ ] **Step 3: Commit**

```bash
cd optmize-backend
git add src/http/routes/admin.routes.ts
git commit -m "O painel ve as maquinas da empresa, e desvincula uma"
```

---

### Task 5: `servidor/licenca.js` — a regra do lado do Full

**Files:**
- Create: `optmize-full/servidor/licenca.js`
- Test: `optmize-full/bancada/conferir-licenca.cjs`
- Modify: `optmize-full/package.json`

**Interfaces:**
- Consumes: `pastaDeDados` de `servidor/caminhos.js`.
- Produces: `{ idDaMaquina, decidirEstado, agoraConfiavel, estado, entrar, sair, renovarAgora, iniciar, parar }`.
  - `decidirEstado({ expira, ultimaConversa, agora, ultimaTentativaFalhou })` → `{ estado: "LIBERADO"|"RENOVANDO"|"BLOQUEADO", horasParaBloqueio: number, tarja: boolean }`
  - `agoraConfiavel(relogio, ultimaConversa)` → `Date`
  - `estado()` → `{ estado, perfil, tarja, horasParaBloqueio, motivo }`

- [ ] **Step 1: Escreva o teste que falha**

Crie `optmize-full/bancada/conferir-licenca.cjs`:

```js
#!/usr/bin/env node
/** A regra da licença do Full: prazos, relógio e a tarja. Sem rede e sem disco. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// A pasta descartável ANTES do require: `caminhos.js` a lê ao ser carregado.
process.env.OPTIMIZE_DADOS = fs.mkdtempSync(
  path.join(os.tmpdir(), "optimize-licenca-"),
);
const licenca = require("../servidor/licenca");

let passou = 0;
// `async` desde já: a Task 6 acrescenta conferências que falam com um servidor,
// e um `conferir` síncrono as deixaria passar sem esperar o resultado — teste
// verde que não conferiu nada é pior que teste vermelho.
const conferir = async (nome, fn) => { await fn(); passou++; console.log(`  ok   ${nome}`); };

const AGORA = new Date("2026-09-21T12:00:00.000Z");
/** Horas somadas a AGORA. */
const em = (horas) => new Date(AGORA.getTime() + horas * 3_600_000);

async function regra() {
await conferir("token folgado é LIBERADO, sem tarja", () => {
  const r = licenca.decidirEstado({
    expira: em(40), ultimaConversa: AGORA, agora: AGORA, ultimaTentativaFalhou: false,
  });
  assert.equal(r.estado, "LIBERADO");
  assert.equal(r.tarja, false);
});

await conferir("faltando menos de 24 h, começa a renovar — e ainda não avisa", () => {
  const r = licenca.decidirEstado({
    expira: em(20), ultimaConversa: AGORA, agora: AGORA, ultimaTentativaFalhou: true,
  });
  assert.equal(r.estado, "RENOVANDO");
  assert.equal(r.tarja, false);
});

await conferir("faltando menos de 12 h com falha, a tarja aparece", () => {
  const r = licenca.decidirEstado({
    expira: em(6), ultimaConversa: AGORA, agora: AGORA, ultimaTentativaFalhou: true,
  });
  assert.equal(r.estado, "RENOVANDO");
  assert.equal(r.tarja, true);
  assert.equal(r.horasParaBloqueio, 6);
});

await conferir("faltando menos de 12 h SEM falha, nada de tarja", () => {
  // Quem acabou de renovar não pode ver aviso de tranca: seria susto à toa.
  const r = licenca.decidirEstado({
    expira: em(6), ultimaConversa: AGORA, agora: AGORA, ultimaTentativaFalhou: false,
  });
  assert.equal(r.tarja, false);
});

await conferir("vencido é BLOQUEADO", () => {
  const r = licenca.decidirEstado({
    expira: em(-1), ultimaConversa: em(-49), agora: AGORA, ultimaTentativaFalhou: true,
  });
  assert.equal(r.estado, "BLOQUEADO");
});

await conferir("atrasar o relógio do Windows não estica a licença", () => {
  // O caso real: a pessoa põe a data uma semana atrás para não bloquear.
  const relogioAtrasado = em(-24 * 7);
  const confiavel = licenca.agoraConfiavel(relogioAtrasado, AGORA);
  assert.equal(confiavel.getTime(), AGORA.getTime());

  const r = licenca.decidirEstado({
    expira: em(-1), ultimaConversa: AGORA, agora: confiavel, ultimaTentativaFalhou: true,
  });
  assert.equal(r.estado, "BLOQUEADO");
});

await conferir("relógio adiantado é respeitado — só o atraso é suspeito", () => {
  const adiantado = em(3);
  assert.equal(licenca.agoraConfiavel(adiantado, AGORA).getTime(), adiantado.getTime());
});

await conferir("o id da máquina é estável entre leituras", () => {
  assert.equal(licenca.idDaMaquina(), licenca.idDaMaquina());
  assert.ok(licenca.idDaMaquina().length >= 16);
});

}

regra().then(() => {
  console.log(`\n${passou} conferências passaram.`);
}, (erro) => {
  console.error(erro);
  process.exit(1);
});
```

- [ ] **Step 2: Rode e confirme que falha**

```bash
cd optmize-full && node bancada/conferir-licenca.cjs
```

Esperado: FALHA, com `Cannot find module '../servidor/licenca'`.

- [ ] **Step 3: Escreva a parte pura de `licenca.js`**

Crie `optmize-full/servidor/licenca.js`. Nesta etapa, só o que o teste cobre — a rede vem na Task 6.

```js
/**
 * ===========================================================================
 * A LICENÇA DESTA INSTALAÇÃO
 * ===========================================================================
 *
 * O Optmize Full abria sozinho. Agora ele abre porque esta máquina está
 * vinculada a uma conta, e o que prova isso é um token de 48 horas que este
 * arquivo guarda, renova e vigia.
 *
 * ---------------------------------------------------------------------------
 * POR QUE AQUI, E NÃO NO REACT OU NO RUST
 * ---------------------------------------------------------------------------
 *
 * O React não alcança o Tauri: a interface é servida por este mesmo Node em
 * 127.0.0.1, uma origem REMOTA aos olhos do Tauri, que não abre o IPC dele
 * para ela (ver o cabeçalho de `tauri-plugin-dialog`, em src-tauri/Cargo.toml).
 * E o Rust não está no caminho de nenhuma requisição.
 *
 * Sobra o Node, que é por onde tudo passa — e ainda bem: token guardado no
 * React seria token em `localStorage` de uma página que a rede inteira da
 * gráfica alcança, porque `server.js` escuta em 0.0.0.0.
 *
 * ---------------------------------------------------------------------------
 * OS PRAZOS NÃO MORAM AQUI
 * ---------------------------------------------------------------------------
 *
 * 48 horas de token, renovação 24 horas antes, tarja nas últimas 12: são
 * decisão de negócio e vêm do servidor, em `politica`, a cada resposta. Os
 * valores abaixo são só o que vale antes da primeira conversa.
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const { pastaDeDados } = require("./caminhos");

const HORA = 3_600_000;

/** O que vale enquanto o servidor não disser outra coisa. */
let politica = { tokenHours: 48, renewBeforeHours: 24, warnBeforeHours: 12 };

// ─── O identificador desta máquina ───────────────────────────────────────────

const ARQUIVO_DA_MAQUINA = path.join(pastaDeDados("licenca"), "maquina.txt");

/**
 * O identificador desta instalação: aleatório, gravado uma vez e lido sempre.
 *
 * NÃO é impressão digital de hardware, de propósito. O servidor só precisa que
 * ele seja estável neste computador, e derivar de disco ou placa-mãe faria
 * uma troca de HD desvincular a máquina sozinha — chamado de suporte onde não
 * havia problema. Trocar de computador se resolve no painel, com um botão.
 */
function idDaMaquina() {
  try {
    const guardado = fs.readFileSync(ARQUIVO_DA_MAQUINA, "utf8").trim();
    if (guardado.length >= 16) return guardado;
  } catch {
    // Primeira execução, ou arquivo apagado: nasce um novo logo abaixo.
  }
  const novo = crypto.randomBytes(16).toString("hex");
  fs.writeFileSync(ARQUIVO_DA_MAQUINA, novo, { mode: 0o600 });
  return novo;
}

// ─── O relógio ───────────────────────────────────────────────────────────────

/**
 * Que horas são, sem acreditar no relógio do Windows quando ele anda para trás.
 *
 * O ataque é trivial e não precisa de ferramenta nenhuma: atrasar a data do
 * computador faria o token vencido parecer válido de novo. Como o horário da
 * última conversa com o servidor foi gravado por nós, um relógio ANTERIOR a
 * ele é impossível de boa-fé — então vale o maior dos dois.
 *
 * Adiantar continua sendo respeitado: ele só antecipa o próprio bloqueio, o
 * que não interessa a ninguém.
 */
function agoraConfiavel(relogio, ultimaConversa) {
  if (!ultimaConversa) return relogio;
  return relogio.getTime() < ultimaConversa.getTime() ? ultimaConversa : relogio;
}

// ─── A máquina de estados ────────────────────────────────────────────────────

/**
 * Em que estado esta instalação está.
 *
 * Função PURA: recebe os quatro fatos e devolve a decisão. É o que permite
 * conferir a regra na bancada sem rede, sem disco e sem esperar 48 horas.
 */
function decidirEstado({ expira, ultimaConversa, agora, ultimaTentativaFalhou }) {
  const faltam = (expira.getTime() - agora.getTime()) / HORA;

  if (faltam <= 0) {
    return { estado: "BLOQUEADO", horasParaBloqueio: 0, tarja: false };
  }

  const renovando = faltam <= politica.renewBeforeHours;

  /*
    A tarja pede as DUAS coisas: pouco tempo e a última tentativa falhada.
    Só o tempo avisaria quem acabou de renovar — susto à toa a cada ciclo. Só a
    falha avisaria a primeira falha de um token com 40 horas pela frente, que é
    ruído: a rede volta muito antes.
  */
  const tarja = renovando && ultimaTentativaFalhou && faltam <= politica.warnBeforeHours;

  return {
    estado: renovando ? "RENOVANDO" : "LIBERADO",
    horasParaBloqueio: Math.floor(faltam),
    tarja,
  };
}

module.exports = {
  idDaMaquina,
  agoraConfiavel,
  decidirEstado,
  /** Só para a bancada: devolve os prazos ao padrão entre conferências. */
  _politica: (nova) => { politica = nova ?? politica; return politica; },
};
```

- [ ] **Step 4: Rode e confirme que passa**

```bash
cd optmize-full && node bancada/conferir-licenca.cjs
```

Esperado: `8 conferências passaram.`

- [ ] **Step 5: Ligue a conferência ao lançamento**

Em `optmize-full/package.json`, acrescente o script e inclua-o na revisão:

```json
    "bancada:licenca": "node bancada/conferir-licenca.cjs",
```

E, em `bancada:revisao`, acrescente ` && node bancada/conferir-licenca.cjs` ao fim do encadeamento que já existe. Sem isso, a regra da licença não é conferida antes de compilar, que é o único momento em que alguém olharia.

- [ ] **Step 6: Confirme que a revisão inteira passa**

```bash
cd optmize-full && npm run bancada:revisao
```

Esperado: todas as conferências passando, inclusive as que já existiam.

- [ ] **Step 7: Commit**

```bash
cd optmize-full
git add servidor/licenca.js bancada/conferir-licenca.cjs package.json
git commit -m "A regra da licenca no Full: prazos, relogio e a tarja"
```

---

### Task 6: A conversa com o backend e a renovação sozinha

**Files:**
- Modify: `optmize-full/servidor/licenca.js`

**Interfaces:**
- Consumes: `POST /device/authorize` e `POST /device/token` (Task 3); `idDaMaquina`, `decidirEstado`, `agoraConfiavel` (Task 5).
- Produces: `entrar(email, senha)` → `{ ok: true, perfil }` ou `{ ok: false, code, message }`; `sair()`; `renovarAgora()` → `boolean`; `estado()` → `{ estado, perfil, tarja, horasParaBloqueio, motivo, versao }`; `iniciar()`; `parar()`.

- [ ] **Step 1: Acrescente o teste do ciclo completo**

Em `optmize-full/bancada/conferir-licenca.cjs`, antes da linha final do `console.log`, acrescente um servidor de mentira e o ciclo:

```js
// ─── O ciclo contra um backend de mentira ────────────────────────────────────
const express = require("express");

async function ciclo() {
  let codigoEmitido = null;
  let tokensEmitidos = 0;
  let responderErro = null;

  const falso = express();
  falso.use(express.json());
  falso.post("/device/authorize", (req, res) => {
    if (req.body.senha !== "certa") {
      return res.status(401).json({ code: "invalid_credentials", message: "E-mail ou senha incorretos." });
    }
    codigoEmitido = "codigo-de-uso-unico";
    res.json({ codigo: codigoEmitido, expiraEm: 300 });
  });
  falso.post("/device/token", (req, res) => {
    if (responderErro) {
      return res.status(401).json({ code: responderErro, message: "Recusado." });
    }
    if (req.body.codigo && req.body.codigo !== codigoEmitido) {
      return res.status(400).json({ code: "codigo_invalido", message: "Não vale mais." });
    }
    codigoEmitido = null; // uso único, como no servidor de verdade
    tokensEmitidos++;
    res.json({
      token: `token-${tokensEmitidos}`,
      expira: new Date(Date.now() + 48 * 3_600_000).toISOString(),
      empresa: "o1",
      usuario: { nome: "Dona da Gráfica", papel: "owner" },
      telas: null,
      versao: "1.0.31",
      politica: { tokenHours: 48, renewBeforeHours: 24, warnBeforeHours: 12 },
    });
  });

  const aberto = await new Promise((ok) => {
    const s = falso.listen(0, "127.0.0.1", () => ok(s));
  });
  licenca._backend(`http://127.0.0.1:${aberto.address().port}`);

  const errado = await licenca.entrar("dono@grafica.com", "errada");
  conferir("senha errada não entra, e explica", () => {
    assert.equal(errado.ok, false);
    assert.equal(errado.code, "invalid_credentials");
  });

  const certo = await licenca.entrar("dono@grafica.com", "certa");
  conferir("senha certa entra e vincula a máquina", () => {
    assert.equal(certo.ok, true);
    assert.equal(certo.perfil.nome, "Dona da Gráfica");
    assert.equal(licenca.estado().estado, "LIBERADO");
  });

  conferir("a versão publicada chega de carona no token", () => {
    assert.equal(licenca.estado().versao, "1.0.31");
  });

  conferir("renovar troca o token sem pedir senha de novo", async () => {
    assert.equal(await licenca.renovarAgora(), true);
    assert.equal(tokensEmitidos, 2);
  });

  responderErro = "maquina_desvinculada";
  await licenca.renovarAgora();
  conferir("máquina desvinculada volta para a tela de login", () => {
    assert.equal(licenca.estado().estado, "SEM CONTA");
    assert.equal(licenca.estado().motivo, "maquina_desvinculada");
  });

  responderErro = null;
  await licenca.entrar("dono@grafica.com", "certa");
  responderErro = "licenca_vencida";
  await licenca.renovarAgora();
  conferir("assinatura vencida bloqueia na hora, sem esperar as 48 h", () => {
    assert.equal(licenca.estado().estado, "BLOQUEADO");
    assert.equal(licenca.estado().motivo, "licenca_vencida");
  });

  licenca.sair();
  conferir("sair apaga o token", () => {
    assert.equal(licenca.estado().estado, "SEM CONTA");
  });

  aberto.close();
}
```

E troque o encerramento do arquivo — a Task 5 já deixou `conferir` assíncrono e as conferências da regra dentro de `regra()`, então basta encadear:

```js
regra().then(ciclo).then(() => {
  console.log(`\n${passou} conferências passaram.`);
}, (erro) => {
  console.error(erro);
  process.exit(1);
});
```

- [ ] **Step 2: Rode e confirme que falha**

```bash
cd optmize-full && node bancada/conferir-licenca.cjs
```

Esperado: FALHA, com `licenca._backend is not a function`.

- [ ] **Step 3: Implemente a conversa**

Acrescente a `optmize-full/servidor/licenca.js`, antes do `module.exports`:

```js
// ─── A conversa com o backend ────────────────────────────────────────────────

/**
 * Onde o backend mora.
 *
 * O mesmo endereço que o atualizador do Tauri já usa (ver
 * src-tauri/tauri.conf.json). A variável de ambiente existe para a bancada
 * apontar para um servidor de mentira — não para configuração de cliente.
 */
let BACKEND = process.env.OPTMIZE_BACKEND
  || "https://optmize-backend-production.up.railway.app";

const ARQUIVO_DO_TOKEN = path.join(pastaDeDados("licenca"), "token.json");

/**
 * O que está guardado em disco.
 *
 * Fica em memória depois da primeira leitura porque `estado()` é chamado a
 * cada requisição do React — ler o disco toda vez seria I/O por clique.
 */
let guardado = null;
let ultimaTentativaFalhou = false;
let motivo = null;
let relogio = null;

function ler() {
  if (guardado !== null) return guardado;
  try {
    guardado = JSON.parse(fs.readFileSync(ARQUIVO_DO_TOKEN, "utf8"));
  } catch {
    guardado = false; // false = já procuramos e não há nada
  }
  return guardado;
}

function gravar(dados) {
  guardado = dados;
  /*
    `mode: 0o600` é o que dá para fazer, e a spec não finge que é cofre: quem
    tem a senha desta máquina lê o arquivo. O que segura o risco são as 48
    horas — um token copiado morre depois de amanhã. Guardar de verdade pediria
    DPAPI, que o Node não tem.
  */
  fs.writeFileSync(ARQUIVO_DO_TOKEN, JSON.stringify(dados), { mode: 0o600 });
}

function apagar() {
  guardado = false;
  try {
    fs.unlinkSync(ARQUIVO_DO_TOKEN);
  } catch {
    // Já não existia. Sair duas vezes não é erro.
  }
}

async function falar(rota, corpo) {
  const resposta = await fetch(BACKEND + rota, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) {
    const erro = new Error(dados.message || "Não foi possível falar com o servidor.");
    erro.code = dados.code || "sem_resposta";
    throw erro;
  }
  return dados;
}

/** Guarda o que veio do servidor, inclusive os prazos. */
function aceitar(resposta) {
  politica = resposta.politica || politica;
  gravar({
    token: resposta.token,
    expira: resposta.expira,
    ultimaConversa: new Date().toISOString(),
    perfil: {
      nome: resposta.usuario.nome,
      papel: resposta.usuario.papel,
      empresa: resposta.empresa,
      telas: resposta.telas,
    },
    versao: resposta.versao,
    politica,
  });
  ultimaTentativaFalhou = false;
  motivo = null;
}

/**
 * Entrar: senha → código → token, em duas idas.
 *
 * As duas etapas existem para a janela web de autorização poder entrar depois
 * no lugar da primeira, sem mexer na segunda. Ver o cabeçalho de
 * `services/device.service.ts`, no backend.
 */
async function entrar(email, senha) {
  try {
    const { codigo } = await falar("/device/authorize", { email, senha });
    const resposta = await falar("/device/token", {
      codigo,
      deviceId: idDaMaquina(),
      deviceName: require("node:os").hostname(),
      appVersion: require("../package.json").version,
    });
    aceitar(resposta);
    return { ok: true, perfil: ler().perfil };
  } catch (erro) {
    return { ok: false, code: erro.code, message: erro.message };
  }
}

function sair() {
  apagar();
  motivo = null;
}

/**
 * Uma tentativa de renovação.
 *
 * Devolve `true` quando conseguiu. As recusas NÃO são todas iguais, e é essa
 * distinção que evita telefonema: sem rede, espera calada; máquina
 * desvinculada, volta ao login; conta ou assinatura, bloqueia na hora com o
 * texto certo — esperar as 48 horas nesses dois casos só adiaria a má notícia.
 */
async function renovarAgora() {
  const atual = ler();
  if (!atual) return false;

  try {
    const resposta = await falar("/device/token", {
      token: atual.token,
      deviceId: idDaMaquina(),
      deviceName: require("node:os").hostname(),
      appVersion: require("../package.json").version,
    });
    aceitar(resposta);
    return true;
  } catch (erro) {
    ultimaTentativaFalhou = true;
    motivo = erro.code;

    if (erro.code === "maquina_desvinculada") {
      apagar();
    } else if (erro.code === "conta_bloqueada" || erro.code === "licenca_vencida") {
      // Mantém o token guardado (o perfil ainda serve para a tela dizer de
      // quem é a conta), mas marca o bloqueio.
      gravar({ ...atual, expira: new Date(0).toISOString() });
    }
    return false;
  }
}

/** O que o React precisa saber. Nunca inclui o token. */
function estado() {
  const atual = ler();
  if (!atual) return { estado: "SEM CONTA", perfil: null, tarja: false, horasParaBloqueio: 0, motivo, versao: null };

  const agora = agoraConfiavel(new Date(), new Date(atual.ultimaConversa));
  const decisao = decidirEstado({
    expira: new Date(atual.expira),
    ultimaConversa: new Date(atual.ultimaConversa),
    agora,
    ultimaTentativaFalhou,
  });

  return { ...decisao, perfil: atual.perfil, motivo, versao: atual.versao };
}

/**
 * O trabalho de fundo.
 *
 * De 3 em 3 horas, e só faz alguma coisa quando o estado é RENOVANDO — ou
 * seja, nas últimas 24 horas do token. Fora disso é uma comparação de datas e
 * volta a dormir: não adianta renovar um token com 40 horas pela frente, e
 * bater no servidor à toa multiplicado pelas instalações é carga de graça.
 */
function iniciar() {
  parar();
  relogio = setInterval(() => {
    if (estado().estado === "RENOVANDO") renovarAgora();
  }, 3 * HORA);
  // `unref` para o intervalo não segurar o processo de pé sozinho: fechar o
  // Optmize tem de fechar o Optmize.
  relogio.unref?.();

  // Uma tentativa logo ao abrir: a máquina pode ter passado a noite desligada
  // e atravessado a janela inteira de renovação dormindo.
  if (estado().estado === "RENOVANDO") renovarAgora();
}

function parar() {
  if (relogio) clearInterval(relogio);
  relogio = null;
}
```

E troque o `module.exports` por:

```js
module.exports = {
  idDaMaquina,
  agoraConfiavel,
  decidirEstado,
  entrar,
  sair,
  renovarAgora,
  estado,
  iniciar,
  parar,
  /** Só para a bancada. */
  _backend: (url) => { BACKEND = url; guardado = null; },
};
```

- [ ] **Step 4: Rode e confirme que passa**

```bash
cd optmize-full && node bancada/conferir-licenca.cjs
```

Esperado: todas as conferências passando, incluindo as sete novas do ciclo.

- [ ] **Step 5: Commit**

```bash
cd optmize-full
git add servidor/licenca.js bancada/conferir-licenca.cjs
git commit -m "O Full conversa com o backend, e renova sozinho"
```

---

### Task 7: `servidor/sessao.js` e o portão antes da API

**Files:**
- Create: `optmize-full/servidor/sessao.js`
- Modify: `optmize-full/servidor/server.js`

**Interfaces:**
- Consumes: `entrar`, `sair`, `estado`, `iniciar` de `servidor/licenca.js` (Task 6).
- Produces: `GET /api/sessao/eu`, `POST /api/sessao/entrar`, `POST /api/sessao/sair`; e o middleware `portao` exportado como `criarPortao()`.

- [ ] **Step 1: Escreva o teste que falha**

Acrescente ao fim de `ciclo()`, em `optmize-full/bancada/conferir-licenca.cjs`:

```js
  // ─── O portão ──────────────────────────────────────────────────────────────
  const { criarPortao } = require("../servidor/sessao");
  const protegido = express();
  protegido.use("/api", criarPortao());
  protegido.get("/api/moldes", (_req, res) => res.json({ ok: true }));
  const aberto2 = await new Promise((ok) => {
    const s = protegido.listen(0, "127.0.0.1", () => ok(s));
  });
  const base2 = `http://127.0.0.1:${aberto2.address().port}`;

  licenca.sair();
  const semConta = await fetch(`${base2}/api/moldes`);
  await conferir("sem conta, a API local não responde nem na rede da gráfica", () => {
    assert.equal(semConta.status, 401);
  });

  responderErro = null;
  await licenca.entrar("dono@grafica.com", "certa");
  const comConta = await fetch(`${base2}/api/moldes`);
  await conferir("com conta, a API volta a responder", () => {
    assert.equal(comConta.status, 200);
  });

  const sessaoLivre = await fetch(`${base2}/api/sessao/eu`);
  await conferir("a rota da própria sessão nunca é barrada — senão não há login", () => {
    assert.notEqual(sessaoLivre.status, 401);
  });

  aberto2.close();
```

Lembre de montar as rotas de sessão no app de teste, antes do portão:

```js
  protegido.use(express.json());
  protegido.use("/api/sessao", require("../servidor/sessao").rotas);
```

- [ ] **Step 2: Rode e confirme que falha**

```bash
cd optmize-full && node bancada/conferir-licenca.cjs
```

Esperado: FALHA, com `Cannot find module '../servidor/sessao'`.

- [ ] **Step 3: Escreva `sessao.js`**

Crie `optmize-full/servidor/sessao.js`:

```js
/**
 * ===========================================================================
 * A SESSÃO — quem está usando o programa, para o lado de cá
 * ===========================================================================
 *
 * Três rotas e um portão. O React fala com isto, e só com isto: o token de
 * licença fica em `licenca.js` e não atravessa para a tela. O que atravessa é
 * um PERFIL — nome, papel, empresa, telas.
 *
 * A diferença importa porque `server.js` escuta em 0.0.0.0: a página do
 * Optmize é alcançável de qualquer máquina da gráfica, e um token guardado
 * nela seria um token ao alcance do F12 de qualquer um.
 */

const express = require("express");

const licenca = require("./licenca");

const rotas = express.Router();

/** Quem está usando agora, e em que estado a instalação está. */
rotas.get("/eu", (_req, res) => {
  res.json(licenca.estado());
});

rotas.post("/entrar", async (req, res) => {
  const { email, senha } = req.body || {};
  if (!email || !senha) {
    return res.status(400).json({ code: "faltou", message: "Informe e-mail e senha." });
  }
  const resultado = await licenca.entrar(String(email), String(senha));
  if (!resultado.ok) {
    // 401 com o código do servidor: é o que deixa a tela dizer "e-mail ou
    // senha incorretos" em vez de "não foi possível validar", que obrigaria a
    // pessoa a telefonar para descobrir o que houve.
    return res.status(401).json({ code: resultado.code, message: resultado.message });
  }
  licenca.iniciar();
  res.json(licenca.estado());
});

rotas.post("/sair", (_req, res) => {
  licenca.sair();
  res.json(licenca.estado());
});

/**
 * O portão: sem licença viva, `/api/*` não responde.
 *
 * NÃO é enfeite de tela. `rotas.ts` já sabe esconder tela com `trancada`, e o
 * cabeçalho de `TelaTrancada.tsx` diz em voz alta que aquilo é aparência, não
 * segurança. Aqui é segurança: a porta 8000 está aberta para a rede inteira da
 * gráfica, e deixar a API respondendo enquanto a tela pede senha seria uma
 * tranca com a janela aberta ao lado.
 *
 * Fora do portão fica só `/api/sessao` — barrá-la impediria o próprio login, o
 * que trancaria a instalação para sempre na primeira execução.
 */
function criarPortao() {
  return (req, res, proximo) => {
    if (req.path.startsWith("/sessao")) return proximo();

    const { estado } = licenca.estado();
    if (estado === "SEM CONTA" || estado === "BLOQUEADO") {
      return res.status(401).json({
        code: "sem_licenca",
        message: "Entre com a sua conta para usar o Optmize.",
      });
    }
    return proximo();
  };
}

module.exports = { rotas, criarPortao };
```

- [ ] **Step 4: Monte no `server.js`**

Em `optmize-full/servidor/server.js`, logo **depois** da linha `app.use(express.json({ limit: "15mb" }));` e **antes** de qualquer `app.use("/api/...")`:

```js
/*
 * O PORTÃO DA LICENÇA.
 *
 * Vem antes de toda rota de API, e depois do `express.json` porque as rotas de
 * sessão leem corpo JSON. As telas (o `express.static` e a rota-curinga mais
 * abaixo) continuam sendo servidas: é o React que decide mostrar o login, e
 * ele precisa ser baixado para isso.
 */
const { rotas: rotasDeSessao, criarPortao } = require("./sessao");
const licenca = require("./licenca");

app.use("/api/sessao", rotasDeSessao);
app.use("/api", criarPortao());

licenca.iniciar();
```

Atenção: as três rotas montadas **antes** do `express.json` geral (`/api/encaixe` e `/api/cor`, linhas 58–72) ficam fora do portão por estarem acima dele. Mova o bloco acima para **antes** da linha 58 e acrescente `express.json()` só às rotas de sessão:

```js
app.use("/api/sessao", express.json(), rotasDeSessao);
app.use("/api", criarPortao());
```

- [ ] **Step 5: Rode a bancada e o programa**

```bash
cd optmize-full && node bancada/conferir-licenca.cjs && npm run bancada:revisao
```

Esperado: tudo passando. Se `bancada:revisao` quebrar, é porque as conferências que já existiam sobem rotas sem licença — elas montam os routers direto (ver `conferir-revisao-backend.cjs`), então não passam pelo portão e devem continuar passando. Se alguma subir o `server.js` inteiro, dê a ela uma licença de mentira com `licenca._backend`.

- [ ] **Step 6: Commit**

```bash
cd optmize-full
git add servidor/sessao.js servidor/server.js bancada/conferir-licenca.cjs
git commit -m "O portao: sem conta, a API local nao responde"
```

---

### Task 8: As telas — entrar, bloqueado e a tarja

**Files:**
- Create: `optmize-full/src/telas/Entrar.tsx`
- Create: `optmize-full/src/casca/Bloqueado.tsx`
- Modify: `optmize-full/src/casca/usuario.ts`
- Modify: `optmize-full/src/casca/Casca.tsx`

**Interfaces:**
- Consumes: `GET /api/sessao/eu`, `POST /api/sessao/entrar`, `POST /api/sessao/sair` (Task 7).
- Produces: `useSessao()` → `{ estado, perfil, tarja, horasParaBloqueio, motivo, recarregar }`; `<Entrar />`; `<Bloqueado motivo horas />`.

- [ ] **Step 1: Troque o usuário de mentira por leitura de verdade**

Em `optmize-full/src/casca/usuario.ts`, apague `USUARIO_DE_TESTE` e reescreva o miolo, mantendo `iniciais()` intacta (ela já está testada pelo uso e não depende de nada disto):

```ts
import { useEffect, useState } from "react";

export type Papel = "dono" | "admin" | "operador" | "leitor";
export type EstadoDaSessao = "CARREGANDO" | "SEM CONTA" | "LIBERADO" | "RENOVANDO" | "BLOQUEADO";

export interface Usuario {
  nome: string;
  empresa: string;
  papel: Papel;
  /** As telas liberadas. `null` = todas. Quem obedece é o pedaço B do plano. */
  telas: string[] | null;
}

export interface Sessao {
  estado: EstadoDaSessao;
  perfil: Usuario | null;
  tarja: boolean;
  horasParaBloqueio: number;
  motivo: string | null;
  recarregar: () => void;
}

/**
 * Quem está usando o programa agora.
 *
 * Era um valor fixo enquanto não havia login. Agora lê `/api/sessao/eu`, que é
 * servida pelo mesmo Node que serve esta página — o token de licença fica lá e
 * NÃO chega aqui de propósito: esta página é alcançável por qualquer máquina
 * da gráfica.
 */
export function useSessao(): Sessao {
  const [dados, setDados] = useState<Omit<Sessao, "recarregar">>({
    estado: "CARREGANDO",
    perfil: null,
    tarja: false,
    horasParaBloqueio: 0,
    motivo: null,
  });

  const recarregar = () => {
    fetch("/api/sessao/eu")
      .then((r) => r.json())
      .then((s) => setDados(s))
      .catch(() =>
        // O servidor local não respondeu: é o Optmize fechando, ou ainda
        // subindo. SEM CONTA leva à tela de login, que é recuperável — chutar
        // LIBERADO abriria o programa sem licença nenhuma.
        setDados({ estado: "SEM CONTA", perfil: null, tarja: false, horasParaBloqueio: 0, motivo: null }),
      );
  };

  useEffect(() => {
    recarregar();
    // De hora em hora: a renovação acontece do lado do Node, e a tela só
    // precisa descobrir que o estado mudou antes de a tarja ficar velha.
    const relogio = setInterval(recarregar, 3_600_000);
    return () => clearInterval(relogio);
  }, []);

  return { ...dados, recarregar };
}

export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "?";
  const primeira = partes[0]![0]!;
  const ultima = partes.length > 1 ? partes[partes.length - 1]![0]! : "";
  return (primeira + ultima).toUpperCase();
}
```

Depois, ache quem chamava `usuarioAtual()`:

```bash
cd optmize-full && grep -rn "usuarioAtual" src/
```

e troque cada uso pelo `perfil` que vem do `useSessao()` da casca.

- [ ] **Step 2: Escreva a tela de entrar**

Crie `optmize-full/src/telas/Entrar.tsx`. Siga os componentes da casa (`casca/Botao.tsx`, `casca/Cartao.tsx`) e as classes Tailwind que as outras telas usam:

```tsx
/**
 * A tela de entrar — a primeira coisa que o Optmize mostra numa máquina nova.
 *
 * Ela não decide nada: manda e-mail e senha para `/api/sessao/entrar` e deixa o
 * servidor local cuidar do código, do token e do vínculo. O que ela precisa
 * fazer bem é MOSTRAR O MOTIVO da recusa — "e-mail ou senha incorretos" resolve
 * sozinho; "não foi possível validar" vira telefonema.
 */
import { useState } from "react";

import { Botao } from "../casca/Botao";

export function Entrar({ aoEntrar }: { aoEntrar: () => void }) {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setEnviando(true);
    setErro(null);
    try {
      const resposta = await fetch("/api/sessao/entrar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, senha }),
      });
      if (!resposta.ok) {
        const corpo = await resposta.json().catch(() => ({}));
        setErro(corpo.message || "Não foi possível entrar agora.");
        return;
      }
      aoEntrar();
    } catch {
      setErro("O Optmize não conseguiu falar com o servidor. Confira a internet.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={enviar} className="flex w-full max-w-[360px] flex-col gap-3">
        <h1 className="m-0 text-[1.1rem] font-semibold text-tinta">Entrar no Optmize</h1>
        <p className="m-0 text-[0.85rem] leading-relaxed text-tinta-fraca">
          Use a conta da sua empresa. Esta máquina fica vinculada a ela.
        </p>

        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="E-mail"
          autoFocus
          required
          className="rounded border border-borda px-3 py-2 text-[0.9rem]"
        />
        <input
          type="password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          placeholder="Senha"
          required
          className="rounded border border-borda px-3 py-2 text-[0.9rem]"
        />

        {erro && (
          <p className="m-0 text-[0.85rem] text-vermelho" role="alert">
            {erro}
          </p>
        )}

        <Botao type="submit" disabled={enviando}>
          {enviando ? "Entrando…" : "Entrar"}
        </Botao>
      </form>
    </div>
  );
}
```

Confira os nomes reais das cores (`text-vermelho`, `border-borda`) em `estilo/` e ajuste para os que existirem.

- [ ] **Step 3: Escreva o bloqueio e a tarja**

Crie `optmize-full/src/casca/Bloqueado.tsx`:

```tsx
/**
 * O que aparece quando a licença acaba, e o aviso que vem antes.
 *
 * São dois componentes no mesmo arquivo porque são a mesma conversa com a
 * pessoa, em dois momentos: a tarja avisa, a tela informa. Separá-los faria a
 * segunda ser escrita sem olhar para a primeira, e o texto de uma tem de puxar
 * o da outra.
 */
import { Icone } from "./Icone";

/** Cada motivo leva a uma saída diferente — e é isso que evita telefonema. */
const TEXTOS: Record<string, { titulo: string; recado: string }> = {
  licenca_vencida: {
    titulo: "A assinatura não está em dia",
    recado: "Regularize o pagamento para voltar a usar o Optmize. Assim que a assinatura for reconhecida, o programa destrava sozinho.",
  },
  conta_bloqueada: {
    titulo: "Esta conta ainda não foi liberada",
    recado: "Não é pagamento: a conta está esperando liberação. Fale com quem cuida do Optmize.",
  },
  sem_resposta: {
    titulo: "O Optmize ficou sem contato com o servidor",
    recado: "O acesso desta máquina expirou porque não foi possível revalidar a licença. Confira a internet e entre de novo.",
  },
};

export function Bloqueado({ motivo, aoEntrar }: { motivo: string | null; aoEntrar: () => void }) {
  const texto = TEXTOS[motivo ?? "sem_resposta"] ?? TEXTOS.sem_resposta!;
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="flex max-w-[440px] flex-col items-center gap-3 text-center">
        <Icone referencia="icones.svg#lock" className="size-8 text-tinta-apagada" />
        <p className="m-0 text-[0.95rem] font-semibold text-tinta">{texto.titulo}</p>
        <p className="m-0 text-[0.85rem] leading-relaxed text-tinta-fraca">{texto.recado}</p>
        <button onClick={aoEntrar} className="text-[0.85rem] underline">
          Entrar com outra conta
        </button>
      </div>
    </div>
  );
}

/**
 * A tarja das últimas 12 horas.
 *
 * Ela é a razão de as 48 horas serem vivíveis: bloquear sem avisar transforma
 * um problema de rede numa acusação de golpe, e quem apanha é quem estava
 * trabalhando. Por isso ela diz QUANTO TEMPO FALTA, e não só que algo está
 * errado — é a diferença entre "chame alguém agora" e "chame alguém um dia
 * desses".
 */
export function Tarja({ horas }: { horas: number }) {
  return (
    <div className="bg-atencao px-4 py-2 text-center text-[0.8rem] text-tinta" role="status">
      O Optmize está sem contato com o servidor. O acesso desta máquina trava em{" "}
      <strong>{horas} h</strong> se a conexão não voltar.
    </div>
  );
}
```

- [ ] **Step 4: Ligue tudo na casca**

Em `optmize-full/src/casca/Casca.tsx`, envolva o que já é renderizado:

```tsx
  const sessao = useSessao();

  // Enquanto não sabemos, não desenhamos nem o programa nem o login: piscar
  // a tela de login para quem tem licença válida é pior que meio segundo de
  // nada.
  if (sessao.estado === "CARREGANDO") return null;

  if (sessao.estado === "SEM CONTA") {
    return <Entrar aoEntrar={sessao.recarregar} />;
  }

  if (sessao.estado === "BLOQUEADO") {
    return <Bloqueado motivo={sessao.motivo} aoEntrar={sessao.recarregar} />;
  }

  return (
    <>
      {sessao.tarja && <Tarja horas={sessao.horasParaBloqueio} />}
      {/* …o que a Casca já desenhava… */}
    </>
  );
```

E, no menu do usuário, o botão de sair — com o aviso que a spec pede:

```tsx
  async function sair() {
    if (!confirm("Sair vai pedir a sua senha de novo na próxima vez. Sair mesmo?")) return;
    await fetch("/api/sessao/sair", { method: "POST" });
    sessao.recarregar();
  }
```

- [ ] **Step 5: Confira os tipos e a bancada de tela**

```bash
cd optmize-full && npm run tipos && npm run bancada:react && npm run bancada:tela
```

Esperado: sem erro. `npm run tipos` é o que pega `usuarioAtual` esquecido em alguma tela.

- [ ] **Step 6: Veja funcionando**

```bash
cd optmize-full && npm run dev
```

Abra `http://127.0.0.1:8000`. Esperado: a tela de entrar. Entre com uma conta de verdade do backend e confirme que o programa aparece. Depois pare o backend, apague o `token.json` da pasta de dados e confirme que a tela de entrar volta com um recado sobre internet, e não uma tela em branco.

- [ ] **Step 7: Commit**

```bash
cd optmize-full
git add src/telas/Entrar.tsx src/casca/Bloqueado.tsx src/casca/usuario.ts src/casca/Casca.tsx
git commit -m "As telas da conta: entrar, bloqueado e a tarja que avisa antes"
```

---

### Task 9: Os documentos que passaram a mentir

**Files:**
- Modify: `optmize-full/docs/LANCAMENTO.md`
- Modify: `optmize-full/docs/ARQUITETURA.md`

- [ ] **Step 1: Corrija o que ficou falso**

`docs/LANCAMENTO.md` descreve um Optmize que abre sozinho. Acrescente, depois do diagrama do topo:

```markdown
**Desde 2026-09-21, o Full exige conta.** Uma instalação nova abre na tela de
entrar, vincula-se à máquina e mantém-se liberada por um token de 48 horas que
ela renova sozinha — ver `docs/superpowers/specs/2026-09-21-identidade-no-full-design.md`.
Publicar uma versão passou a ter uma consequência a mais: quem não tiver conta
criada no painel não entra. Crie as contas antes de publicar.
```

Em `docs/ARQUITETURA.md`, acrescente `servidor/licenca.js` e `servidor/sessao.js` ao mapa dos arquivos do servidor, com uma linha cada, no formato que o arquivo já usa.

- [ ] **Step 2: Commit**

```bash
cd optmize-full
git add docs/LANCAMENTO.md docs/ARQUITETURA.md
git commit -m "Os documentos passam a dizer que o Full pede conta"
```

---

## Conferência final

- [ ] `cd optmize-backend && npm run typecheck && npm test` — passa
- [ ] `cd optmize-full && npm run tipos && npm run bancada:revisao` — passa
- [ ] O programa abre na tela de entrar numa pasta de dados limpa
- [ ] Entrar com conta válida leva ao Optmize de sempre
- [ ] Entrar com senha errada diz "E-mail ou senha incorretos"
- [ ] Com o backend fora do ar, o programa que já entrou continua aberto
- [ ] `POST /admin/devices/:id/unbind` devolve a máquina à tela de entrar na renovação seguinte
- [ ] Abrir o painel web com a mesma conta **não** derruba o Full
