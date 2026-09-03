# 操作规则（兼容性指针）

保留此路径以免历史链接失效。原先的规则目录把耐用不变量与过时的实现细节混在一起，不是当前行为的来源。

请改用这些已维护的所有者：

- [`contributor-sync-model.md`](./contributor-sync-model.md) 用于 effect、
  selector、reducer 与 bulk-dispatch 规则；
- [`sync-architecture.html`](./sync-architecture.html) 用于当前的
  全系统地图与可执行源码所有者；
- [`operation-log-architecture.md`](./operation-log-architecture.md) 用于
  仅追加的 payload/生命周期语义、迁移策略与设计历史；
- [`section-conflict-replay.md`](./section-conflict-replay.md) 用于狭义的
  SECTION 语义重放例外；
- [`vector-clocks.md`](./vector-clocks.md) 用于因果性与时钟存储；以及
- [`supersync-encryption-architecture.md`](./supersync-encryption-architecture.md)
  用于 E2EE 线路与完整性边界。

常量与校验限制有意不在此复制。请在 `src/app/op-log/`、`packages/sync-core/` 与
`packages/super-sync-server/` 下阅读其可执行所有者。
