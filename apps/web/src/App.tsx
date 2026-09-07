import { useEffect, useRef, useState } from 'react';
import { Plus, Check, LoaderCircle, Clapperboard, CalendarDays } from 'lucide-react';
import { DateCalendar } from './DateCalendar';
import { Composer } from './Composer';
import { Timeline } from './Timeline';
import { ExportDialog } from './ExportDialog';
import videoMusic from './config/video-music.json';
import { Modal } from './Modal';
import { api, today, dateOf, readPreference, preference, type Entry } from './lib';
export default function App() {
  const [lastPersonId, setLastPersonId] = useState(() =>
    readPreference('parallel.lastSubmittedPerson', readPreference('parallel.person', '')),
  );
  const [date, setDate] = useState(today());
  const [calendarOpen, setCalendarOpen] = useState(false);
  const calendarTrigger = useRef<HTMLButtonElement>(null);
  function closeCalendar() {
    setCalendarOpen(false);
    requestAnimationFrame(() => calendarTrigger.current?.focus({ preventScroll: true }));
  }
  const [entries, setEntries] = useState<Entry[]>([]);
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
  }, [date, revision]);
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
    setLastPersonId(entry.personId);
    preference('parallel.lastSubmittedPerson', entry.personId);
    setComposer(null);
    setDate(dateOf(entry.occurredAt));
    setFocusId(entry.id);
    setRevision((n) => n + 1);
    setToast(composer?.entry ? '修改已保存' : '冒泡成功，朋友们看得到啦');
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
  return (
    <>
      <main className="app-shell">
        <header className="brand-header">
          <div className="brand-copy">
            <h1>
              <a className="brand" href="/" aria-label="和朋友的同一时间首页">
                和朋友的同一时间
              </a>
            </h1>
            <p>同一时间，看看朋友们都在干嘛。</p>
          </div>
          <div className="header-actions">
            <button
              ref={calendarTrigger}
              type="button"
              className="date-picker compact-date-picker"
              title={date}
              aria-label="选择日期"
              aria-haspopup="dialog"
              aria-expanded={calendarOpen}
              onClick={() => setCalendarOpen(true)}
            >
              <span>
                <CalendarDays size={16} />
                <strong>
                  {date === today()
                    ? '今天'
                    : (date.slice(0, 4) === today().slice(0, 4) ? date.slice(5) : date).replaceAll(
                        '-',
                        '/',
                      )}
                </strong>
              </span>
            </button>
          </div>
        </header>
        <Timeline
          lastPersonId={lastPersonId}
          entries={entries}
          loading={loading}
          error={error}
          onRefresh={() => setRevision((n) => n + 1)}
          onEdit={(entry) => setComposer({ entry })}
          onDelete={(entry) => {
            setDeleteError('');
            setDeleteEntry(entry);
          }}
          date={date}
          focusId={focusId}
        />
        <footer className="app-footer">
          <button onClick={() => setCredits(true)}>素材鸣谢</button>
        </footer>
      </main>
      <div className="floating-actions">
        <button
          className="floating-create"
          aria-label={date === today() ? '冒个泡' : '补个泡'}
          onClick={() => setComposer({})}
        >
          <Plus size={20} />
          {date === today() ? '冒个泡' : '补个泡'}
        </button>
        <button
          className="export-trigger"
          aria-label="制作回忆"
          title="手账长图 · 回忆视频 · 素材下载"
          onClick={() => setExportOpen(true)}
          disabled={!entries.length || loading || !!error}
        >
          <Clapperboard size={18} />
          <span>制作回忆</span>
        </button>
      </div>
      {calendarOpen && (
        <DateCalendar
          date={date}
          onClose={closeCalendar}
          onSelect={(next) => {
            setDate(next);
            closeCalendar();
          }}
        />
      )}
      {composer && (
        <Composer
          date={date}
          entry={composer.entry}
          onClose={() => setComposer(null)}
          onSaved={saved}
        />
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
            <p>和朋友的同一时间 © {today().slice(0, 4)}</p>
            <p>谢谢这些让日常更可爱的小伙伴！以下开源图片未经修改。</p>
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
            <h3>陪我们冒泡的音乐</h3>
            <p>音乐会按视频长度裁剪或循环，调整响度并淡入淡出。</p>
            {videoMusic.map((music) => (
              <div key={music.id}>
                <a href={music.source} target="_blank" rel="noreferrer">
                  {music.title} · {music.artist} / Incompetech
                </a>
                {' · '}
                <a href={music.licenseUrl} target="_blank" rel="noreferrer">
                  {music.license}
                </a>
              </div>
            ))}
            <a href="/licenses/music.txt">完整音乐许可与来源</a>
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
