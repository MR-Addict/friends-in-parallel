import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ImagePlus,
  Smile,
  Sticker as StickerIcon,
  Search,
  Clock,
  LoaderCircle,
  Camera,
} from 'lucide-react';
import { Modal } from './Modal';
import {
  people,
  packs,
  stickers,
  personOf,
  mediaSrc,
  localTime,
  readPreference,
  preference,
  uploadEntry,
  type Entry,
  type Sticker,
} from './lib';
export function Composer({
  entry,
  onClose,
  onSaved,
}: {
  entry?: Entry;
  onClose: () => void;
  onSaved: (entry: Entry) => void;
}) {
  const [step, setStep] = useState(entry ? 2 : 1),
    [personId, setPersonId] = useState(entry?.personId || readPreference('parallel.person', ''));
  const [type, setType] = useState<'photo' | 'emoji' | 'sticker'>(entry?.media.type || 'sticker');
  const [description, setDescription] = useState(entry?.description || ''),
    [time, setTime] = useState(localTime(entry?.occurredAt));
  const [stickerId, setStickerId] = useState(
      entry?.media.type === 'sticker' ? entry.media.stickerId : '',
    ),
    [emoji, setEmoji] = useState(entry?.media.type === 'emoji' ? entry.media.emoji : '');
  const [pack, setPack] = useState(
    entry?.media.type === 'sticker'
      ? stickers.find((s) => s.id === stickerId)?.packId || 'fluent'
      : 'fluent',
  );
  const [category, setCategory] = useState('全部'),
    [search, setSearch] = useState(''),
    [file, setFile] = useState<File>(),
    [preview, setPreview] = useState('');
  const [recent, setRecent] = useState<string[]>(readPreference('parallel.recent', []));
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(0);
  useEffect(() => {
    if (!file) {
      setPreview('');
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const choose = (s: Sticker) => {
    setStickerId(s.id);
    const next = [s.id, ...recent.filter((id) => id !== s.id)].slice(0, 18);
    setRecent(next);
    preference('parallel.recent', next);
  };
  const photo = preview || (entry?.media.type === 'photo' ? mediaSrc(entry.media) : '');
  const filtered = stickers.filter(
    (s) =>
      s.packId === pack &&
      (category === '全部' || category === '最近'
        ? category !== '最近' || recent.includes(s.id)
        : s.category === category) &&
      (!search ||
        s.name.includes(search) ||
        s.category.includes(search) ||
        s.emoji.includes(search)),
  );
  const ready = type === 'photo' ? !!photo : type === 'emoji' ? !!emoji : !!stickerId;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!ready) {
      setError('先选择一份素材吧');
      return;
    }
    const parsed = new Date(time + ':00+08:00');
    if (!Number.isFinite(parsed.getTime()) || parsed.getTime() > Date.now()) {
      setError('请选择已经发生的时间');
      return;
    }
    const form = new FormData();
    form.set('personId', personId);
    form.set('description', description);
    form.set('occurredAt', parsed.toISOString());
    form.set('mediaType', type);
    if (type === 'photo') {
      if (file) form.set('photo', file);
      else if (entry?.media.type === 'photo') form.set('filename', entry.media.filename);
    } else if (type === 'sticker') form.set('stickerId', stickerId);
    else form.set('emoji', emoji);
    setBusy(true);
    try {
      const saved = await uploadEntry(form, entry?.id, setProgress);
      preference('parallel.person', personId);
      onSaved(saved);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={entry ? '修改这一刻' : step === 1 ? '今天，是谁的小日常？' : '把这一刻留下来'}
      onClose={onClose}
      busy={busy}
    >
      <div className="stepper">
        <span className={step === 1 ? 'current' : 'done'}>01 选择朋友</span>
        <i />
        <span className={step === 2 ? 'current' : ''}>02 记录此刻</span>
      </div>
      {step === 1 ? (
        <div className="person-step">
          <p className="muted">选一个名字，开始记录你的平行生活。</p>
          <div className="person-list">
            {people.map((p) => (
              <button
                key={p.id}
                className={`person-choice ${personId === p.id ? 'selected' : ''}`}
                style={
                  { '--person-color': p.color, '--person-bg': p.background } as React.CSSProperties
                }
                onClick={() => setPersonId(p.id)}
              >
                <span className="avatar" style={{ background: p.background }}>
                  <img src={`/stickers/fluent/${p.avatar}.png`} alt="" />
                </span>
                <span>{p.nickname}</span>
                <span className="choice-check">{personId === p.id && <Check size={16} />}</span>
              </button>
            ))}
          </div>
          <button
            className="primary full"
            disabled={!personId}
            onClick={() => {
              preference('parallel.person', personId);
              setStep(2);
            }}
          >
            下一步 <ArrowRight size={18} />
          </button>
        </div>
      ) : (
        <form onSubmit={submit}>
          <button type="button" className="back-person" disabled={busy} onClick={() => setStep(1)}>
            <ArrowLeft size={15} />
            <span className="tiny-dot" style={{ background: personOf(personId).color }} />
            {personOf(personId).nickname}
            <span className="muted">· 换一位朋友</span>
          </button>
          <fieldset disabled={busy}>
            <legend className="field-label">
              此刻，在干嘛 <span>选一种方式表达</span>
            </legend>
            <div className="media-tabs">
              {(
                [
                  { id: 'photo', label: '照片', Icon: ImagePlus },
                  { id: 'emoji', label: '表情', Icon: Smile },
                  { id: 'sticker', label: '贴纸', Icon: StickerIcon },
                ] as const
              ).map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  className={type === id ? 'active' : ''}
                  onClick={() => {
                    setType(id);
                    setError('');
                  }}
                >
                  <Icon size={17} />
                  {label}
                </button>
              ))}
            </div>
            {type === 'photo' ? (
              <label className={`photo-upload ${photo ? 'has-photo' : ''}`}>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type)) {
                      setError('请选择 JPEG、PNG 或 WebP 照片');
                      return;
                    }
                    if (f.size > 20 * 1024 * 1024) {
                      setError('照片不能超过 20 MB');
                      return;
                    }
                    setError('');
                    setFile(f);
                  }}
                />
                {photo ? (
                  <>
                    <img src={photo} alt="照片预览" />
                    <span className="replace-photo">
                      <Camera size={16} /> 换一张照片
                    </span>
                  </>
                ) : (
                  <>
                    <span className="upload-icon">
                      <ImagePlus size={28} />
                    </span>
                    <strong>点这里，放一张此刻的照片</strong>
                    <small>相册或拍照 · 最大 20 MB</small>
                  </>
                )}
              </label>
            ) : type === 'emoji' ? (
              <div className="emoji-grid">
                {stickers
                  .filter((s) => s.packId === 'fluent')
                  .map((s) => (
                    <button
                      type="button"
                      key={s.id}
                      title={s.name}
                      aria-label={s.name}
                      aria-pressed={emoji === s.emoji}
                      className={emoji === s.emoji ? 'selected' : ''}
                      onClick={() => setEmoji(s.emoji)}
                    >
                      <img src={s.file} alt={s.emoji} />
                    </button>
                  ))}
              </div>
            ) : (
              <div className="sticker-picker">
                <div className="pack-tabs">
                  {packs.map((p) => (
                    <button
                      type="button"
                      key={p.id}
                      className={pack === p.id ? 'active' : ''}
                      onClick={() => setPack(p.id)}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
                <label className="search-box">
                  <Search size={16} />
                  <input
                    aria-label="搜索贴纸"
                    placeholder="找找此刻的心情…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
                <div className="category-tabs">
                  {['全部', '最近', '心情', '吃喝', '工作学习', '休息玩乐'].map((c) => (
                    <button
                      type="button"
                      className={category === c ? 'active' : ''}
                      key={c}
                      onClick={() => setCategory(c)}
                    >
                      {c}
                    </button>
                  ))}
                </div>
                <div className="sticker-grid">
                  {filtered.map((s) => (
                    <button
                      type="button"
                      key={s.id}
                      className={stickerId === s.id ? 'selected' : ''}
                      aria-pressed={stickerId === s.id}
                      onClick={() => choose(s)}
                    >
                      <img src={s.file} alt="" loading="lazy" />
                      <span>{s.name}</span>
                      {stickerId === s.id && <Check className="sticker-check" size={14} />}
                    </button>
                  ))}
                  {!filtered.length && (
                    <p className="picker-empty">
                      {category === '最近' ? '这套贴纸还没有使用记录' : '没有找到，试试别的词吧'}
                    </p>
                  )}
                </div>
                {stickerId && (
                  <div className="selection-note">
                    已选：{stickers.find((s) => s.id === stickerId)?.name} ·{' '}
                    {
                      packs.find((p) => p.id === stickers.find((s) => s.id === stickerId)?.packId)
                        ?.name
                    }
                  </div>
                )}
              </div>
            )}
            <label className="field-label" htmlFor="description">
              想说的话 <span>不写也没关系</span>
            </label>
            <div className="description-input">
              <textarea
                id="description"
                placeholder="比如：终于喝到了念了一周的奶茶 ☁"
                rows={3}
                maxLength={500}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              <small>{Array.from(description).length}/500</small>
            </div>
            <label className="field-label" htmlFor="moment-time">
              发生的时间 <span>北京时间 · 可以补记</span>
            </label>
            <div className="time-input">
              <Clock size={18} />
              <input
                required
                type="datetime-local"
                id="moment-time"
                max={localTime()}
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
              <button type="button" onClick={() => setTime(localTime())}>
                现在
              </button>
            </div>
          </fieldset>
          {error && (
            <p role="alert" className="error-banner">
              {error}
            </p>
          )}
          <div className="composer-footer">
            <button className="primary full" disabled={busy || !ready} type="submit">
              {busy ? (
                <>
                  <LoaderCircle className="spin" size={18} />
                  {progress < 100 ? `正在上传 ${progress}%` : '正在保存…'}
                </>
              ) : (
                <>
                  {entry ? '保存修改' : '发布这一刻'}
                  <ArrowRight size={18} />
                </>
              )}
            </button>
            <p className="small-note">普通的一刻，也值得被记住。</p>
          </div>
        </form>
      )}
    </Modal>
  );
}
