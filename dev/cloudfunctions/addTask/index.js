const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const calcQuadrant = (importance, deadline) => {
  const isUrgent = deadline && (new Date(deadline) - new Date()) / (1000 * 60 * 60 * 24) <= 3
  const isImportant = importance >= 3
  if (isUrgent && isImportant) return 'Q1'
  if (!isUrgent && isImportant) return 'Q2'
  if (isUrgent && !isImportant) return 'Q3'
  return 'Q4'
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { title, deadline, estimatedMinutes, importance, description } = event

  try {
    const isFragment = estimatedMinutes <= 10
    const quadrant = isFragment ? 'Q4' : calcQuadrant(importance, deadline)

    const taskData = {
      user_id: openid,
      title: title.trim(),
      description: description || '',
      deadline: deadline || null,
      estimated_minutes: estimatedMinutes || 30,
      importance: importance || 2,
      urgency: deadline ? Math.max(1, 4 - Math.ceil((new Date(deadline) - new Date()) / (1000 * 60 * 60 * 24))) : 1,
      quadrant,
      is_fragment: isFragment,
      status: 'pending',
      fail_history: [],
      fail_count: 0,
      parent_task_id: null,
      created_at: db.serverDate(),
      completed_at: null
    }

    const res = await db.collection('tasks').add({ data: taskData })
    return { success: true, taskId: res._id }
  } catch (e) {
    console.error('addTask error:', e)
    return { error: e.message }
  }
}
