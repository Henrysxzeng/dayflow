const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// V2: 支持工作日/周末区分 + 晚饭时间
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { wakeTime, sleepTime, hasLunchBreak, lunchStart, lunchEnd,
          hasDinnerBreak, dinnerStart, dinnerEnd,
          weekendDifferent, weekendWakeTime, weekendSleepTime,
          peakMorning, peakEvening } = event

  try {
    const prefs = {
      wake_time: wakeTime || '07:00',
      sleep_time: sleepTime || '23:00',
      has_lunch_break: hasLunchBreak !== undefined ? hasLunchBreak : null,
      lunch_start: hasLunchBreak ? (lunchStart || '12:00') : null,
      lunch_end: hasLunchBreak ? (lunchEnd || '13:30') : null,
      has_dinner_break: hasDinnerBreak || false,
      dinner_start: hasDinnerBreak ? (dinnerStart || '18:00') : null,
      dinner_end: hasDinnerBreak ? (dinnerEnd || '19:00') : null,
      weekend_different: weekendDifferent || false,
      weekend_wake_time: weekendDifferent ? (weekendWakeTime || '09:00') : null,
      weekend_sleep_time: weekendDifferent ? (weekendSleepTime || '00:00') : null,
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
