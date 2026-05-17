const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { date } = event

  const d = new Date(date)
  d.setDate(d.getDate() + 1)
  const targetDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

  try {
    await db.collection('push_auth').add({
      data: {
        user_id: openid,
        target_date: targetDate,
        used: false,
        authorized_at: db.serverDate()
      }
    })
    return { success: true }
  } catch (e) {
    return { error: e.message }
  }
}
