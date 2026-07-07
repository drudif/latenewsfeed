# Portal de Inputs — Design

Data: 2026-07-07
Status: aprovado (aguardando revisão do spec)

## Visão

Portal pessoal de atualização diária. Ao longo do dia o usuário envia "inputs"
(screenshots, textos, links) para a plataforma — por **encaminhamento de e-mail**
ou **colando direto** na interface. Um LLM classifica cada input numa categoria
fixa e gera um título. Os inputs aparecem num **feed único, categorizado, em
scroll infinito**. O usuário revisa e **marca como lido**; itens lidos saem do
feed e vão para um **arquivo pesquisável** (modelo inbox-zero).

Uso estritamente pessoal (um único usuário).

## Decisões tomadas

| Tema | Decisão |
|------|---------|
| Ingestão de e-mail | Leitura do **Gmail via IMAP** (senha de app) na conta `latenewsfeed@gmail.com`, filtrando pelo destino `latenewsfeed+f.drudi@gmail.com`; **polling a cada ~1 min** |
| Categorização | **Automática via Claude** na chegada |
| Taxonomia | **Conjunto fixo** editável: Ler/Ver depois, Inspiração/Referência, Pessoal/Vida, Outros |
| Comportamento "lido" | **Some do feed** e vai para arquivo pesquisável (inbox-zero) |
| Acesso | **URL secreta** (sem login) |
| Stack | App único **Next.js 15** no Railway |

## Arquitetura

App único **Next.js 15 (App Router, TypeScript, Tailwind)** hospedado no Railway.
Serviços externos:

- **Postgres** (plugin Railway) — dados (inputs, attachments, categories).
- **Cloudflare R2** — armazenamento de imagens/screenshots (S3-compatível).
- **Gmail (conta `latenewsfeed@gmail.com`) via IMAP** — fonte dos e-mails
  encaminhados; um poller interno lê periodicamente as mensagens cujo destino é
  o alias `latenewsfeed+f.drudi@gmail.com`.
- **Anthropic Claude (Haiku 4.5, multimodal)** — classificação + título/resumo.

### Acesso (URL secreta)

- Middleware do Next.js exige um cookie de sessão.
- Primeiro acesso via `app.com/?k=SEGREDO`: valida o token contra
  `PORTAL_SECRET`, grava cookie httpOnly, redireciona para `/`.
- `/api/poll` (dispara a leitura do Gmail) é isento do middleware — protege-se
  com header `x-inbound-secret` próprio (`INBOUND_SECRET`), acionado pelo cron
  do Railway.

## Modelo de dados

**inputs**
- `id` (uuid, pk)
- `source` — `'email' | 'paste'`
- `category` — fk/slug para `categories`
- `title` — gerado por IA
- `body_text` — texto (plain/markdown)
- `html` — html original do e-mail (nullable)
- `sender` — remetente do e-mail (nullable)
- `subject` — assunto do e-mail (nullable)
- `summary` — resumo curto gerado por IA (nullable)
- `message_id` — Message-ID do e-mail (header) para dedupe (nullable, unique quando presente)
- `created_at` — timestamp
- `read_at` — timestamp nullable. **NULL = não-lido (feed); preenchido = lido (arquivo)**

**attachments**
- `id` (uuid, pk)
- `input_id` (fk → inputs)
- `r2_key` — chave do objeto no R2
- `content_type`
- `width`, `height` (nullable)
- `filename` (nullable)
- `status` — `'ok' | 'failed'`

**categories**
- `id` (uuid, pk)
- `slug` — identificador estável
- `name` — rótulo exibido
- `sort_order`
- Seed inicial: Ler/Ver depois, Inspiração/Referência, Pessoal/Vida, Outros.
- Editável numa tela de ajustes (renomear/adicionar/reordenar), sem redeploy.
  Renomear preserva o slug; remover é bloqueado se houver inputs (ou reatribui
  para "Outros"). Reclassificar inputs existentes está fora de escopo.

## Fluxos

### 1. Entrada por e-mail (Gmail via IMAP)

1. Usuário encaminha/envia e-mail para o alias `latenewsfeed+f.drudi@gmail.com`
   (entregue na caixa da conta `latenewsfeed@gmail.com`).
2. O **cron do Railway** (a cada ~1 min) faz `POST /api/poll` com header
   `x-inbound-secret`.
3. `/api/poll` conecta no Gmail via **IMAP** (`imapflow`) usando
   `GMAIL_USER` + `GMAIL_APP_PASSWORD`, e busca mensagens **não processadas**
   com destino = `GMAIL_TARGET_ADDRESS` (`TO "latenewsfeed+f.drudi@gmail.com"`).
   - "Não processada" = UID maior que o último UID já visto (persistido) e/ou
     ainda sem a flag/label de processado.
4. Para cada mensagem nova, parseia o MIME (`mailparser`): `from`, `subject`,
   `text`, `html`, `messageId` e anexos.
5. Sobe cada anexo de imagem no **R2** e coleta as chaves.
6. Dedupe por `message_id` (ignora se já existe), chama Claude para classificar +
   gerar título/resumo, insere `inputs` + `attachments`.
7. Marca a mensagem como processada (aplica label `processado` / avança o último
   UID visto) para não reprocessar.

### 2. Colar na plataforma

1. Caixa de composição no topo do feed.
2. Usuário cola imagem (evento `paste` do clipboard) e/ou digita texto.
3. Frontend envia imagem(ns) para o app → app sobe no R2 → `POST /api/paste`
   com `{ text, attachments: [{r2_key, ...}] }`.
4. Claude classifica; grava com `source='paste'`.

### 3. Classificação (Claude)

- Uma chamada por input, modelo Haiku 4.5.
- Entrada: `subject` + `text` + remetente. **Se houver pouco/nenhum texto e
  existir imagem, envia a primeira imagem (visão)** para classificar e descrever
  — screenshots são cidadãos de primeira classe.
- Saída estruturada: `{ category_slug, title, summary }`, restrita ao conjunto
  fixo de categorias.
- **Fallback:** se a chamada falhar ou retornar categoria inválida, usa `Outros`
  com título = assunto ou primeira linha do texto. Um input nunca se perde.

## Feed, lido e arquivo

### Feed (`/`)
- `GET /api/feed?cursor=<created_at,id>&category=<slug>`
- Só `read_at IS NULL`, ordenado por `created_at DESC`.
- **Scroll infinito com cursor** (sem controles de paginação).
- Cabeçalhos por dia (Hoje, Ontem, data).
- Chips de filtro por categoria no topo.
- Cada card mostra: categoria, título, resumo/preview, thumbnails dos anexos,
  origem (e-mail/paste), horário, botão "marcar como lido".

### Marcar como lido
- `PATCH /api/inputs/:id/read` → seta `read_at = now()`.
- Item sai do feed com animação (some da vista).

### Arquivo (`/arquivo`)
- `GET /api/archive?q=<busca>&cursor=...&category=<slug>`
- Só `read_at IS NOT NULL`.
- **Busca full-text** (Postgres `tsvector` sobre `title` + `body_text`).
- Filtro por categoria; scroll infinito.

## Erros e casos de borda

- **Poller:** header inválido → 401. `message_id` duplicado → no-op idempotente
  (execuções sobrepostas do cron não duplicam). Falha de conexão IMAP → loga e
  tenta de novo no próximo ciclo; o último UID processado só avança após gravar
  com sucesso (nenhum e-mail é pulado). Uma trava simples evita dois polls
  concorrentes.
- **Classificação falha:** fallback para `Outros` (descrito acima).
- **Upload R2 falha:** input é salvo mesmo assim; o anexo é gravado com
  `status='failed'` e o card sinaliza imagem indisponível. Texto nunca se perde.
- **Paste:** valida tipo (imagens) e tamanho máximo; erro exibe toast, sem perder
  o texto já digitado.
- **Input vazio** (sem texto e sem anexo): rejeitado na entrada.

## Testes

- **Unit:** parsing da resposta estruturada do Claude; fallback de categoria;
  codificação/decodificação do cursor; geração do `tsvector`.
- **Integração:** parsing de e-mail de exemplo (com e sem anexo) e ingestão;
  dedupe por `message_id`; `/api/paste`; feed com cursor; `mark-read` movendo
  item do feed para o arquivo; busca no arquivo. O IMAP é abstraído atrás de uma
  interface, com um fake nos testes (sem conexão real ao Gmail).
- **Ferramenta de dev:** script `simular-inbound` que injeta um e-mail fake
  (texto e/ou imagem) direto no pipeline de ingestão, testando classificação +
  gravação sem depender do Gmail.
- **Seed:** categorias iniciais + alguns inputs de exemplo.

## Stack / bibliotecas

- Next.js 15 (App Router), TypeScript, Tailwind CSS.
- ORM: Drizzle + Postgres.
- R2: AWS S3 SDK (S3-compatível).
- Anthropic SDK (`@anthropic-ai/sdk`), modelo `claude-haiku-4-5`.
- IMAP: `imapflow` + `mailparser` para ler e parsear o Gmail.
- Agendamento: **cron do Railway** batendo em `/api/poll` a cada ~1 min.

## Variáveis de ambiente

- `DATABASE_URL` — Postgres.
- `PORTAL_SECRET` — token da URL secreta.
- `INBOUND_SECRET` — segredo que protege `/api/poll` (usado pelo cron).
- `GMAIL_USER` — `latenewsfeed@gmail.com`.
- `GMAIL_APP_PASSWORD` — senha de app gerada no Google (exige 2FA).
- `GMAIL_TARGET_ADDRESS` — `latenewsfeed+f.drudi@gmail.com`.
- `ANTHROPIC_API_KEY`.
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`,
  `R2_PUBLIC_URL`.

## Fora de escopo (v1)

- Múltiplos usuários / login real.
- Reclassificação em massa ao editar categorias.
- Edição/anotação do conteúdo de um input.
- App mobile nativo (a web é responsiva).
- Notificações push.
