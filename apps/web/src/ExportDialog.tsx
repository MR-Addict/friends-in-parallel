import { useState } from 'react';
import { Image, FolderArchive, ArrowDownToLine, LoaderCircle, ArrowLeft } from 'lucide-react';
import { Modal } from './Modal';
import { api, type ImageExport } from './lib';
export function ExportDialog({ date, onClose }: { date: string; onClose: () => void }) {
  const [busy, setBusy] = useState(''),
    [error, setError] = useState(''),
    [result, setResult] = useState<ImageExport>();
  async function images() {
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
      a.download = `parallel-${date}-materials.zip`;
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
    <Modal title="导出当天动态" onClose={onClose} busy={!!busy} wide={!!result}>
      <p className="export-date">
        {date} <span>· 包含当天全部朋友的动态</span>
      </p>
      {!result ? (
        <>
          <div className="export-options">
            <button disabled={!!busy} onClick={images}>
              <span className="export-icon peach">
                <Image size={25} />
              </span>
              <div>
                <strong>分享长图</strong>
                <small>高清 PNG · 可预览、保存和分享</small>
              </div>
              {busy === 'images' ? (
                <LoaderCircle size={20} className="spin" />
              ) : (
                <ArrowDownToLine size={20} />
              )}
            </button>
            <button disabled={!!busy} onClick={archive}>
              <span className="export-icon sage">
                <FolderArchive size={25} />
              </span>
              <div>
                <strong>下载素材 ZIP</strong>
                <small>ZIP · 按朋友整理 · 附时间与描述清单</small>
              </div>
              {busy === 'archive' ? (
                <LoaderCircle size={20} className="spin" />
              ) : (
                <ArrowDownToLine size={20} />
              )}
            </button>
          </div>
          {busy && (
            <div className="export-progress" role="status">
              <LoaderCircle size={18} className="spin" />
              {busy === 'images' ? '正在生成长图…' : '正在整理原始素材…'}
            </div>
          )}
          <p className="small-note">图片太长时会分成多张，完整保留每一个瞬间。</p>
        </>
      ) : (
        <>
          <button className="text-button" onClick={() => setResult(undefined)}>
            <ArrowLeft size={16} />
            返回导出选项
          </button>
          <p className="preview-help">
            点击下载图片，或在手机上长按保存。
            <br />
            下载链接保留 1 小时，过期后可重新生成。
          </p>
          <div className="export-previews">
            {result.images.map((src, i) => (
              <figure key={src}>
                <img src={src} alt={`${date}手账 第${i + 1}张`} />
                <figcaption>
                  <span>
                    第 {i + 1} / {result.images.length} 张
                  </span>
                  <a className="primary full" href={`${src}?download=1`} download>
                    <ArrowDownToLine size={16} />
                    {result.images.length === 1 ? '下载图片' : `下载第 ${i + 1} 张图片`}
                  </a>
                </figcaption>
              </figure>
            ))}
          </div>
          <a href={result.archiveUrl} className="text-button full" download>
            <FolderArchive size={18} />
            下载图片合集
          </a>
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
