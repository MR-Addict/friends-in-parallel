import { useEffect, useState } from 'react';
import {
  Plus,
  Check,
  LoaderCircle,
  RefreshCw,
  Download,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { DateCalendar } from './DateCalendar';
import { Composer } from './Composer';
import { Timeline } from './Timeline';
import { ExportDialog } from './ExportDialog';
import { Modal } from './Modal';
import { api, today, dateOf, shiftDate, type Entry } from './lib';
export default function App() {
  const [date, setDate] = useState(today());
  const [calendarOpen, setCalendarOpen] = useState(false);
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
    setComposer(null);
    setDate(dateOf(entry.occurredAt));
    setFocusId(entry.id);
    setRevision((n) => n + 1);
    setToast(composer?.entry ? '修改已保存' : '这一刻，记下了');
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
          <h1>
            <a className="brand" href="/" aria-label="此刻，同频首页">
              此刻，同频
            </a>
          </h1>
          <div className="header-actions">
            <button
              className="icon-button"
              aria-label="刷新时间线"
              onClick={() => setRevision((n) => n + 1)}
              disabled={loading}
            >
              <RefreshCw size={18} className={loading ? 'spin' : ''} />
            </button>
            <button
              className="export-trigger"
              aria-label="生成今日手账"
              title="生成所选日期的手账"
              onClick={() => setExportOpen(true)}
              disabled={!entries.length || loading || !!error}
            >
              <Download size={16} />
              <span>生成手账</span>
            </button>
          </div>
        </header>
        <div className="page-intro">
          <p>各自生活，也在一起。</p>
        </div>
        <nav className="day-navigation" aria-label="日期导航">
          <button
            className="icon-button"
            aria-label="前一天"
            onClick={() => setDate(shiftDate(date, -1))}
          >
            <ChevronLeft size={20} />
          </button>
          <label className="date-picker">
            <span>
              <CalendarDays size={18} />
              <strong>{date.replaceAll('-', '/')}</strong>
            </span>
            <input
              type="date"
              aria-label="选择日期"
              value={date}
              max={today()}
              onChange={(e) => {
                if (e.target.value) setDate(e.target.value);
              }}
              aria-haspopup="dialog"
              aria-expanded={calendarOpen}
              onClick={(e) => {
                e.preventDefault();
                setCalendarOpen(true);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setCalendarOpen(true);
                }
              }}
            />
          </label>
          <button
            className="icon-button"
            aria-label="后一天"
            disabled={date >= today()}
            onClick={() => setDate(shiftDate(date, 1))}
          >
            <ChevronRight size={20} />
          </button>
          <button
            className="today-action"
            aria-label="回到今天"
            disabled={date === today()}
            onClick={() => setDate(today())}
          >
            今天
          </button>
        </nav>
        <Timeline
          entries={entries}
          loading={loading}
          error={error}
          onRefresh={() => setRevision((n) => n + 1)}
          onCreate={() => setComposer({})}
          onEdit={(entry) => setComposer({ entry })}
          onDelete={(entry) => {
            setDeleteError('');
            setDeleteEntry(entry);
          }}
          date={date}
          focusId={focusId}
        />
        <footer className="app-footer">
          <span>此刻，同频 © {today().slice(0, 4)}</span>
          <button onClick={() => setCredits(true)}>素材鸣谢</button>
        </footer>
      </main>
      <button
        className="floating-create"
        aria-label={date === today() ? '记下一刻' : '补记这一天'}
        onClick={() => setComposer({})}
      >
        <Plus size={20} />
        {date === today() ? '记下一刻' : '补记这一天'}
      </button>
      {calendarOpen && (
        <DateCalendar
          date={date}
          onClose={() => setCalendarOpen(false)}
          onSelect={(next) => {
            setDate(next);
            setCalendarOpen(false);
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
