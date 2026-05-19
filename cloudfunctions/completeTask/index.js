const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const yesterdayStr = () => {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const ACHIEVEMENTS = [
  { id: 'first_complete', label: '🌱 起步', desc: '完成了第一个任务', check: (count) => count === 1 },
  { id: 'tasks_10', label: '🎯 十件成就', desc: '累计完成10件任务', check: (count) => count === 10 },
  { id: 'tasks_50', label: '💪 效率达人', desc: '累计完成50件任务', check: (count) => count === 50 },
  { id: 'tasks_100', label: '🚀 百件英雄', desc: '累计完成100件任务', check: (count) => count === 100 },
  { id: 'streak_3', label: '🔥 初燃', desc: '连续3天完成计划', check: (count, streak) => streak === 3 },
  { id: 'streak_7', label: '⚡ 一周战将', desc: '连续7天完成计划', check: (count, streak) => streak === 7 },
  { id: 'streak_30', label: '🏆 月度传奇', desc: '连续30天完成计划', check: (count, streak) => streak === 30 }
]

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { taskId, planId, timeAccuracy } = event

  try {
    const taskUpdate = { status: 'completed', completed_at: db.serverDate() }
    if (timeAccuracy) taskUpdate.time_accuracy = timeAccuracy
    await db.collection('tasks').doc(taskId).update({ data: taskUpdate })

    const today = todayStr()
    const yesterday = yesterdayStr()

    // 更新日志
    const logsRes = await db.collection('daily_logs').where({ user_id: openid, log_date: today }).get()
    if (logsRes.data && logsRes.data.length > 0) {
      await db.collection('daily_logs').doc(logsRes.data[0]._id).update({ data: { tasks_completed: db.command.inc(1) } })
    } else {
      await db.collection('daily_logs').add({ data: { user_id: openid, log_date: today, tasks_planned: 1, tasks_completed: 1, tasks_deferred: 0, created_at: db.serverDate() } })
    }

    // 更新 streak + 统计完成总数
    const userRes = await db.collection('users').doc(openid).get()
    const user = userRes.data
    const streak = user.streak || { current: 0, longest: 0, last_active_date: '', jokers_remaining: 1 }
    const totalCompleted = (user.total_completed || 0) + 1

    let newStreak
    if (streak.last_active_date === today) {
      newStreak = streak.current
    } else if (streak.last_active_date === yesterday || streak.current === 0) {
      newStreak = streak.current + 1
    } else {
      newStreak = 1
    }

    // 检查新成就
    const existingAchievements = user.achievements || []
    const newAchievements = ACHIEVEMENTS.filter(a =>
      !existingAchievements.includes(a.id) && a.check(totalCompleted, newStreak)
    )

    const updateData = {
      'streak.current': newStreak,
      'streak.longest': Math.max(newStreak, streak.longest || 0),
      'streak.last_active_date': today,
      total_completed: totalCompleted,
      updated_at: db.serverDate()
    }

    if (newAchievements.length > 0) {
      updateData.achievements = db.command.push({ each: newAchievements.map(a => a.id) })
      updateData.pending_achievements = db.command.push({
        each: newAchievements.map(a => ({ id: a.id, label: a.label, desc: a.desc, unlocked_at: new Date().toISOString() }))
      })
    }

    await db.collection('users').doc(openid).update({ data: updateData })

    // 循环任务：完成后自动创建下一次
    try {
      const completedTaskRes = await db.collection('tasks').doc(taskId).get()
      const ct = completedTaskRes.data
      if (ct.recurrence_type && ct.recurrence_type !== 'none') {
        const curDeadline = ct.deadline ? new Date(ct.deadline.replace(' ', 'T')) : new Date()
        let intervalDays = ct.recurrence_type === 'weekly' ? 7 : (ct.recurrence_type === 'custom' ? (ct.recurrence_interval || 7) : 1)
        const nextDate = new Date(curDeadline)
        nextDate.setDate(nextDate.getDate() + intervalDays)
        const nd = nextDate
        const nextDeadline = nd.getFullYear() + '-' + String(nd.getMonth() + 1).padStart(2, '0') + '-' + String(nd.getDate()).padStart(2, '0')
        await db.collection('tasks').add({
          data: {
            user_id: ct.user_id, title: ct.title, description: ct.description || '',
            deadline: nextDeadline, estimated_minutes: ct.estimated_minutes,
            importance: ct.importance, urgency: ct.urgency, quadrant: ct.quadrant,
            is_fragment: ct.is_fragment, locked_start_time: ct.locked_start_time || null,
            preferred_time: ct.preferred_time || null, reminder_minutes_before: ct.reminder_minutes_before || 0,
            recurrence_type: ct.recurrence_type, recurrence_interval: ct.recurrence_interval || 1,
            recurrence_days: ct.recurrence_days || [],
            status: 'pending', fail_history: [], fail_count: 0,
            parent_task_id: null, created_at: db.serverDate(), completed_at: null
          }
        })
      }
    } catch (rErr) { console.log('recurrence error:', rErr.message) }

    // 双人Streak：检查好友是否今天也完成了任务
    try {
      const friendshipsRes = await db.collection('friendships')
        .where({ _id: db.command.or([{ user_a: openid }, { user_b: openid }]) })
        .limit(20)
        .get()

      for (const fs of friendshipsRes.data || []) {
        const partnerId = fs.user_a === openid ? fs.user_b : fs.user_a
        const partnerLogRes = await db.collection('daily_logs')
          .where({ user_id: partnerId, log_date: today })
          .get()
        const partnerDone = partnerLogRes.data && partnerLogRes.data.length > 0 && (partnerLogRes.data[0].tasks_completed || 0) > 0
        if (partnerDone) {
          const ps = fs.pair_streak || { current: 0, longest: 0, last_date: '' }
          if (ps.last_date !== today) {
            const newPs = ps.last_date === yesterday ? ps.current + 1 : 1
            await db.collection('friendships').doc(fs._id).update({
              data: {
                'pair_streak.current': newPs,
                'pair_streak.longest': Math.max(newPs, ps.longest || 0),
                'pair_streak.last_date': today
              }
            })
          }
        }
      }
    } catch (pairErr) { console.log('pair streak error:', pairErr.message) }

    // 共同任务：更新状态和默契度
    try {
      const taskDoc = await db.collection('tasks').doc(taskId).get()
      if (taskDoc.data.is_shared) {
        const stRes = await db.collection('shared_tasks')
          .where({
            _id: db.command.or([
              { creator_task_id: taskId },
              { invitee_task_id: taskId }
            ])
          })
          .get()

        if (stRes.data && stRes.data.length > 0) {
          const st = stRes.data[0]
          const isCreator = st.creator_task_id === taskId
          const updateField = isCreator ? 'creator_completed' : 'invitee_completed'
          const otherDone = isCreator ? st.invitee_completed : st.creator_completed

          await db.collection('shared_tasks').doc(st._id).update({
            data: { [updateField]: true, status: otherDone ? 'both_done' : (isCreator ? 'creator_done' : 'invitee_done') }
          })

          if (otherDone) {
            // 双方都完成了，更新默契度
            const partnerId = isCreator ? st.invitee_id : st.creator_id
            const fsRes = await db.collection('friendships')
              .where({
                _id: db.command.or([
                  { user_a: openid, user_b: partnerId },
                  { user_a: partnerId, user_b: openid }
                ])
              })
              .get()
            if (fsRes.data && fsRes.data.length > 0) {
              await db.collection('friendships').doc(fsRes.data[0]._id).update({
                data: {
                  chemistry: db.command.inc(2),
                  shared_tasks_completed: db.command.inc(1)
                }
              })
            }
          }
        }
      }
    } catch (sharedErr) { console.log('shared task update error:', sharedErr.message) }

    return { success: true, streak: newStreak, newAchievements }
  } catch (e) {
    console.error('completeTask error:', e)
    return { error: e.message }
  }
}
