const cloud = require('wx-server-sdk')
const https = require('https')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const TEMPLATE_ID = 'WwdP2DizjA9fmYOIOqKd-yWFcCFKmBg9h-TLm4U8r4E'
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

exports.main = async (event, context) => {
  const today = todayStr()

  try {
    const plansRes = await db.collection('daily_plans')
      .where({ plan_date: today })
      .limit(200)
      .get()

    if (plansRes.data.length === 0) return { today, pushed: 0 }

    console.log(`found ${plansRes.data.length} plans for today`)
    const accessToken = await getAccessToken()
    console.log('access_token obtained')
    let pushed = 0

    for (const plan of plansRes.data || []) {
      if (!plan.selected_task_ids || plan.selected_task_ids.length === 0) {
        console.log(`plan ${plan._id}: no tasks selected`)
        continue
      }

      const tasksRes = await db.collection('tasks')
        .where({ _id: db.command.in(plan.selected_task_ids), status: db.command.neq('completed') })
        .get()
      const remainingCount = (tasksRes.data || []).length
      if (remainingCount <= 0) {
        console.log(`plan ${plan._id}: all ${plan.selected_task_ids.length} tasks completed`)
        continue
      }

      console.log(`plan ${plan._id}: ${remainingCount} remaining tasks, looking for push_auth`)
      const authRes = await db.collection('push_auth')
        .where({ user_id: plan.user_id, push_type: 'evening', target_date: today, used: false })
        .get()
      if (!authRes.data || authRes.data.length === 0) {
        console.log(`plan ${plan._id}: no evening push_auth for ${plan.user_id}`)
        continue
      }

      try {
        const sendRes = await sendSubscribeMessage(accessToken, plan.user_id, TEMPLATE_ID, {
          time1: { value: '20:00' },
          thing2: { value: remainingCount + '件事还没做？清掉好入睡' }
        }, 'pages/index/index')

        if (sendRes.errcode === 0) {
          await db.collection('push_auth').doc(authRes.data[0]._id).update({ data: { used: true } })
          pushed++
        } else {
          console.log(`send failed for ${plan.user_id}: ${sendRes.errcode} ${sendRes.errmsg}`)
          if (sendRes.errcode === 43101) {
            await db.collection('push_auth').doc(authRes.data[0]._id).update({ data: { used: true } })
          }
        }
      } catch (e) {
        console.log('evening push failed for ' + plan.user_id + ':', e.message)
      }
    }

    return { today, pushed }
  } catch (e) {
    console.error('eveningPush error:', e)
    return { error: e.message }
  }
}
