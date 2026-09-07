import { useExportValidity } from './useExportValidity';
import { ShareButton } from './ShareButton';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  ArrowLeft,
  Film,
  LoaderCircle,
  Music2,
  Play,
  Square,
  RefreshCw,
  Check,
} from 'lucide-react';
import { api, preference, readPreference } from './lib';
import type { VideoExportJob, VideoExportOptions } from '../../server/src/video-types';

const durationLabel = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
interface SavedVideo {
  jobId: string;
  styleId: string;
  musicId: string;
}
export function VideoStep({ date, onBack }: { date: string; onBack: () => void }) {
  const key = `parallel-video:${date}`;
  const restored = useRef(readPreference<SavedVideo | null>(key, null));
  const [options, setOptions] = useState<VideoExportOptions>();
  const [styleId, setStyleId] = useState('paper');
  const [musicId, setMusicId] = useState('carefree');
  const [job, setJob] = useState<VideoExportJob>();
  const [jobId, setJobId] = useState(() => restored.current?.jobId || '');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [playing, setPlaying] = useState(false);
  const [reload, setReload] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const alive = useRef(true);
  const stop = () => {
    audioRef.current?.pause();
    audioRef.current = null;
    setPlaying(false);
  };
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    api<VideoExportOptions>('/api/exports/video-options', { signal: controller.signal })
      .then((value) => {
        setOptions(value);
        const saved = restored.current;
        if (saved && value.styles.some((style) => style.id === saved.styleId)) {
          setStyleId(saved.styleId);
          setMusicId(
            saved.musicId === 'none' || value.music.some((music) => music.id === saved.musicId)
              ? saved.musicId
              : value.styles.find((style) => style.id === saved.styleId)!.defaultMusicId,
          );
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [key, reload]);
  useEffect(() => {
    if (!jobId) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const response = await fetch(`/api/exports/videos/${encodeURIComponent(jobId)}`, {
          signal: controller.signal,
        });
        const value = await response.json();
        if (controller.signal.aborted) return;
        if (!response.ok) {
          if (response.status === 404) {
            preference(key, {
              jobId: '',
              styleId: restored.current?.styleId || styleId,
              musicId: restored.current?.musicId || musicId,
            });
            setJobId('');
            setJob(undefined);
            setError(value.error || '视频已过期，请重新生成');
            return;
          }
          throw new Error(value.error || '暂时无法查询生成进度');
        }
        if (controller.signal.aborted) return;
        setJob(value);
        setError('');
        setStyleId(value.styleId);
        setMusicId(value.musicId);
        if (value.status === 'rendering') timer = setTimeout(poll, 1500);
      } catch (e) {
        if (!controller.signal.aborted) {
          setError(`${(e as Error).message}，正在重新连接…`);
          timer = setTimeout(poll, 3000);
        }
      }
    }
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [jobId, key]);
  const validate = useExportValidity(
    job?.result?.videoUrl,
    job?.result?.expiresAt,
    (message) => {
      setJobId('');
      setJob(undefined);
      preference(key, { jobId: '', styleId, musicId });
      setError(message);
    },
    setError,
  );
  const selected = options?.music.find((music) => music.id === musicId);
  const style = options?.styles.find((style) => style.id === styleId);
  const busy = submitting || job?.status === 'rendering' || (!!jobId && !job);
  function configure() {
    stop();
    setJobId('');
    setJob(undefined);
    setError('');
    preference(key, { jobId: '', styleId, musicId });
  }
  async function preview() {
    if (playing) {
      stop();
      return;
    }
    if (!selected) return;
    stop();
    setError('');
    const audio = new Audio(selected.previewUrl);
    audioRef.current = audio;
    audio.onended = () => {
      if (audioRef.current === audio) setPlaying(false);
    };
    audio.onerror = () => {
      if (audioRef.current === audio) {
        setPlaying(false);
        setError('音乐暂时无法试听，请重试或选择其他音乐');
      }
    };
    try {
      await audio.play();
      if (alive.current && audioRef.current === audio) setPlaying(true);
      else audio.pause();
    } catch {
      if (alive.current && audioRef.current === audio) setError('音乐暂时无法试听，请重试');
    }
  }
  async function generate() {
    stop();
    setSubmitting(true);
    setError('');
    try {
      const value = await api<VideoExportJob>('/api/exports/videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, styleId, musicId }),
      });
      if (alive.current) {
        preference(key, { jobId: value.jobId, styleId, musicId });
        setJob(value);
        setJobId(value.jobId);
      }
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      if (alive.current) setSubmitting(false);
    }
  }
  return (
    <>
      <div className="export-preview-scroll video-step">
        <button
          className="text-button"
          onClick={() => {
            stop();
            onBack();
          }}
        >
          <ArrowLeft size={16} />
          返回导出选项
        </button>
        <p className="video-intro">
          {date} · 全部朋友的完整回顾
          <span>竖屏 1080p · 长文字会分成续页 · 最多保留 24 小时，动态更新后失效</span>
        </p>
        {loading ? (
          <p role="status">
            <LoaderCircle className="spin" size={18} /> 正在准备样式和音乐…
          </p>
        ) : !options ? (
          <button className="text-button" onClick={() => setReload((n) => n + 1)}>
            重新加载选项
          </button>
        ) : job?.status === 'ready' && job.result ? (
          <>
            <video
              className="video-player"
              key={job.result.videoUrl}
              controls
              onPlay={async (event) => {
                const player = event.currentTarget;
                if (player.dataset.validated === 'true') {
                  delete player.dataset.validated;
                  return;
                }
                player.pause();
                if (await validate()) {
                  player.dataset.validated = 'true';
                  void player.play().catch(() => {
                    delete player.dataset.validated;
                  });
                }
              }}
              playsInline
              preload="metadata"
              poster={job.result.coverUrl}
              src={job.result.videoUrl}
              aria-label="回忆视频预览"
              onError={() => {
                void validate().then((valid) => {
                  if (valid) setError('视频暂时无法播放，请重试');
                });
              }}
            />
            <p className="small-note">
              {durationLabel(job.result.duration)} · {selected?.title || '无音乐'}
              <br />
              有效期至{' '}
              {new Date(job.result.expiresAt).toLocaleString('zh-CN', {
                timeZone: 'Asia/Shanghai',
                hour12: false,
              })}
              （北京时间）
            </p>
          </>
        ) : busy ? (
          <div className="video-progress" role="status" aria-live="polite">
            <div className="video-progress-icon">
              <Film size={36} />
            </div>
            <h3>{job?.phase || (submitting ? '正在提交生成任务' : '正在恢复生成进度')}</h3>
            <progress max={100} value={job?.progress || 0} aria-label="视频生成进度" />
            <p>{job?.progress || 0}%</p>
            <p className="small-note">
              可以关闭窗口，稍后回来查看。
              <br />
              完整保留每一个瞬间，内容越多，生成时间越长。
            </p>
          </div>
        ) : (
          <>
            {!options.available && <p className="error-banner">{options.unavailableReason}</p>}
            {job?.status === 'failed' && (
              <p className="error-banner" role="alert">
                {job.error}
              </p>
            )}
            <fieldset className="video-fieldset">
              <legend>
                选择画面风格 <span>12 种不同的心情</span>
              </legend>
              <div className="video-style-grid">
                {options.styles.map((option) => (
                  <button
                    type="button"
                    key={option.id}
                    className={`video-style-option ${styleId === option.id ? 'selected' : ''}`}
                    aria-pressed={styleId === option.id}
                    onClick={() => {
                      stop();
                      setStyleId(option.id);
                      setMusicId(option.defaultMusicId);
                      setJob(undefined);
                      setJobId('');
                      preference(key, {
                        jobId: '',
                        styleId: option.id,
                        musicId: option.defaultMusicId,
                      });
                    }}
                  >
                    <div
                      className={`video-style-thumb thumb-${option.id}`}
                      style={
                        {
                          '--thumb-bg': option.background,
                          '--thumb-paper': option.paper,
                          '--thumb-ink': option.ink,
                          '--thumb-accent': option.accent,
                        } as CSSProperties
                      }
                    >
                      <span>和朋友的同一时间</span>
                      <div className="thumb-card">
                        <i />
                        <b>今天的小小日常</b>
                        <em>14:30</em>
                      </div>
                      {styleId === option.id && <Check size={18} className="thumb-check" />}
                    </div>
                    <strong>{option.name}</strong>
                    <small>{option.tag}</small>
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset className="video-fieldset">
              <legend>
                <Music2 size={17} /> 背景音乐 <span>24 首 · 自由搭配</span>
              </legend>
              <div className="video-music-row">
                <select
                  aria-label="背景音乐"
                  value={musicId}
                  onChange={(e) => {
                    stop();
                    setMusicId(e.target.value);
                    setJob(undefined);
                    setJobId('');
                    preference(key, { jobId: '', styleId, musicId: e.target.value });
                  }}
                >
                  <option value="none">无音乐 · 安静回顾</option>
                  {options.music.map((music) => (
                    <option key={music.id} value={music.id}>
                      {music.title} · {music.tag}
                      {music.id === style?.defaultMusicId || music.id === style?.secondMusicId
                        ? ' · 推荐'
                        : ''}
                    </option>
                  ))}
                </select>
                <button
                  className="video-listen"
                  disabled={!selected}
                  onClick={preview}
                  aria-label={playing ? '停止试听' : '试听背景音乐'}
                >
                  {playing ? <Square size={17} /> : <Play size={17} />}
                  {playing ? '停止' : '试听'}
                </button>
              </div>
            </fieldset>
          </>
        )}
        {error && (
          <p className="error-banner" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="export-download-bar">
        {job?.status === 'ready' && job.result ? (
          <>
            <ShareButton
              validate={validate}
              label="分享视频"
              variant="primary"
              resource={{
                url: `${job.result.videoUrl}?download=1`,
                filename: `和朋友的同一时间-${date}-回忆视频.mp4`,
                mime: 'video/mp4',
              }}
            />
            <button className="secondary full video-reconfigure" onClick={configure}>
              <RefreshCw size={16} />
              修改样式与音乐
            </button>
          </>
        ) : busy ? (
          <button className="text-button full" onClick={onBack}>
            稍后回来查看
          </button>
        ) : (
          <button
            className="primary full"
            disabled={loading || !options?.available}
            onClick={generate}
          >
            <Film size={18} />
            {job?.status === 'failed' ? '重新生成视频' : '开始生成视频'}
          </button>
        )}
      </div>
    </>
  );
}
