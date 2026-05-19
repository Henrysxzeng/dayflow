const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const TEMPLATE_MAP = {
  morning: 'P9sWcD2pBtrsB4MZzhULtQw65HMXPCE_Hsx5QSZ_J-k',
  evening: 'WwdP2DizjA9fmYOIOqKd-yWFcCFKmBg9h-TLm4U8r4E',
  friday: 'J1dVGMwQvPuVfQZJBxoQc9lZk9aCHIvQREa5kewt14w'
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { date, types } = event

  const d = new Date(date)
  const today = date

  d.setDate(d.getDate() + 1)
  const tomorrow = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

  const requested = types || ['morning', 'evening', 'friday']

  try {
    const records = []

    if (requested.includes('morning')) {
      records.push({
        user_id: openid,
        push_type: 'morning',
        template_id: TEMPLATE_MAP.morning,
        target_date: tomorrow,
        used: false,
        authorized_at: db.serverDate()
      })
    }

    if (requested.includes('evening')) {
      records.push({
        user_id: openid,
        push_type: 'evening',
        template_id: TEMPLATE_MAP.evening,
        target_date: today,
        used: false,
        authorized_at: db.serverDate()
      })
    }

    if (requested.includes('friday')) {
      records.push({
        user_id: openid,
        push_type: 'friday',
        template_id: TEMPLATE_MAP.friday,
        target_date: today,
        used: false,
        authorized_at: db.serverDate()
      })
    }

    for (const rec of records) {
      await db.collection('push_auth').add({ data: rec })
    }

    return { success: true, created: records.length }
  } catch (e) {
    return { error: e.message }
  }
}
