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
import { Photo } from './Photo';
import { readDraft, writeDraft, type Draft } from './drafts';
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
interface ComposerProps {
  entry?: Entry;
  date: string;
  onClose: () => void;
  onSaved: (entry: Entry) => void;
}
export function Composer(props: ComposerProps) {
  const [loaded, setLoaded] = useState<{ draft?: Draft }>();
  useEffect(() => {
    let active = true;
    if (props.entry) setLoaded({});
    else
      readDraft(props.date).then((draft) => {
        if (active) setLoaded({ draft });
      });
    return () => {
      active = false;
    };
  }, [props.date, props.entry]);
  if (!loaded)
    return (
      <Modal title="记下一刻" onClose={props.onClose}>
        <p className="muted">正在打开草稿…</p>
      </Modal>
    );
  return <ComposerEditor {...props} draft={loaded.draft} />;
}
function ComposerEditor({
  entry,
  date,
  onClose,
  onSaved,
  draft,
}: ComposerProps & { draft?: Draft }) {
  const initialPerson = entry?.personId || draft?.personId || readPreference('parallel.person', '');
  const [step, setStep] = useState(entry || people.some((p) => p.id === initialPerson) ? 2 : 1),
    [personId, setPersonId] = useState(
      people.some((p) => p.id === initialPerson) ? initialPerson : '',
    );
  const [type, setType] = useState<'photo' | 'sticker'>(
    entry ? (entry.media.type === 'photo' ? 'photo' : 'sticker') : draft?.type || 'sticker',
  );
  const [description, setDescription] = useState(entry?.description ?? draft?.description ?? ''),
    [time, setTime] = useState(
      entry ? localTime(entry.occurredAt) : draft?.time || `${date}T${localTime().slice(11)}`,
    );
  const [pickerOpen, setPickerOpen] = useState(false);
  const legacyEmoji = entry?.media.type === 'emoji' ? entry.media.emoji : '';
  const [stickerId, setStickerId] = useState(
    entry?.media.type === 'sticker'
      ? entry.media.stickerId
      : entry?.media.type === 'emoji'
        ? stickers.find((s) => s.packId === 'fluent' && s.emoji === legacyEmoji)?.id || ''
        : draft?.stickerId || '',
  );
  const [pack, setPack] = useState(
    entry?.media.type === 'sticker'
      ? stickers.find((s) => s.id === stickerId)?.packId || 'fluent'
      : 'fluent',
  );
  const [category, setCategory] = useState('全部'),
    [search, setSearch] = useState(''),
    [file, setFile] = useState<File | undefined>(draft?.file),
    [preview, setPreview] = useState('');
  const [recent, setRecent] = useState<string[]>(readPreference('parallel.recent', []));
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(0);
  const [draftStatus, setDraftStatus] = useState('');
  const [undo, setUndo] = useState<{ draft: Draft; clearedTime: string }>();
  useEffect(() => {
    if (!undo) return;
    const timer = setTimeout(() => setUndo(undefined), 10000);
    return () => clearTimeout(timer);
  }, [undo]);
  useEffect(() => {
    if (
      undo &&
      (description ||
        stickerId ||
        file ||
        type !== 'sticker' ||
        time !== undo.clearedTime ||
        personId !== undo.draft.personId)
    )
      setUndo(undefined);
  }, [undo, description, stickerId, file, type, time, personId]);
  useEffect(() => {
    if (entry) return;
    let active = true;
    setDraftStatus('正在保存草稿…');
    void writeDraft(date, { personId, type, description, time, stickerId, file }).then((saved) => {
      if (active) setDraftStatus(saved ? '草稿已保存在此设备' : '草稿暂存于当前页面，请勿刷新');
    });
    return () => {
      active = false;
    };
  }, [date, entry, personId, type, description, time, stickerId, file]);
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
    if (busy) return;
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
      if (!entry) await writeDraft(date);
      onSaved(saved);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={
        pickerOpen ? '选择表情' : entry ? '编辑动态' : step === 1 ? '这一刻，属于谁' : '记下一刻'
      }
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
          {step === 1 ? (
            <div className="person-step">
              <p className="muted person-intro">选好后，下次会直接为你打开编辑页。</p>
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
                    留下此刻 <span>照片或表情，都可以</span>
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
                        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = '';
                          if (!f) return;
                          setError('');
                          setFile(f);
                        }}
                      />
                      {photo ? (
                        <>
                          <Photo src={photo} alt="照片预览" />
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
                          <small>支持 iPhone 照片 · 最大 20 MB · 上传后自动优化</small>
                        </>
                      )}
                      {file && (
                        <small>
                          {file.name} · {(file.size / 1_000_000).toFixed(2)} MB
                        </small>
                      )}
                    </label>
                  ) : (
                    <>
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
                      <div className="quick-stickers" aria-label="常用表情">
                        {(recent.length
                          ? recent
                              .map((id) => stickers.find((s) => s.id === id))
                              .filter((s): s is Sticker => !!s)
                          : stickers.filter((s) => s.packId === 'fluent')
                        )
                          .slice(0, 5)
                          .map((s) => (
                            <button
                              type="button"
                              key={s.id}
                              aria-label={`快捷表情：${s.name}`}
                              aria-pressed={stickerId === s.id}
                              onClick={() => choose(s)}
                            >
                              <img src={s.file} alt="" />
                            </button>
                          ))}
                        <button
                          type="button"
                          className="more-stickers"
                          onClick={() => setPickerOpen(true)}
                        >
                          更多
                        </button>
                      </div>
                    </>
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
                {!entry && (
                  <div className="draft-note">
                    <span role="status">{undo ? '草稿已清空 · 10 秒内可撤销' : draftStatus}</span>
                    {undo ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          const previous = undo.draft;
                          setPersonId(previous.personId);
                          setDescription(previous.description);
                          setStickerId(previous.stickerId);
                          setFile(previous.file);
                          setType(previous.type);
                          setTime(previous.time);
                          setError('');
                          setUndo(undefined);
                        }}
                      >
                        撤销清空
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={busy || (!description && !stickerId && !file)}
                        onClick={() => {
                          const clearedTime = `${date}T${localTime().slice(11)}`;
                          setUndo({
                            draft: { personId, description, stickerId, file, type, time },
                            clearedTime,
                          });
                          setDescription('');
                          setStickerId('');
                          setFile(undefined);
                          setType('sticker');
                          setTime(clearedTime);
                          setError('');
                        }}
                      >
                        清空草稿
                      </button>
                    )}
                  </div>
                )}
                <button className="primary full" disabled={busy || !ready} type="submit">
                  {busy ? (
                    <>
                      <LoaderCircle className="spin" size={18} />
                      {progress < 100 ? `正在上传 ${progress}%` : '正在优化并保存…'}
                    </>
                  ) : (
                    <>
                      {entry ? '保存修改' : '发布'}
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
