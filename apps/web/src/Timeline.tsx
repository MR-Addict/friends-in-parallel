import { ShareButton, entryShare } from './ShareButton';
import { Photo } from './Photo';
import { useEffect, useState } from 'react';
import { Pencil, Trash2, Clock, MoreHorizontal, LoaderCircle, Users } from 'lucide-react';
import { people, personOf, timeOf, mediaSrc, mediaName, today, type Entry } from './lib';
import { Modal } from './Modal';
export function Timeline({
  entries,
  loading,
  error,
  onRefresh,
  onEdit,
  onDelete,
  focusId,
  date,
}: {
  entries: Entry[];
  loading: boolean;
  error: string;
  onRefresh: () => void;
  onEdit: (e: Entry) => void;
  onDelete: (e: Entry) => void;
  focusId: string;
  date: string;
}) {
  const [filter, setFilter] = useState('all'),
    [zoom, setZoom] = useState<Entry>(),
    [actions, setActions] = useState<Entry>();
  useEffect(() => {
    if (focusId) setFilter('all');
  }, [focusId]);
  const visible = entries
    .filter((e) => filter === 'all' || e.personId === filter)
    .sort(
      (a, b) =>
        b.occurredAt.localeCompare(a.occurredAt) ||
        b.createdAt.localeCompare(a.createdAt) ||
        b.id.localeCompare(a.id),
    );
  const hours = [...new Set(visible.map((e) => timeOf(e.occurredAt).slice(0, 2)))].sort().reverse();
  return (
    <section className="timeline-view" aria-labelledby="moments-heading">
      <section className="people-panel" aria-label="朋友筛选">
        <div className="people-filter" role="group" aria-label="按人物筛选">
          <button
            aria-pressed={filter === 'all'}
            className={filter === 'all' ? 'active' : ''}
            onClick={() => setFilter('all')}
          >
            <span className="filter-avatar all-friends">
              <Users size={21} />
            </span>
            全部朋友
          </button>
          {people.map((p) => (
            <button
              key={p.id}
              aria-pressed={filter === p.id}
              className={filter === p.id ? 'active' : ''}
              onClick={() => setFilter(p.id)}
            >
              <span className="filter-avatar" style={{ background: p.background }}>
                <img src={`/stickers/fluent/${p.avatar}.png`} alt="" />
                <i className={entries.some((e) => e.personId === p.id) ? 'has-moments' : ''} />
              </span>
              {p.nickname}
            </button>
          ))}
        </div>
      </section>
      <div className="timeline-heading">
        <div className="section-heading">
          <h2 id="moments-heading">{date === today() ? '今天的瞬间' : '这一天的瞬间'}</h2>
        </div>
        <div className="timeline-summary" role="status">
          <span>
            {loading
              ? '翻开手账中…'
              : error
                ? '暂时没有加载成功'
                : filter === 'all'
                  ? `${new Set(entries.map((e) => e.personId)).size} 位朋友 · ${entries.length} 个瞬间`
                  : `${personOf(filter).nickname} · ${visible.length} 个瞬间`}
          </span>
          {!loading && !error && filter !== 'all' && <span>当天共 {entries.length} 个瞬间</span>}
        </div>
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
          <span className="empty-illustration">
            <Users size={32} />
          </span>
          <h2>
            {filter === 'all' ? '这一天还没有动态' : `${personOf(filter).nickname}这天还没有记录`}
          </h2>
          <p>
            {date === today()
              ? '一张照片，或一个表情，都值得留下。'
              : '过去的小事，也可以慢慢补上。'}
          </p>
        </div>
      ) : (
        <div className="hour-timeline">
          {hours.map((hour) => {
            const hourEntries = visible.filter((e) => timeOf(e.occurredAt).startsWith(hour));
            const companions = [...new Set(hourEntries.map((e) => e.personId))].map(personOf);
            return (
              <section className="hour-group" key={hour}>
                <div className="hour-heading">
                  <time>{hour}:00</time>
                  <span className="hour-line" />
                  {companions.length > 1 && (
                    <div className="same-hour">
                      <span className="companion-avatars">
                        {companions.map((p) => (
                          <img
                            key={p.id}
                            src={`/stickers/fluent/${p.avatar}.png`}
                            alt={p.nickname}
                            style={{ background: p.background }}
                          />
                        ))}
                      </span>
                      <span>{companions.length} 位朋友的此刻</span>
                    </div>
                  )}
                </div>
                <div className="hour-entries">
                  {hourEntries.map((entry) => {
                    const p = personOf(entry.personId);
                    return (
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
                        <div
                          className={`moment-body ${entry.media.type === 'photo' ? 'photo-body' : 'expression-body'}`}
                        >
                          <button
                            className={`moment-media ${entry.media.type === 'photo' ? 'photo' : 'sticker'}`}
                            aria-label={`查看${mediaName(entry.media)}`}
                            onClick={() => setZoom(entry)}
                          >
                            <Photo
                              src={mediaSrc(entry.media)}
                              alt={mediaName(entry.media)}
                              loading="lazy"
                            />
                          </button>
                          {entry.description && (
                            <p className="moment-description">{entry.description}</p>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
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
          <Photo className="zoom-image" src={mediaSrc(zoom.media)} alt={mediaName(zoom.media)} />
          {mediaSrc(zoom.media) && (
            <ShareButton
              label={zoom.media.type === 'photo' ? '分享照片' : '分享图片'}
              {...entryShare(zoom)}
            />
          )}
          {zoom.description && <p className="moment-description">{zoom.description}</p>}
        </Modal>
      )}
    </section>
  );
}
