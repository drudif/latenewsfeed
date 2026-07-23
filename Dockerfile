# Imagem oficial do Playwright: já traz Node 22 + Chromium + libs do sistema.
# A tag DEVE bater com a versão do "playwright" no package.json (1.61.1), senão
# o Chromium pré-instalado não corresponde ao que o pacote espera.
FROM mcr.microsoft.com/playwright:v1.61.1-jammy

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# Dependências primeiro (cache). O Chromium já vem na imagem; o postinstall do
# playwright detecta e não baixa de novo. NODE_ENV não é "production" aqui para
# que as devDependencies (typescript/tailwind) estejam disponíveis no build.
COPY package.json package-lock.json ./
RUN npm ci

# Código + build do Next.
COPY . .
RUN npm run build

# Runtime em produção.
ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "run", "start"]
