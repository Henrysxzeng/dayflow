# DayFlow · 完整技术参考文档

> 写给下一个接手此项目的开发者或 AI 助手。读完本文档应能完全理解项目架构、数据结构、业务逻辑，并能独立进行开发迭代。

**项目名称：** DayFlow  
**类型：** 微信小程序（含云开发后端）  
**核心功能：** AI 驱动的每日任务规划助手  
**开发完成时间：** 2026年5月  

---

## 一、技术栈

| 层级 | 技术 |
|------|------|
| 前端 | 微信小程序原生（WXML / WXSS / JS） |
| 后端 | 腾讯云开发 CloudBase（Serverless） |
| 数据库 | 云开发 CloudDB（MongoDB） |
| AI | DeepSeek API（`deepseek-chat` 模型） |
| 推送 | 微信订阅消息 API |
| 定时任务 | 云开发定时触发器（Cron） |

**环境信息：**
- 小程序 AppID：`wxd0de3ba5bb35cb1d`
- 云开发环境 ID：`cloudbase-d8g5men5j0e2712cd`
- DeepSeek API Key：存储在云函数环境变量 `DEEPSEEK_API_KEY`（不在代码中）
- 订阅消息模板 ID：`J1dVGMwQvPuVfQZJBxoQc9lZk9aCHIvQREa5kewt14w`

---

## 二、项目目录结构

```
DayFlow/
├── docs/                          # 产品与技术文档
│   ├── 01_requirements_analysis.md
│   ├── 02_technical_architecture.md
│   ├── 03_ux_prototype.md
│   ├── 04_dev_setup_guide.md
│   ├── 05_product_manual.md
│   └── 06_technical_reference.md  ← 本文件
├── dev/
│   ├── project.config.json        # 微信项目配置（含 AppID）
│   ├── miniprogram/               # 前端代码
│   │   ├── app.js                 # 云开发初始化
│   │   ├── app.json               # 页面路由 + Tab Bar
│   │   ├── app.wxss               # 全局设计系统（颜色、组件）
│   │   ├── pages/
│   │   │   ├── index/             # 今日计划页（核心页面）
│   │   │   ├── tasks/             # 任务清单页
│   │   │   ├── add-task/          # 新建任务页
│   │   │   ├── profile/           # 我的页面
│   │   │   └── privacy/           # 隐私政策页
│   │   └── utils/
│   │       ├── api.js             # 云函数调用封装（callCloud）
│   │       └── date.js            # 日期工具函数
│   └── cloudfunctions/            # 20个云函数
│       ├── generatePlan/          ★ 核心：AI生成每日计划
│       ├── getUserInfo/           ★ 核心：获取用户完整状态
│       ├── completeTask/          ★ 核心：完成任务+成就+Streak
│       ├── addTask/
│       ├── getTasks/
│       ├── getTodayPlan/
│       ├── deleteTask/
│       ├── savePushAuth/
│       ├── updateSettings/
│       ├── markRestDay/
│       ├── useJoker/
│       ├── addFailureReason/
│       ├── generateWeeklySummary/
│       ├── eveningPush/
│       ├── morningPush/
│       ├── nightlyProcess/
│       ├── fridayReminder/
│       ├── saveWeeklyNote/
│       ├── getChallengeInfo/
│       └── joinChallenge/
└── .gitignore
```

---

## 三、数据库设计（8个集合）

### 3.1 `users` — 用户主表

```javascript
{
  _id: "openid_xxxxx",           // 微信 openid，作为主键
  settings: {
    wake_time: "08:00",          // 推送时间
    default_daily_hours: 4,      // 默认可用时长
    ai_tone: "friendly"          // friendly | strict | snarky
  },
  streak: {
    current: 12,                 // 当前连续天数
    longest: 25,                 // 历史最长
    last_active_date: "2026-05-17", // 最后活跃日期（YYYY-MM-DD）
    jokers_remaining: 1          // 免死金牌剩余次数
  },
  total_completed: 47,           // 累计完成任务数
  achievements: ["first_complete", "streak_7"],  // 已解锁成就ID数组
  pending_achievements: [],      // 待弹窗展示的新成就（展示后清空）
  pending_failure_tags: [        // 待用户标记原因的未完成任务
    { task_id: "xxx", task_title: "xxx", date: "2026-05-17" }
  ],
  next_week_note: "下周重点：完成期末报告", // 周五预载备注
  is_new_user: false,
  created_at: Date,
  updated_at: Date
}
```

### 3.2 `tasks` — 任务表

```javascript
{
  _id: "auto",
  user_id: "openid_xxxxx",
  title: "完成 Q2 报告",
  description: "包含数据分析部分",
  deadline: "2026-05-19 17:00",  // 可精确到时间
  estimated_minutes: 90,
  importance: 3,                 // 1-4，用户填写
  urgency: 2,                    // 自动计算
  quadrant: "Q1",                // Q1-Q4，四象限
  is_fragment: false,            // true = 碎片任务（≤10分钟）
  status: "pending",             // pending|in_plan|completed|needs_breakdown|deferred
  time_accuracy: "more",         // 完成后用户反馈：less|same|more|much_more
  fail_history: [                // 未完成记录
    { date: "2026-05-15", reason: "too_hard" }  // too_hard|no_time|dont_want
  ],
  fail_count: 1,
  parent_task_id: null,          // 非空时为拆解后的子任务
  created_at: Date,
  completed_at: null
}
```

### 3.3 `daily_plans` — 每日计划表

```javascript
{
  _id: "auto",
  user_id: "openid_xxxxx",
  plan_date: "2026-05-17",       // YYYY-MM-DD
  available_hours: 3,
  hours_source: "user_input",    // user_input | default
  schedule_constraints: "上午10-11点开会", // 用户填写的时间约束
  selected_task_ids: ["t1","t2","t3"],  // 主计划任务ID数组
  fragment_task_ids: ["t4","t5"],       // 随手清空任务ID数组
  busy_slots: [                         // AI识别的忙碌时段
    { start: "10:00", end: "11:00", label: "开会" },
    { start: "12:00", end: "13:30", label: "午饭休息" }
  ],
  plan_text: "今天时间紧，先搞定最重要的两件...", // AI生成的今日摘要
  ai_raw: { ... },               // AI 原始返回（含 main_plan 数组，每项含 suggested_start_time）
  context: {                     // 生成时的上下文（新鲜开始、完成率、时间校准）
    freshStart: "今天是周一，新的一周...",
    recentRate: 73,
    rateAdvice: "完成率正常，按常规安排",
    calibrationFactor: 1.3
  },
  generated_at: Date,
  regenerated_count: 0,
  next_day_auth: false
}
```

### 3.4 `daily_logs` — 每日执行记录

```javascript
{
  _id: "auto",
  user_id: "openid_xxxxx",
  log_date: "2026-05-17",
  tasks_planned: 3,
  tasks_completed: 2,
  tasks_deferred: 1,
  is_rest_day: false,            // true = 用户主动标记的休息日
  created_at: Date
}
```

### 3.5 `push_auth` — 推送授权记录

```javascript
{
  _id: "auto",
  user_id: "openid_xxxxx",
  target_date: "2026-05-18",    // 授权用于哪天的推送
  used: false,                   // 是否已发送
  authorized_at: Date
}
```

### 3.6 `weekly_summaries` — 每周AI总结缓存

```javascript
{
  _id: "auto",
  user_id: "openid_xxxxx",
  week_start: "2026-05-12",
  week_end: "2026-05-18",
  summary_text: "这周你完成了23件事...",  // AI生成的总结文本
  stats: { totalCompleted: 23, totalPlanned: 28, activeDays: 5, restDays: 2, rate: 82 },
  created_at: Date
}
```

### 3.7 `monthly_challenges` — 月度挑战配置（全局共享）

```javascript
{
  _id: "auto",
  month_key: "2026-05",
  title: "五月挑战",
  desc: "连续14天完成计划",
  goal_type: "streak",          // streak | tasks（累计任务数）
  goal_value: 14,
  start_date: "2026-05-01",
  end_date: "2026-05-31",
  created_at: Date
}
```

### 3.8 `challenge_participants` — 挑战参与记录

```javascript
{
  _id: "auto",
  user_id: "openid_xxxxx",
  month_key: "2026-05",
  joined_at: Date,
  completed: false,
  completed_at: null
}
```

---

## 四、云函数详解（20个）

### ★ generatePlan（核心，AI生成每日计划）

**触发：** 用户选择可用时长后，前端调用

**入参：**
```javascript
{
  availableHours: 3,              // 今日可用小时数
  date: "2026-05-17",            // 日期字符串
  scheduleConstraints: "上午10-11点开会"  // 可选，时间约束自然语言
}
```

**核心逻辑：**
1. 并行查询：待完成任务列表、用户信息、近7天日志
2. 计算3个上下文信息：
   - **新鲜开始检测**：周一/月初调整AI语气
   - **近期完成率**：< 50% 少排任务重建信心，> 75% 可增加挑战
   - **时间校准系数**：查询已完成任务的 `time_accuracy` 字段，计算平均偏差，若用户系统性低估则传给AI
3. 拼装 System Prompt（含人类能量曲线、任务类型匹配规则、排期硬性规定）
4. 调用 DeepSeek API（`deepseek-chat`，JSON mode，temperature=0.6）
5. 解析AI返回：main_plan（含建议时段）、busy_slots（含自动午饭块）、summary
6. 写入/更新 `daily_plans` 集合
7. 将选中任务状态更新为 `in_plan`

**出参：** `{ plan: { _id, selected_task_ids_data, fragment_task_ids_data, busy_slots, plan_text, ... } }`

**环境变量：** `DEEPSEEK_API_KEY`，超时：60秒

---

### ★ getUserInfo（用户状态中心）

**触发：** 每次进入首页/我的页面时调用

**核心逻辑：**
1. 尝试获取用户文档，不存在则创建（新用户初始化）
2. 计算 Streak 状态：`last_active_date` 与今天/昨天比较
3. 判断是否需要显示免死金牌（`showJoker`）
4. 查询未完成任务数量（判断 `isNewUser`）
5. 统计时间校准数据点数量（`calibrationDataPoints`）
6. 读取近7天日志，计算完成率
7. 读取并清空 `pending_achievements`（成就消费型推送）
8. 返回完整用户状态供前端渲染

**超时：** 20秒

---

### ★ completeTask（完成任务）

**触发：** 用户勾选任务完成

**入参：** `{ taskId, planId, timeAccuracy? }` —— `timeAccuracy` 为可选的用时反馈（less|same|more|much_more）

**核心逻辑：**
1. 更新任务状态为 `completed`，可选写入 `time_accuracy`
2. 更新/创建今日 `daily_logs`（+1 tasks_completed）
3. 计算新 Streak：
   - `last_active_date === today` → 不变
   - `last_active_date === yesterday` → +1
   - 其他 → 重置为 1
4. 检查成就解锁（7个里程碑，见代码中 ACHIEVEMENTS 数组）
5. 新成就写入 `users.pending_achievements`（前端下次打开时弹窗展示）

**超时：** 20秒

---

### morningPush（晨间推送，定时触发）

**Cron：** `0 50 7 * * * *`（每天07:50）

**逻辑：**
1. 查询 `push_auth` 中 `target_date === 今天 && used === false` 的记录
2. 对每个授权用户：
   - 查询其待完成任务
   - 调用 DeepSeek 生成初步计划（用默认时长）
   - 写入 `daily_plans`（`hours_source: 'default'`）
   - 发送微信订阅消息
   - 标记 `push_auth.used = true`

**超时：** 60秒

---

### nightlyProcess（夜间处理，定时触发）

**Cron：** `0 0 23 * * * *`（每天23:00）

**逻辑：**
1. 查询今天所有 `daily_plans`
2. 找出状态仍为 `in_plan`（未完成）的任务
3. 更新失败记录，`fail_count >= 2 && reason === 'too_hard'` → 状态改为 `needs_breakdown`
4. 将未完成任务 push 到 `users.pending_failure_tags`（明早让用户标原因）
5. 更新 `daily_logs` 的 `tasks_deferred` 字段

**超时：** 60秒

---

### eveningPush（晚间再激活，定时触发）

**Cron：** `0 0 20 * * * *`（每天20:00）

发送给今天有计划但未完成任务的用户，提醒"今天还有X件事没完成"。

**超时：** 20秒

---

### fridayReminder（周五预载提醒，定时触发）

**Cron：** `0 0 18 * * 5 *`（每周五18:00）

发送给授权用户："一周结束了，告诉Flow下周最重要的事"。用户填写的备注存入 `users.next_week_note`，周一生成计划时读取。

**超时：** 20秒

---

### generateWeeklySummary（每周AI总结）

**触发：** 用户打开"我的"页面时前端调用

**逻辑：**
1. 查询本周是否已有缓存（`weekly_summaries` 集合）
2. 有则直接返回，无则：
   - 查询本周 `daily_logs`
   - 调用 DeepSeek 生成80字以内的个性化总结
   - 写入 `weekly_summaries` 缓存

**超时：** 60秒

---

### getChallengeInfo（社区月度挑战）

**触发：** 用户打开"我的"页面

**逻辑：**
1. 查询本月挑战配置（`monthly_challenges`），不存在则按模板自动创建
2. 查询用户参与记录（`challenge_participants`）
3. 根据 `goal_type` 计算用户进度（streak 或 本月完成任务数）
4. 统计总参与人数

**超时：** 20秒

---

### 其余云函数（简单 CRUD）

| 云函数 | 功能 |
|--------|------|
| `addTask` | 创建任务，自动计算四象限、is_fragment |
| `getTasks` | 查询用户所有任务 |
| `getTodayPlan` | 查询今日计划并关联任务数据 |
| `deleteTask` | 删除任务（验证所有权） |
| `savePushAuth` | 写入次日推送授权 |
| `updateSettings` | 更新用户设置（ai_tone、wake_time 等） |
| `markRestDay` | 标记今日为休息日，Streak 逻辑同 completeTask |
| `useJoker` | 消耗一张免死金牌，恢复 last_active_date |
| `addFailureReason` | 提交任务失败原因，从 pending_failure_tags 中移除 |
| `saveWeeklyNote` | 保存周五预载备注到 users.next_week_note |
| `joinChallenge` | 加入本月社区挑战 |

---

## 五、前端页面详解

### pages/index（今日计划页，核心）

**状态机（关键 data 字段）：**

```
showOnboarding → showRestDay → waitingForSchedule → planReady → allTasksDone
     ↓               ↓               ↓                 ↓             ↓
  无任务引导     今天休息/无任务     时间约束输入      正常计划展示    全部完成
```

**特殊状态（浮层，高于正常内容）：**
- `showAchievement`：成就解锁浮层（队列式，一个个展示）
- `showJoker`：免死金牌浮层
- `showFailureTag`：昨日任务失败原因标签（队列式）
- `showCompletion`：今日全部完成庆祝页
- `showTimeTracker`：完成任务后的用时反馈（4选1）
- `showPomodoro`：番茄钟全屏专注模式
- `showFridayPlanning`：周五预载浮层

**页面加载流程（initPage）：**
```
getUserInfo → 检查成就/金牌/失败标签/新用户 → getTodayPlan
→ 有计划 → applyPlan（检查任务是否全空/全完成）
→ 无计划 → getTasks → 有任务则显示时长选择，无任务则 showRestDay
```

**番茄钟实现：**
使用 `setInterval` + `Date.now()` 时间戳计时，`onHide` 清除 interval，`onShow` 重新计算剩余时间。25分钟专注 → 振动提醒 → 可选5分钟休息。

### pages/tasks（任务清单页）

按四象限（Q1-Q4）分组展示，随手清空单独列。每张卡片：
- 点主体 → 标为完成确认框
- 点 `···` → 删除任务确认框（红色）

### pages/add-task（新建任务页）

- 截止日期 + 时间（两个 picker，日期选完才显示时间选择）
- 预计用时：preset chips + "自定义"（自定义时显示数字输入框）
- ≤10分钟自动提示进入随手清空
- 重要程度：4个 chips（低/中/高/非常高）

### pages/profile（我的页面）

- 分享本月成绩（`button open-type="share"` + `onShareAppMessage`）
- 成就徽章展示
- 社区月度挑战（进度条、参与人数、加入按钮）
- 每周 AI 总结（懒加载，首次打开时触发生成）
- 七日完成率趋势图（固定7个柱，无数据天显示 0）
- 本周数据（完成率上限100%）
- 时间校准分析（锁定/解锁，10次用时反馈后解锁）
- AI 风格设置（温暖友好/严厉教练/毒舌朋友）
- 隐私政策入口

---

## 六、AI 集成详解

### DeepSeek API 调用方式

```javascript
// 使用 Node.js 内置 https 模块（无需额外依赖）
POST https://api.deepseek.com/v1/chat/completions
Headers: { Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}` }
Body: { model: 'deepseek-chat', response_format: { type: 'json_object' }, temperature: 0.6 }
```

### System Prompt 设计原则（generatePlan）

**核心分四段：**
1. **人类能量曲线**：早8-12黄金时段、午12-13:30强制空出、午后低谷、下午第二高效期
2. **任务类型匹配**：难任务→早上，沟通→下午，回邮件→低谷期
3. **硬性排期规则**：午饭不排任务、任务间15分钟缓冲、默认8:30开始
4. **note字段**：必须引用科学原理（前额叶活跃、帕金森定律、蔡格尼克效应等）

### 动态上下文注入

每次生成计划时，会在 User Prompt 里注入：
- `freshStart`：周一/月初标记，AI 调整语气强化新起点仪式感
- `recentRate`：近7天完成率，< 50% 减少任务数，> 75% 增加挑战
- `calibrationFactor`：时间校准系数（如 1.3 表示用户习惯性低估30%），AI 在排期时乘以该系数

---

## 七、定时任务配置

| 云函数 | Cron 表达式 | 说明 |
|--------|------------|------|
| `morningPush` | `0 50 7 * * * *` | 每天07:50生成并推送 |
| `nightlyProcess` | `0 0 23 * * * *` | 每天23:00处理未完成任务 |
| `eveningPush` | `0 0 20 * * * *` | 每天20:00再激活推送 |
| `fridayReminder` | `0 0 18 * * 5 *` | 每周五18:00周计划提醒 |

在云开发控制台 → 云函数 → 对应函数 → 配置 → 定时触发器中设置。

---

## 八、超时配置

| 函数 | 超时 | 原因 |
|------|------|------|
| generatePlan / morningPush / generateWeeklySummary / nightlyProcess | 60s | 调用 DeepSeek 需要5-20秒 |
| getUserInfo / getChallengeInfo / completeTask / getTodayPlan / eveningPush / fridayReminder | 20s | 多次 DB 查询 |
| 其余14个 | 10s | 简单 CRUD |

---

## 九、权限配置

**集合权限：**
- `users / tasks / daily_plans / daily_logs / push_auth / weekly_summaries / challenge_participants`：**仅创建者可读写**
- `monthly_challenges`：**所有用户可读，仅管理端可写**

> 注意：云函数始终以管理员权限运行，权限设置仅影响小程序直接访问数据库（本项目不使用直接访问）。

---

## 十、业务流程图

### 用户每日使用流程

```
早8点 → morningPush 推送 → 用户点击
→ 选择今日时长（可填时间约束）
→ generatePlan（AI生成，5-15秒）
→ 显示任务列表（含时间段和科学注释）
→ 专注执行（可用番茄钟）
→ 逐一勾选 → 弹出用时反馈（4选1）
→ 全部完成 → 庆祝页 → 授权明日推送

晚8点 → eveningPush（未完成时推送）
晚11点 → nightlyProcess → 处理未完成任务 → 写入 pending_failure_tags
第二天早上 → 弹出失败原因标签 → 用户选择原因 → 清空队列 → 正常流程
```

### Streak 逻辑

```
completeTask 或 markRestDay 调用时：
  last_active_date === today → 不变
  last_active_date === yesterday → +1
  其他（超过1天未活跃）→ 重置为 1

免死金牌（useJoker）：
  将 last_active_date 改为 today，jokers_remaining - 1
  Streak 数字不变
```

---

## 十一、已知问题与优化方向

**已知问题：**
1. `tasks_planned` 在 `daily_logs` 里有时记录不准确（completeTask 首次创建 log 时写死为 1），导致完成率可能超过100%。前端已加 `Math.min(100, ...)` 做上限。
2. 社区挑战中 `goal_type === 'tasks'` 时，进度统计依赖 `daily_logs` 的 `tasks_completed` 字段，该字段同上可能不准。
3. 番茄钟仅前端计时，不持久化，App 被系统杀死后丢失。

**后续优化方向：**
1. 番茄钟：云端记录专注记录，页面重新打开后恢复
2. 个性化洞察：积累30天数据后，AI 分析用户拖延规律和高效时段
3. 好友挑战：生成挑战分享卡，好友点击进入 DayFlow
4. 订阅付费：Streak > 30天的用户转化率最高，加 Pro 功能
5. 年度 Wrapped 报告：仿 Spotify Wrapped，年底生成分享卡

---

## 十二、本地开发环境搭建

详见 `docs/04_dev_setup_guide.md`，关键步骤：

1. 注册微信小程序账号（mp.weixin.qq.com）
2. 下载微信开发者工具
3. 导入 `dev/` 目录
4. 填入 AppID（`project.config.json`）和云开发 ENV ID（`app.js`）
5. 在云函数控制台配置 `DEEPSEEK_API_KEY` 环境变量
6. 部署所有云函数（右键→上传并部署：云端安装依赖）
7. 创建8个数据库集合
8. 设置4个定时触发器
