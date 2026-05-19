# FlowCast · 项目备注

## 项目信息

| 项目 | 内容 |
|------|------|
| 名称 | FlowCast（原名 DayFlow） |
| 类型 | 微信小程序 |
| AppID | `wxd0de3ba5bb35cb1d` |
| 云环境 ID | `cloudbase-d8g5men5j0e2712cd` |
| GitHub | https://github.com/Henrysxzeng/dayflow |
| 服务类目 | 工具 / 办公 |
| 当前阶段 | 体验版 1.3.0，ICP 备案进行中 |

---

## 推送系统架构

```
用户订阅 → push_auth 记录 → 定时触发器 → 云函数 → WeChat API → 用户收到消息
```

| 推送类型 | 云函数 | 触发时间 | 模板 ID |
|----------|--------|----------|---------|
| 晨间AI计划 | morningPush | 每天 07:50 | `P9sWcD2pBtrsB4MZzhULtQw65HMXPCE_Hsx5QSZ_J-k` |
| 晚间未完成 | eveningPush | 每天 20:00 | `WwdP2DizjA9fmYOIOqKd-yWFcCFKmBg9h-TLm4U8r4E` |
| 周五下周预载 | fridayReminder | 每周五 18:00 | `J1dVGMwQvPuVfQZJBxoQc9lZk9aCHIvQREa5kewt14w` |
| 截止倒计时 | deadlineReminder | 每30分钟 | `J1dVGMwQvPuVfQZJBxoQc9lZk9aCHIvQREa5kewt14w` |
| 夜间处理 | nightlyProcess | 每天 23:00 | — |

### 订阅授权流程

- **通用推送（morning/evening/friday）**：首页自动弹窗 → `savePushAuth` 创建记录
- **逐任务推送（deadline）**：编辑任务开启提醒 → 即时弹授权 → `saveTaskPushAuth` 创建记录
- **关键限制**：微信订阅消息一次授权只能发一条，每次都需要重新授权
- **43101 处理**：用户拒绝/订阅过期时标记 `used: true`，避免无限重试

---

## 关键云函数说明

### AI 相关

| 函数 | 调用 DeepSeek | 说明 |
|------|---------------|------|
| `generatePlan` | ✅ | 核心规划：能量曲线 + 校准因子 + 约束+ 今日截止 |
| `morningPush` | ✅ | 早间自动生成计划并推送 |
| `generateWeeklySummary` | ✅ | 每周个性化总结 |

### 推送相关

| 函数 | 关键逻辑 |
|------|---------|
| `deadlineReminder` | 查 push_auth → 查 task → 判断提醒窗口 → 推送。不传 target_date |
| `eveningPush` | 查 plan → 查未完成 tasks → 查 push_auth → 推送 |
| `morningPush` | 查 push_auth(target_date=today) → 调 AI → 推送 |
| `fridayReminder` | 查 push_auth(push_type=friday) → 查 daily_logs → 推送 |

---

## 数据库核心集合

| 集合 | 用途 |
|------|------|
| `users` | 用户文档（设置、成就、连续打卡、Pomodoro 状态、好友码） |
| `tasks` | 任务文档（标题、截止日期、估计时长、重要性、状态、失败原因） |
| `daily_plans` | AI 生成计划（task_ids + ai_raw 含 main_plan/fragment_plan） |
| `daily_logs` | 每日表现（完成任务数、情绪、是否休息日） |
| `push_auth` | 推送授权（push_type + target_date + used + task_id） |
| `friendships` | 好友关系（默契度、共同完成数） |
| `shared_tasks` | 共同任务 |

---

## 部署清单

### 首次部署后需操作

1. 所有云函数 → 上传并部署：云端安装依赖
2. 定时触发器函数 → 上传触发器（`deadlineReminder`、`eveningPush`、`morningPush`、`fridayReminder`、`nightlyProcess`）
3. 云函数环境变量 → 设置 `DEEPSEEK_API_KEY` 和 `APP_SECRET`
4. 数据库集合 → 创建所需集合（首次）

### 每次更新后

1. 修改的云函数 → 上传并部署
2. 修改的触发器 → 上传触发器
3. 小程序 → 编译 → 上传体验版

---

## 已知限制

- 微信订阅消息一次授权只能发一条，无法实现"授权一次每天自动推送"
- `wx.requestSubscribeMessage` 必须在用户手势上下文中调用（不能在异步 await 后）
- 定时触发器最短间隔为每分钟（cron 秒字段）
- DeepSeek API 每月费用约 ¥36（1000用户/天估算）

---

## 本地开发

```bash
# 项目路径
D:\Investment\DayFlow\dev

# 微信开发者工具打开此目录即可
# 云函数在 cloudfunctions/ 下，右键部署
# 密钥文件 .secrets.local 不上传 Git
```
