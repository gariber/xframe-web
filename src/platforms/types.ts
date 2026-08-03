import type { Platform, Post } from '../types'

/**
 * 一個平台要能被做成卡片，需要提供的全部東西。
 *
 * 這是全系統唯一與平台相關的地方 —— 渲染、匯出、設定都不知道有哪些平台
 * 存在。新增平台的成本因此是「寫一份 Adapter 並註冊」，而不是在十幾個
 * switch 裡各加一個 case。
 */
export type Adapter = {
  platform: Platform

  /**
   * 這個平台的網域。同時是 adapterFor 的比對依據與 manifest host_permissions
   * 的來源 —— 兩者共用同一份清單，不會出現「程式碼認得但權限沒開」的落差。
   */
  hosts: readonly string[]

  /**
   * 在頁面上找出可產卡的貼文，以及按鈕該注入在哪裡。
   * content script 專用；行動網頁不呼叫這個。
   */
  findPermalinks(root: ParentNode): { url: string; anchor: Element }[]

  /**
   * 取得貼文。實作可以是免 cookie 抓取、經代理、或讀當前 DOM ——
   * 呼叫端不需要知道是哪一種。
   */
  acquire(url: string): Promise<Post>
}
