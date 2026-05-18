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

    // 创建恢复后的新任务，保留所有原始数据
    const newTaskData = {
      user_id: openid,
      title: original.title,
      description: original.description || '',
      deadline: newDeadline || original.deadline,
      estimated_minutes: original.estimated_minutes,
      importance: original.importance,
      urgency: original.urgency,
      quadrant: original.quadrant,
      is_fragment: original.is_fragment,
      preferred_time: original.preferred_time || null,
      locked_start_time: original.locked_start_time || null,
      status: 'pending',
      fail_history: [],
      fail_count: 0,
      restored_from: taskId,
      created_at: db.serverDate(),
      completed_at: null
    }

    const res = await db.collection('tasks').add({ data: newTaskData })
    return { success: true, newTaskId: res._id }
  } catch (e) {
    return { error: e.message }
  }
}
