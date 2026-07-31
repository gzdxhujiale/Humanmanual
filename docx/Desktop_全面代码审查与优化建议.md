# Desktop 应用全面代码审查与优化建议

> 审查范围：`apps/desktop/src/`（前端 React 19 + TS + TanStack Query）与 `apps/desktop/src-tauri/src/`（后端 Rust / Tauri 2 / libsql Turso）
> 方法论：karpathy-guidelines（简单优先、外科手术式修改、可验证目标）+ codebase-design 深模块原则（小接口、大实现、接缝处藏复杂度）
> 审查日期：2026-07-31
> 说明：所有严重问题均经过人工二次核验；审查过程中发现的 3 个疑似问题经核验为误报，已剔除（见附录）。

---

## 目录

1. [总体评价](#一总体评价)
2. [严重问题（P0）](#二严重问题p0--安全与数据一致性)
3. [后端 Rust 问题清单](#三后端-rust-问题清单)
4. [前端问题清单（按模块）](#四前端问题清单按模块)
5. [基础设施与编辑器问题](#五基础设施与编辑器问题)
6. [性能优化专项](#六性能优化专项)
7. [架构与代码质量改进](#七架构与代码质量改进)
8. [测试覆盖缺口](#八测试覆盖缺口)
9. [修复路线图](#九修复路线图)
10. [附录：已核验的误报](#十附录已核验的误报)

---

## 一、总体评价

**优点**：
- 技术栈现代且分层清晰：TanStack Query 管数据态、Zustand 只存瞬时 UI 态、service 层统一封装 IPC，符合深模块原则的地方不少（如 `useTimeManagementData` 的注释里就明确写着 "Deep Module Hook"）。
- `quickEditWindow.ts` 的窗口池 + session 序号防串话设计成熟，注释交代了 DPI 校正、dev 重载收养等边界场景。
- 写路径普遍采用"乐观缓存更新 + sharedSyncEngine 防抖持久化 + 同步完成后 invalidate"的一致模式，删除路径还记得 `cancel` 掉 pending upsert 防复活。

**主要短板**（按影响排序）：
1. **安全**：Turso 读写令牌明文硬编码且随安装包分发（P0）。
2. **数据一致性**：后端多条 UPDATE/DELETE 级联操作无事务保护；`daily_review_save` 存在检查-后-执行竞态。
3. **健壮性**：`error.rs` 只是 String 包装，前端无法区分错误类别；多处 `unwrap_or_default()` 静默吞错。
4. **可维护性**：4 个超大组件（最大 2134 行）职责过载；各模块 CRUD 代码高度复制粘贴。
5. **性能**：selector 全部未记忆化、大组件 inline handler 导致重渲染、bundle 未做 code splitting。

---

## 二、严重问题（P0）— 安全与数据一致性

### 2.1 🔴 Turso 读写令牌明文硬编码（安全）

**位置**：`src-tauri/turso.config.json`，且经 `db.rs` 的 `include_str!("../turso.config.json")` **编译进二进制**作为兜底配置。

**问题**：JWT 令牌权限为 `"a":"rw"`（读写），任何拿到安装包的人都可以直连远程数据库读写删全部数据。令牌 `iat` 为 2026-07，仍在有效期内。

**影响**：数据泄露、篡改、删库风险，属于典型的凭据泄露漏洞。

**修复建议**：
1. 立即在 Turso 控制台**轮换该令牌**（当前令牌视为已泄露）。
2. 从仓库与 `include_str!` 中移除令牌：`turso.config.json` 加入 `.gitignore`，构建时由 CI 注入或首次运行时引导用户配置（应用已有 `DatabaseSettingsPanel` 配置入口，具备落地条件）。
3. 若必须内置默认库，为分发版单独签发**只读或按用户隔离**的令牌，而非主库 rw 令牌。

### 2.2 🔴 级联写操作缺少事务保护（数据一致性）

| 位置 | 操作 | 风险 |
|---|---|---|
| `habit.rs` `habit_delete`（约 L165-179） | 两条 UPDATE（软删 checkins → 软删 habit） | 第一条成功第二条失败 → 打卡记录被删但习惯仍在 |
| `mission.rs` `mission_delete_role`（约 L156-167） | 三条 UPDATE（goals、tasks 解绑、role 软删） | 中途失败 → 任务/目标残留失效的 roleId，形成数据孤岛 |
| `time_management.rs` `tm_upsert_task`（约 L98-103） | INSERT 任务 + DELETE 已完成任务的提醒去重记录 | 提醒记录清理失败 → 记录堆积、任务重新打开后提醒可能不触发 |
| `list/commands.rs` `list_duplicate_list`（约 L202-262） | 逐条 INSERT 复制 groups/notes | 中途失败 → 复制出半个清单 |

**修复建议**：统一用 `conn.transaction()` 包裹多语句写操作。可在 `db.rs` 中提供一个 `with_txn(conn, |tx| ...)` 辅助函数，一处实现、全模块受益（深模块：把事务复杂度藏进接缝）。

### 2.3 🔴 `daily_review_save` 检查-后-执行竞态（daily_review.rs 约 L115-158）

**问题**：先 SELECT 判断 id/date 是否存在，再决定 target_id，最后 INSERT...ON CONFLICT。两个并发保存（如自动保存与手动切换日期保存同时到达）可能都判断"不存在"，各插一条，产生同日期重复记录。项目此前已发生过 date 字段数据契约问题，此处是同类隐患的根源。

**修复建议**：删掉前置 SELECT，依赖已有的 `idx_daily_reviews_date` 唯一索引直接 `INSERT ... ON CONFLICT(date) DO UPDATE`，把原子性交给数据库。

### 2.4 🔴 `habit_toggle_checkin` 写后读时序（habit.rs 约 L181-218）

**问题**：INSERT...ON CONFLICT 之后立刻 SELECT 回读打卡状态。在 Direct Remote 模式下同一 `conn` 可读到；但代码同时保留了本地 SQLite 降级路径，且回读用 `unwrap_or` 静默降级，若回读失败会返回错误的 `completed` 状态，前端 UI 与库内状态背离。

**修复建议**：利用 `INSERT ... ON CONFLICT ... RETURNING` 一条语句完成写入+回读（libsql 支持），消除时序窗口。

### 2.5 🔴 番茄钟运行态零持久化（pomodoroStore.ts）

**问题**：`mode / phase / isRunning / timeLeft / targetEndTime` 全在内存。应用崩溃、误关或 Windows 更新重启后，正在进行的专注会话彻底丢失且不产生任何 record，用户损失整段专注时长。

**修复建议**：`startTimer` 时将 `{ phase, targetEndTime, linkedTarget, startedAt }` 写入 localStorage；应用启动时检查——若 `targetEndTime` 未到则恢复倒计时，已过则按实际时长补一条 record（或按 `minEffectiveMinutes` 判定是否有效）。改动集中在 store 内部，不扩大接口。

---

## 三、后端 Rust 问题清单

### 3.1 错误处理设计过浅（中等，error.rs）

`AppError` 是纯 String 包装，数据库错误 / 网络错误 / 业务错误全部坍缩成一个字符串。前端 `tauriClient.callSilent` 因此只能"一刀切"降级，无法区分"该重试"（网络抖动）与"该报错"（数据违反约束）。

**建议**：定义错误枚举并携带 `kind` 字段序列化给前端：

```rust
#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum AppError {
    Db { message: String },
    Network { message: String },
    Validation { message: String },
}
```

前后端配套：`tauriClient` 按 `kind` 决定重试/提示/静默。这是一次性的接缝投资，后续所有模块受益。

### 3.2 `unwrap_or_default()` 静默吞错（中等，遍布各模块行映射代码）

如 `habit.rs` L75 附近 `row.get(8).unwrap_or(0)`、`dictionary.rs` 缓存行映射等：列类型不匹配或 schema 漂移时静默返回默认值，而不是暴露问题。Turso schema 由远端管理（本地不建表），schema 漂移风险真实存在。

**建议**：行映射失败至少 `eprintln!`/log 一次告警；关键字段（id、date）失败应返回 Err 而非默认值。

### 3.3 提醒调度器（reminder_scheduler.rs）

- **去重键不含提醒配置**（约 L149）：键为 `{taskId}@{today}:{offsetDays}`，用户当天修改提醒时间后（offsetDays 不变时）新配置当天不会再触发。建议键中加入 `reminder.time`，或修改提醒时清除该任务当日的 fired 记录。
- **时区语义未固定**（约 L39-54）：`deadline`（UTC 毫秒）与 `scheduled_date`（本地日期字符串）混用，换算成"目标日"时未显式指定本地时区。建议统一用 `chrono::Local` 换算并在注释中固定契约。
- **扫描间隔 15s 硬编码**（约 L195）：与前端记忆中"每 30 秒"的契约不一致，说明契约漂移过；提取为常量并写明理由。

### 3.4 CRUD 复制粘贴模式（中等，全模块）

`mission.rs`、`list/commands.rs`、`habit.rs` 等每个命令都是"取 conn → 拼参数 → execute → push_sync"的复制粘贴。已经出现的后果：事务遗漏（2.2 节）分布不均——有的模块记得、有的忘了。

**建议**：不必上宏或 ORM（避免过度抽象），只需两个辅助函数收口：
- `exec_synced(db, sql, params)` —— execute + push_sync；
- `with_txn(db, |tx| ...)` —— 事务包裹 + push_sync。

### 3.5 其他后端问题（轻微）

| 位置 | 问题 | 建议 |
|---|---|---|
| `daily_review.rs` L34-55 | created_at/updated_at 逐行尝试 Integer/Real/Text 多格式解析 | 数据一次性迁移为统一 UNIX 毫秒，删除运行时格式推断 |
| `time_management.rs` L46 | SQL 内 `CAST(strftime...)` 逐行换算时间 | 存储层统一毫秒时间戳 |
| `habit_load_all` | habits 与 checkins 两次查询（远程模式两次网络往返） | 可接受；若列表变大改 LEFT JOIN |
| `mission_update_goal` L218 | COALESCE 部分字段用、部分不用，`start_date/end_date` 无法显式置 NULL | 统一部分更新语义 |
| `pomodoro.rs` L74/L100 | `linked_target` JSON 反序列化失败静默 `.ok()` 丢弃 | 失败时打日志 |
| `db.rs` `db_sync_now` | 返回值是给用户看的中文字符串（`"sync_ok: ..."`）| 返回结构化状态，文案交给前端 |
| `tauri.conf.json` L26 | `csp: null` | 至少配置 `default-src 'self'`，词典音频等远程源单独放行 |
| `capabilities/default.json` | `core:window:allow-*` 全量窗口权限 | 按实际用到的窗口操作收窄 |
| `sync.rs` / `db.rs` | `push_sync()`、`start_background_sync` 均为空操作但仍被全模块调用 | 属于 Direct Remote 模式的历史残留；保留接缝可以，但建议在 `push_sync` 文档注释中明确"若未来恢复 replica 模式需实现节流"，避免误解为真在同步 |

---

## 四、前端问题清单（按模块）

### 4.1 time-management

#### 🟠 TimeManagementPanel 自动迁移任务的 effect 自触发（约 L701-714）

`useEffect` 依赖 `[tasks, updateTask]`，effect 内部调用 `updateTask` 又更新 tasks 缓存 → effect 再次执行。当前靠"符合条件的任务第二次不再符合"收敛，但这是**隐式收敛**：一旦筛选条件写出不动点缺陷就变成 mutation 风暴。

**建议**：用 `useRef<Set<string>>` 记录已迁移的 taskId，或将"自动分配 Q2"下沉到 queryFn 的数据规整阶段（读到即修正缓存，不发 mutation；持久化交给下次正常编辑）。

#### 🟠 quickEditWindow 常驻监听器永不卸载（installListeners，L82-114）

`tqe:save/create/closed/shown` 等 `listen()` 返回的 unlisten 全部丢弃，仅 `unlistenPoolFocus` 被追踪。当前靠 `listenersInstalled` 模块级标志保证只注册一次，主窗口存活期内**不算泄漏**；但 `discardPool()` 只清 focus 监听，若未来改为"池销毁即全清"语义，这里就是暗坑。

**建议**：把所有 unlisten 收进一个数组，`discardPool` 统一遍历调用；成本极低，消除对"只注册一次"约定的隐性依赖。

#### 🟡 TanStack Query 无 per-query 配置

`useTimeManagementData` 等 query 依赖 `queryClient.ts` 全局默认。全局 `staleTime: 5min` 对任务四象限合适，但对跨窗口编辑场景（快捷浮层保存后主窗口靠 sync invalidate 刷新）是可行的——前提是 sharedSyncEngine 的 invalidation 链路不出错。建议为核心数据 query 显式声明 `staleTime`，把契约写在代码里而不是依赖全局默认。

#### 🟡 TaskQuickEdit.tsx（710 行）

单文件承担三层浮层 UI + 定位翻转 + 日期/时间/提醒编辑。行数偏大但内聚度尚可；建议只提取 `useLayerPosition` 与日期时间小组件，不必大拆。L344 的 `eslint-disable` 依赖绕过应补注释说明理由。

### 4.2 lists

#### 🟠 ListsPanel.tsx —— 2134 行超大组件

单组件混合 8 类职责：侧边栏、分组排序、DnD、笔记抽屉、5+ 个模态框、批量导入导出、打开方式设置、toast。任何 state 变更都触发全树 re-render；修 bug 与写测试都困难。

**建议**（按深模块原则拆分，每块小接口）：
- `ListsSidebar`（清单/文件夹树 + DnD）
- `NotesGrid`（笔记分组展示 + DnD）
- `NoteDrawer`（抽屉编辑器）
- `ListsModals`（聚合各模态框，由一个 reducer 驱动开关）
- 批量导入导出逻辑移入 `listsService` 或独立 `listsImportExport.ts`（纯函数，可测）

#### 🟠 useListsQuery.ts —— `useListsActions` 返回 18+ 个方法（L188-565）

Lists/Folders/Notes/Groups 四种实体的 action 混在一个 hook。接口过宽（浅模块）：调用方拿到一大把不相关的方法，改一处全体重编译心智。

**建议**：拆为 `useListActions / useFolderActions / useNoteActions / useGroupActions`，各自内部仍复用同一套乐观更新工具函数。

#### 🟡 registerCrossWindowSync（L95-142）

模块级 `crossWindowRegistered` 标志 + 永不 unlisten。主窗口单例场景下可接受（与 quickEditWindow 同理），但闭包捕获的是**首次注册时的 queryClient**。当前 queryClient 是模块级单例所以无碍——建议加一行注释固定该前提，防止未来改为 per-window client 时踩坑。

#### 🟡 listsReorder.ts

多场景拖拽分支复杂（folder 重排 / 跨 folder / 跨 group）。已有 `listsReorder.test.ts` 是好事；建议补齐"拖到自身位置""空目标组""首尾边界"三类用例。

### 4.3 pomodoro

#### 🟠 计时精度依赖 setInterval 唤醒（pomodoroStore.ts tick，约 L301-329）

`tick` 基于 `targetEndTime` 反算剩余时间，这个设计**本身是对的**（不累积漂移）；问题在于结束判定依赖 500ms interval 被及时唤醒——窗口最小化 / 系统节流时 interval 可能数秒不跑，会话完成通知与 record 落库延迟。

**建议**：不必上 Web Worker（过度设计）；在 `visibilitychange`/window focus 事件里补一次 `tick()`，加上恢复逻辑（2.5 节）即可覆盖绝大多数场景。

#### 🟡 records/favoriteTasks 的双写职责重叠

`pomodoroService` 与 `pomodoroStore` 都直接操作 localStorage（`STORAGE_KEY_*` 常量两处重复定义）。数据态应走"store 内存 + service 持久化"单向链路，常量收口到一个文件。

#### 🟡 PomodoroPanel.tsx —— 1176 行

建议拆出 `TimerDisplay`、`HistoryList`、`FavoriteTasks` 三个子组件；`getStats` 全量遍历 records 的计算用 `useMemo(records)` 包裹。

### 4.4 habit

#### 🟠 打卡提醒 `notifiedSetRef` 永不清空（HabitPanel.tsx 约 L888-916）

去重 Set 只增不减：跨天后旧键堆积（轻微内存问题）；更重要的是**用户当天修改 checkInTime 后**，若旧键设计不含时间，新提醒当天不会再触发——与后端 reminder_scheduler 的去重键问题（3.3 节）是同一类缺陷，前后端两处要一起修。

**建议**：键格式固定为 `habitId@date@checkInTime`；每日首次 tick 时清掉非当日的键。

#### 🟡 日期时区契约

打卡日期用本地时区 `YYYY-MM-DD` 字符串。对单机自用应用这是**合理选择**（用户感知的"今天"就是本地日），无需改为 UTC；但应在 `habitTypes.ts` 的 date 字段上写明"本地日期"契约注释，与 daily-review 的 date 字段口径统一（后者曾出过契约事故）。

#### 🟡 HabitPanel.tsx —— 973 行

`CreateEditModal`、日历热力图可拆出；`getStats()/getHabitsForDate()` 在 render 中裸调用，用 `useMemo` 包裹。

### 4.5 daily-review

#### 🟠 useReviewAutoSave 日期切换与防抖竞态（L50-93）

日期切换时立即保存上一日期内容，同时可能有 pending 的 debounced save。两个 save 均为异步 fire-and-forget，若旧日期的 debounced save 晚于新日期加载完成才到达后端，配合 2.3 节的后端竞态，可能产生重复行或旧内容覆盖。

**建议**：
1. 日期切换时**先 cancel 防抖定时器**再同步 flush（保证一个日期只有一条在途保存）；
2. 后端按 2.3 节改为唯一索引 upsert 后，前端竞态的后果自动收敛为"最后写入者胜"。

#### 🟡 硬编码 `MIN_DATE = '2026-07-01'`（DailyReviewPanel.tsx 约 L162-200）

模块上线日期写死在组件里。提取为模块级常量并注释含义（"复盘功能启用日，早于此日期无数据"）。

### 4.6 mission / dictionary / settings

| 位置 | 级别 | 问题 | 建议 |
|---|---|---|---|
| MissionPanel.tsx L37-64 | 🟡 | statement 从 query 更新时 editor 同步 effect 无 cleanup，旧 save timeout 可能在切换后执行 | effect cleanup 中 clear saveTimer |
| DictionaryWindow.tsx L95-112 | 🟡 | async init 中 `onResized` 的 unlisten 若 init 中途抛错则泄漏 | 用局部变量 + try/finally 保证 cleanup 拿到 unlisten |
| useDictionaryHotkey.ts | 🟡 | 快捷键无节流，连按可能并发触发多次 resolveInitialWord/开窗 | 加 300ms 节流或 in-flight 标志 |
| preferencesStore.ts L37 | 🟠 | `init()` 只回填 5 个白名单 key；新增偏好若忘记加入白名单，换设备/清缓存后静默丢失——这是**易踩的扩展陷阱** | 改为启动时 `SELECT pref_key, pref_value FROM app_preferences` 全量回填（表很小），彻底删除白名单 |
| preferencesStore.ts L31 | 🟡 | SQLite 写 best-effort 无失败反馈，crash 窗口内两层可能不一致 | 可接受的权衡（localStorage 为准），但 `callSilent` 失败应 log 告警 |
| DatabaseSettingsPanel.tsx | 🟡 | 多处 any | 用 `TursoConfigJson` 对应的前端类型 |

---

## 五、基础设施与编辑器问题

### 5.1 tauriClient.ts（🟠）

- `callSilent` 的静默降级不区分"后端不可用"与"业务校验失败"，两者都返回 fallback。配合 3.1 节的错误 kind 改造：网络类静默降级，业务类应向上抛。
- 错误日志建议固定包含 `cmd` 名与参数摘要，便于定位。

### 5.2 dateUtils.ts（🟠）

`daysBetween` 用 `new Date(dateStr)` 解析——注意 `"2024-01-15"` 这种纯日期串会被 JS 按 **UTC 午夜**解析，再 `setHours(0,0,0,0)` 转本地，东八区结果正确纯属巧合（UTC 午夜=本地 8 点，归零后仍是同一天），西半球时区会**差一天**。且跨夏令时的毫秒差不是 24h 整倍数。

**建议**：`parseYMD` 手动 split 后 `new Date(y, m-1, d)` 构造本地日期；天数差用 `Math.round` 而非截断，抵消 DST 的 ±1h。补时区/DST 单测。

### 5.3 jsonMarkdownAdapter.ts（🟠）

`renderNodeToMarkdown` 的 default 分支把未知节点类型静默降级为纯文本——自定义扩展节点（CollapsibleList、iframe 等）在"导出 Markdown → 再导入"的往返中**丢失结构**。

**建议**：default 分支对未知类型 log 一次告警；导出场景明确标注"有损转换"；若需要无损备份，导出 TipTap JSON 原文。

### 5.4 patchEnv.ts（🟡，已知 hack，控制风险即可）

- 拦截 `console.error` 过滤 Yjs 告警：过滤条件要尽量精确（匹配完整告警文案），避免吞掉真实错误。
- 全局 `getContext` 强制 `willReadFrequently: true`：影响所有 canvas，含第三方库。建议注释写明是为哪个库打的补丁，并在该库升级后回归验证是否可移除。
- 根治方向：Yjs 重复导入优先用 `resolve.dedupe`（vite 配置已有雏形）解决，解决后删掉对应 hack。

### 5.5 跨窗口同步双链路（🟡）

`AppLayout` 监听 Tauri `db:synced` 事件、`useSyncQueryInvalidator` 监听 `sharedSyncEngine.onSync`，两条链路都会 invalidate query。功能上互补（一个管跨窗口、一个管本窗口写完成），但语义未文档化，容易被误当成重复代码删掉一条。建议在两处互相引用注释，说明各自覆盖的场景。

### 5.6 构建与依赖（🟡）

- `vite.config.ts` 无 `manualChunks`：编辑器（tiptap 全家桶 + lowlight + katex 等重量级依赖）与首屏打在一起。建议按 feature 做 `React.lazy` + manualChunks（editor 单独一个 chunk 收益最大）。
- `@tiptap/*` 存在 3.27.4 / 3.28.0 混版，建议用 pnpm overrides 统一（项目已有 overrides 实践规范）。
- `tiptap-markdown` 与自研 `jsonMarkdownAdapter` 功能部分重叠，评估二选一。
- `EditorClient.tsx` 只做 mounted 检查的 wrapper 疑似死代码；`main.tsx` TOOL_REGISTRY 的空 component 字段同理——确认后删除。

---

## 六、性能优化专项

按投入产出比排序：

1. **Selector 记忆化**（低成本高收益）：`listsSelectors / habitSelectors / dailyReviewSelectors` 全部是纯函数但在 render 中裸调用。在消费处统一 `useMemo(() => selector(data), [data])`，或在各 query hook 内返回派生结果。
2. **大组件重渲染**：ListsPanel / TimeManagementPanel 中大量 inline handler 使子组件 memo 失效。拆组件（4.2 节）本身就是最大的重渲染优化；拆完后再对列表项加 `React.memo` + `useCallback`。
3. **Bundle 分割**（5.6 节）：editor chunk 独立 + 各 panel lazy 化，改善冷启动。
4. **CollapsibleList decorations 全树遍历**：大文档下编辑卡顿的主要嫌疑。改为基于事务的增量映射（`tr.mapping`）而非每次全量重建 decorations。
5. **Emoji suggestion 全量线性过滤**：查询时对 48KB 列表 filter。预构建按首字母分桶的索引即可，无需 trie。
6. **后端逐行时间格式推断**（3.5 节）：数据迁移统一格式后删除多格式解析。

**明确不建议做的**（避免过度优化）：
- 给番茄钟上 Web Worker 计时（visibilitychange 补 tick 已够）；
- 给单机应用引入 WebSocket 实时失效（Tauri 事件已覆盖）；
- 后端引入连接池/ORM（libsql 直连模式下单连接够用）。

---

## 七、架构与代码质量改进

### 7.1 深模块视角的结构问题

- **浅模块**：`useListsActions`（18+ 方法宽接口）、`timeManagementTypes.ts` 的 `export * from "@humanmanual/core"`（把 core 的全部类型再导出，调用方无从知道哪些是本模块契约）。→ 收窄为显式命名导出。
- **深模块典范可推广**：`quickEditWindow.ts` 对外只暴露 3 个函数（prewarm/open/requestCloseLayer），池化、DPI、session 全部藏在内部——lists 的批量导入导出、pomodoro 的持久化都可以照此收口。
- **接缝缺失**：后端事务/同步逻辑散落在每个 command 里（3.4 节），是"复杂度未藏进接缝"的典型。

### 7.2 类型安全

- `as Partial<Task>`（quickEditWindow fromWire）、`as any[]`（Editor extensions）、DatabaseSettingsPanel 的 any——IPC 边界建议定义 wire 类型 + 窄化函数，编辑器处至少收窄为 `AnyExtension[]`。
- IPC 参数当前无运行时校验；单机应用可不上 zod，但 wire 格式（null↔undefined 约定）应有类型层表达（如 `type Wire<T> = { [K in keyof T]: T[K] | null }`）。

### 7.3 一致性小项

- 常量重复：`EMPTY_TASKS`、`STORAGE_KEY_*` 多处定义 → 收口。
- 后端 `db_sync_now` 返回中文 UI 文案 → 返回结构化状态。
- `habit.rs` 中 `reminder` 与 `check_in_time` 双字段同源 → 明确语义或合并。

---

## 八、测试覆盖缺口

现有测试仅 2 个文件（`createSyncEngine.test.ts`、`listsReorder.test.ts`），质量尚可但覆盖面窄。按风险优先补：

| 优先级 | 目标 | 理由 |
|---|---|---|
| P1 | `dateUtils`（时区/DST/跨月边界） | 已发现真实缺陷（5.2） |
| P1 | `jsonMarkdownAdapter` 各节点类型往返 | 已发现数据丢失路径（5.3） |
| P1 | `useReviewAutoSave`（日期切换 + 防抖交错时序，fake timers） | 已发现竞态（4.5） |
| P2 | `listsReorder` 补边界用例 | 分支复杂 |
| P2 | 后端 `daily_review_save` 并发 upsert（Rust 集成测试，本地 SQLite 模式即可跑） | P0 修复的回归保护 |
| P3 | preferencesStore init 回填 | 白名单陷阱回归 |

---

## 九、修复路线图

### 第一批（立即，安全与数据一致性）
1. **轮换 Turso 令牌 + 移出仓库/二进制**（2.1）
2. 后端级联写操作补事务，新增 `with_txn` 辅助（2.2）
3. `daily_review_save` 改唯一索引 upsert（2.3）+ `useReviewAutoSave` 切日期先 cancel 防抖（4.5）
4. `habit_toggle_checkin` 改 RETURNING（2.4）

### 第二批（1-2 周，健壮性与核心体验）
5. 番茄钟运行态持久化 + visibilitychange 补 tick（2.5、6.4）
6. `error.rs` 错误枚举 + `tauriClient` 按 kind 处理（3.1、5.1）
7. 提醒去重键前后端一起修（3.3、4.4）
8. `dateUtils` 时区修复 + 单测（5.2）
9. preferencesStore 全量回填（4.6）

### 第三批（1 个月，可维护性与性能）
10. ListsPanel 拆分（4.2）→ 顺带完成重渲染优化
11. `useListsActions` 拆分、selector 记忆化
12. bundle 分割 + tiptap 版本统一
13. PomodoroPanel / HabitPanel 拆分

### 第四批（持续）
14. jsonMarkdownAdapter 告警与测试、CSP/capabilities 收窄、类型收紧、死代码清理

---

## 十、附录：已核验的误报

审查过程中以下疑似问题经人工核对源码后**排除**，记录在此防止重复排查：

1. **"前端任务提醒调度逻辑缺失"** —— 误报。`taskReminderScheduler.ts` 仅保留辅助函数是**有意设计**：桌面端提醒已迁移至 Rust 后端 `reminder_scheduler.rs` 守护线程（文件头注释已说明）。前端无需重复实现 30 秒扫描。
2. **"useSyncQueryInvalidator 事件监听泄漏"** —— 误报。该 hook 的 `useEffect` 正确返回了 `unsubscribe`，cleanup 链路完整。
3. **"sharedSyncEngine 同键调度导致快速编辑丢字段"** —— 误报。`updateTask` 每次调度捕获的是**合并后的完整 task 对象**（`{ ...t, ...updates }` 基于最新缓存），同键防抖只会用更完整的快照替换旧快照，不会丢失先前字段。这正是防抖批量持久化的预期行为。

---

*本文档由全量代码审查生成：后端 16 个 Rust 源文件与配置、前端 11 个 feature 模块 + lib/layout/editor 基础设施，共 4 路并行深度审查 + 关键结论人工核验。*
