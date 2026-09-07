import { useEffect, useState } from 'react';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  RefreshCw,
  Plus,
  Pencil,
  Trash2,
  Clock,
  MoreHorizontal,
  LoaderCircle,
} from 'lucide-react';
import { people, personOf, timeOf, today, shiftDate, mediaSrc, mediaName, type Entry } from './lib';
import { Modal } from './Modal';
export function Timeline({
  entries,
  date,
  setDate,
  loading,
  error,
  onRefresh,
  onCreate,
  onEdit,
  onDelete,
  onExport,
  focusId,
}: {
  entries: Entry[];
  date: string;
  setDate: (s: string) => void;
  loading: boolean;
  error: string;
  onRefresh: () => void;
  onCreate: () => void;
  onEdit: (e: Entry) => void;
  onDelete: (e: Entry) => void;
  onExport: () => void;
  focusId: string;
}) {
  const [filter, setFilter] = useState('all'),
    [zoom, setZoom] = useState<Entry>(),
    [actions, setActions] = useState<Entry>();
  useEffect(() => {
    if (focusId) setFilter('all');
  }, [focusId]);
  const visible = entries.filter((e) => filter === 'all' || e.personId === filter);
  const hours = [...new Set(visible.map((e) => timeOf(e.occurredAt).slice(0, 2)))].sort();
  return (
    <section className="timeline-view">
      <div className="timeline-title">
        <h1>同一天的我们</h1>
        <button
          className="icon-button"
          aria-label="刷新时间线"
          onClick={onRefresh}
          disabled={loading}
        >
          <RefreshCw size={18} className={loading ? 'spin' : ''} />
        </button>
      </div>
      <div className="date-toolbar">
        {' '}
        <button
          className="text-button export-trigger"
          aria-label="导出这一天"
          onClick={onExport}
          disabled={!entries.length || loading || !!error}
        >
          <Download size={15} />
          导出
        </button>
        <button
          className="icon-button"
          aria-label="前一天"
          onClick={() => setDate(shiftDate(date, -1))}
        >
          <ChevronLeft size={20} />
        </button>
        <label className="date-picker">
          <CalendarDays size={18} />
          <input
            type="date"
            aria-label="选择日期"
            value={date}
            max={today()}
            onChange={(e) => {
              if (e.target.value) setDate(e.target.value);
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
          className={`today-button ${date === today() ? 'is-today' : ''}`}
          onClick={() => setDate(today())}
        >
          今天
        </button>
      </div>
      <div className="people-filter" aria-label="按人物筛选">
        <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>
          全部朋友
        </button>
        {people.map((p) => (
          <button
            key={p.id}
            className={filter === p.id ? 'active' : ''}
            onClick={() => setFilter(p.id)}
          >
            <span className="tiny-dot" style={{ background: p.color }} />
            {p.nickname}
          </button>
        ))}
      </div>
      <div className="timeline-summary">
        <span>
          {loading
            ? '翻开手账中…'
            : `${new Set(entries.map((e) => e.personId)).size} 位朋友 · ${entries.length} 个瞬间`}
        </span>
      </div>
      {error ? (
        <div className="empty-state">
          <p role="alert">{error}</p>
          <button className="secondary" onClick={onRefresh}>
            再试一次
          </button>
        </div>
      ) : loading ? (
        <div className="empty-state">
          <LoaderCircle size={28} className="spin" />
          <p>正在翻到这一天…</p>
        </div>
      ) : !visible.length ? (
        <div className="empty-state">
          <h2>
            {filter === 'all' ? '这一天还没有动态' : `${personOf(filter).nickname}这天还没有记录`}
          </h2>
          <button className="secondary" onClick={onCreate}>
            <Plus size={17} />
            记下一刻
          </button>
        </div>
      ) : (
        <div className="hour-timeline">
          {hours.map((hour) => (
            <section className="hour-group" key={hour}>
              <div className="hour-heading">
                <time>{hour}:00</time>
                <span className="hour-line" />
              </div>
              <div className="hour-entries">
                {[
                  ...people.map((p) => p.id),
                  ...new Set(
                    visible
                      .filter((e) => !people.some((p) => p.id === e.personId))
                      .map((e) => e.personId),
                  ),
                ].map((personId) => {
                  const group = visible.filter(
                    (e) => e.personId === personId && timeOf(e.occurredAt).startsWith(hour),
                  );
                  if (!group.length) return null;
                  const p = personOf(personId);
                  return (
                    <div key={personId} className="person-moments">
                      {group.map((entry) => (
                        <article
                          key={entry.id}
                          id={`entry-${entry.id}`}
                          className={`moment-card ${focusId === entry.id ? 'just-posted' : ''}`}
                        >
                          <header className="card-header">
                            <span className="avatar small" style={{ background: p.background }}>
                              <img src={`/stickers/fluent/${p.avatar}.png`} alt="" />
                            </span>
                            <div>
                              <strong>{p.nickname}</strong>
                              <time>
                                <Clock size={11} />
                                {timeOf(entry.occurredAt)}
                              </time>
                            </div>
                            <button
                              className="icon-button card-actions"
                              aria-label={`更多操作：${p.nickname} ${timeOf(entry.occurredAt)}`}
                              onClick={() => setActions(entry)}
                            >
                              <MoreHorizontal size={20} />
                            </button>
                          </header>
                          <button
                            className={`moment-media ${entry.media.type === 'photo' ? 'photo' : 'sticker'}`}
                            aria-label={`查看${mediaName(entry.media)}`}
                            onClick={() => setZoom(entry)}
                          >
                            <img
                              src={mediaSrc(entry.media)}
                              alt={mediaName(entry.media)}
                              loading="lazy"
                            />
                          </button>
                          {entry.description && (
                            <p className="moment-description">{entry.description}</p>
                          )}
                        </article>
                      ))}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
      {actions && (
        <Modal title="动态操作" onClose={() => setActions(undefined)}>
          <div className="entry-options">
            <button
              className="secondary full"
              aria-label={`编辑${personOf(actions.personId).nickname}的动态`}
              onClick={() => {
                onEdit(actions);
                setActions(undefined);
              }}
            >
              <Pencil size={18} />
              编辑动态
            </button>
            <button
              className="danger-button full"
              aria-label={`删除${personOf(actions.personId).nickname}的动态`}
              onClick={() => {
                onDelete(actions);
                setActions(undefined);
              }}
            >
              <Trash2 size={18} />
              删除动态
            </button>
          </div>
        </Modal>
      )}
      {zoom && (
        <Modal
          title={`${personOf(zoom.personId).nickname} · ${timeOf(zoom.occurredAt)}`}
          onClose={() => setZoom(undefined)}
        >
          <img className="zoom-image" src={mediaSrc(zoom.media)} alt={mediaName(zoom.media)} />
          {zoom.description && <p className="moment-description">{zoom.description}</p>}
        </Modal>
      )}
    </section>
  );
}
