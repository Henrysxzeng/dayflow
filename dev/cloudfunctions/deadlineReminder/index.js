const cloud = require('wx-server-sdk')
const https = require('https')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const TEMPLATE_ID = 'J1dVGMwQvPuVfQZJBxoQc9lZk9aCHIvQREa5kewt14w'
const APPID = 'wxd0de3ba5bb35cb1d'
const APP_SECRET = process.env.APP_SECRET

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
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')) })
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
  const now = Date.now()
  console.log(`deadlineReminder running at ${new Date(now).toISOString()}`)

  try {
    const authRes = await db.collection('push_auth')
      .where({ push_type: 'deadline', used: false })
      .limit(200)
      .get()

    const records = authRes.data || []
    const validRecords = records.filter(r => r.task_id)
    console.log(`found ${records.length} auth records, ${validRecords.length} with task_id`)

    if (validRecords.length === 0) return { now: new Date(now).toISOString(), pushed: 0 }

    const accessToken = await getAccessToken()
    let pushed = 0

    for (const auth of validRecords) {
      try {
        const taskRes = await db.collection('tasks').doc(auth.task_id).get()
        const task = taskRes.data
        if (!task || task.status === 'completed') {
          console.log(`task ${auth.task_id} not found or completed, marking auth used`)
          await db.collection('push_auth').doc(auth._id).update({ data: { used: true } })
          continue
        }

        if (!task.deadline || !task.reminder_minutes_before) {
          console.log(`task ${auth.task_id} missing deadline or reminder, marking auth used`)
          await db.collection('push_auth').doc(auth._id).update({ data: { used: true } })
          continue
        }

        const deadlineMs = new Date(task.deadline.replace(' ', 'T') + '+08:00').getTime()
        const reminderWindowStart = deadlineMs - task.reminder_minutes_before * 60000

        if (now < reminderWindowStart) {
          console.log(`task ${auth.task_id} not yet in reminder window`)
          continue
        }

        if (now >= deadlineMs) {
          console.log(`task ${auth.task_id} deadline passed, marking auth used`)
          await db.collection('push_auth').doc(auth._id).update({ data: { used: true } })
          continue
        }

        const minutesLeft = Math.round((deadlineMs - now) / 60000)
        let tip = ''
        if (minutesLeft <= 15) tip = ('只剩' + minutesLeft + '分钟！冲刺搞定它').substring(0, 20)
        else if (minutesLeft <= 60) tip = ('还有' + minutesLeft + '分钟，现在动手吧').substring(0, 20)
        else { const h = Math.round(minutesLeft / 60); tip = (h + '小时后截止，别给明天留坑').substring(0, 20) }

        const sendRes = await sendSubscribeMessage(accessToken, auth.user_id, TEMPLATE_ID, {
          thing1: { value: task.title.substring(0, 20) },
          time8: { value: task.deadline },
          thing5: { value: tip }
        }, 'pages/index/index')

        if (sendRes.errcode === 0) {
          await db.collection('push_auth').doc(auth._id).update({ data: { used: true } })
          pushed++
          console.log(`pushed reminder for task ${auth.task_id} to ${auth.user_id}`)
        } else {
          console.log(`send failed for task ${auth.task_id}: ${sendRes.errcode} ${sendRes.errmsg}`)
          // 如果是用户拒绝或其它不可恢复错误，也标记已用避免重复尝试
          if (sendRes.errcode === 43101) {
            await db.collection('push_auth').doc(auth._id).update({ data: { used: true } })
          }
        }
      } catch (e) {
        console.log(`failed for auth ${auth._id} task ${auth.task_id}:`, e.message)
      }
    }

    return { now: new Date(now).toISOString(), pushed }
  } catch (e) {
    console.error('deadlineReminder error:', e)
    return { error: e.message }
  }
}
