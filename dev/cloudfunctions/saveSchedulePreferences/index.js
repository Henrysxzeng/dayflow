const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { wakeTime, sleepTime, hasLunchBreak, lunchStart, lunchEnd, peakMorning, peakEvening } = event

  try {
    const prefs = {
      wake_time: wakeTime || '07:00',
      sleep_time: sleepTime || '23:00',
      has_lunch_break: hasLunchBreak !== undefined ? hasLunchBreak : null,
      lunch_start: hasLunchBreak ? (lunchStart || '12:00') : null,
      lunch_end: hasLunchBreak ? (lunchEnd || '13:30') : null,
      peak_morning: peakMorning || false,
      peak_evening: peakEvening || false,
      setup_completed: true
    }

    await db.collection('users').doc(openid).update({
      data: { schedule_preferences: prefs, updated_at: db.serverDate() }
    })
    return { success: true }
  } catch (e) {
    return { error: e.message }
  }
}
