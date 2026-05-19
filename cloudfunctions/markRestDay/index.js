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

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const today = todayStr()
  const yesterday = yesterdayStr()

  try {
    const userRes = await db.collection('users').doc(openid).get()
    const streak = userRes.data.streak || { current: 0, longest: 0, last_active_date: '', jokers_remaining: 1 }

    if (streak.last_active_date === today) {
      return { success: true, streak: streak.current, message: 'already_marked' }
    }

    let newStreak
    if (streak.last_active_date === yesterday || streak.current === 0) {
      newStreak = streak.current + 1
    } else {
      newStreak = 1
    }

    await db.collection('users').doc(openid).update({
      data: {
        'streak.current': newStreak,
        'streak.longest': Math.max(newStreak, streak.longest || 0),
        'streak.last_active_date': today,
        updated_at: db.serverDate()
      }
    })

    await db.collection('daily_logs').add({
      data: {
        user_id: openid,
        log_date: today,
        tasks_planned: 0,
        tasks_completed: 0,
        tasks_deferred: 0,
        is_rest_day: true,
        created_at: db.serverDate()
      }
    })

    return { success: true, streak: newStreak }
  } catch (e) {
    return { error: e.message }
  }
}
