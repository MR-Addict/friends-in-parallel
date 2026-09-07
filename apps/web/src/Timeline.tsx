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
    [zoom, setZoom] = useState<Entry>();
  useEffect(() => {
    if (focusId) setFilter('all');
  }, [focusId]);
  const visible = entries.filter((e) => filter === 'all' || e.personId === filter);
  const hours = [...new Set(visible.map((e) => timeOf(e.occurredAt).slice(0, 2)))].sort();
  return (
    <section className="timeline-view">
      <div className="section-eyebrow">OUR LITTLE DAYS</div>
      <div className="timeline-title">
        <h1>
          同一天的我们<span>。</span>
        </h1>
        <button
          className="icon-button"
          aria-label="刷新时间线"
          onClick={onRefresh}
          disabled={loading}
        >
          <RefreshCw size={18} className={loading ? 'spin' : ''} />
        </button>
      </div>
      <p className="section-subtitle">时钟走在一起，生活各自有趣。</p>
      <div className="date-toolbar">
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
        <button
          className="text-button"
          onClick={onExport}
          disabled={!entries.length || loading || !!error}
        >
          <Download size={15} />
          导出这一天
        </button>
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
          <div className="empty-illustration">
            <img src="/stickers/fluent/1f31b.png" alt="" />
            <span>还留着空白呢</span>
          </div>
          <h2>
            {filter === 'all'
              ? '这一天，等一个小瞬间'
              : `${personOf(filter).nickname}这天还没有记录`}
          </h2>
          <p>一顿饭、一场发呆，都是生活的切片。</p>
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
                <span className="hour-dot" />
                <time>{hour}:00</time>
                <span className="hour-line" />
                <span>
                  {Number(hour) < 6
                    ? '夜深了'
                    : Number(hour) < 12
                      ? '早安时光'
                      : Number(hour) < 18
                        ? '午后日常'
                        : '晚间片刻'}
                </span>
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
                            <div className="card-actions">
                              <button
                                className="icon-button"
                                aria-label={`编辑${p.nickname} ${timeOf(entry.occurredAt)}的动态`}
                                onClick={() => onEdit(entry)}
                              >
                                <Pencil size={15} />
                              </button>
                              <button
                                className="icon-button"
                                aria-label={`删除${p.nickname} ${timeOf(entry.occurredAt)}的动态`}
                                onClick={() => onDelete(entry)}
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </header>
                          <button
                            className={`moment-media ${entry.media.type === 'photo' ? 'photo' : 'sticker'}`}
                            aria-label={`查看${mediaName(entry.media)}`}
                            style={
                              entry.media.type === 'photo'
                                ? undefined
                                : { background: p.background }
                            }
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
                          <div className="card-caption">
                            <span className="tiny-dot" style={{ background: p.color }} />
                            {entry.media.type === 'sticker'
                              ? mediaName(entry.media)
                              : entry.media.type === 'emoji'
                                ? '此刻的心情'
                                : '生活切片'}
                            <span>平行生活 · 同频收藏</span>
                          </div>
                        </article>
                      ))}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
          <div className="timeline-end">
            <span />
            这一天的小小日常，都在这里了
            <span />
          </div>
        </div>
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
