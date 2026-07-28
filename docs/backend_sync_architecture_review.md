# 本项目后端代码、数据模型与数据管道同步机制改进建议文档

> **编写依据**：基于对 `src-tauri` 后端 Rust 代码、数据库 Schema (`schema.rs`)、数据模型 (`entities/`) 以及 TiDB ↔ SQLite 同步机制 (`local_db.rs`, `sync.rs`) 的深度架构审计，结合 **Codebase Design (深层模块与缝隙隔离)**、**Domain Modeling (领域建模与切片)** 和 **高可靠离线优先 (Offline-First) 同步** 设计原则整理而成。

---

## 目录

1. [架构概述与现有实现诊断](#1-架构概述与现有实现诊断)
2. [后端代码架构改进建议](#2-后端代码架构改进建议)
3. [数据模型 (Data Model) 改进建议](#3-数据模型-data-model-改进建议)
4. [数据管道同步机制 (Data Pipeline Sync) 改进建议](#4-数据管道同步机制-data-pipeline-sync-改进建议)
5. [重构实施路线图 (Roadmap)](#5-重构实施路线图-roadmap)

---

## 1. 架构概述与现有实现诊断

当前项目采用了典型的 **Offline-First (离线优先)** 桌面/移动双端架构：
- **本地主存储**：SQLite (`fishworker.db`)，使用 `sqlx` 连接池，运行在客户端。
- **云端同步数据库**：TiDB (MySQL 兼容协议)，通过 `sea-orm` 与 `sqlx` 进行远程同步。
- **同步引擎**：在 `lib.rs` 中通过 15s 定时器轮询调用 `pull_from_tidb` 和 `push_to_tidb`，并在每次本地写操作后触发异步后台 `trigger_background_push`。

总体架构具备离线可用和双向数据同步的基本雏形，但在**数据一致性、同步性能、代码封装度与扩展性**方面存在若干显著痛点。

---

## 2. 后端代码架构改进建议

### 2.1 ORM 与 Raw SQL 混用导致的代码冗余与类型碎片化

#### 诊断问题
- **架构双重依赖**：同步逻辑 (`local_db.rs`) 使用 SeaORM (`sea_orm`) 的 Entity 映射；而前端 Tauri Command 交互层 (`time_management.rs`, `mission.rs`, `list/commands.rs`) 却直接手写 `sqlx::query(...)` 原生 SQL。
- **类型三重定义**：同一个业务实体（如任务 Task）同时存在于：
  1. `schema.rs` 的 SQL DDL 字符串
  2. `src/entities/time_management_tasks.rs` 的 SeaORM 结构体
  3. `time_management.rs` 的 `Task` Rust 结构体
  4. 前端 TypeScript `Task` 接口
  - 这种冗余导致每次新增或更新字段时，必须手动同步修改 4 处，极易发生字段漏配或类型不匹配。

#### 改进建议
1. **统一数据访问层 (Repository Pattern & Deep Module)**：
   - 遵照 **Codebase Design** 原则，收敛数据访问接口。为每一个领域模块（如 `ListRepository`, `TaskRepository`）提供小而坚固的 Interface (Deep Module)，隐藏 SQL 或 SeaORM 内部细节。
   - 内部统一采用 SeaORM 或纯 `sqlx` 强类型映射，消除手工拼接 SQL 字符串与冗余的结构体定义。

---

### 2.2 数据库 Schema 迁移 (Migration) 机制脆弱

#### 诊断问题
- 当前数据库表新增列依赖 `schema.rs` 和 `list/migration.rs` 中连续的 `ALTER TABLE ...` 语句，并使用 `let _ = sqlx::query(...).execute().await;` **静默忽略所有迁移错误**。
- 缺乏版本号追踪 (`schema_version`)。如果迁移在某种极端情况下失败（如锁超时或列类型不兼容），程序不会抛出警告，后续代码会在运行时因字段缺失而崩溃。

#### 改进建议
1. **引入标准结构化迁移框架**：
   - 引入 `sqlx::migrate!` 或 `sea-orm-migration`，按版本时间戳拆分 `.sql` 迁移文件。
   - 增加版本表记录执行状态，确保 DDL 变更具备事务原子性与失败回滚/阻退能力。

---

### 2.3 异步任务治理与后台轮询冲突

#### 诊断问题
- 在 `lib.rs` 中，建立连接后通过 `tokio::time::interval(Duration::from_secs(15))` 开启无限循环的后台同步。
- 轮询任务直接触发 `pull_from_tidb` 和 `push_to_tidb`。在弱网或 TiDB 响应延迟较高时，15 秒可能不足以完成全表同步，虽然有 `SYNC_MUTEX` 互斥锁，但会导致任务在锁上积压，打满 async runtime 线程池。

#### 改进建议
1. **指数退避与网络状态感知 (Exponential Backoff & Debounce)**：
   - 将固定 15s 轮询改为**基于事件驱动 (Event-driven)** + **智能退避轮询**。
   - 本地写入触发推送时进行 **防抖 (Debounce 500ms~1s)**，避免短时间内连续修改（如连续打勾或打字）密集触发全表 Push。
   - 同步失败时采用指数退避（15s -> 30s -> 60s -> 300s），网络恢复或应用重新聚焦时立即重试。

---

## 3. 数据模型 (Data Model) 改进建议

### 3.1 时间戳数据类型不一致 (Timestamp Format Inconsistency)

#### 诊断问题
- 整个项目中时间戳存储格式严重混杂：
  - `time_management_tasks`: `created_at` / `completed_at` / `deadline` 使用 `BIGINT` (Unix 毫秒级时间戳)。
  - `daily_reviews` / `list_notes` / `habits`: `created_at` / `updated_at` 使用 `DATETIME(3)` 或 `VARCHAR` (ISO8601 字符串 `YYYY-MM-DD HH:MM:SS.mmm`)。
  - `pomodoro_records`: `start_time` 使用 `VARCHAR(64)`。
- **严重隐患**：`local_db.rs` 中的 LWW (Last-Write-Wins) 比较算法使用了字符串直接比较 `r.updated_at > existing.updated_at`。如果时区格式（UTC vs 本地时区）或毫秒位数格式化不一致，字符串比较将得出错误结论，导致最新的修改被旧数据非法覆盖。

#### 改进建议
1. **标准化时间戳规范**：
   - 统一所有表的 `created_at` / `updated_at` / `deleted_at` 为 **ISO 8601 UTC 字符串** (`YYYY-MM-DDTHH:MM:SS.mmmZ`) 或统一为 **UTC Unix 毫秒数 (`BIGINT`)**。
   - 在 Rust 层统一封装时间解析与比较函数，切勿直接基于未格式化的原生字符串进行 LWW 比较。

---

### 3.2 外键约束与数据关联完整性缺失

#### 诊断问题
- 尽管 SQLite 连接开启了 `PRAGMA foreign_keys=ON;`，但在 DDL (`schema.rs`) 中，`list_notes` 的 `list_id`/`group_id`、`habit_checkins` 的 `habit_id` 等均未添加 `FOREIGN KEY ... REFERENCES` 声明。
- 删除清单 (`list_lists`) 时，如果代码漏删子节点，数据库中会残留大量孤立的 `list_notes` 垃圾数据。

#### 改进建议
1. **补全 DDL 外键与级联删除 (CASCADE)**：
   - 在 SQLite 与 TiDB DDL 中显式定义外键约束（如 `FOREIGN KEY (list_id) REFERENCES list_lists(id) ON DELETE CASCADE`）。
   - 增强数据完整性校验，防止孤儿节点产生。

---

### 3.3 缺少多租户/用户隔离 (User Scoping)

#### 诊断问题
- 所有业务表均未包含 `user_id` 字段。当前模式下，客户端通过 `mysql.config.json` 拥有对全库数据的直接读写权限。
- 若未来扩展多用户登录、多账号切换或云端多租户隔离，当前 Schema 必须进行破坏性重构。

#### 改进建议
1. **预留 `user_id` / `account_id` 领域字段**：
   - 在关键实体模型中引入 `user_id` 字段，并在同步引擎中增加 User Scope 隔离过滤。

---

## 4. 数据管道同步机制 (Data Pipeline Sync) 改进建议

### 4.1 全表扫描与 N+1 查询性能瓶颈

#### 诊断问题
- 当前 `copy_table_lww!` 宏实现逻辑：
  1. `$entity::Entity::find().all($src).await`：一次性将源数据库（如远程 TiDB）整张表的所有数据读入内存。
  2. 遍历每一行：执行 `$entity::Entity::find_by_id(id).one($dst).await` 查目标库。
  3. 若需写入，再执行 `insert().on_conflict().exec($dst)`。
- **性能灾难**：当累积几千条笔记或打卡记录时，每次同步将产生 **1 次全量 SELECT + N 次按 ID 查询 + M 次写入**。14 张表累加后，每次 15s 轮询都会引发数千个数据库 Round-Trips，导致严重的网络卡顿与 CPU 开销。

#### 改进建议
1. **增量水位线同步 (Incremental Delta Sync with Watermark)**：
   - 在本地 SQLite 中维护 `sync_state` 表，记录各表上一次成功同步的时间戳 (`last_synced_at`)。
   - 拉取/推送时，仅查询 `updated_at > last_synced_at` 的变更记录：
     ```sql
     SELECT * FROM list_notes WHERE updated_at > ?
     ```
   - 这样只需同步几毫秒内发生变更的少量增量数据（Delta Rows），将查询复杂度从 $O(N)$ 降至 $O(\Delta N)$。

---

### 4.2 行级 LWW 冲突解决的局限性

#### 诊断问题
- 现有的 LWW 逻辑是以**整行 (Row-level)** 为粒度覆盖的。
- 如果设备 A 修改了笔记标题，设备 B 几乎同时修改了同一条笔记的正文。同步时最新时间戳的设备会整行覆盖另一台设备的修改，造成另一台设备输入的标题或正文无声丢失 (Lost Update)。

#### 改进建议
1. **字段级 LWW 或三方合并 (Field-level LWW / Delta Merging)**：
   - 对文本内容等复杂结构，比较每个字段的修改状态，或引入轻量级 CRDT / 差异合并算法。
   - 对软删除与编辑分离处理，避免更新操作抹除软删除标志 (`deleted_at`)。

---

### 4.3 离线与断网重试队列 (Sync Queue) 补全

#### 诊断问题
- 代码中存在 `sync_queue` 表的定义，但实际写操作（如 `tm_upsert_task`）只是直接写入 SQLite 并调用异步推送。如果此时断网，推送失败仅在控制台输出日志，并没有把变更放入重试队列中进行持续跟踪。

#### 改进建议
1. **建立可靠的离线变更队列 (Outbox Pattern)**：
   - 本地所有增删改操作同时写入本地业务表与 `outbox_queue` (操作日志表)。
   - 后台同步引擎专门消费 `outbox_queue`，成功推送到云端后再清除队列。确保断网期间积累的所有写操作在恢复连网后能按顺序百分之百重放。

---

## 5. 重构实施路线图 (Roadmap)

| 阶段 | 核心任务 | 预估收益 |
| :--- | :--- | :--- |
| **Phase 1: 应急修复与性能止血** | 1. 统一 `updated_at` 时间戳格式，修复字符串 LWW 误判<br>2. 实现基于 `last_synced_at` 的增量同步 (Delta Sync)，替代全表扫描<br>3. 增加写操作防抖 (Debounce 500ms) | 同步网络流量与 I/O 降低 **80%+**，消除潜在的数据覆盖 Bug |
| **Phase 2: 模型规范与隔离** | 1. 补全 DDL 外键与级联约束<br>2. 引入 `sqlx::migrate!` 进行版本化 Migration 管理<br>3. 业务表预留 `user_id` | 彻底解决孤儿节点问题，实现可控安全的数据库迁移 |
| **Phase 3: 代码层重构与队列化** | 1. 按照 Codebase Design 抽离统一的 Repository 接口<br>2. 统一代码层的 ORM/SQL 映射<br>3. 实现基于 Outbox Pattern 的离线写队列 | 代码维护性提升，实现真正的 100% 离线优先无缝同步 |

---
*文档生成于：2026-07-28*
