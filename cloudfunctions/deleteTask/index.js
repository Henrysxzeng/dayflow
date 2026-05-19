const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { taskId } = event

  try {
    const task = await db.collection('tasks').doc(taskId).get()
    if (task.data.user_id !== openid) {
      return { error: 'unauthorized' }
    }
    await db.collection('tasks').doc(taskId).remove()
    return { success: true }
  } catch (e) {
    return { error: e.message }
  }
}
