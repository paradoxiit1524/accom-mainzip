FROM node:24-slim

WORKDIR /app

# Install pnpm globally
RUN npm install -g pnpm@10 --no-fund --no-audit

# Copy everything (node_modules, mobile, dist, etc. excluded via .dockerignore)
COPY . .

# Install all workspace dependencies (including devDeps needed for build + db push)
RUN pnpm install --no-frozen-lockfile

# Build the API server (TypeScript → CJS bundle via esbuild)
RUN pnpm --filter @workspace/api-server run build

# Build the Vite web-admin
RUN pnpm --filter @workspace/web-admin run build

EXPOSE 8080

# At runtime: push DB schema (needs DATABASE_URL), then start the compiled API server
CMD ["sh", "-c", "pnpm --filter @workspace/db run push && node artifacts/api-server/dist/index.cjs"]
