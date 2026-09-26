# GREEN-API Chat

[![CI](https://github.com/Fh192/green-api-chat/actions/workflows/ci.yml/badge.svg)](https://github.com/Fh192/green-api-chat/actions/workflows/ci.yml)

Веб-чат в стиле [web.telegram.org](https://web.telegram.org/) для отправки и получения текстовых сообщений через [GREEN-API](https://green-api.com/telegram).

![Демо: вход → новый чат → отправка → ответ из Telegram](docs/demo.gif)

## Быстрый старт

```bash
pnpm install
pnpm dev
```

Откройте http://localhost:5173 и введите данные инстанса из [личного кабинета GREEN-API](https://console.green-api.com):

- `idInstance` и `apiTokenInstance`;
- `apiUrl`: подставляется автоматически по первым четырём цифрам `idInstance`.

### Подготовка инстанса

1. Инстанс должен быть **авторизован**: статус `authorized` в кабинете.
2. Для получения сообщений через HTTP API поле **webhookUrl должно быть пустым**, а уведомления о входящих сообщениях включены.

Если инстанс настроен не так, после входа появится предупреждение с кнопкой **«Исправить автоматически»**. Она вызывает `SetSettings`: инстанс перезапустится, изменения применяются до 5 минут.

## Что сделано

### По ТЗ

| Требование                                | Реализация                                                                                                                                                                                                                                                                                                     |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Вход по `idInstance` и `apiTokenInstance` | форма входа, проверка через [`GetStateInstance`](https://green-api.com/v3/docs/api/account/GetStateInstance/) и [`GetSettings`](https://green-api.com/v3/docs/api/account/GetSettings/)                                                                                                                        |
| Новый чат по номеру телефона              | [`CheckAccount`](https://green-api.com/v3/docs/api/service/CheckAccount/) проверяет, что у номера есть аккаунт, и возвращает `chatId`                                                                                                                                                                          |
| Отправка текста                           | [`SendMessage`](https://green-api.com/v3/docs/api/sending/SendMessage/)                                                                                                                                                                                                                                        |
| Получение ответов                         | [HTTP API](https://green-api.com/v3/docs/api/receiving/technology-http-api/): цикл [`ReceiveNotification`](https://green-api.com/v3/docs/api/receiving/technology-http-api/ReceiveNotification/) → [`DeleteNotification`](https://green-api.com/v3/docs/api/receiving/technology-http-api/DeleteNotification/) |
| Интерфейс как у web.telegram.org          | тёмная тема, список чатов, пузыри сообщений, разделители дат                                                                                                                                                                                                                                                   |
| React, shadcn, React Hook Form + zod      | все формы на RHF + zod, компоненты shadcn (Base UI)                                                                                                                                                                                                                                                            |

В ТЗ упоминаются и Telegram, и MAX. У GREEN-API для них одинаковый формат запросов, поэтому чат поддерживает оба, а заодно WhatsApp. Мессенджер выбирается при входе, по умолчанию Telegram. Различия (метод проверки номера, формат `chatId`, лимит длины сообщения) спрятаны в адаптерах [`messengers.ts`](src/lib/green-api/messengers.ts).

### Дополнительно

- Список чатов из [`GetChats`](https://green-api.com/v3/docs/api/service/GetChats/) с превью последних сообщений (журналы [`LastIncomingMessages`](https://green-api.com/v3/docs/api/journals/LastIncomingMessages/) и [`LastOutgoingMessages`](https://green-api.com/v3/docs/api/journals/LastOutgoingMessages/)) и сортировкой по активности. Каналы скрыты.
- История переписки через [`GetChatHistory`](https://green-api.com/v3/docs/api/journals/GetChatHistory/), карточка собеседника через [`GetContactInfo`](https://green-api.com/v3/docs/api/service/GetContactInfo/).
- Статусы сообщений: отправляется, отправлено, прочитано, ошибка. Неотправленное сообщение можно переотправить.
- Счётчики непрочитанных, отметка прочтения через [`ReadChat`](https://green-api.com/v3/docs/api/marks/ReadChat/).
- Пометки для пересланных, изменённых и удалённых сообщений.
- Поиск собеседника по `@username` (Telegram).
- Открытый чат хранится в URL (`#chatId`), работают «назад» и «вперёд» браузера.
- Несколько вкладок: уведомления опрашивает одна вкладка и пересылает события остальным.
- Сессия сохраняется в `localStorage`, есть выход. Вёрстка адаптирована под мобильные.

## Скрипты

| Команда         | Что делает                                                  |
| --------------- | ----------------------------------------------------------- |
| `pnpm dev`      | dev-сервер                                                  |
| `pnpm build`    | проверка типов и production-сборка                          |
| `pnpm lint`     | ESLint                                                      |
| `pnpm test`     | unit- и компонентные тесты (Vitest + Testing Library + msw) |
| `pnpm test:e2e` | e2e-тесты (Playwright, desktop и Pixel 7)                   |

Тесты не ходят в настоящий GREEN-API. Unit- и e2e-тесты используют общий in-memory фейк [`fake-green-api.ts`](src/test/fake-green-api.ts) с теми же URL и форматами ответов.

## Архитектура

```
src/
  lib/green-api/     транспорт: клиент, zod-схемы ответов, адаптеры мессенджеров, разбор уведомлений
  features/auth/     вход и проверка инстанса
  features/session/  сессия (учётные данные, клиент) и ключи TanStack Query
  features/chats/    список чатов, новый чат, цикл уведомлений, синхронизация с URL
  features/chat/     окно чата: история, отправка, кэш сообщений
  components/ui/     компоненты shadcn
```

- **Данные** хранятся в кэше TanStack Query. Уведомления и оптимистичная отправка обновляют кэш напрямую (`message-cache.ts`), без повторных запросов.
- **Лимиты.** У многих методов GREEN-API лимит 1 запрос в секунду. Запросы не отменяются по AbortSignal, потому что отменённый запрос всё равно засчитывается сервером. Повторы идут только на 429, 5xx и сетевые ошибки.
- **Цикл уведомлений.** Long polling на 20 секунд. [`DeleteNotification`](https://green-api.com/v3/docs/api/receiving/technology-http-api/DeleteNotification/) вызывается для любого уведомления, иначе очередь застрянет. Цикл возвращается после сетевых ошибок с нарастающей паузой.

## Ограничения

- Отправляются и отображаются только текстовые сообщения, остальные типы пропускаются.
- Для Telegram и MAX API не сообщает, прочитано ли сообщение. Поэтому после перезагрузки счётчики непрочитанных восстанавливаются только для WhatsApp.
