const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { taskId } = event

  if (!taskId) return { error: 'missing taskId' }

  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  try {
    await db.collection('push_auth').add({
      data: {
        user_id: openid,
        push_type: 'deadline',
        task_id: taskId,
        target_date: todayStr,
        used: false,
        authorized_at: db.serverDate()
      }
    })
    return { success: true }
  } catch (e) {
    return { error: e.message }
  }
}
