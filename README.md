# DayFlow · AI 每日任务调度助手

> 让每天的任务像水流一样被引导，进入心流状态。

微信小程序 | AI驱动 | 个人效率工具

---

## 产品简介

DayFlow 是一款基于 DeepSeek AI 的每日任务规划微信小程序。核心理念：**不是帮你管理所有任务，而是每天早上帮你选出最该做的几件事，根据人类能量曲线安排到最合适的时间段。**

---

## 核心功能

- **AI 智能日程**：根据可用时间 + 时间约束，按人类能量曲线排期（早上做难事，下午低谷做杂事）
- **番茄钟专注**：25分钟专注计时，App 后台切换不停计时
- **Streak 连续天数**：免死金牌 + 休息日标记，连续不断
- **晨间推送**：每天早8点推送今日计划，一键确认可用时间
- **失败原因学习**：未完成任务标原因，AI 自动调整下次安排
- **时间校准分析**：积累10次用时反馈后，AI 自动校正时间估算偏差
- **社区月度挑战**：全社区匿名参与，每月共同挑战
- **成就系统**：7个里程碑徽章
- **每周AI总结**：个性化数据总结

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | 微信小程序原生（WXML/WXSS/JS） |
| 后端 | 腾讯云开发 CloudBase（Serverless） |
| 数据库 | 云开发 CloudDB（MongoDB） |
| AI | DeepSeek API |
| 推送 | 微信订阅消息 |

## 文档

| 文档 | 说明 |
|------|------|
| [需求分析](docs/01_requirements_analysis.md) | 产品定位、用户画像、行为科学设计 |
| [技术架构](docs/02_technical_architecture.md) | 系统设计、数据库设计、API 设计 |
| [UI/UX 原型](docs/03_ux_prototype.md) | 设计系统、线框图、交互规范 |
| [开发环境搭建](docs/04_dev_setup_guide.md) | 从零搭建开发环境 |
| [产品功能手册](docs/05_product_manual.md) | 面向用户的功能说明 |
| [完整技术参考](docs/06_technical_reference.md) | 面向开发者的完整技术文档 |

## 快速开始

参考 [开发环境搭建指南](docs/04_dev_setup_guide.md)

**关键配置（需要自行填写）：**

| 文件 | 配置项 |
|------|--------|
| `project.config.json` | 你的小程序 AppID |
| `miniprogram/app.js` | 你的云开发 ENV ID |
| 云函数环境变量 | `DEEPSEEK_API_KEY` |
| `morningPush/index.js` | 订阅消息模板 ID |

## 项目结构

```
dev/
├── miniprogram/          # 前端（5个页面）
│   ├── pages/index/      # 今日计划页（核心）
│   ├── pages/tasks/      # 任务清单
│   ├── pages/add-task/   # 新建任务
│   ├── pages/profile/    # 我的
│   └── pages/privacy/    # 隐私政策
└── cloudfunctions/       # 20个云函数
```

---

Made with DeepSeek AI × 腾讯云开发 × 微信小程序
