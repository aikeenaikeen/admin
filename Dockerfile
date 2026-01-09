# syntax=docker/dockerfile:1

FROM node:20-alpine AS builder
WORKDIR /app

# Позволяет переопределять API эндпоинт на этапе сборки (Vite читает его во время build)
ARG VITE_API_BASE_URL=http://localhost:3000
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

# Позволяет переопределять URL recognition streaming API на этапе сборки (Vite build-time)
ARG VITE_RECOGNITION_STREAM_URL=http://localhost:5001
ENV VITE_RECOGNITION_STREAM_URL=$VITE_RECOGNITION_STREAM_URL

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build


# non-root nginx образ (запуск без root)
FROM nginxinc/nginx-unprivileged:stable-alpine AS runner
WORKDIR /usr/share/nginx/html

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist ./

# non-root nginx (не слушает <1024)
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:8080 || exit 1

CMD ["nginx", "-g", "daemon off;"]
