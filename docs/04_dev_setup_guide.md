# FlowCast · 开发环境搭建指南
**版本：** v1.0  
**日期：** 2026-05-17  
**阶段：** 软件开发生命周期 · 第四阶段

---

## 概览

完成本指南后，你将拥有一个可在模拟器中运行的 FlowCast 小程序，并成功验证：
- 小程序正常加载 ✓
- 云开发数据库读写正常 ✓
- DeepSeek AI 接口调用成功 ✓
- 晨间推送流程可触发 ✓

预计完成时间：**2-3 小时**

---

## 第一步：注册微信小程序

1. 前往 [mp.weixin.qq.com](https://mp.weixin.qq.com) 注册账号
2. 选择**小程序**类型
3. 主体类型选**个人**（MVP 阶段，无需营业执照）
4. 完成邮箱验证和手机验证
5. 登录后台 → 左侧菜单 **开发** → **开发管理** → 复制你的 **AppID**

> 个人主体小程序限制：不能开通微信支付，不影响 MVP 功能

---

## 第二步：开通云开发环境

1. 在小程序后台 → 左侧 **云开发** → 点击**开通**
2. 创建环境，选择**免费套餐**
3. 环境名称填 `dayflow-prod`
4. 创建完成后记录 **环境 ID**（格式类似 `dayflow-prod-xxxxx`）

---

## 第三步：下载并配置微信开发者工具

1. 下载地址：[developers.weixin.qq.com/miniprogram/dev/devtools/download.html](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)
2. 安装完成后登录（用你注册小程序的微信账号扫码）
3. 点击**导入项目**
4. 目录选择：`D:\Investment\FlowCast\dev`
5. AppID 填入你在第一步获取的 AppID
6. 点击**确定**

---

## 第四步：填入配置信息

打开 `D:\Investment\FlowCast\dev\project.config.json`，将 `YOUR_APPID_HERE` 替换为你的真实 AppID。

打开 `D:\Investment\FlowCast\dev\miniprogram\app.js`，将 `YOUR_ENV_ID_HERE` 替换为你的云开发环境 ID。

---

## 第五步：获取 DeepSeek API Key

1. 前往 [platform.deepseek.com](https://platform.deepseek.com) 注册
2. 进入 **API Keys** 页面 → 创建新 Key
3. 复制 API Key（只显示一次，注意保存）

---

## 第六步：配置云函数环境变量

在微信开发者工具中：

1. 左侧面板 → **云开发控制台**（工具栏图标）
2. 进入 **云函数** → 找到 `generatePlan` 函数
3. 点击函数名 → **配置** → **环境变量**
4. 添加变量：
   ```
   Key:   DEEPSEEK_API_KEY
   Value: sk-xxxxxxxx（你的 DeepSeek Key）
   ```
5. 对 `morningPush` 函数重复同样操作

---

## 第七步：初始化数据库集合

在云开发控制台 → **数据库** → 创建以下集合：

| 集合名 | 权限设置 |
|--------|---------|
| `users` | 仅创建者可读写 |
| `tasks` | 仅创建者可读写 |
| `daily_plans` | 仅创建者可读写 |
| `daily_logs` | 仅创建者可读写 |
| `push_auth` | 仅创建者可读写 |

---

## 第八步：部署云函数

在微信开发者工具中，对以下每个云函数右键 → **上传并部署（云端安装依赖）**：

- `generatePlan`
- `addTask`
- `completeTask`
- `getUserInfo`
- `morningPush`（部署后设置定时触发器）
- `nightlyProcess`（部署后设置定时触发器）

**设置定时触发器：**
1. 云开发控制台 → 云函数 → `morningPush` → 配置 → 定时触发器
2. Cron 表达式：`0 50 7 * * * *`（每天 07:50 执行）
3. 同理，`nightlyProcess` 的 Cron：`0 0 23 * * * *`（每天 23:00 执行）

---

## 第九步：申请订阅消息模板

1. 小程序后台 → **功能** → **订阅消息**
2. 搜索并申请以下模板：
   - **待办任务提醒**（用于晨间推送）
3. 申请通过后，将模板 ID 填入 `morningPush/index.js` 的 `TEMPLATE_ID` 变量

---

## 第十步：验证环境

在微信开发者工具模拟器中：

1. **验证登录：** 打开小程序，应能正常进入今日页面
2. **验证数据库：** 添加一个任务，在云开发控制台数据库中应能看到新记录
3. **验证 AI：** 选择时长后，等待 3-5 秒应生成计划（查看模拟器控制台确认无报错）
4. **验证推送：** 手动在云开发控制台触发 `morningPush` 函数，确认无报错

---

## 常见问题

| 问题 | 解决方案 |
|------|---------|
| 云函数报错 "env not found" | 检查 app.js 中的环境 ID 是否正确 |
| DeepSeek 调用超时 | 检查环境变量是否配置，Key 是否有余额 |
| 数据库权限报错 | 检查集合权限是否设置为"仅创建者可读写" |
| 订阅消息发送失败 | 检查模板 ID 是否正确，用户是否已授权 |
