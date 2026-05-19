const cloud = require('wx-server-sdk')
const https = require('https')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const TEMPLATE_ID = 'P9sWcD2pBtrsB4MZzhULtQw65HMXPCE_Hsx5QSZ_J-k'
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY
const APPID = 'wxd0de3ba5bb35cb1d'
const APP_SECRET = process.env.APP_SECRET

const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try { resolve(JSON.parse(data)) } catch (e) { reject(e) }
      })
    }).on('error', reject)
  })
}

function httpsPost(url, body) {
  const bodyStr = JSON.stringify(body)
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const options = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyStr) }
    }
    const req = https.request(options, res => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try { resolve(JSON.parse(data)) } catch (e) { reject(e) }
      })
    })
    req.on('error', reject)
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')) })
    req.write(bodyStr)
    req.end()
  })
}

function callDeepSeek(messages) {
  const body = JSON.stringify({
    model: 'deepseek-chat',
    messages,
    response_format: { type: 'json_object' },
    temperature: 0.7,
    max_tokens: 800
  })

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.deepseek.com',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
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
          resolve(JSON.parse(parsed.choices[0].message.content))
        } catch (e) { reject(e) }
      })
    })
    req.on('error', reject)
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')) })
    req.write(body)
    req.end()
  })
}

async function getAccessToken() {
  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${APPID}&secret=${APP_SECRET}`
  const res = await httpsGet(url)
  if (res.errcode) throw new Error(`getAccessToken failed: ${res.errcode} ${res.errmsg}`)
  return res.access_token
}

async function sendSubscribeMessage(accessToken, openid, templateId, data, page) {
  const url = `https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${accessToken}`
  return httpsPost(url, { touser: openid, template_id: templateId, page, data })
}

async function generateAndPushForUser(user, today, accessToken) {
  const openid = user._id
  const defaultHours = (user.settings && user.settings.default_daily_hours) || 4
  const tone = (user.settings && user.settings.ai_tone) || 'friendly'

  const tasksRes = await db.collection('tasks')
    .where({ user_id: openid, status: db.command.neq('completed') })
    .limit(30)
    .get()

  const tasks = tasksRes.data || []
  if (tasks.length === 0) return

  const aiResult = await callDeepSeek([
    {
      role: 'system',
      content: '你是效率助手Flow。根据任务清单生成今日默认计划。summary简短总结（不要提可用小时数，只说今天重点做什么）。返回JSON：{"main_plan":[{"task_id":"","suggested_minutes":0,"note":""}],"fragment_plan":[],"summary":"简短总结"}'
    },
    {
      role: 'user',
      content: `今日可用时间：${defaultHours}小时\n风格：${tone}\n任务：${JSON.stringify(tasks.map(t => ({ id: t._id, title: t.title, deadline: t.deadline, estimated_minutes: t.estimated_minutes, importance: t.importance })))}`
    }
  ])

  const topTask = aiResult.main_plan && aiResult.main_plan[0]
    ? tasks.find(t => t._id === aiResult.main_plan[0].task_id)
    : tasks[0]

  const planCount = aiResult.main_plan ? aiResult.main_plan.length : 0

  await db.collection('daily_plans').add({
    data: {
      user_id: openid,
      plan_date: today,
      available_hours: defaultHours,
      hours_source: 'default',
      selected_task_ids: (aiResult.main_plan || []).map(p => p.task_id),
      fragment_task_ids: aiResult.fragment_plan || [],
      plan_text: aiResult.summary || '',
      ai_raw: aiResult,
      generated_at: db.serverDate(),
      next_day_auth: false
    }
  })

  await sendSubscribeMessage(accessToken, openid, TEMPLATE_ID, {
    thing20: { value: (topTask ? topTask.title : '查看今日计划').substring(0, 20) },
    time2: { value: today },
    time11: { value: '07:50' },
    thing13: { value: (aiResult.summary || '早！今天' + planCount + '件事，开始规划吧').substring(0, 20) }
  }, 'pages/index/index')
}

exports.main = async (event, context) => {
  const today = todayStr()
  console.log(`morningPush running for ${today}`)

  try {
    const authRes = await db.collection('push_auth')
      .where({ push_type: 'morning', target_date: today, used: false })
      .limit(100)
      .get()

    const authorizedUsers = authRes.data || []
    console.log(`Found ${authorizedUsers.length} users with push auth`)

    if (authorizedUsers.length === 0) return { date: today, processed: 0, results: [] }

    const accessToken = await getAccessToken()
    console.log('access_token obtained')

    const results = []
    for (const auth of authorizedUsers) {
      try {
        const userRes = await db.collection('users').doc(auth.user_id).get()
        await generateAndPushForUser(userRes.data, today, accessToken)
        await db.collection('push_auth').doc(auth._id).update({ data: { used: true } })
        results.push({ user_id: auth.user_id, status: 'success' })
      } catch (e) {
        console.error(`Push failed for ${auth.user_id}:`, e.message)
        results.push({ user_id: auth.user_id, status: 'error', error: e.message })
      }
    }

    return { date: today, processed: results.length, results }
  } catch (e) {
    console.error('morningPush error:', e)
    return { error: e.message }
  }
}
