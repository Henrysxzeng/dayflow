const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const calcQuadrant = (importance, deadline) => {
  const isUrgent = deadline && (new Date(deadline.replace(' ', 'T')) - new Date()) / (1000 * 60 * 60 * 24) <= 3
  const isImportant = importance >= 3
  if (isUrgent && isImportant) return 'Q1'
  if (!isUrgent && isImportant) return 'Q2'
  if (isUrgent && !isImportant) return 'Q3'
  return 'Q4'
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { taskId, title, deadline, estimatedMinutes, importance, description } = event

  try {
    const taskRes = await db.collection('tasks').doc(taskId).get()
    if (taskRes.data.user_id !== openid) return { error: 'unauthorized' }

    const isFragment = estimatedMinutes <= 10
    const quadrant = isFragment ? 'Q4' : calcQuadrant(importance, deadline)

    await db.collection('tasks').doc(taskId).update({
      data: {
        title: title.trim(),
        deadline: deadline || null,
        estimated_minutes: estimatedMinutes,
        importance,
        description: description || '',
        is_fragment: isFragment,
        quadrant,
        updated_at: db.serverDate()
      }
    })
    return { success: true }
  } catch (e) {
    return { error: e.message }
  }
}
