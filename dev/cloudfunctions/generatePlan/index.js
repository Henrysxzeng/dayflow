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
    // 工作日/周末区分
    const dateObj = new Date(date.replace(/-/g, '/'))
    const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6
    const wakeTime = isWeekend && prefs.weekend_different && prefs.weekend_wake_time
      ? prefs.weekend_wake_time : prefs.wake_time
    const sleepTime = isWeekend && prefs.weekend_different && prefs.weekend_sleep_time
      ? prefs.weekend_sleep_time : prefs.sleep_time

    if (isWeekend && prefs.weekend_different) {
      habitsSection += `• 今天是${dateObj.getDay() === 0 ? '周日' : '周六'}（周末），使用周末时间表\n`
    }
    if (wakeTime) habitsSection += `• 通常 ${wakeTime} 起床，请勿在此之前安排任务\n`
    if (sleepTime) habitsSection += `• 通常 ${sleepTime} 睡觉，请勿在此之后安排任务\n`
    if (prefs.has_lunch_break === true && prefs.lunch_start && prefs.lunch_end) {
      habitsSection += `• 有固定午休：${prefs.lunch_start}-${prefs.lunch_end}，请在 busy_slots 中加入并避开\n`
    } else if (prefs.has_lunch_break === false) {
      habitsSection += `• 该用户通常不固定午休，不要自动添加午饭时段\n`
    }
    if (prefs.has_dinner_break === true && prefs.dinner_start && prefs.dinner_end) {
      habitsSection += `• 有固定晚饭时间：${prefs.dinner_start}-${prefs.dinner_end}，请在 busy_slots 中加入并避开\n`
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

  // 今日截止的任务，必须全部出现在计划中
  const mustDoToday = regularTasks.filter(t => t.deadline && t.deadline.startsWith(date))
  const mustDoSection = mustDoToday.length > 0
    ? `\n⚠️ 以下任务今天截止，必须全部出现在 main_plan 中，不能跳过：\n${mustDoToday.map(t => `• "${t.title}"（${t.estimated_minutes}分钟）`).join('\n')}\n如果这些任务加起来超过可用时间，请仍全部安排，并在 summary 中用一句话给出优先级建议（例如"时间紧，先搞定X，Y可以申请延期"），不要因为时间不够而省略今日截止任务。\n`
    : ''

  const currentTimeSection = context.currentTime
    ? `\n当前实际时间：${context.currentTime}。请只安排在此时间之后开始的任务。若时间已晚，可安排轻松小任务或明日准备工作，不要返回空计划。\n`
    : ''

  const availMinutes = context.alreadyCompletedMinutes > 0
    ? Math.max(30, availableHours * 60 - context.alreadyCompletedMinutes)
    : availableHours * 60

  const completedSection = context.alreadyCompletedMinutes > 0
    ? `\n已完成任务耗时 ${context.alreadyCompletedMinutes} 分钟，剩余可用时间约 ${Math.round(availMinutes / 6) / 10} 小时，请基于剩余时间安排任务。\n`
    : ''

  return `今天日期：${date}
今日可用时间：${availableHours} 小时
AI风格：${toneDesc}
${habitsSection}${currentTimeSection}${completedSection}${freshStartSection}${completionRateSection}${calibrationSection}${lockedSection}${mustDoSection}${constraintSection}
待排任务清单：
${JSON.stringify(regularTasks.map(function(t) { return {
    task_id: t._id,
    title: t.title,
    deadline: t.deadline || null,
    estimated_minutes: t.estimated_minutes,
    importance: t.importance,
    fail_count: t.fail_count || 0,
    last_fail_reason: t.fail_history && t.fail_history.length ? t.fail_history[t.fail_history.length - 1].reason : null,
    user_preferred_time: t.preferred_time || null
  }}), null, 2)}

请返回如下 JSON（task_id 必须原样使用上面列表中的值，不能修改或编造）：
{
  "main_plan": [
    {
      "task_id": "上面列表中的task_id原值",
      "suggested_minutes": 60,
      "suggested_start_time": "09:00",
      "suggested_end_time": "10:00",
      "note": "为什么现在做，引用科学依据，不超过25字"
    }
  ],
  "busy_slots": [
    {"start": "XX:00", "end": "XX:30", "label": "描述"}
  ],
  "fragment_plan": ["task_id原值"],
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
  const { availableHours = 4, date, scheduleConstraints = '', currentTime = null, alreadyCompletedMinutes = 0, keepExistingSlots = false } = event

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

    const promptContext = { freshStart, recentRate, rateAdvice, calibrationFactor, schedulePreferences, currentTime, alreadyCompletedMinutes }

    const aiResult = await callDeepSeek([
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt(tasks, availableHours, date, tone, scheduleConstraints, promptContext, lockedTasks) }
    ])

    if (!aiResult || typeof aiResult !== 'object') {
      throw new Error('AI returned invalid response')
    }

    const busySlots = aiResult.busy_slots || []

    const makeEntry = function(task, p) {
      return { user_id: task.user_id, _id: task._id, title: task.title, description: task.description,
               deadline: task.deadline, estimated_minutes: task.estimated_minutes,
               importance: task.importance, quadrant: task.quadrant, is_fragment: task.is_fragment,
               status: task.status, fail_count: task.fail_count || 0,
               suggested_minutes: (p && p.suggested_minutes) || task.estimated_minutes,
               suggested_start_time: (p && p.suggested_start_time) || null,
               suggested_end_time: (p && p.suggested_end_time) || null,
               ai_note: (p && p.note) || '' }
    }

    // 三层匹配：精确ID → 标题 → 保底（彻底防止AI幻觉ID导致空计划）
    const mainTasksData = []
    ;(aiResult.main_plan || []).forEach(function(p) {
      var task = tasks.find(function(t) { return t._id === p.task_id })
      if (!task) task = tasks.find(function(t) { return t.title === p.task_id || t.title === (p.task_title || '') })
      if (task) mainTasksData.push(makeEntry(task, p))
    })
    if (mainTasksData.length === 0 && regularTasks.length > 0) {
      var fallback = regularTasks.slice(0, Math.min(5, regularTasks.length))
      var minsEach = Math.max(15, Math.floor(availableHours * 60 * 0.8 / fallback.length))
      fallback.forEach(function(t) {
        mainTasksData.push(makeEntry(t, { suggested_minutes: Math.min(minsEach, t.estimated_minutes), note: '（自动安排）' }))
      })
    }

    const fragmentTasksData = (aiResult.fragment_plan || []).map(function(id) {
      return tasks.find(function(t) { return t._id === id })
    }).filter(Boolean)

    // 关键修复：用实际匹配到的任务的真实_id存储，不用AI返回的（可能错误的）id

    // 用 mainTasksData 的真实 _id 保存（彻底修复之前存错ID的bug）
    const realMainTaskIds = mainTasksData.map(function(t) { return t._id })
    const realFragmentIds = fragmentTasksData.map(function(t) { return t._id })

    const planData = {
      user_id: openid,
      plan_date: date,
      available_hours: availableHours,
      schedule_constraints: scheduleConstraints,
      selected_task_ids: realMainTaskIds,
      fragment_task_ids: realFragmentIds,
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

    await db.collection('tasks').where({ _id: db.command.in(realMainTaskIds), status: 'pending' }).update({ data: { status: 'in_plan' } })

    return { plan: { _id: planId, ...planData, selected_task_ids_data: mainTasksData, fragment_task_ids_data: fragmentTasksData } }
  } catch (e) {
    console.error('generatePlan error:', e)
    return { error: e.message }
  }
}
