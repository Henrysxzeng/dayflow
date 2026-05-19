const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { defaultHours, aiTone, wakeTime } = event

  const updates = {}
  if (defaultHours !== undefined) updates['settings.default_daily_hours'] = defaultHours
  if (aiTone !== undefined) updates['settings.ai_tone'] = aiTone
  if (wakeTime !== undefined) updates['settings.wake_time'] = wakeTime
  updates['updated_at'] = db.serverDate()

  try {
    await db.collection('users').doc(openid).update({ data: updates })
    return { success: true }
  } catch (e) {
    return { error: e.message }
  }
}
