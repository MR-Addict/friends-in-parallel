import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ImagePlus,
  Smile,
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
  const [type, setType] = useState<'photo' | 'sticker'>(
    entry?.media.type === 'photo' ? 'photo' : 'sticker',
  );
  const [description, setDescription] = useState(entry?.description || ''),
    [time, setTime] = useState(localTime(entry?.occurredAt));
  const [pickerOpen, setPickerOpen] = useState(false);
  const legacyEmoji = entry?.media.type === 'emoji' ? entry.media.emoji : '';
  const [stickerId, setStickerId] = useState(
    entry?.media.type === 'sticker'
      ? entry.media.stickerId
      : entry?.media.type === 'emoji'
        ? stickers.find((s) => s.packId === 'fluent' && s.emoji === legacyEmoji)?.id || ''
        : '',
  );
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
    setPickerOpen(false);
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
  const ready = type === 'photo' ? !!photo : !!stickerId;
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
      title={pickerOpen ? '选择表情' : entry ? '编辑动态' : step === 1 ? '选择人物' : '填写动态'}
      className="composer-modal"
      onClose={onClose}
      busy={busy}
    >
      {pickerOpen ? (
        <div className="picker-page">
          <button className="text-button" onClick={() => setPickerOpen(false)}>
            <ArrowLeft size={16} />
            返回编辑
          </button>{' '}
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
                aria-label="搜索表情"
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
                  {category === '最近' ? '这套表情还没有使用记录' : '没有找到，试试别的词吧'}
                </p>
              )}
            </div>
            {stickerId && (
              <div className="selection-note">
                已选：{stickers.find((s) => s.id === stickerId)?.name} ·{' '}
                {packs.find((p) => p.id === stickers.find((s) => s.id === stickerId)?.packId)?.name}
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="stepper">
            <span className={step === 1 ? 'current' : 'done'}>01 选择朋友</span>
            <i />
            <span className={step === 2 ? 'current' : ''}>02 记录此刻</span>
          </div>
          {step === 1 ? (
            <div className="person-step">
              <p className="muted">这条动态属于谁？</p>
              <div className="person-list" role="group" aria-label="选择人物">
                {people.map((p) => (
                  <button
                    key={p.id}
                    aria-pressed={personId === p.id}
                    className={`person-choice ${personId === p.id ? 'selected' : ''}`}
                    style={
                      {
                        '--person-color': p.color,
                        '--person-bg': p.background,
                      } as React.CSSProperties
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
              <div className="composer-footer">
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
            </div>
          ) : (
            <form onSubmit={submit}>
              <div className="editor-fields">
                <button
                  type="button"
                  className="back-person"
                  disabled={busy}
                  onClick={() => setStep(1)}
                >
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
                        { id: 'sticker', label: '表情', Icon: Smile },
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
                  ) : (
                    <button
                      type="button"
                      className="selected-media"
                      aria-label={stickerId ? '更换表情' : '选择表情'}
                      onClick={() => setPickerOpen(true)}
                    >
                      {stickerId ? (
                        <img
                          src={stickers.find((s) => s.id === stickerId)?.file}
                          alt={stickers.find((s) => s.id === stickerId)?.name}
                        />
                      ) : (
                        <Smile size={32} />
                      )}
                      <span>{stickerId ? '更换表情' : '选择表情'}</span>
                    </button>
                  )}
                  <label className="field-label" htmlFor="description">
                    想说的话 <span>不写也没关系</span>
                  </label>
                  <div className="description-input">
                    <textarea
                      id="description"
                      placeholder="分享一下正在做的事…"
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
              </div>
              <div className="composer-footer">
                <button className="primary full" disabled={busy || !ready} type="submit">
                  {busy ? (
                    <>
                      <LoaderCircle className="spin" size={18} />
                      {progress < 100 ? `正在上传 ${progress}%` : '正在保存…'}
                    </>
                  ) : (
                    <>
                      {entry ? '保存修改' : '发布动态'}
                      <ArrowRight size={18} />
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </>
      )}
    </Modal>
  );
}
