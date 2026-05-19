const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  try {
    const res = await db.collection('tasks')
      .where({ user_id: openid })
      .orderBy('created_at', 'desc')
      .limit(100)
      .get()
    return { tasks: res.data || [] }
  } catch (e) {
    return { error: e.message, tasks: [] }
  }
}
