import { ShareButton } from './ShareButton';
import { useRef, useState } from 'react';
import {
  Image,
  Film,
  FolderArchive,
  ArrowDownToLine,
  LoaderCircle,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Modal } from './Modal';
import { ArchiveStep } from './ArchiveStep';
import { VideoStep } from './VideoStep';
import { api, type ImageExport } from './lib';
export function ExportDialog({ date, onClose }: { date: string; onClose: () => void }) {
  const previewRef = useRef<HTMLDivElement>(null);
  const [archiveStep, setArchiveStep] = useState(false);
  const [videoStep, setVideoStep] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const [busy, setBusy] = useState(''),
    [error, setError] = useState(''),
    [result, setResult] = useState<ImageExport>();
  async function images() {
    setPageIndex(0);
    setBusy('images');
    setError('');
    try {
      setResult(
        await api<ImageExport>('/api/exports/images', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date }),
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  }
  async function archive() {
    setBusy('archive');
    setError('');
    try {
      await api(`/api/exports/archive?date=${date}&check=1`);
      const a = document.createElement('a');
      a.href = `/api/exports/archive?date=${date}`;
      a.download = ''; // The server supplies the dated filename.
      document.body.append(a);
      a.click();
      a.remove();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  }
  return (
    <Modal
      title={videoStep ? '把这一天，拍成回忆' : result ? '手账预览' : '把这一天，留成回忆'}
      onClose={onClose}
      busy={!!busy}
      wide={!!result}
      className={result || archiveStep || videoStep ? 'export-result-modal' : ''}
    >
      {!result && !archiveStep && !videoStep && (
        <p className="export-date">
          {date} <span>· 包含当天全部朋友的动态</span>
        </p>
      )}
      {videoStep ? (
        <VideoStep date={date} onBack={() => setVideoStep(false)} />
      ) : archiveStep ? (
        <ArchiveStep
          date={date}
          busy={!!busy}
          onBack={() => {
            setArchiveStep(false);
            setError('');
          }}
          onDownload={archive}
        />
      ) : !result ? (
        <>
          <div className="export-options">
            <button disabled={!!busy} aria-busy={busy === 'images'} onClick={images}>
              <span className="export-icon peach">
                <Image size={25} />
              </span>
              <div>
                <strong>生成手账长图</strong>
                <small>把大家的瞬间放在一起 · 保存与分享</small>
              </div>
              {busy === 'images' ? (
                <LoaderCircle size={20} className="spin" />
              ) : (
                <ArrowDownToLine size={20} />
              )}
            </button>
            <button
              disabled={!!busy}
              onClick={() => {
                setVideoStep(true);
                setError('');
              }}
            >
              <span className="export-icon">
                <Film size={25} />
              </span>
              <div>
                <strong>生成回忆视频</strong>
                <small>12 种画面风格 · 24 首配乐 · 收藏完整的一天</small>
              </div>
              <ArrowDownToLine size={20} />
            </button>
            <button
              className="export-materials-option"
              disabled={!!busy}
              onClick={() => {
                setArchiveStep(true);
                setError('');
              }}
            >
              <span className="export-icon sage">
                <FolderArchive size={25} />
              </span>
              <div>
                <strong>下载素材 ZIP</strong>
                <small>下一步：复制 AI 提示词，再下载素材</small>
              </div>
              {busy === 'archive' ? (
                <LoaderCircle size={20} className="spin" />
              ) : (
                <ArrowDownToLine size={20} />
              )}
            </button>
          </div>
          <p className="small-note">图片太长时会分成多张，完整保留每一个瞬间。</p>
        </>
      ) : (
        <>
          <div className="export-preview-scroll" ref={previewRef}>
            <button className="text-button" onClick={() => setResult(undefined)}>
              <ArrowLeft size={16} />
              返回导出选项
            </button>
            <div className="export-previews">
              <img
                key={result.images[pageIndex]}
                src={result.images[pageIndex]}
                alt={`${date}手账 第${pageIndex + 1}张`}
              />
            </div>
          </div>
          <div className="export-download-bar">
            {result.images.length > 1 && (
              <nav className="export-pagination" aria-label="导出图片翻页">
                <button
                  className="icon-button"
                  aria-label="上一张图片"
                  disabled={pageIndex === 0}
                  onClick={() => {
                    setPageIndex((i) => i - 1);
                    previewRef.current?.scrollTo(0, 0);
                  }}
                >
                  <ChevronLeft size={20} />
                </button>
                <span role="status">
                  第 {pageIndex + 1} / {result.images.length} 张
                </span>
                <button
                  className="icon-button"
                  aria-label="下一张图片"
                  disabled={pageIndex === result.images.length - 1}
                  onClick={() => {
                    setPageIndex((i) => i + 1);
                    previewRef.current?.scrollTo(0, 0);
                  }}
                >
                  <ChevronRight size={20} />
                </button>
              </nav>
            )}
            <a className="primary full" href={`${result.images[pageIndex]}?download=1`} download>
              <ArrowDownToLine size={18} />
              {result.images.length === 1 ? '下载图片' : '下载当前图片'}
            </a>
            <ShareButton
              label={result.images.length === 1 ? '分享图片' : '分享当前图片'}
              resource={{
                url: `${result.images[pageIndex]}?download=1`,
                filename: `此刻同频-${date}-手账-${String(pageIndex + 1).padStart(2, '0')}.png`,
                mime: 'image/png',
              }}
            />
            {result.images.length > 1 && (
              <a href={result.archiveUrl} className="text-button full" download>
                <FolderArchive size={16} />
                下载图片合集
              </a>
            )}
          </div>
        </>
      )}
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
    </Modal>
  );
}
