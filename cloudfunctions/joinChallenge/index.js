const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { monthKey } = event

  try {
    const existing = await db.collection('challenge_participants')
      .where({ user_id: openid, month_key: monthKey })
      .get()

    if (existing.data && existing.data.length > 0) {
      return { success: true, alreadyJoined: true }
    }

    await db.collection('challenge_participants').add({
      data: {
        user_id: openid,
        month_key: monthKey,
        joined_at: db.serverDate(),
        completed: false,
        completed_at: null
      }
    })

    return { success: true }
  } catch (e) {
    return { error: e.message }
  }
}
