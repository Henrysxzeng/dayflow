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

  try {
    const userRes = await db.collection('users').doc(openid).get()
    const streak = userRes.data.streak || { current: 0, longest: 0, jokers_remaining: 1 }

    if ((streak.jokers_remaining || 0) <= 0) {
      return { success: false, message: 'no_jokers' }
    }

    const today = todayStr()
    await db.collection('users').doc(openid).update({
      data: {
        'streak.last_active_date': today,
        'streak.jokers_remaining': db.command.inc(-1),
        updated_at: db.serverDate()
      }
    })

    return { success: true, streak: streak.current, jokers_remaining: (streak.jokers_remaining || 1) - 1 }
  } catch (e) {
    return { error: e.message }
  }
}
