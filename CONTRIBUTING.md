# Contributing

Спасибо за интерес к `@wallet-core/evm`. Это криптографический проект: любое изменение, затрагивающее seed phrase, ключи, подписи, calldata, RPC или vault, требует особенно тщательного review.

## Быстрый старт

Требования: Node.js 20+, pnpm 10.

```bash
pnpm install
pnpm run lint
pnpm run build
pnpm test
pnpm run format:check
```

## Pull requests

1. Создайте feature-ветку от `main`.
2. Добавьте тесты на новую ветку поведения и отрицательные сценарии.
3. Не добавляйте реальные seed phrases, private keys, passwords, RPC keys или API keys.
4. Не изменяйте криптографические параметры без обоснования и review.
5. Запустите все quality gates локально.
6. Опишите security impact и backwards compatibility в PR.

PR должен быть небольшим и атомарным. Для изменений криптографии или transaction encoding требуется минимум один дополнительный reviewer.

## Security

Не публикуйте уязвимости в Issues. Используйте GitHub Security Advisory. Секреты, случайно попавшие в репозиторий, нужно немедленно отозвать и заменить; удаление файла из Git history не отменяет утечку.

## Стиль

Проект использует strict TypeScript и Prettier. Публичные API должны иметь явные типы, валидировать входные данные и документировать security boundary.
