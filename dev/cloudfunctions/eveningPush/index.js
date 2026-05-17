const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const TEMPLATE_ID = 'J1dVGMwQvPuVfQZJBxoQc9lZk9aCHIvQREa5kewt14w'

const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

exports.main = async (event, context) => {
  const today = todayStr()

  try {
    // 找今天有计划但还没完成任务的用户
    const plansRes = await db.collection('daily_plans')
      .where({ plan_date: today })
      .limit(200)
      .get()

    let pushed = 0

    for (const plan of plansRes.data || []) {
      if (!plan.selected_task_ids || plan.selected_task_ids.length === 0) continue

      // 检查今天的完成情况
      const logRes = await db.collection('daily_logs')
        .where({ user_id: plan.user_id, log_date: today })
        .get()

      const log = logRes.data && logRes.data[0]
      const completedToday = log ? (log.tasks_completed || 0) : 0
      const remainingCount = plan.selected_task_ids.length - completedToday

      if (remainingCount <= 0) continue // 已完成，不推送

      // 检查是否有推送授权（复用今天的授权）
      const authRes = await db.collection('push_auth')
        .where({ user_id: plan.user_id, target_date: today })
        .get()

      if (!authRes.data || authRes.data.length === 0) continue

      try {
        await cloud.openapi.subscribeMessage.send({
          touser: plan.user_id,
          template_id: TEMPLATE_ID,
          page: 'pages/index/index',
          data: {
            thing1: { value: `今天还有 ${remainingCount} 件事没完成` },
            thing2: { value: remainingCount === 1 ? '最后一件，收个尾吧' : '明天等你的事少一点' },
            thing3: { value: '现在还来得及，Flow 等你' }
          }
        })
        pushed++
      } catch (e) {
        console.log(`evening push failed for ${plan.user_id}:`, e.message)
      }
    }

    return { today, pushed }
  } catch (e) {
    console.error('eveningPush error:', e)
    return { error: e.message }
  }
}
