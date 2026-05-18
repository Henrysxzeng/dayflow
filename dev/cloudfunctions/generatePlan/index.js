const cloud = require('wx-server-sdk')
const https = require('https')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const SYSTEM_PROMPT = `你是用户的私人效率助手，名叫 Flow。你像一个真正懂人的高质量秘书，根据人类生理规律和用户的真实习惯，帮用户做出真正聪明的安排。

━━━ 人类能量曲线（参考，须结合用户实际习惯）━━━
• 早上精力通常最好，适合深度工作，但必须以用户实际可用时间为准
• 午后血糖波动期，适合轻松任务
• 下午第二个高效期，适合中等难度任务
• 晚上20:00后认知能力下降，避免安排高难度任务

━━━ 关键解析规则（极其重要）━━━
• 用户说"上午有课/上班/开会/不可用/都在上课" → 自动将 08:00-12:00 视为完全忙碌，不安排任何任务
• 用户说"下午有事" → 将 13:00-18:00 视为忙碌
• 用户说"全天有事/全天都忙" → 只排很少的任务，利用碎片时间
• 用户说的时间约束要精确理解，不要在其提到的忙碌时段安排任何任务
• 若用户提到"上午上课到11点"，则11点前不排任务，从11点后的空档开始排

━━━ 午饭/休息时间处理（根据用户习惯，不强制）━━━
• 如果用户有明确的午休习惯（在用户习惯数据中），在该时段不排任务并加入 busy_slots
• 如果用户没有午休习惯或数据不足，不要自动加午饭时段，用户自己会管理
• 不要在没有用户数据支撑时强制插入"午饭休息"这个 busy_slot

━━━ 任务类型与时段匹配（在用户可用时间内执行）━━━
• 报告、方案、代码、学习、创作 → 优先排精力好的时段
• 沟通、讨论、回复消息 → 排精力低谷期
• 单任务超过 90 分钟 → 拆成两段，中间休息 15 分钟

━━━ 动态难度校准━━━
• 近期完成率 < 50%：只排 1-2 件最重要的，重建信心
• 近期完成率 50-75%：正常安排 3-4 件
• 近期完成率 > 75%：可安排 4-5 件，适当挑战
• 某任务 fail_count ≥ 2 且原因为 too_hard：降低权重

━━━ 排期规则━━━
1. 任务之间至少留 15 分钟过渡
2. 用户没说开始时间时，根据用户习惯（起床时间+30分钟）决定开始时间，没有习惯数据则从 8:30 开始
3. 不在用户睡觉时间后安排任务
4. 完全尊重用户标注的所有忙碌时段，不在其中安排任何任务
5. 固定时间任务（locked_time已设置）必须按其固定时段排列，不得移动

━━━ note 字段（必须有说服力）━━━
引用科学原理解释为什么在这个时段做，不超过25字。
例："前额叶峰值，复杂分析效率最高"、"低谷期做沟通，保留创造力"

严格返回 JSON，不要有任何多余文字。`

const buildUserPrompt = (tasks, availableHours, date, tone, scheduleConstraints, context, lockedTasks) => {
  const toneDesc = tone === 'strict' ? '严厉直接' : tone === 'snarky' ? '略带毒舌但有帮助' : '温暖友好'

  // 用户习惯数据
  const prefs = context.schedulePreferences || {}
  let habitsSection = ''
  if (prefs.wake_time || prefs.sleep_time || prefs.has_lunch_break !== undefined) {
    habitsSection = `\n用户作息习惯：\n`
    if (prefs.wake_time) habitsSection += `• 通常 ${prefs.wake_time} 起床，请勿在此之前安排任务\n`
    if (prefs.sleep_time) habitsSection += `• 通常 ${prefs.sleep_time} 睡觉，请勿在此之后安排任务\n`
    if (prefs.has_lunch_break === true && prefs.lunch_start && prefs.lunch_end) {
      habitsSection += `• 有固定午休：${prefs.lunch_start}-${prefs.lunch_end}，请在 busy_slots 中加入并避开\n`
    } else if (prefs.has_lunch_break === false) {
      habitsSection += `• 该用户通常不固定午休，不要自动添加午饭时段\n`
    }
    if (prefs.peak_morning) habitsSection += `• 历史数据：上午是其高效时段\n`
    if (prefs.peak_evening) habitsSection += `• 历史数据：晚上是其高效时段\n`
  }

  // 固定时间任务
  let lockedSection = ''
  if (lockedTasks && lockedTasks.length > 0) {
    lockedSection = `\n以下任务已由用户手动固定时间，必须按此安排，不得移动：\n`
    lockedTasks.forEach(t => {
      lockedSection += `• "${t.title}"：${t.locked_start_time}（${t.estimated_minutes}分钟）\n`
    })
    lockedSection += `请将以上固定任务直接放入 main_plan 对应时段，并加入 busy_slots 防止其他任务占用。\n`
  }

  const constraintSection = scheduleConstraints
    ? `\n用户今天的时间安排（严格执行，如有"上午有课/工作"等描述请将整个上午视为忙碌）：\n"${scheduleConstraints}"\n`
    : `\n用户未提供具体时间约束，根据用户习惯和能量曲线自主安排，注意不要超出起床和睡觉时间。\n`

  const freshStartSection = context.freshStart
    ? `\n特别提示：${context.freshStart}请在 summary 中融入新起点的仪式感。\n`
    : ''

  const completionRateSection = context.recentRate !== null
    ? `\n用户近7天完成率：${context.recentRate}%（${context.rateAdvice}）\n`
    : ''

  const calibrationSection = context.calibrationFactor
    ? `\n时间校准：该用户实际用时平均比预估多 ${Math.round((context.calibrationFactor - 1) * 100)}%，请将任务预估时长乘以 ${context.calibrationFactor}。\n`
    : ''

  const regularTasks = tasks.filter(t => !t.locked_start_time)

  return `今天日期：${date}
今日可用时间：${availableHours} 小时
AI风格：${toneDesc}
${habitsSection}${freshStartSection}${completionRateSection}${calibrationSection}${lockedSection}${constraintSection}
待排任务（固定时间任务已单独列出，以下是需要AI安排的任务）：
${JSON.stringify(regularTasks.map(t => ({
    id: t._id,
    title: t.title,
    deadline: t.deadline || null,
    estimated_minutes: t.estimated_minutes,
    importance: t.importance,
    fail_count: t.fail_count || 0,
    last_fail_reason: t.fail_history && t.fail_history.length
      ? t.fail_history[t.fail_history.length - 1].reason
      : null,
    user_preferred_time: t.preferred_time || null
  })), null, 2)}

请返回如下 JSON（固定时间任务也要包含在 main_plan 中）：
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
    {"start": "XX:00", "end": "XX:30", "label": "描述（只在有真实忙碌时段时才加）"}
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
    const schedulePreferences = user.schedule_preferences || null

    if (tasks.length === 0) return { plan: null, message: 'no_tasks' }

    // 分离固定时间任务和普通任务
    const lockedTasks = tasks.filter(t => t.locked_start_time)
    const regularTasks = tasks.filter(t => !t.locked_start_time)

    // 新鲜开始检测
    const d = new Date(date.replace(/-/g, '/'))
    const isMonday = d.getDay() === 1
    const isMonthStart = d.getDate() === 1
    let freshStart = null
    if (isMonday && isMonthStart) freshStart = '今天是周一，也是新月份的第一天，双重新起点。'
    else if (isMonday) freshStart = '今天是周一，新的一周从今天开始。'
    else if (isMonthStart) freshStart = '今天是本月第一天，新的开始。'
    if (isMonday && user.next_week_note) {
      freshStart = (freshStart || '') + `用户上周五设定的本周重点：「${user.next_week_note}」。`
    }

    // 近期完成率
    const recentPlanned = logs.reduce((s, l) => s + (l.tasks_planned || 0), 0)
    const recentCompleted = logs.reduce((s, l) => s + (l.tasks_completed || 0), 0)
    const recentRate = recentPlanned > 0 ? Math.round((recentCompleted / recentPlanned) * 100) : null
    let rateAdvice = ''
    if (recentRate !== null) {
      if (recentRate < 50) rateAdvice = '近期完成率偏低，今天少排一点，优先重建信心'
      else if (recentRate < 75) rateAdvice = '完成率正常，按常规安排'
      else rateAdvice = '完成率优秀，可适当增加挑战'
    }

    // 时间校准系数
    let calibrationFactor = null
    try {
      const calibratedRes = await db.collection('tasks')
        .where({ user_id: openid, status: 'completed', time_accuracy: db.command.neq(null) })
        .limit(50).get()
      const accuracyMap = { less: -0.25, same: 0, more: 0.3, much_more: 0.65 }
      const calibrated = (calibratedRes.data || []).filter(t => t.time_accuracy)
      if (calibrated.length >= 10) {
        const avgBias = calibrated.reduce((s, t) => s + (accuracyMap[t.time_accuracy] || 0), 0) / calibrated.length
        if (avgBias > 0.05) calibrationFactor = Math.round((1 + avgBias) * 100) / 100
      }
    } catch (e) { }

    const promptContext = { freshStart, recentRate, rateAdvice, calibrationFactor, schedulePreferences }

    const aiResult = await callDeepSeek([
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt(tasks, availableHours, date, tone, scheduleConstraints, promptContext, lockedTasks) }
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
