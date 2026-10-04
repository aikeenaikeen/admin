# ENV — admin (frontend)

Скопируй `env.example` → `.env`. Ниже — что значит каждый ключ.

- **VITE_API_BASE_URL**: base URL backend API для админки (Vite build-time).
- **VITE_RECOGNITION_STREAM_URL**: base URL recognition_service streaming API (Vite build-time).
  Если пусто — используется текущий origin (через nginx `/video_feed?...`). Путь с подписью выдаёт backend.

## Runtime (контейнер nginx админки)

- **CAMERA_GATEWAY_ACCESS_TOKEN**: общий токен camera-gateway (тот же, что у backend и шлюза).
  `nginx.conf` — шаблон: при старте контейнера токен подставляется в заголовок
  `X-Gateway-Token` для `/streams/`. Браузеру токен не отдаётся. Без переменной nginx не стартует.

Видеопотоки (`/streams/<id>.mjpg`, `/video_feed`) открываются только по подписанной ссылке из
`GET /api/cameras/:id/stream-url` (`mjpegUrl`, `recognitionUrl`, срок `expiresAt`): nginx через
`auth_request` спрашивает backend `GET /api/stream-auth` и без валидной подписи отвечает 401.
Для `/video_feed` подпись проверяется и при заданном `VITE_RECOGNITION_STREAM_URL`, только если
этот адрес ведёт на nginx админки (прямой адрес recognition-service подпись не проверяет — только для dev).
