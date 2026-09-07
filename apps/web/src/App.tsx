import { useEffect, useState } from 'react';
import { ArrowRight, Plus, BookOpen, PenLine, Sun, Heart, Check, LoaderCircle } from 'lucide-react';
import { Composer } from './Composer';
import { Timeline } from './Timeline';
import { ExportDialog } from './ExportDialog';
import { Modal } from './Modal';
import { api, today, dateOf, type Entry } from './lib';
export default function App() {
  const [tab, setTab] = useState<'create' | 'timeline'>('create'),
    [date, setDate] = useState(today());
  const [entries, setEntries] = useState<Entry[]>([]),
    [todayEntries, setTodayEntries] = useState<Entry[]>([]),
    [statsError, setStatsError] = useState(false),
    [statsLoading, setStatsLoading] = useState(true);
  const [loading, setLoading] = useState(false),
    [error, setError] = useState(''),
    [revision, setRevision] = useState(0);
  const [composer, setComposer] = useState<{ entry?: Entry } | null>(null),
    [exportOpen, setExportOpen] = useState(false),
    [deleteEntry, setDeleteEntry] = useState<Entry>(),
    [deleting, setDeleting] = useState(false),
    [deleteError, setDeleteError] = useState('');
  const [toast, setToast] = useState(''),
    [focusId, setFocusId] = useState(''),
    [credits, setCredits] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setStatsLoading(true);
    api<Entry[]>(`/api/entries?date=${today()}`, { signal: controller.signal })
      .then((data) => {
        setTodayEntries(data);
        setStatsError(false);
      })
      .catch((e) => {
        if (e.name !== 'AbortError') setStatsError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setStatsLoading(false);
      });
    return () => controller.abort();
  }, [revision, tab]);
  useEffect(() => {
    if (tab !== 'timeline') return;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setEntries([]);
    api<Entry[]>(`/api/entries?date=${date}`, { signal: controller.signal })
      .then(setEntries)
      .catch((e) => {
        if (e.name !== 'AbortError') setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [tab, date, revision]);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(''), 3500);
    return () => clearTimeout(id);
  }, [toast]);
  useEffect(() => {
    if (!focusId || loading) return;
    const id = setTimeout(
      () =>
        document
          .getElementById(`entry-${focusId}`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
      150,
    );
    return () => clearTimeout(id);
  }, [focusId, entries, loading]);
  function saved(entry: Entry) {
    setComposer(null);
    setDate(dateOf(entry.occurredAt));
    setTab('timeline');
    setFocusId(entry.id);
    setRevision((n) => n + 1);
    setToast('这一刻，已经好好收下啦');
  }
  async function remove() {
    if (!deleteEntry) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await api(`/api/entries/${deleteEntry.id}`, { method: 'DELETE' });
      setDeleteEntry(undefined);
      setRevision((n) => n + 1);
      setToast('这条动态已删除');
    } catch (e) {
      setDeleteError((e as Error).message);
    } finally {
      setDeleting(false);
    }
  }
  const current = today(),
    dateParts = current.split('-'),
    weekday = new Intl.DateTimeFormat('zh-CN', {
      weekday: 'long',
      timeZone: 'Asia/Shanghai',
    }).format(new Date());
  return (
    <>
      <main className="app-shell">
        <header className="brand-header">
          <a className="brand" href="/" aria-label="此刻，同频首页">
            <span className="brand-mark">
              <i />
              <i />
              <b />
            </span>
            <span>
              此刻，同频<small>FRIENDS IN PARALLEL</small>
            </span>
          </a>
          <span className="edition">
            我们的生活手账 <span>VOL. 01</span>
          </span>
        </header>
        <nav className="floating-tabs" aria-label="页面切换">
          <button
            className={tab === 'create' ? 'active' : ''}
            aria-current={tab === 'create' ? 'page' : undefined}
            onClick={() => setTab('create')}
          >
            <PenLine size={18} />
            记一刻
          </button>
          <button
            className={tab === 'timeline' ? 'active' : ''}
            aria-current={tab === 'timeline' ? 'page' : undefined}
            onClick={() => setTab('timeline')}
          >
            <BookOpen size={18} />
            同一天
            {todayEntries.length > 0 && <span className="tab-count">{todayEntries.length}</span>}
          </button>
        </nav>
        {tab === 'create' ? (
          <section className="home-view">
            <div className="day-line">
              <span>
                <Sun size={16} /> {dateParts[0]} 年 {Number(dateParts[1])} 月 {Number(dateParts[2])}{' '}
                日
              </span>
              <span>{weekday}</span>
            </div>
            <div className="home-title">
              <span className="section-eyebrow">SAME TIME, DIFFERENT LITTLE LIVES</span>
              <h1>
                此刻，你在
                <br />
                <span className="title-highlight">
                  做什么呀<span className="question">？</span>
                </span>
              </h1>
              <p>把平凡的日常，和朋友们放在一起。</p>
              <span className="drawn-star">✳</span>
            </div>
            <div className="memory-collage" aria-hidden="true">
              <div className="paper-note note-one">
                <span className="tape" />
                <span className="note-time">14:28 · 某个小瞬间</span>
                <img src="/stickers/fluent/2615.png" alt="" />
                <span className="note-caption">慢一点，也没关系。</span>
                <span className="note-heart">♡</span>
              </div>
              <div className="paper-note note-two">
                <span className="tape" />
                <div className="note-grid">
                  <img src="/stickers/fluent/1f4f7.png" alt="" />
                </div>
                <span className="note-caption">日常，也会闪闪发光</span>
                <span className="doodle-line" />
              </div>
              <img className="collage-flower" src="/stickers/fluent/1f33c.png" alt="" />
              <img className="collage-sparkles" src="/stickers/fluent/2728.png" alt="" />
              <span className="collage-label">LIFE, LATELY.</span>
            </div>
            <div className="home-action">
              <button className="primary upload-main" onClick={() => setComposer({})}>
                <span className="plus-box">
                  <Plus size={19} />
                </span>
                上传动态
                <ArrowRight size={20} />
              </button>
              <p>一张图，一句话。记住现在就好。</p>
            </div>
            <button
              className="today-summary"
              onClick={() => {
                if (statsError) setRevision((n) => n + 1);
                else {
                  setDate(today());
                  setTab('timeline');
                }
              }}
            >
              <span className="summary-icon">
                <BookOpen size={21} />
              </span>
              <span>
                <strong>
                  {statsLoading
                    ? '正在翻开今天的手账…'
                    : statsError
                      ? '暂时没有连上手账'
                      : todayEntries.length
                        ? '今天的手账，正在慢慢写满'
                        : '今天的手账，等你翻开'}
                </strong>
                <small>
                  {statsLoading ? (
                    '稍等一下就好'
                  ) : statsError ? (
                    '点击重新连接'
                  ) : (
                    <>
                      <b>{todayEntries.length}</b> 个瞬间{' '}
                      <span className="summary-separator">/</span>{' '}
                      <b>{new Set(todayEntries.map((e) => e.personId)).size}</b> 位朋友已留下日常
                    </>
                  )}
                </small>
              </span>
              <ArrowRight size={18} />
            </button>
            <div className="home-footnote">
              <Heart size={13} />
              <span>各自忙碌，也一起生活。</span>
            </div>
          </section>
        ) : (
          <Timeline
            entries={entries}
            date={date}
            setDate={setDate}
            loading={loading}
            error={error}
            onRefresh={() => setRevision((n) => n + 1)}
            onCreate={() => setComposer({})}
            onEdit={(entry) => setComposer({ entry })}
            onDelete={(entry) => {
              setDeleteError('');
              setDeleteEntry(entry);
            }}
            onExport={() => setExportOpen(true)}
            focusId={focusId}
          />
        )}
        <footer className="app-footer">
          <span>此刻，同频 © {dateParts[0]}</span>
          <button onClick={() => setCredits(true)}>贴纸鸣谢</button>
        </footer>
      </main>
      {tab === 'timeline' && (
        <button className="floating-create" aria-label="上传动态" onClick={() => setComposer({})}>
          <Plus size={25} />
        </button>
      )}
      {composer && (
        <Composer entry={composer.entry} onClose={() => setComposer(null)} onSaved={saved} />
      )}
      {exportOpen && <ExportDialog date={date} onClose={() => setExportOpen(false)} />}
      {deleteEntry && (
        <Modal title="要删掉这一刻吗？" onClose={() => setDeleteEntry(undefined)} busy={deleting}>
          <p className="muted">这条动态和上传的照片会被删除，无法撤回。</p>
          {deleteError && (
            <p role="alert" className="error-banner">
              {deleteError}
            </p>
          )}
          <div className="confirm-actions">
            <button
              className="secondary"
              disabled={deleting}
              onClick={() => setDeleteEntry(undefined)}
            >
              再想想
            </button>
            <button className="danger-button" disabled={deleting} onClick={remove}>
              {deleting ? <LoaderCircle size={17} className="spin" /> : '确认删除'}
            </button>
          </div>
        </Modal>
      )}
      {credits && (
        <Modal title="让日常更可爱的朋友们" onClose={() => setCredits(false)}>
          <div className="credits">
            <p>本项目使用以下开源素材，图片未经修改。</p>
            <a href="https://github.com/microsoft/fluentui-emoji" target="_blank" rel="noreferrer">
              Fluent Emoji · © Microsoft
            </a>
            <a href="/licenses/fluent.txt">MIT 许可</a>
            <a href="https://github.com/jdecked/twemoji" target="_blank" rel="noreferrer">
              Twemoji · © Twitter, Inc. and contributors
            </a>
            <a href="/licenses/twemoji.txt">CC BY 4.0 许可</a>
            <a href="https://openmoji.org" target="_blank" rel="noreferrer">
              OpenMoji · © HfG Schwäbisch Gmünd and contributors
            </a>
            <a href="/licenses/openmoji.txt">CC BY-SA 4.0 许可</a>
            <p>Noto Sans CJK · © The Noto Project Authors</p>
            <a href="/licenses/font.txt">SIL Open Font License 1.1</a>
          </div>
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
        </div>
      )}
    </>
  );
}
