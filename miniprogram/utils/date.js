const WEEK_DAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

const todayString = () => {
  const d = new Date()
  const m = d.getMonth() + 1
  const day = d.getDate()
  return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day
}

const formatDateDisplay = (date = new Date()) => {
  const d = typeof date === 'string' ? new Date(date) : date
  return `${WEEK_DAYS[d.getDay()]} · ${d.getMonth() + 1}月${d.getDate()}日`
}

const safeDate = (dateStr) => {
  if (!dateStr) return null
  // iOS 不支持 "yyyy-MM-dd HH:mm" 格式，需要替换为 "yyyy-MM-ddTHH:mm"
  const normalized = dateStr.replace(' ', 'T')
  return new Date(normalized)
}

const formatDeadline = (dateStr) => {
  if (!dateStr) return '无截止'
  const d = safeDate(dateStr)
  if (!d || isNaN(d.getTime())) return '无截止'
  const today = new Date()
  const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const deadlineDate = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const diff = Math.round((deadlineDate - todayDate) / (1000 * 60 * 60 * 24))
  if (diff < 0) return '已过期'
  if (diff === 0) return '今天截止'
  if (diff === 1) return '明天截止'
  if (diff <= 7) return `${diff}天后截止`
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

const minutesToDisplay = (minutes) => {
  if (minutes < 60) return `${minutes}分`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h${m}分` : `${h}小时`
}

module.exports = { todayString, formatDateDisplay, formatDeadline, minutesToDisplay }
