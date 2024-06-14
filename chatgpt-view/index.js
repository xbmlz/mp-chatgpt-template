// index.js
import {
  createParser
} from './eventsource-parser'
import CryptoJS from './crypto-js/index'
import {
  Base64
} from 'js-base64'


Component({
  data: {
    messages: [

    ],
    prompt: '',

    loading: false,
    scrollTop: 0,
    requestTask: null,
    systemInfo: wx.getSystemInfoSync(),

    socketTask: null
  },
  lifetimes: {
    attached: function () {
      // 在组件实例进入页面节点树时执行
    },
    detached: function () {
      // 在组件实例被从页面节点树移除时执行
      this.storageMessages()
    },
  },
  methods: {
    handleSend() {
      if (!this.data.prompt) return
      const userMessageId = `user:${Date.now()}`
      this.pushMessage({
        id: userMessageId,
        role: 'user',
        content: this.data.prompt,
        created: new Date().getTime(),
        error: '',
        finished: true,
        playing: false
      })
      const assistantMessageId = `assistant:${Date.now()}`
      this.pushMessage({
        id: assistantMessageId,
        role: 'assistant',
        content: '...',
        created: new Date().getTime(),
        error: '',
        finished: false,
        playing: false
      })
      this.scrollToBottom()
      this.handlePrompt(assistantMessageId)
      this.clearPrompt()
    },
    handleRegenerate(e) {
      const id = e.currentTarget.dataset.id
      const assistantMessageId = `assistant:${Date.now()}`
      this.deleteMessage(id)
      this.pushMessage({
        id: assistantMessageId,
        role: 'assistant',
        content: '...',
        created: new Date().getTime(),
        error: '',
        finished: false,
        playing: false
      })
      this.handlePrompt(assistantMessageId)
      this.scrollToBottom()
    },
    handlePrompt(updateId) {
      // TODO 
      // this.fetchOpenAI(updateId)
      this.fetchSpark(updateId)
    },
    handleStop() {
      this.setData({
        loading: false
      })
      this.data.requestTask.abort()
      this.clearPrompt()
    },
    handleCopy(e) {
      const text = e.currentTarget.dataset.content
      wx.setClipboardData({
        data: text,
        success: () => {
          wx.showToast({
            title: '复制成功',
          })
        }
      })
    },
    handlePlay() {
      // const plugin = requirePlugin("WechatSI")
      // plugin.textToSpeech({
      //   lang: "zh_CN",
      //   tts: true,
      //   content: "一个常见的需求",
      //   success: function (res) {
      //     console.log("succ tts", res.filename)
      //   },
      //   fail: function (res) {
      //     console.log("fail tts", res)
      //   }
      // })
    },
    clearPrompt() {
      this.setData({
        prompt: ''
      })
    },
    promptInput() {},
    // rebuild
    buildPayload(updateId) {
      return this.data.messages.filter(item => item.id !== updateId).map(item => ({
        role: item.role,
        content: item.content
      }))
    },
    // provider
    fetchOpenAI(updateId) {
      let finalText = ''
      this.data.requestTask = wx.request({
        url: 'https://openkey.cloud/v1/chat/completions',
        method: 'POST',
        enableChunked: true,
        header: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer sk-WahlpznSulBHXmcmrqkSG3ND3vL3DtSRmlzNjPHrD1NkXYOV'
        },
        dataType: 'json',
        data: {
          "model": "gpt-3.5-turbo",
          "stream": true,
          "max_tokens": 2000,
          "messages": [...this.buildPayload(updateId)]
        },
        complete: () => {
          this.setData({
            loading: false
          })
          this.scrollToBottom()
        },
        fail: (err) => {
          this.setData({
            loading: false
          })
          console.error(err)
          if (err.errMsg !== 'request:fail abort') {
            this.updateMessage(updateId, {
              content: '',
              error: '请求错误，点击发送'
            })
          }

          // this.deleteMessage(assistantMessageId)
        }
      })
      const chunkParser = (evt) => {
        if (evt.type !== 'event') return
        const data = evt.data
        if (data === '[DONE]') {
          // this.data.requestTask.abort()
          this.updateMessage(updateId, {
            finished: true
          })
          this.scrollToBottom()
          return
        }
        try {
          const json = JSON.parse(data)
          const text = json.choices[0].delta?.content || ''
          finalText += text
          this.updateMessage(updateId, {
            content: finalText
          })
        } catch (e) {
          console.log(e)
        }
      }

      this.data.requestTask.onHeadersReceived(res => {
        if (res.statusCode === 200) {
          this.setData({
            loading: true
          })
          // TODO
          // this.updateMessage(userMessageId, {
          //   error: ''
          // })
          console.log(this.data.messages)
        }
      })

      this.data.requestTask.onChunkReceived(res => {
        const unit8Arr = new Uint8Array(res.data);
        const decode = this.utf8ArrayToStr(unit8Arr)
        const parser = createParser(chunkParser)
        parser.feed(decode)
        this.scrollToBottom()
        // this.data.chunkParser.feed(decode)
      })
    },
    fetchSpark(updateId) {
      let url = 'wss://spark-api.xf-yun.com/v3.1/chat'
      const appId = "7ac19d5e"
      const apiKey = "dfa5a0e4178b00a978557e68bd41ae2d"
      const apiSecret = "NDIwMzBjNjU4MGU0NWE1Y2M2NzZjNDVh"
      const host = "localhost"
      const date = new Date().toGMTString()
      const algorithm = 'hmac-sha256'
      const headers = 'host date request-line'
      const signatureOrigin = `host: ${host}\ndate: ${date}\nGET /v3.1/chat HTTP/1.1`
      const signatureSha = CryptoJS.HmacSHA256(signatureOrigin, apiSecret)
      const signature = CryptoJS.enc.Base64.stringify(signatureSha)
      const authorizationOrigin = `api_key="${apiKey}", algorithm="${algorithm}", headers="${headers}", signature="${signature}"`
      const authorization = Base64.btoa(authorizationOrigin)
      url = `${url}?authorization=${authorization}&date=${date}&host=${host}`
      let that = this

      this.data.socketTask = wx.connectSocket({
        url,
        method: 'GET',
        success: res => {
          console.log(res, "ws成功连接...", url)
        }
      })
      this.data.socketTask.onOpen(res => {
        console.info("wss的onOpen成功执行...", res)
        this.data.socketTask.send({
          data: JSON.stringify({
            header: {
              app_id: appId,
            },
            parameter: {
              chat: {
                domain: "generalv3"
              }
            },
            payload: {
              message: {
                text: [...that.buildPayload(updateId)]
              }
            }
          })
        })
      })
      // console.log(url)
      let finalText = ''
      this.data.socketTask.onMessage(res => {
        const data = JSON.parse(res.data)
        const contentArr = data.payload.choices.text
        for (let i = 0; i < contentArr.length; i++) {
          finalText += contentArr[i].content
          this.updateMessage(updateId, {
            content: finalText
          })
        }

        if (data.header.status === 2) {
          that.updateMessage(updateId, {
            finished: true
          })
          that.scrollToBottom()

          setTimeout(() => {
            that.data.socketTask.close()
          }, 500)
        }
      })
      this.data.socketTask.onError(err => {
        console.error(err)
      })
    },
    // message
    pushMessage(message) {
      const messageKey = `messages[${this.data.messages.length}]`
      this.setData({
        [messageKey]: message
      })
    },
    findMessageIndex(id) {
      const messages = this.data.messages
      return messages.findIndex(item => item.id === id)
    },
    findMessage(id) {
      const index = this.findMessageIndex(id)
      if (index === -1) return null
      return this.data.messages[index];
    },
    deleteMessage(id) {
      const messages = this.data.messages
      const removed = messages.filter(item => item.id !== id)
      this.setData({
        messages: removed
      })
    },
    updateMessage(id, msg) {
      const index = this.findMessageIndex(id)
      if (index === -1) return
      const messageKey = `messages[${index}]`
      let updatedMessage = this.data.messages[index];
      for (let key in msg) {
        if (msg.hasOwnProperty(key)) {
          updatedMessage[key] = msg[key]
        }
      }
      this.setData({
        [messageKey]: updatedMessage
      })
    },
    storageMessages() {
      const storaged = wx.getStorageSync('messages') || []
      wx.setStorageSync('messages', [...storaged, ...this.data.messages])
    },

    // UI
    scrollToBottom() {
      let query = wx.createSelectorQuery().in(this)
      query.select('#chat-message-view').boundingClientRect()
      query.select('#chat-message-wrapper').boundingClientRect()
      query.exec((res) => {
        const viewHeight = res[0].height
        const wrapperHeight = res[1].height
        const offset = wrapperHeight - viewHeight
        if (offset > 0 && offset > this.data.scrollTop) {
          this.setData({
            scrollTop: offset
          })
        }
      })
    },

    // utils
    utf8ArrayToStr(array, startingIndex = 0) {
      // Based on code by Masanao Izumo <iz@onicos.co.jp>
      // posted at http://www.onicos.com/staff/iz/amuse/javascript/expert/utf.txt

      const len = array.length;
      let c;
      let char2;
      let char3;
      let out = '';
      let i = startingIndex || 0;
      while (i < len) {
        c = array[i++];
        // If the character is 3 (END_OF_TEXT) or 0 (NULL) then skip it
        if (c === 0x00 || c === 0x03) {
          continue;
        }
        switch (c >> 4) {
          case 0:
          case 1:
          case 2:
          case 3:
          case 4:
          case 5:
          case 6:
          case 7:
            // 0xxxxxxx
            out += String.fromCharCode(c);
            break;
          case 12:
          case 13:
            // 110x xxxx   10xx xxxx
            char2 = array[i++];
            out += String.fromCharCode(((c & 0x1F) << 6) | (char2 & 0x3F));
            break;
          case 14:
            // 1110 xxxx  10xx xxxx  10xx xxxx
            char2 = array[i++];
            char3 = array[i++];
            out += String.fromCharCode(((c & 0x0F) << 12) |
              ((char2 & 0x3F) << 6) |
              ((char3 & 0x3F) << 0));
            break;
          default:
        }
      }
      return out;
    }
  },
})