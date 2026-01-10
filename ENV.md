# ENV — admin (frontend)

Скопируй `env.example` → `.env`. Ниже — что значит каждый ключ.

- **VITE_API_BASE_URL**: base URL backend API для админки (Vite build-time).
- **VITE_RECOGNITION_STREAM_URL**: base URL recognition_service streaming API (Vite build-time).
  Если пусто — используется текущий origin (через nginx `/video_feed?...`).
