const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { date } = event

  try {
    const planRes = await db.collection('daily_plans')
      .where({ user_id: openid, plan_date: date })
      .get()

    if (!planRes.data || planRes.data.length === 0) {
      return { plan: null }
    }

    const plan = planRes.data[0]

    const [mainTasksRes, fragmentTasksRes] = await Promise.all([
      plan.selected_task_ids && plan.selected_task_ids.length > 0
        ? db.collection('tasks').where({ _id: db.command.in(plan.selected_task_ids) }).get()
        : Promise.resolve({ data: [] }),
      plan.fragment_task_ids && plan.fragment_task_ids.length > 0
        ? db.collection('tasks').where({ _id: db.command.in(plan.fragment_task_ids) }).get()
        : Promise.resolve({ data: [] })
    ])

    const mainTasksWithNotes = (mainTasksRes.data || []).map(task => {
      const aiEntry = plan.ai_raw && plan.ai_raw.main_plan
        ? plan.ai_raw.main_plan.find(p => p.task_id === task._id)
        : null
      return {
        ...task,
        suggested_minutes: aiEntry ? aiEntry.suggested_minutes : task.estimated_minutes,
        ai_note: aiEntry ? aiEntry.note : ''
      }
    })

    return {
      plan: {
        ...plan,
        selected_task_ids_data: mainTasksWithNotes,
        fragment_task_ids_data: fragmentTasksRes.data || []
      }
    }
  } catch (e) {
    return { error: e.message, plan: null }
  }
}
