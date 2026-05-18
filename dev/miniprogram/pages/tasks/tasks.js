const { callCloud } = require('../../utils/api')
const { formatDeadline, minutesToDisplay } = require('../../utils/date')

Page({
  data: {
    activeTab: 'pending',
    tabs: [
      { key: 'pending', label: '待完成' },
      { key: 'completed', label: '已完成' }
    ],
    allTasks: [],
    filteredTasks: [],
    q1Tasks: [],
    q2Tasks: [],
    fragmentTasks: []
  },

  onShow() {
    this.loadTasks()
  },

  async loadTasks() {
    try {
      const result = await callCloud('getTasks')
      const tasks = (result.tasks || []).map(t => ({
        ...t,
        deadlineDisplay: formatDeadline(t.deadline),
        durationDisplay: minutesToDisplay(t.estimated_minutes),
        completedAtDisplay: t.completed_at ? new Date(t.completed_at).toLocaleDateString('zh-CN') : ''
      }))
      this.setData({ allTasks: tasks })
      this.filterTasks(this.data.activeTab, tasks)
    } catch (e) {
      console.error('loadTasks error', e)
    }
  },

  filterTasks(tab, tasks) {
    const all = tasks || this.data.allTasks
    if (tab === 'completed') {
      this.setData({
        filteredTasks: all.filter(t => t.status === 'completed'),
        q1Tasks: [], q2Tasks: [], fragmentTasks: []
      })
      return
    }
    const pending = all.filter(t => t.status !== 'completed')
    this.setData({
      filteredTasks: pending,
      q1Tasks: pending.filter(t => !t.is_fragment && t.quadrant === 'Q1'),
      q2Tasks: pending.filter(t => !t.is_fragment && t.quadrant !== 'Q1'),
      fragmentTasks: pending.filter(t => t.is_fragment)
    })
  },

  handleTabChange(e) {
    const key = e.currentTarget.dataset.key
    this.setData({ activeTab: key })
    this.filterTasks(key)
  },

  handleTaskTap(e) {
    const id = e.currentTarget.dataset.id
    const task = this.data.allTasks.find(t => t._id === id)
    if (!task || task.status === 'completed') return
    wx.showModal({
      title: '标为完成？',
      content: `"${task.title}"`,
      confirmText: '完成',
      cancelText: '取消',
      success: res => {
        if (res.confirm) this.completeTask(id)
      }
    })
  },

  handleDeleteTask(e) {
    const id = e.currentTarget.dataset.id
    const task = this.data.allTasks.find(t => t._id === id)
    if (!task) return
    wx.showActionSheet({
      itemList: ['编辑任务', '删除任务'],
      success: res => {
        if (res.tapIndex === 0) {
          wx.navigateTo({ url: `/pages/add-task/add-task?taskId=${id}` })
        } else {
          wx.showModal({
            title: '删除任务',
            content: `"${task.title.substring(0, 20)}" 删除后不可恢复`,
            confirmText: '删除',
            confirmColor: '#DC2626',
            cancelText: '取消',
            success: async r => {
              if (r.confirm) {
                await callCloud('deleteTask', { taskId: id })
                this.loadTasks()
              }
            }
          })
        }
      }
    })
  },

  async completeTask(taskId) {
    await callCloud('completeTask', { taskId })
    this.loadTasks()
  },

  goAddTask() {
    wx.navigateTo({ url: '/pages/add-task/add-task' })
  }
})
