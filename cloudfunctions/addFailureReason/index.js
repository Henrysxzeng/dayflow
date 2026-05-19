const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { taskId, reason } = event

  try {
    const taskRes = await db.collection('tasks').doc(taskId).get()
    const task = taskRes.data
    const newHistory = [...(task.fail_history || []), { date: todayStr(), reason }]
    const failCount = newHistory.filter(h => h.reason === 'too_hard').length

    let newStatus = 'pending'
    let needsBreakdown = false
    if (failCount >= 2) {
      newStatus = 'needs_breakdown'
      needsBreakdown = true
    }
    if (reason === 'dont_want' && newHistory.filter(h => h.reason === 'dont_want').length >= 2) {
      newStatus = 'deferred'
    }

    await db.collection('tasks').doc(taskId).update({
      data: {
        fail_history: newHistory,
        fail_count: db.command.inc(1),
        status: newStatus
      }
    })

    await db.collection('users').doc(openid).update({
      data: {
        pending_failure_tags: db.command.pull({ task_id: taskId })
      }
    })

    return { success: true, needsBreakdown, newStatus }
  } catch (e) {
    return { error: e.message }
  }
}
