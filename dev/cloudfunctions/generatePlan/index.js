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

━━━ 人类自然节律（软约束，不要加入 busy_slots）━━━
大多数人遵循相似的生理节奏，请在排任务时自然避开以下时段（不创建禁止线，只不安排任务）：
• 11:30-12:30 临近午饭，专注力自然下降，宜安排轻松任务或留空
• 12:00-13:00 多数人午餐时段，尽量不排任务。留空即可，不要加入 busy_slots
• 13:00-14:00 餐后血糖升高、褪黑素微升，多数人犯困，避免深度工作，只排极轻任务
• 18:00-19:00 晚饭时段，尽量避开不排任务
• 22:00 之后认知能力显著下降，避免任何需要思考的任务
以上为软约束：尽量遵守但不强制，若用户可用时间紧张可以适度占用。严禁为此创建 busy_slots。

━━━ 用户明确约束（硬约束，需加入 busy_slots）━━━
• 只有用户设置了午休/晚饭习惯，或主动输入了时间约束，才在对应时段加入 busy_slots
• 用户说"上午有课/上班/开会/不可用" → 在对应时段加入 busy_slots，不排任务
• busy_slots 只用于标记用户明确告知的不可用时段，严禁自创

━━━ 任务类型与时段匹配（在用户可用时间内执行）━━━
• 报告、方案、代码、学习、创作 → 优先排精力好的时段
• 沟通、讨论、回复消息 → 排精力低谷期
• 单任务超过 90 分钟 → 必须拆成两段，中间休息 15 分钟
• 运动、健身等体力任务 → 默认安排在 06:00-20:00，深夜运动不符合多数人节律。但如果用户主动要求或白天确实排满，可以灵活处理
• 任何单段任务不能超过 120 分钟，超过则拆分为多段
• 任务时长必须合理匹配剩余时间窗口，不能把3小时任务塞到晚上22点之后

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

━━━ note 字段（让人看了就想行动）━━━
每条任务必须附带一个学术级的激励提示，不超过30字。
自由调用你掌握的神经科学、认知心理学、行为经济学、时间生物学、进化心理学、内分泌学等知识。
必须使用专业术语增强权威感（如：皮质醇峰值、前额叶皮层、默认模式网络、多巴胺奖赏通路、超日节律、血清素-褪黑素转换、突触可塑性窗口、心流阈值、决策疲劳、执行功能恢复）。
每一条要让用户感觉"这是硬核科学研究结论，不听就亏了"。
不要套模板，每次换不同学科和术语组合。

严格返回 JSON，不要有任何多余文字。`

const buildUserPrompt = (tasks, availableHours, date, tone, scheduleConstraints, context, lockedTasks, existingTaskSlots) => {
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

  let currentTimeSection = ''
  // 当有当前时间时，把 availableHours 截断到今天午夜前实际剩余时间
  let effectiveHours = availableHours
  if (context.currentTime) {
    const tp = context.currentTime.split(':')
    const curMins = parseInt(tp[0]) * 60 + parseInt(tp[1])
    const minsToMidnight = 24 * 60 - curMins
    // 取用户选择与今日剩余的最小值，保留一位小数
    effectiveHours = Math.round(Math.min(availableHours, minsToMidnight / 60) * 10) / 10
    const capH = Math.floor(minsToMidnight / 60)
    const capM = minsToMidnight % 60
    const capStr = capH > 0 ? capH + '小时' + (capM > 0 ? capM + '分' : '') : capM + '分'
    currentTimeSection = '\n当前实际时间：' + context.currentTime + '。' +
      '今天剩余可安排：约' + capStr + '（任务时间段必须在今天00:00-23:59内，不得出现跨午夜的时间段）。' +
      '若所有任务安排不下，在summary中说明哪些留到明天即可。\n'
  }

  const availMinutes = context.alreadyCompletedMinutes > 0
    ? Math.max(30, effectiveHours * 60 - context.alreadyCompletedMinutes)
    : effectiveHours * 60

  const completedSection = context.alreadyCompletedMinutes > 0
    ? `\n已完成任务耗时 ${context.alreadyCompletedMinutes} 分钟，剩余可用时间约 ${Math.round(availMinutes / 6) / 10} 小时，请基于剩余时间安排任务。\n`
    : ''

  const existingSection = existingTaskSlots && existingTaskSlots.length > 0
    ? `\n已排定任务时段（这些是已排定的任务，不需要加入busy_slots，新任务请插入它们的空档之间）：\n${existingTaskSlots.map(function(s) { return '• ' + (s.title || '') + ' ' + s.start + '-' + s.end }).join('\n')}\n`
    : ''

  return `今天日期：${date}
今日可用时间：${effectiveHours} 小时
AI风格：${toneDesc}
${habitsSection}${currentTimeSection}${completedSection}${freshStartSection}${completionRateSection}${calibrationSection}${lockedSection}${mustDoSection}${constraintSection}${existingSection}
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
      "note": "引用具体理论和数据，让用户觉得这个时间做效果翻倍，不超过30字"
    }
  ],
  "busy_slots": [
    {"start": "XX:00", "end": "XX:30", "label": "描述"}
  ],
  "fragment_plan": ["task_id原值"],
  "summary": "一句话总结今日计划亮点，让用户看了就有动力行动，30字以内"
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
  const { availableHours = 4, date, scheduleConstraints = '', currentTime = null, alreadyCompletedMinutes = 0, existingTaskSlots = [] } = event

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
      { role: 'user', content: buildUserPrompt(tasks, availableHours, date, tone, scheduleConstraints, promptContext, lockedTasks, existingTaskSlots) }
    ])

    if (!aiResult || typeof aiResult !== 'object') {
      throw new Error('AI returned invalid response')
    }

    // 只保留不与已排任务时间重叠的busy_slots（午休/上课等真正不可用时段）
    const toMinutes = function(t) { var p = t.split(':'); return parseInt(p[0]) * 60 + parseInt(p[1]) }
    const scheduledTasks = aiResult.main_plan || []
    const busySlots = (aiResult.busy_slots || []).filter(function(slot) {
      var sStart = toMinutes(slot.start)
      var sEnd = toMinutes(slot.end)
      var keep = !scheduledTasks.some(function(task) {
        if (!task.suggested_start_time || !task.suggested_end_time) return false
        var tStart = toMinutes(task.suggested_start_time)
        var tEnd = toMinutes(task.suggested_end_time)
        return sStart < tEnd - 2 && sEnd > tStart + 2
      })
      return keep
    })

    // 用户未设置个人习惯且未输入今日时间约束时，丢弃AI自行发明的busy_slots
    const cleanConstraints = scheduleConstraints.replace(/\n?(?:已有任务时段[（(]请勿占用[）)]|已有任务时段|以下时段已排定任务)[：:][\s\S]*$/, '').trim()
    if (!schedulePreferences && !cleanConstraints) {
      busySlots.length = 0
    }

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

    // 固定时间任务：直接加入计划，不依赖AI（AI没有它们的ID）
    const mainTasksData = []
    lockedTasks.forEach(function(t) {
      var endH = 0, endM = 0
      if (t.locked_start_time) {
        var parts = t.locked_start_time.split(':')
        var totalMins = parseInt(parts[0]) * 60 + parseInt(parts[1]) + (t.estimated_minutes || 30)
        endH = Math.floor(totalMins / 60) % 24
        endM = totalMins % 60
      }
      var endTime = endH > 0 || endM > 0
        ? (endH < 10 ? '0' : '') + endH + ':' + (endM < 10 ? '0' : '') + endM
        : null
      mainTasksData.push(makeEntry(t, {
        suggested_minutes: t.estimated_minutes,
        suggested_start_time: t.locked_start_time || null,
        suggested_end_time: endTime,
        note: '（固定时间）'
      }))
    })

    // 普通任务：通过AI匹配（精确ID → 标题 → 保底）
    var aiPlanItems = aiResult.main_plan || []
    aiPlanItems.forEach(function(p) {
      var task = regularTasks.find(function(t) { return t._id === p.task_id })
      if (!task) task = regularTasks.find(function(t) { return t.title === p.task_id || t.title === (p.task_title || '') })
      if (task) mainTasksData.push(makeEntry(task, p))
    })

    // 保底：AI完全没排出任务时，从全部任务里取（修复regularTasks为空时保底失效的bug）
    if (mainTasksData.length === 0 && tasks.length > 0) {
      var allPending = tasks.slice(0, Math.min(5, tasks.length))
      var minsEach = Math.max(15, Math.floor(availableHours * 60 * 0.8 / allPending.length))
      allPending.forEach(function(t) {
        mainTasksData.push(makeEntry(t, { suggested_minutes: Math.min(minsEach, t.estimated_minutes), note: '（自动安排）' }))
      })
    }

    const fragmentTasksData = (aiResult.fragment_plan || []).map(function(id) {
      return tasks.find(function(t) { return t._id === id })
    }).filter(function(t) { return t && t.is_fragment === true })

    // 关键修复：用实际匹配到的任务的真实_id存储，不用AI返回的（可能错误的）id

    // 用 mainTasksData 的真实 _id 保存（彻底修复之前存错ID的bug）
    const realMainTaskIds = mainTasksData.map(function(t) { return t._id })
    const realFragmentIds = fragmentTasksData.map(function(t) { return t._id })

    // 保留旧计划中已完成任务的ID和ai_raw条目，防止重排后已完成任务消失
    const existingPlan = await db.collection('daily_plans').where({ user_id: openid, plan_date: date }).get()
    let completedTaskIds = []
    let completedAiEntries = []
    if (existingPlan.data && existingPlan.data.length > 0) {
      const oldPlan = existingPlan.data[0]
      const oldSelectedIds = oldPlan.selected_task_ids || []
      const oldMainPlan = (oldPlan.ai_raw && oldPlan.ai_raw.main_plan) || []
      // 筛选出已完成的旧任务
      const completedRes = await db.collection('tasks')
        .where({ _id: db.command.in(oldSelectedIds), status: 'completed' })
        .get()
      completedTaskIds = (completedRes.data || []).map(function(t) { return t._id })
      completedAiEntries = oldMainPlan.filter(function(e) { return completedTaskIds.indexOf(e.task_id) >= 0 })
    }
    const allMainTaskIds = realMainTaskIds.concat(completedTaskIds.filter(function(id) { return realMainTaskIds.indexOf(id) < 0 }))

    // cleanConstraints 已在 busy_slots 过滤阶段计算，此处直接复用
    const planData = {
      user_id: openid,
      plan_date: date,
      available_hours: availableHours,
      schedule_constraints: cleanConstraints,
      selected_task_ids: allMainTaskIds,
      fragment_task_ids: realFragmentIds,
      busy_slots: busySlots,
      plan_text: aiResult.summary || '',
      ai_raw: aiResult,
      context: promptContext,
      generated_at: db.serverDate(),
      regenerated_count: 0
    }

    // 将已完成任务的ai条目也写入ai_raw，确保getTodayPlan能返回它们的时间
    if (completedAiEntries.length > 0) {
      planData.ai_raw = { ...aiResult, main_plan: (aiResult.main_plan || []).concat(completedAiEntries) }
    }

    let planId
    if (existingPlan.data && existingPlan.data.length > 0) {
      planId = existingPlan.data[0]._id
      await db.collection('daily_plans').doc(planId).update({ data: { ...planData, regenerated_count: (existingPlan.data[0].regenerated_count || 0) + 1 } })
    } else {
      const addRes = await db.collection('daily_plans').add({ data: planData })
      planId = addRes._id
    }

    // 只更新非完成任务的状态为in_plan，已完成任务保持completed
    const newTaskIds = realMainTaskIds.filter(function(id) { return completedTaskIds.indexOf(id) < 0 })
    if (newTaskIds.length > 0) {
      await db.collection('tasks').where({ _id: db.command.in(newTaskIds), status: 'pending' }).update({ data: { status: 'in_plan' } })
    }

    // 已完成任务的完整数据，合并到返回结果中
    let completedTasksData = []
    if (completedTaskIds.length > 0) {
      const completedTasksRes = await db.collection('tasks').where({ _id: db.command.in(completedTaskIds) }).get()
      completedTasksData = (completedTasksRes.data || []).map(function(t) {
        const aiEntry = completedAiEntries.find(function(e) { return e.task_id === t._id })
        return makeEntry(t, aiEntry)
      })
    }

    return { plan: { _id: planId, ...planData, selected_task_ids_data: mainTasksData.concat(completedTasksData), fragment_task_ids_data: fragmentTasksData } }
  } catch (e) {
    console.error('generatePlan error:', e)
    return { error: e.message }
  }
}
