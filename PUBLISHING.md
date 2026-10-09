# Publishing to npm

Пакет публикуется как `@wallet-core/evm`. Для scoped public package нужен npm scope, которым владеет аккаунт или организация, и включённый 2FA/automation token согласно политике npm.

## Локальная публикация

```bash
pnpm install --frozen-lockfile
pnpm run release:check
npm login
NPM_PUBLISH_CONFIRM=1 pnpm run publish:npm
```

Скрипт проверяет чистое Git-древо, branch `main`, lint, build, tests, formatting, выполняет `npm pack --dry-run` и требует явный `NPM_PUBLISH_CONFIRM=1`. Он не принимает токены из аргументов командной строки.

## Рекомендуемый CI-релиз

1. Поднимите версию через `npm version patch|minor|major`.
2. Проверьте `CHANGELOG.md`.
3. Создайте annotated tag: `git tag -a vX.Y.Z -m "vX.Y.Z"`.
4. Создайте GitHub Release из tag.
5. Выполните publishing через доверенный npm/GitHub Actions workflow после проверки package name и provenance.

Не коммитьте `.npmrc`, npm tokens или automation tokens. Для GitHub Actions предпочтителен npm Trusted Publishing/OIDC; если используется token, храните его только в repository secret `NPM_TOKEN` и включите 2FA policy.

Перед первой публикацией проверьте, что `@wallet-core/evm` действительно принадлежит вашему npm scope: имя из текущего `package.json` является примером и может потребовать замены.
