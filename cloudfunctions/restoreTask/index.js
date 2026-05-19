const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { taskId, newDeadline } = event

  try {
    const taskRes = await db.collection('tasks').doc(taskId).get()
    const original = taskRes.data
    if (original.user_id !== openid) return { error: 'unauthorized' }

    // 直接将原任务恢复为 pending，不创建新任务
    // 这样已完成列表会移除它，待完成列表会出现它
    await db.collection('tasks').doc(taskId).update({
      data: {
        status: 'pending',
        completed_at: null,
        deadline: newDeadline || original.deadline,
        fail_history: [],
        fail_count: 0,
        updated_at: db.serverDate()
      }
    })

    return { success: true, taskId }
  } catch (e) {
    return { error: e.message }
  }
}
