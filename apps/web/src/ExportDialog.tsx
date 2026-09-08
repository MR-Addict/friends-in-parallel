import { Icon as IslandIcon, Button } from 'animal-island-ui';
import { useExportValidity } from './useExportValidity';
import { ShareButton } from './ShareButton';
import { useEffect, useRef, useState } from 'react';
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
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const { validate, shareValidity } = useExportValidity(
    result?.images[0],
    result?.expiresAt,
    (message) => {
      setResult(undefined);
      setPageIndex(0);
      setError(message);
    },
    setError,
  );
  async function images() {
    setPageIndex(0);
    setBusy('images');
    setError('');
    try {
      const value = await api<ImageExport>('/api/exports/images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date }),
      });
      if (alive.current) setResult(value);
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      if (alive.current) setBusy('');
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
      if (alive.current) setError((e as Error).message);
    } finally {
      if (alive.current) setBusy('');
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
            <Button
              className="island-control"
              type="text"
              disabled={!!busy}
              aria-busy={busy === 'images'}
              onClick={images}
            >
              <span className="export-icon peach">
                <IslandIcon icon={Image} size={25} />
              </span>
              <div>
                <strong>生成手账长图</strong>
                <small>把大家的瞬间放在一起 · 保存与分享</small>
              </div>
              {busy === 'images' ? (
                <IslandIcon icon={LoaderCircle} size={20} className="spin" />
              ) : (
                <IslandIcon icon={ArrowDownToLine} size={20} />
              )}
            </Button>
            <Button
              className="island-control"
              type="text"
              disabled={!!busy}
              onClick={() => {
                setVideoStep(true);
                setError('');
              }}
            >
              <span className="export-icon">
                <IslandIcon icon={Film} size={25} />
              </span>
              <div>
                <strong>生成回忆视频</strong>
                <small>12 种画面风格 · 24 首配乐 · 收藏完整的一天</small>
              </div>
              <IslandIcon icon={ArrowDownToLine} size={20} />
            </Button>
            <Button
              type="text"
              className="island-control export-materials-option"
              disabled={!!busy}
              onClick={() => {
                setArchiveStep(true);
                setError('');
              }}
            >
              <span className="export-icon sage">
                <IslandIcon icon={FolderArchive} size={25} />
              </span>
              <div>
                <strong>素材 ZIP</strong>
                <small>下一步：复制 AI 提示词，分享素材</small>
              </div>
              {busy === 'archive' ? (
                <IslandIcon icon={LoaderCircle} size={20} className="spin" />
              ) : (
                <IslandIcon icon={ArrowDownToLine} size={20} />
              )}
            </Button>
          </div>
          <p className="small-note">图片太长时会分成多张，完整保留每一个瞬间。</p>
        </>
      ) : (
        <>
          <div className="export-preview-scroll" ref={previewRef}>
            <Button
              type="text"
              className="island-control text-button"
              onClick={() => setResult(undefined)}
            >
              <IslandIcon icon={ArrowLeft} size={16} />
              返回导出选项
            </Button>
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
                <Button
                  type="text"
                  className="island-control icon-button"
                  aria-label="上一张图片"
                  disabled={pageIndex === 0}
                  onClick={async () => {
                    if (!(await validate())) return;
                    setPageIndex((i) => Math.max(0, i - 1));
                    previewRef.current?.scrollTo(0, 0);
                  }}
                >
                  <IslandIcon icon={ChevronLeft} size={20} />
                </Button>
                <span role="status">
                  第 {pageIndex + 1} / {result.images.length} 张
                </span>
                <Button
                  type="text"
                  className="island-control icon-button"
                  aria-label="下一张图片"
                  disabled={pageIndex === result.images.length - 1}
                  onClick={async () => {
                    if (!(await validate())) return;
                    setPageIndex((i) => Math.min(result.images.length - 1, i + 1));
                    previewRef.current?.scrollTo(0, 0);
                  }}
                >
                  <IslandIcon icon={ChevronRight} size={20} />
                </Button>
              </nav>
            )}
            <ShareButton
              validity={shareValidity}
              variant="primary"
              download={{ url: `${result.images[pageIndex]}?download=1`, validate }}
              label={result.images.length === 1 ? '分享图片' : '分享当前图片'}
              resource={{
                url: result.images[pageIndex],
                filename: `和朋友的同一时间-${date}-手账-${String(pageIndex + 1).padStart(2, '0')}.png`,
                mime: 'image/png',
              }}
            />
            {result.images.length > 1 && (
              <ShareButton
                label="分享图片合集"
                validity={shareValidity}
                download={{ url: result.archiveUrl, validate }}
                resource={{
                  url: result.archiveUrl,
                  filename: `和朋友的同一时间-${date}-手账合集.zip`,
                  mime: 'application/zip',
                }}
              />
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
