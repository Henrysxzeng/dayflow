const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { action, taskId, taskTitle, startTime, phase, totalSeconds, minutesToAdd } = event

  try {
    if (action === 'start') {
      await db.collection('users').doc(openid).update({
        data: {
          active_pomodoro: {
            task_id: taskId,
            task_title: taskTitle,
            start_time: startTime,
            phase: phase || 'focus',
            total_seconds: totalSeconds || 25 * 60
          }
        }
      })
    } else if (action === 'addTime') {
      // 记录番茄钟已花费时间到任务
      await db.collection('tasks').doc(taskId).update({
        data: { time_spent_minutes: db.command.inc(minutesToAdd || 25) }
      })
      await db.collection('users').doc(openid).update({
        data: { active_pomodoro: db.command.remove() }
      })
    } else {
      await db.collection('users').doc(openid).update({
        data: { active_pomodoro: db.command.remove() }
      })
    }
    return { success: true }
  } catch (e) {
    return { error: e.message }
  }
}
