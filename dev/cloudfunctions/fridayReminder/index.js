const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const TEMPLATE_ID = 'J1dVGMwQvPuVfQZJBxoQc9lZk9aCHIvQREa5kewt14w'

const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

exports.main = async (event, context) => {
  const today = todayStr()

  try {
    const authRes = await db.collection('push_auth')
      .where({ target_date: today, used: false })
      .limit(200)
      .get()

    let pushed = 0
    for (const auth of authRes.data || []) {
      try {
        const logRes = await db.collection('daily_logs')
          .where({ user_id: auth.user_id, log_date: today })
          .get()
        const completedToday = logRes.data && logRes.data[0] ? (logRes.data[0].tasks_completed || 0) : 0

        await cloud.openapi.subscribeMessage.send({
          touser: auth.user_id,
          template_id: TEMPLATE_ID,
          page: 'pages/index/index?mode=friday',
          data: {
            thing1: { value: '一周结束了，给下周做个计划' },
            thing2: { value: completedToday > 0 ? `今天完成了${completedToday}件，收官不错` : '告诉Flow下周最重要的事' },
            thing3: { value: '周一Flow会第一个提醒你' }
          }
        })
        pushed++
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
