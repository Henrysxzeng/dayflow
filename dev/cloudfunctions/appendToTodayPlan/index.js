const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const parseTimeToMin = (timeStr) => {
  if (!timeStr) return 0
  const parts = timeStr.split(':')
  return parseInt(parts[0]) * 60 + parseInt(parts[1])
}

const fmtTime = (totalMin) => {
  const h = Math.floor(totalMin / 60) % 24
  const m = totalMin % 60
  return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { taskId, planId } = event

  try {
    const taskRes = await db.collection('tasks').doc(taskId).get()
    const task = taskRes.data
    if (task.user_id !== openid) return { error: 'unauthorized' }

    await db.collection('tasks').doc(taskId).update({ data: { status: 'in_plan' } })

    // 计算追加任务的时间段：找到非完成任务中最晚的结束时间
    // 提前完成的任务释放了时间空档，不应阻碍新任务插入
    let latestEndMin = 0

    if (planId) {
      const planRes = await db.collection('daily_plans').doc(planId).get()
      const plan = planRes.data
      const mainPlan = (plan.ai_raw && plan.ai_raw.main_plan) || []
      const mainTaskIds = mainPlan.map(function(e) { return e.task_id }).filter(Boolean)
      // 查出哪些任务已完成，排除它们的时段
      let completedIds = []
      if (mainTaskIds.length > 0) {
        const doneRes = await db.collection('tasks')
          .where({ _id: db.command.in(mainTaskIds), status: 'completed' })
          .get()
        completedIds = (doneRes.data || []).map(function(t) { return t._id })
      }
      mainPlan.forEach(function(entry) {
        if (completedIds.indexOf(entry.task_id) >= 0) return // 跳过已完成任务
        const m = parseTimeToMin(entry.suggested_end_time)
        if (m > latestEndMin) latestEndMin = m
      })
      const busySlots = plan.busy_slots || []
      busySlots.forEach(function(slot) {
        const m = parseTimeToMin(slot.end)
        if (m > latestEndMin) latestEndMin = m
      })
    }

    // 无参考时间时，用当前时间（向上取整到15分钟），最早9:00
    if (latestEndMin === 0) {
      const now = new Date()
      latestEndMin = now.getHours() * 60 + now.getMinutes()
      latestEndMin = Math.ceil(latestEndMin / 15) * 15
      if (latestEndMin < 9 * 60) latestEndMin = 9 * 60
    }

    const estimatedMin = task.estimated_minutes || 30
    let startMin = latestEndMin + 15
    let endMin = startMin + estimatedMin

    // 截止时间约束：不能超过截止时间
    if (task.deadline) {
      const dlMin = parseTimeToMin(task.deadline.substring(11, 16))
      if (endMin > dlMin) {
        endMin = dlMin
        startMin = Math.max(latestEndMin + 15, endMin - estimatedMin)
      }
    }

    const startTime = fmtTime(startMin)
    const endTime = fmtTime(endMin)

    const startHour = Math.floor(startMin / 60)
    let note = ''
    if (startHour < 10) note = '晨间皮质醇峰值期，决策力与专注力达全天最高'
    else if (startHour < 12) note = '前额叶皮层活跃末期，趁黄金窗口收尾深度任务'
    else if (startHour < 14) note = '午后血清素自然回落，轻松任务助认知恢复'
    else if (startHour < 17) note = '下午第二个生理高效期，睾酮与多巴胺协同助行动'
    else if (startHour < 20) note = '昼夜节律黄昏峰，身体协调与情绪处于最佳平衡'
    else note = '夜间去甲肾上腺素下降，低压力窗口适合收尾整理'

    const aiEntry = {
      task_id: taskId,
      suggested_minutes: estimatedMin,
      suggested_start_time: startTime,
      suggested_end_time: endTime,
      note
    }

    const today = todayStr()
    if (planId) {
      const planRes = await db.collection('daily_plans').doc(planId).get()
      const plan = planRes.data
      const existingMainPlan = (plan.ai_raw && plan.ai_raw.main_plan) || []
      await db.collection('daily_plans').doc(planId).update({
        data: {
          selected_task_ids: db.command.push(taskId),
          ai_raw: { main_plan: existingMainPlan.concat([aiEntry]) }
        }
      })
    } else {
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
          regenerated_count: 0,
          ai_raw: { main_plan: [aiEntry] }
        }
      })
    }

    return {
      success: true,
      task,
      suggested_start_time: startTime,
      suggested_end_time: endTime
    }
  } catch (e) {
    return { error: e.message }
  }
}
