const cloud = require('wx-server-sdk')
const https = require('https')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const weekStartStr = () => {
  const d = new Date()
  d.setDate(d.getDate() - 6)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function callDeepSeek(prompt) {
  const body = JSON.stringify({
    model: 'deepseek-chat',
    messages: [
      { role: 'system', content: '你是效率助手Flow。用温暖、有感情的语气生成每周总结，像一个真实的朋友在和用户说话。不超过80字。' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.8,
    max_tokens: 200
  })

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.deepseek.com',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
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
          resolve(parsed.choices[0].message.content)
        } catch (e) { reject(e) }
      })
    })
    req.on('error', reject)
    req.setTimeout(12000, () => { req.destroy(); reject(new Error('timeout')) })
    req.write(body)
    req.end()
  })
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const weekStart = weekStartStr()
  const today = todayStr()

  try {
    const existingRes = await db.collection('weekly_summaries')
      .where({ user_id: openid, week_start: weekStart })
      .get()

    if (existingRes.data && existingRes.data.length > 0) {
      return { summary: existingRes.data[0].summary_text, cached: true }
    }

    const logsRes = await db.collection('daily_logs')
      .where({ user_id: openid, log_date: db.command.gte(weekStart) })
      .orderBy('log_date', 'asc')
      .get()

    const logs = logsRes.data || []
    const totalCompleted = logs.reduce((s, l) => s + (l.tasks_completed || 0), 0)
    const totalPlanned = logs.reduce((s, l) => s + (l.tasks_planned || 0), 0)
    const activeDays = logs.filter(l => !l.is_rest_day && l.tasks_completed > 0).length
    const restDays = logs.filter(l => l.is_rest_day).length
    const rate = totalPlanned > 0 ? Math.round((totalCompleted / totalPlanned) * 100) : 0

    const prompt = `用户这周的数据：
- 完成任务 ${totalCompleted} 件，计划 ${totalPlanned} 件，完成率 ${rate}%
- 高效工作 ${activeDays} 天，休息 ${restDays} 天
请生成一段温暖的每周总结，高光具体数字，鼓励但不空洞。`

    const summaryText = await callDeepSeek(prompt)

    await db.collection('weekly_summaries').add({
      data: {
        user_id: openid,
        week_start: weekStart,
        week_end: today,
        summary_text: summaryText,
        stats: { totalCompleted, totalPlanned, activeDays, restDays, rate },
        created_at: db.serverDate()
      }
    })

    return { summary: summaryText, cached: false, stats: { totalCompleted, totalPlanned, activeDays, rate } }
  } catch (e) {
    return { error: e.message }
  }
}
