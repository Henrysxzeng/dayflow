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

    return { success: true, streak: newStreak, newAchievements }
  } catch (e) {
    console.error('completeTask error:', e)
    return { error: e.message }
  }
}
