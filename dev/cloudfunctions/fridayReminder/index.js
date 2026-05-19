const cloud = require('wx-server-sdk')
const https = require('https')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const TEMPLATE_ID = 'J1dVGMwQvPuVfQZJBxoQc9lZk9aCHIvQREa5kewt14w'
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
    const authRes = await db.collection('push_auth')
      .where({ push_type: 'friday', used: false })
      .limit(200)
      .get()

    if (authRes.data.length === 0) return { today, pushed: 0 }

    const accessToken = await getAccessToken()
    console.log('access_token obtained')
    let pushed = 0

    for (const auth of authRes.data || []) {
      try {
        const logRes = await db.collection('daily_logs')
          .where({ user_id: auth.user_id, log_date: today })
          .get()
        const completedToday = logRes.data && logRes.data[0] ? (logRes.data[0].tasks_completed || 0) : 0

        const sendRes = await sendSubscribeMessage(accessToken, auth.user_id, TEMPLATE_ID, {
          thing1: { value: '周末前整理一下，下周更从容' },
          time8: { value: today },
          thing5: { value: completedToday > 0 ? ('本周完成' + completedToday + '件，安心休息吧').substring(0, 20) : '清空待办，周末才能真正放松' }
        }, 'pages/index/index?mode=friday')

        if (sendRes.errcode === 0) {
          await db.collection('push_auth').doc(auth._id).update({ data: { used: true } })
          pushed++
        } else {
          console.log(`send failed for ${auth.user_id}: ${sendRes.errcode} ${sendRes.errmsg}`)
          if (sendRes.errcode === 43101) {
            await db.collection('push_auth').doc(auth._id).update({ data: { used: true } })
          }
        }
      } catch (e) {
        console.log(`fridayReminder failed for ${auth.user_id}:`, e.message)
      }
    }

    return { today, pushed }
  } catch (e) {
    console.error('fridayReminder error:', e)
    return { error: e.message }
  }
}
