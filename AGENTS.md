# TireEmergencyService

服务端与司机端 UI 源码仓库。Android v1 的任务与验收在 `chenhe237531/TireEmergencyApp` 的 GitHub Issues 中管理。

## Issue tracker

GitHub Issues in `chenhe237531/TireEmergencyApp` is the single source of truth for Android v1.

- 读取任务：`gh issue view <n> --repo chenhe237531/TireEmergencyApp`
- 新问题：创建到 `chenhe237531/TireEmergencyApp`，不要写入本仓 `issues/` 目录。
- 本仓 `issues/` 下的 `TIRE-*.md` 是历史任务书，仅供追溯，不是待办来源。

## Domain docs

改动行为前先读 `TireEmergencyApp/GLOSSARY.md`、`TireEmergencyApp/docs/adr/`，以及 `TireEmergencyApp/docs/android-app-design.md`。

## Checks

- Server：`DB_PROVIDER=mysql pnpm --filter tire-server prisma:generate && pnpm --filter tire-server build`
- Miniapp：`pnpm --filter tire-miniapp init-baseFiles && pnpm --filter tire-miniapp type-check && pnpm --filter tire-miniapp test:run`
