import { useEffect, useState } from 'react';
import { Plus, Check, LoaderCircle } from 'lucide-react';
import { Composer } from './Composer';
import { Timeline } from './Timeline';
import { ExportDialog } from './ExportDialog';
import { Modal } from './Modal';
import { api, today, dateOf, type Entry } from './lib';
export default function App() {
  const [date, setDate] = useState(today());
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
    setToast('动态已发布');
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
          <a className="brand" href="/" aria-label="此刻，同频首页">
            此刻，同频
          </a>
        </header>
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
        <footer className="app-footer">
          <span>此刻，同频 © {today().slice(0, 4)}</span>
          <button onClick={() => setCredits(true)}>素材鸣谢</button>
        </footer>
      </main>
      <button className="floating-create" aria-label="上传动态" onClick={() => setComposer({})}>
        <Plus size={20} />
        上传动态
      </button>
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
