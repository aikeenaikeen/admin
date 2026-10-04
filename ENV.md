# ENV — admin (frontend)

Скопируй `env.example` → `.env`. Ниже — что значит каждый ключ.

- **VITE_API_BASE_URL**: base URL backend API для админки (Vite build-time).
- Потоки открываются по относительным путям текущего origin. Старый
  `VITE_RECOGNITION_STREAM_URL` больше не используется: внешний адрес обошёл бы
  проверку подписи в nginx админки.

## Runtime (контейнер nginx админки)

- **CAMERA_GATEWAY_ACCESS_TOKEN**: общий токен camera-gateway (тот же, что у backend и шлюза).
  `nginx.conf` — шаблон: при старте контейнера токен подставляется в заголовок
  `X-Gateway-Token` для `/streams/`. Браузеру токен не отдаётся. Без переменной nginx не стартует.

Видеопотоки (`/streams/<id>.mjpg`, `/video_feed`) открываются только по подписанной ссылке из
`GET /api/cameras/:id/stream-url` (`mjpegUrl`, `recognitionUrl`, срок `expiresAt`): nginx через
`auth_request` спрашивает backend `GET /api/stream-auth` и без валидной подписи отвечает 401.
