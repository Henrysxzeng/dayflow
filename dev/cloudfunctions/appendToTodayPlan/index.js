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
  const { taskId, planId } = event

  try {
    const taskRes = await db.collection('tasks').doc(taskId).get()
    const task = taskRes.data
    if (task.user_id !== openid) return { error: 'unauthorized' }

    // 更新任务状态为 in_plan
    await db.collection('tasks').doc(taskId).update({ data: { status: 'in_plan' } })

    const today = todayStr()
    if (planId) {
      // 追加到现有计划
      await db.collection('daily_plans').doc(planId).update({
        data: { selected_task_ids: db.command.push(taskId) }
      })
    } else {
      // 创建今日计划（极简版，仅含此任务）
      await db.collection('daily_plans').add({
        data: {
          user_id: openid,
          plan_date: today,
          available_hours: 4,
          selected_task_ids: [taskId],
          fragment_task_ids: [],
          busy_slots: [],
          plan_text: '',
          generated_at: db.serverDate(),
          regenerated_count: 0
        }
      })
    }

    return { success: true, task }
  } catch (e) {
    return { error: e.message }
  }
}
