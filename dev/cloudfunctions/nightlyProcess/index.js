const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

exports.main = async (event, context) => {
  const today = todayStr()
  console.log(`nightlyProcess running for ${today}`)

  try {
    const plansRes = await db.collection('daily_plans')
      .where({ plan_date: today })
      .limit(200)
      .get()

    const plans = plansRes.data || []
    let processed = 0

    for (const plan of plans) {
      const allTaskIds = [...(plan.selected_task_ids || []), ...(plan.fragment_task_ids || [])]
      if (allTaskIds.length === 0) continue

      const tasksRes = await db.collection('tasks')
        .where({ _id: db.command.in(allTaskIds), status: 'in_plan' })
        .get()

      const unfinishedTasks = tasksRes.data || []

      // 更新任务状态并收集待标记列表
      const pendingTags = []
      for (const task of unfinishedTasks) {
        const newFailHistory = [
          ...(task.fail_history || []),
          { date: today, reason: 'no_time' }
        ]
        const failCount = newFailHistory.filter(h => h.reason === 'too_hard').length
        const newStatus = failCount >= 2 ? 'needs_breakdown' : 'pending'

        await db.collection('tasks').doc(task._id).update({
          data: { status: newStatus, fail_history: newFailHistory, fail_count: db.command.inc(1) }
        })

        pendingTags.push({ task_id: task._id, task_title: task.title, date: today })
      }

      // 写入用户待标记队列（让用户明早填真实原因）
      if (pendingTags.length > 0) {
        await db.collection('users').doc(plan.user_id).update({
          data: {
            pending_failure_tags: db.command.push({ each: pendingTags })
          }
        })
      }

      // 更新日志
      const completedCount = (plan.selected_task_ids || []).length - unfinishedTasks.length
      const logRes = await db.collection('daily_logs')
        .where({ user_id: plan.user_id, log_date: today })
        .get()

      if (logRes.data && logRes.data.length > 0) {
        await db.collection('daily_logs').doc(logRes.data[0]._id).update({
          data: { tasks_planned: (plan.selected_task_ids || []).length, tasks_deferred: unfinishedTasks.length }
        })
      } else {
        await db.collection('daily_logs').add({
          data: {
            user_id: plan.user_id,
            log_date: today,
            tasks_planned: (plan.selected_task_ids || []).length,
            tasks_completed: completedCount,
            tasks_deferred: unfinishedTasks.length,
            created_at: db.serverDate()
          }
        })
      }

      processed++
    }

    return { date: today, plans_processed: processed }
  } catch (e) {
    console.error('nightlyProcess error:', e)
    return { error: e.message }
  }
}
