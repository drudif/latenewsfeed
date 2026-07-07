# Portal de Inputs

Feed pessoal inbox-zero. Inputs por e-mail (Gmail via IMAP) ou colados.

## Deploy (Railway)
1. Crie o projeto, adicione o plugin **Postgres** (define `DATABASE_URL`).
2. Configure todas as env vars de `.env.example` (incluindo `NEXT_PUBLIC_R2_PUBLIC_URL`).
3. Rode a migração uma vez: `npm run db:push` (via Railway shell) e `npm run seed`.
4. Deploy do serviço web (`npm run build` / `npm start`).

## Cron (poll do Gmail)
Crie um **Cron** no Railway (a cada 1 min: `* * * * *`) que executa:
```
curl -fsS -X POST "$APP_URL/api/poll" -H "x-inbound-secret: $INBOUND_SECRET"
```
Defina `APP_URL` e `INBOUND_SECRET` nas variáveis do serviço de cron.

## Gmail
- Conta `latenewsfeed@gmail.com` com 2FA ligado → gere uma **senha de app** → `GMAIL_APP_PASSWORD`.
- Encaminhe/envie inputs para `latenewsfeed+f.drudi@gmail.com`.

## Cloudflare R2
- Crie um bucket, gere Access Key/Secret, habilite acesso público (r2.dev) → preencha `R2_*`.
- **Importante:** `NEXT_PUBLIC_R2_PUBLIC_URL` é embutida no build (client-side). Configure-a no Railway ANTES do build, senão as imagens do feed/arquivo quebram silenciosamente.

## Acesso
Abra `https://<app>/?k=<PORTAL_SECRET>` uma vez para gravar o cookie.

## Verificação local (você, com credenciais reais)
1. Suba um Postgres local (ou use o `DATABASE_URL` do Railway):
   ```
   docker run -d --name portal-pg -e POSTGRES_PASSWORD=pass -e POSTGRES_DB=portal_inputs -p 5432:5432 postgres:16
   ```
2. Copie `.env.example` para `.env` e preencha `DATABASE_URL`, `GEMINI_API_KEY`, `R2_*`, `PORTAL_SECRET`, `INBOUND_SECRET`, `NEXT_PUBLIC_R2_PUBLIC_URL`.

   > A classificação usa **Google Gemini** (`gemini-2.5-flash`) via `GEMINI_API_KEY`. Sem a chave (ou em erro/timeout), o app cai no fallback e marca como "Outros" — nenhum input se perde.
3. `npm run db:push && npm run seed`
4. `npm run simular-inbound -- "Um artigo sobre tipografia que quero ler depois"`
5. `npm run dev` e abra `http://localhost:3000/?k=<PORTAL_SECRET>` — o input aparece no feed classificado por IA. Sem `?k=` → 403.
6. Colar screenshot no composer, marcar como lido (vai pro /arquivo), buscar no arquivo, adicionar categoria em /ajustes.
7. Poll real do Gmail: preencha `GMAIL_*`, encaminhe um e-mail para `latenewsfeed+f.drudi@gmail.com`, depois:
   ```
   curl -X POST http://localhost:3000/api/poll -H "x-inbound-secret: <INBOUND_SECRET>"
   ```

## Nota sobre auth (Next 16)
O gate de URL-secreta vive em `src/proxy.ts` (o convention `middleware` foi renomeado para `proxy` no Next 16). `/api/poll` é isento (usa o header `x-inbound-secret`).
