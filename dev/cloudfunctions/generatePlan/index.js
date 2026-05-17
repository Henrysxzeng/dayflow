const cloud = require('wx-server-sdk')
const https = require('https')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const SYSTEM_PROMPT = `你是用户的私人效率助手，名叫 Flow。你像一个真正懂人的高质量秘书，不只是机械地把任务塞进时间格子，而是根据人类的生理和认知规律，帮用户做出真正聪明的安排。

━━━ 人类能量曲线（核心原则，必须遵守）━━━
• 早上 8:00-12:00：前额叶皮质最活跃，是深度工作的黄金时段。复杂分析、创意写作、需要高度专注的任务必须优先排在这里。
• 中午 12:00-13:30：午饭和休息时间。绝对不安排工作任务。即使用户没提，也要自动保留并加入 busy_slots，标注"午饭休息"。
• 下午 13:30-15:00：餐后血糖波动的低谷期，注意力和判断力下降。只适合低难度、机械性任务（回复消息、整理、简单沟通）。
• 下午 15:00-17:30：大脑的第二个高效期。适合中等难度任务和需要沟通协调的工作。
• 晚上 20:00 后：认知能力大幅下降，非必要不安排需要深度思考的任务。

━━━ 任务类型与时段的智能匹配（必须遵守）━━━
• 报告、方案、代码、学习、创作 → 早上黄金时段（8:00-12:00）
• 开会、讨论、沟通、协调 → 下午第二高效期（15:00-17:30）
• 回复邮件/消息、整理资料、行政事务 → 下午低谷（13:30-15:00），不浪费黄金时段
• 阅读、学习新知识 → 早上或下午高效期
• 单个任务超过 90 分钟 → 拆成两段，中间至少休息 15 分钟

━━━ 排期硬性规则（绝对不能违反）━━━
1. 12:00-13:30 是午饭时间，任何任务都不得占用，必须出现在 busy_slots 里（label:"午饭休息"）
2. 任务与任务之间至少留 15 分钟过渡，防止一延误全线崩溃
3. 用户没说明开始时间时，默认从 8:30 开始排
4. 不安排跨越午饭的单一任务（90分钟任务不能从 11:30 开始）
5. 不在晚上 22:00 后安排任务，除非用户明确说了夜间时间
6. 尊重用户填写的所有忙碌时段，同时自动补充午饭时段

━━━ 动态难度校准（根据用户历史调整）━━━
• 近期完成率 < 50%：用户可能压力过大或计划过满，今天只排 1-2 件最重要的，让用户重建信心，语气要温暖鼓励
• 近期完成率 50-75%：正常安排 3-4 件
• 近期完成率 > 75%：用户状态良好，可安排 4-5 件，适当增加挑战
• 某任务 fail_count ≥ 2 且原因为 too_hard：建议本次跳过或拆解，降低选中权重

━━━ 任务优先级规则━━━
• 截止日期近且重要程度高（Q1）→ 最优先，排黄金时段
• 重要但不紧急（Q2）→ 次优先，排第二高效期
• 总规划时长不超过可用时间的 80%（留 20% 缓冲）
• ≤10 分钟的碎片任务放 fragment_plan，不进主计划

━━━ note 字段的写法（核心差异化，必须有说服力）━━━
note 要引用具体的科学原理解释为什么在这个时段做：
✓ "前额叶峰值，复杂分析效率最高"
✓ "会后空档，顺势处理不打断节奏"
✓ "低谷期做沟通，保留上午的创造力"
✓ "帕金森定律：今天不动，明天更难动"
✓ "蔡格尼克效应：先啃硬骨头，完成后负担消失"
不超过 25 字，直接、有力、有依据。

严格返回 JSON，不要有任何多余文字。`

const buildUserPrompt = (tasks, availableHours, date, tone, scheduleConstraints, context) => {
  const toneDesc = tone === 'strict' ? '严厉直接' : tone === 'snarky' ? '略带毒舌但有帮助' : '温暖友好'

  const constraintSection = scheduleConstraints
    ? `\n用户今天的时间安排（请严格按此排期，同时自动加入午饭时段）：\n"${scheduleConstraints}"\n`
    : '\n用户没有提供具体时间约束，请根据人类能量曲线自主安排合理时段，默认从 8:30 开始。\n'

  const freshStartSection = context.freshStart
    ? `\n特别提示：${context.freshStart}请在 summary 中融入新起点的仪式感，语气积极但不空洞。\n`
    : ''

  const completionRateSection = context.recentRate !== null
    ? `\n用户近7天完成率：${context.recentRate}%（${context.rateAdvice}）\n`
    : ''

  const calibrationSection = context.calibrationFactor
    ? `\n时间校准提示：该用户历史数据显示实际用时平均比预估多 ${Math.round((context.calibrationFactor - 1) * 100)}%，请将所有任务预估时长乘以 ${context.calibrationFactor} 后再做排期，避免计划做不完。\n`
    : ''

  return `今天日期：${date}
今日可用时间：${availableHours} 小时
AI风格：${toneDesc}
${freshStartSection}${completionRateSection}${calibrationSection}${constraintSection}
待办任务清单：
${JSON.stringify(tasks.map(t => ({
    id: t._id,
    title: t.title,
    deadline: t.deadline || null,
    estimated_minutes: t.estimated_minutes,
    importance: t.importance,
    fail_count: t.fail_count || 0,
    last_fail_reason: t.fail_history && t.fail_history.length
      ? t.fail_history[t.fail_history.length - 1].reason
      : null
  })), null, 2)}

请返回如下 JSON：
{
  "main_plan": [
    {
      "task_id": "任务ID",
      "suggested_minutes": 60,
      "suggested_start_time": "09:00",
      "suggested_end_time": "10:00",
      "note": "为什么现在做，引用科学依据，不超过25字"
    }
  ],
  "busy_slots": [
    {"start": "12:00", "end": "13:30", "label": "午饭休息"}
  ],
  "fragment_plan": ["碎片任务ID"],
  "summary": "今日计划整体说明，30字以内，温暖自然"
}`
}

function callDeepSeek(messages) {
  const apiKey = process.env.DEEPSEEK_API_KEY
  const body = JSON.stringify({
    model: 'deepseek-chat',
    messages,
    response_format: { type: 'json_object' },
    temperature: 0.6,
    max_tokens: 1500
  })

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.deepseek.com',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }
    const req = https.request(options, res => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data)
          if (!parsed.choices || !parsed.choices[0]) { reject(new Error('Invalid response')); return }
          resolve(JSON.parse(parsed.choices[0].message.content))
        } catch (e) { reject(e) }
      })
    })
    req.on('error', reject)
    req.setTimeout(55000, () => { req.destroy(); reject(new Error('timeout')) })
    req.write(body)
    req.end()
  })
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { availableHours = 4, date, scheduleConstraints = '' } = event

  try {
    const [tasksRes, userRes, logsRes] = await Promise.all([
      db.collection('tasks').where({ user_id: openid, status: db.command.neq('completed') }).limit(50).get(),
      db.collection('users').doc(openid).get().catch(() => ({ data: null })),
      db.collection('daily_logs').where({ user_id: openid }).orderBy('log_date', 'desc').limit(7).get()
    ])

    const tasks = tasksRes.data || []
    const user = userRes.data || {}
    const tone = user.settings && user.settings.ai_tone || 'friendly'
    const logs = logsRes.data || []

    if (tasks.length === 0) return { plan: null, message: 'no_tasks' }

    // 新鲜开始效应检测
    const d = new Date(date.replace(/-/g, '/'))
    const isMonday = d.getDay() === 1
    const isMonthStart = d.getDate() === 1
    let freshStart = null
    if (isMonday && isMonthStart) freshStart = '今天是周一，也是新月份的第一天，双重新起点。'
    else if (isMonday) freshStart = '今天是周一，新的一周从今天开始。'
    else if (isMonthStart) freshStart = '今天是本月第一天，新的开始。'

    // 周一读取上周五的备注
    if (isMonday && user.next_week_note) {
      freshStart = (freshStart || '') + `用户上周五设定的本周重点：「${user.next_week_note}」，请在安排中优先考虑。`
    }

    // 近期完成率计算
    const recentPlanned = logs.reduce((s, l) => s + (l.tasks_planned || 0), 0)
    const recentCompleted = logs.reduce((s, l) => s + (l.tasks_completed || 0), 0)
    const recentRate = recentPlanned > 0 ? Math.round((recentCompleted / recentPlanned) * 100) : null
    let rateAdvice = ''
    if (recentRate !== null) {
      if (recentRate < 50) rateAdvice = '近期完成率偏低，今天少排一点，优先重建信心'
      else if (recentRate < 75) rateAdvice = '完成率正常，按常规安排'
      else rateAdvice = '完成率优秀，可适当增加挑战'
    }

    // 时间校准系数计算
    let calibrationFactor = null
    try {
      const calibratedTasksRes = await db.collection('tasks')
        .where({ user_id: openid, status: 'completed', time_accuracy: db.command.neq(null) })
        .limit(50)
        .get()

      const accuracyMap = { less: -0.25, same: 0, more: 0.3, much_more: 0.65 }
      const calibrated = (calibratedTasksRes.data || []).filter(t => t.time_accuracy)
      if (calibrated.length >= 10) {
        const avgBias = calibrated.reduce((s, t) => s + (accuracyMap[t.time_accuracy] || 0), 0) / calibrated.length
        if (avgBias > 0.05) calibrationFactor = Math.round((1 + avgBias) * 100) / 100
      }
    } catch (e) { }

    const promptContext = { freshStart, recentRate, rateAdvice, calibrationFactor }

    const aiResult = await callDeepSeek([
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt(tasks, availableHours, date, tone, scheduleConstraints, promptContext) }
    ])

    const mainTaskIds = (aiResult.main_plan || []).map(p => p.task_id)
    const fragmentIds = aiResult.fragment_plan || []
    const busySlots = aiResult.busy_slots || []

    const mainTasksData = (aiResult.main_plan || []).map(p => {
      const task = tasks.find(t => t._id === p.task_id)
      if (!task) return null
      return { ...task, suggested_minutes: p.suggested_minutes, suggested_start_time: p.suggested_start_time || null, suggested_end_time: p.suggested_end_time || null, ai_note: p.note }
    }).filter(Boolean)

    const fragmentTasksData = fragmentIds.map(id => tasks.find(t => t._id === id)).filter(Boolean)

    const planData = {
      user_id: openid,
      plan_date: date,
      available_hours: availableHours,
      schedule_constraints: scheduleConstraints,
      selected_task_ids: mainTaskIds,
      fragment_task_ids: fragmentIds,
      busy_slots: busySlots,
      plan_text: aiResult.summary || '',
      ai_raw: aiResult,
      context: promptContext,
      generated_at: db.serverDate(),
      regenerated_count: 0
    }

    const existingPlan = await db.collection('daily_plans').where({ user_id: openid, plan_date: date }).get()
    let planId
    if (existingPlan.data && existingPlan.data.length > 0) {
      planId = existingPlan.data[0]._id
      await db.collection('daily_plans').doc(planId).update({ data: { ...planData, regenerated_count: (existingPlan.data[0].regenerated_count || 0) + 1 } })
    } else {
      const addRes = await db.collection('daily_plans').add({ data: planData })
      planId = addRes._id
    }

    await db.collection('tasks').where({ _id: db.command.in(mainTaskIds), status: 'pending' }).update({ data: { status: 'in_plan' } })

    return { plan: { _id: planId, ...planData, selected_task_ids_data: mainTasksData, fragment_task_ids_data: fragmentTasksData } }
  } catch (e) {
    console.error('generatePlan error:', e)
    return { error: e.message }
  }
}
