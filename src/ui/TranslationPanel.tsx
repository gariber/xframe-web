import type { Post, Segment, TranslatedFrom } from '../types'
import {
  TRANSLATED_FROM_LABEL,
  TRANSLATED_FROM_OPTIONS,
  type TranslationDraft,
  type TranslationPlan,
  type TranslatedVersion,
} from '../translate/translation'

/*
 * 原文區塊標成 translate="no"。譯文是由使用者從 X 貼進來的，不經過瀏覽器翻譯，
 * 但使用者仍可能自己對整頁下翻譯指令——那會讓瀏覽器去動我們拿來當比對基準的
 * 原文，「貼上的內容和原文一不一樣」這個判斷就失去意義了。
 */
function browserTranslation(value: 'yes' | 'no') {
  return (element: HTMLElement | null): void => {
    if (element) element.setAttribute('translate', value)
  }
}

const disableBrowserTranslation = browserTranslation('no')

function TranslationSourceText({ segments }: { segments: Segment[] }) {
  return (
    <>
      {segments.map((segment, index) => (
        segment.type === 'text'
          ? <span key={index}>{segment.value}</span>
          : <span key={index} ref={disableBrowserTranslation}>{segment.value}</span>
      ))}
    </>
  )
}

export type TranslationPanelProps = {
  /** 原文那份 Post —— 來源區塊與「貼上的內容是否等同原文」都以它為準。 */
  post: Post
  plan: TranslationPlan
  draft: TranslationDraft
  from: TranslatedFrom
  applied: TranslatedVersion | null
  feedback: string | null
  busy: boolean
  onDraft: (draft: TranslationDraft) => void
  onFrom: (from: TranslatedFrom) => void
  onApply: () => void
  onView: (view: TranslatedVersion['view']) => void
  onRestore: () => void
}

/**
 * 翻譯流程的 UI。網頁版與擴充功能面板共用。
 *
 * 抽成元件而不是兩邊各刻一份：這段流程有不少容易寫歪的細節（原文要標
 * translate="no"、貼上框不預填原文、語言判定要能手動覆蓋、套用失敗要講原因），
 * 複製一份到面板等於把這些細節也複製一份，然後從此各自漂移。
 *
 * 狀態一律由呼叫端持有 —— 兩邊的「套用」語意不同（網頁版要順手釋放已產生的
 * PNG），元件只負責畫和回報事件。
 */
export function TranslationPanel({
  post, plan, draft, from, applied, feedback, busy,
  onDraft, onFrom, onApply, onView, onRestore,
}: TranslationPanelProps) {
  return (
    <section class="translation-guide" aria-labelledby="translation-title">
      <div class="translation-heading">
        <div>
          <strong id="translation-title">翻譯</strong>
          <span>貼上 X 翻好的譯文</span>
        </div>
        {applied && <span class="translation-state">已套用</span>}
      </div>

      <p class="translation-instructions">
        在 X 上點推文的「翻譯貼文」，把翻好的文字複製後貼到下面，再套用到卡片。
      </p>

      <div class="translation-source" ref={disableBrowserTranslation} aria-label="原文">
        {plan.main.kind === 'foreign' && (
          <div class="translation-source-part">
            <span class="translation-kicker">主文原文</span>
            <div data-part="body" lang={plan.main.tag} dir="auto">
              <TranslationSourceText segments={post.text} />
            </div>
          </div>
        )}
        {plan.quoted?.kind === 'foreign' && post.quoted && (
          <div class="translation-source-part">
            <span class="translation-kicker">引用原文</span>
            <div data-part="quote-body" lang={plan.quoted.tag} dir="auto">
              <TranslationSourceText segments={post.quoted.text} />
            </div>
          </div>
        )}
      </div>

      <div class="translation-editors">
        {plan.main.kind === 'foreign' && (
          <label for="translation-main">
            主文譯文
            <textarea
              id="translation-main"
              dir="auto"
              placeholder="貼上 X 翻好的譯文"
              value={draft.main}
              onInput={(event) => onDraft({ ...draft, main: event.currentTarget.value })}
            />
          </label>
        )}
        {plan.quoted?.kind === 'foreign' && (
          <label for="translation-quoted">
            引用譯文
            <textarea
              id="translation-quoted"
              dir="auto"
              placeholder="貼上 X 翻好的譯文"
              value={draft.quoted}
              onInput={(event) => onDraft({ ...draft, quoted: event.currentTarget.value })}
            />
          </label>
        )}
        {/*
          卡片標示要說「翻譯自◯文」，語言由原文自動判定。判定會錯——全漢字
          日文和中文分不出來——所以給一個下拉讓使用者改，而不是把錯的標示
          硬印在卡片上。
        */}
        <label for="translation-from">
          翻譯自
          <select
            id="translation-from"
            value={from}
            onChange={(event) => onFrom(event.currentTarget.value as TranslatedFrom)}
          >
            {TRANSLATED_FROM_OPTIONS.map((tag) => (
              <option key={tag} value={tag}>{TRANSLATED_FROM_LABEL[tag]}</option>
            ))}
          </select>
        </label>
      </div>

      <button class="primary translation-apply" type="button" disabled={busy} onClick={onApply}>
        套用到卡片
      </button>

      <div class="translation-actions">
        {applied && (
          <>
            <button type="button" aria-pressed={applied.view === 'translated'}
              onClick={() => onView('translated')}>顯示譯文</button>
            <button type="button" aria-pressed={applied.view === 'original'}
              onClick={() => onView('original')}>顯示原文</button>
          </>
        )}
        <button class="translation-restore" type="button" onClick={onRestore}>還原原文</button>
      </div>

      {feedback && <p class="translation-feedback" role="status" aria-live="polite">{feedback}</p>}
      <p class="translation-note">
        譯文由你自己貼上，XFrame 不使用翻譯 API，也不會把原文或譯文送到任何伺服器——
        全部只留在這個瀏覽器分頁裡。卡片也只在你按下「套用到卡片」後才會被譯文取代。
      </p>
    </section>
  )
}
