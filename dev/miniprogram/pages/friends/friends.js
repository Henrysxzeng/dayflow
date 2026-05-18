const { callCloud } = require('../../utils/api')

const AVATARS = ['😊', '🎯', '⚡', '🌊', '🔥', '💪', '🚀', '🎨', '🌱', '💎']

Page({
  data: {
    myFriendCode: '',
    myDisplayName: '',
    myAvatar: '😊',
    friends: [],
    pendingInvites: [],
    sharedHistory: [],
    activeTab: 'friends',
    showAddFriend: false,
    showEditProfile: false,
    showAvatarPicker: false,
    inputCode: '',
    editName: '',
    editAvatar: '😊',
    avatarOptions: AVATARS,
    loading: true
  },

  onShow() {
    this.loadAll()
  },

  async loadAll() {
    this.setData({ loading: true })
    try {
      const [profileRes, friendsRes, historyRes] = await Promise.all([
        callCloud('updateProfile', {}),
        callCloud('getFriendsData'),
        callCloud('getSharedTaskHistory')
      ])

      this.setData({
        myFriendCode: profileRes.friend_code || '',
        myDisplayName: profileRes.display_name || 'Flow用户',
        myAvatar: profileRes.avatar_emoji || '😊',
        friends: friendsRes.friends || [],
        pendingInvites: friendsRes.pendingInvites || [],
        sharedHistory: historyRes.tasks || [],
        loading: false
      })
    } catch (e) {
      this.setData({ loading: false })
      console.error('friends loadAll error:', e)
    }
  },

  switchTab(e) { this.setData({ activeTab: e.currentTarget.dataset.tab }) },

  copyFriendCode() {
    wx.setClipboardData({
      data: this.data.myFriendCode,
      success: () => wx.showToast({ title: '好友码已复制', icon: 'success' })
    })
  },

  shareMyCode() {
    wx.shareAppMessage({
      title: `用 FlowCast 和我一起高效！我的好友码：${this.data.myFriendCode}`,
      path: `/pages/friends/friends?code=${this.data.myFriendCode}`
    })
  },

  openAddFriend() { this.setData({ showAddFriend: true, inputCode: '' }) },
  closeAddFriend() { this.setData({ showAddFriend: false }) },
  handleCodeInput(e) { this.setData({ inputCode: e.detail.value }) },

  async handleAddFriend() {
    const code = this.data.inputCode.trim().toUpperCase()
    if (code.length < 4) {
      wx.showToast({ title: '请输入完整的好友码', icon: 'none' })
      return
    }
    wx.showLoading({ title: '添加中...', mask: true })
    try {
      const res = await callCloud('addFriend', { friendCode: code })
      wx.hideLoading()
      if (res.success) {
        wx.showToast({ title: `已添加 ${res.friend.display_name}！`, icon: 'success' })
        this.setData({ showAddFriend: false })
        this.loadAll()
      } else {
        wx.showToast({ title: res.error || '添加失败', icon: 'none' })
      }
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: '网络错误', icon: 'none' })
    }
  },

  async acceptInvite(e) {
    const { id } = e.currentTarget.dataset
    wx.showLoading({ title: '接受中...', mask: true })
    try {
      await callCloud('joinSharedTask', { sharedTaskId: id })
      wx.hideLoading()
      wx.showToast({ title: '已接受！任务已加入今日计划', icon: 'success' })
      this.loadAll()
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: '接受失败', icon: 'none' })
    }
  },

  openEditProfile() {
    this.setData({ showEditProfile: true, editName: this.data.myDisplayName, editAvatar: this.data.myAvatar })
  },
  closeEditProfile() { this.setData({ showEditProfile: false }) },
  handleNameInput(e) { this.setData({ editName: e.detail.value }) },
  openAvatarPicker() { this.setData({ showAvatarPicker: true }) },
  selectAvatar(e) { this.setData({ editAvatar: e.currentTarget.dataset.emoji, showAvatarPicker: false }) },

  async saveProfile() {
    wx.showLoading({ title: '保存中...', mask: true })
    try {
      await callCloud('updateProfile', { displayName: this.data.editName, avatarEmoji: this.data.editAvatar })
      wx.hideLoading()
      this.setData({ showEditProfile: false, myDisplayName: this.data.editName, myAvatar: this.data.editAvatar })
      wx.showToast({ title: '已保存', icon: 'success' })
    } catch (e) {
      wx.hideLoading()
    }
  },

  onShareAppMessage() {
    return {
      title: `用 FlowCast 和我一起高效！我的好友码：${this.data.myFriendCode}`,
      path: `/pages/friends/friends?code=${this.data.myFriendCode}`
    }
  },

  onLoad(options) {
    if (options && options.code) {
      this.setData({ showAddFriend: true, inputCode: options.code })
    }
  }
})
