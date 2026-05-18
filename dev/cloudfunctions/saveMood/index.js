const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { mood } = event // great | good | tired | exhausted

  try {
    const today = todayStr()
    const logRes = await db.collection('daily_logs')
      .where({ user_id: openid, log_date: today })
      .get()

    if (logRes.data && logRes.data.length > 0) {
      await db.collection('daily_logs').doc(logRes.data[0]._id).update({
        data: { mood }
      })
    } else {
      await db.collection('daily_logs').add({
        data: { user_id: openid, log_date: today, tasks_planned: 0, tasks_completed: 0, tasks_deferred: 0, mood, created_at: db.serverDate() }
      })
    }
    return { success: true }
  } catch (e) {
    return { error: e.message }
  }
}
