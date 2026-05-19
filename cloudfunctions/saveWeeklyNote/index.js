const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { note } = event

  try {
    await db.collection('users').doc(openid).update({
      data: { next_week_note: note, next_week_note_updated: db.serverDate() }
    })
    return { success: true }
  } catch (e) {
    return { error: e.message }
  }
}
