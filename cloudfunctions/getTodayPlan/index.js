const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const parseTime = (t) => { const p = t.split(':'); return parseInt(p[0]) * 60 + parseInt(p[1]) }
const fmtTime = (m) => { const h = Math.floor(m / 60) % 24; return (h < 10 ? '0' : '') + h + ':' + (m % 60 < 10 ? '0' : '') + m % 60 }

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
      // 优先用 AI 返回的 suggested_end_time（已考虑拖延校准），没有才用原始预估估算
      let endTime = aiEntry ? aiEntry.suggested_end_time : null
      if (!endTime && aiEntry && aiEntry.suggested_start_time && task.estimated_minutes) {
        endTime = fmtTime(parseTime(aiEntry.suggested_start_time) + task.estimated_minutes)
      }
      return {
        ...task,
        suggested_minutes: (aiEntry && aiEntry.suggested_minutes) || task.estimated_minutes,
        suggested_start_time: aiEntry ? aiEntry.suggested_start_time : null,
        suggested_end_time: endTime,
        ai_note: aiEntry ? aiEntry.note : ''
      }
    })

    // 按开始时间排序，检查相邻非完成任务是否重叠，级联微调避免覆盖
    // 已完成任务不参与级联，保持原时间不变
    const sorted = mainTasksWithNotes
      .filter(t => t.suggested_start_time && t.status !== 'completed')
      .sort((a, b) => a.suggested_start_time.localeCompare(b.suggested_start_time))
    for (let i = 0; i < sorted.length - 1; i++) {
      const cur = sorted[i]
      const next = sorted[i + 1]
      if (cur.status === 'completed' || next.status === 'completed') continue
      const curEnd = parseTime(cur.suggested_end_time)
      const nextStart = parseTime(next.suggested_start_time)
      const minGap = 10 // 至少10分钟缓冲
      if (curEnd + minGap > nextStart) {
        const shift = curEnd + minGap - nextStart
        const nextEnd = parseTime(next.suggested_end_time)
        next.suggested_start_time = fmtTime(nextStart + shift)
        next.suggested_end_time = fmtTime(nextEnd + shift)
        // 检查移位后是否超出截止时间
        if (next.deadline) {
          const dlMin = parseTime(next.deadline.substring(11, 16))
          if (nextEnd + shift > dlMin) {
            console.log(`task ${next._id} (${next.title}) shifted past deadline: end ${next.suggested_end_time} > deadline ${next.deadline}`)
          }
        }
      }
    }

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
