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
    <Modal title="把这一天带走" onClose={onClose} busy={!!busy} wide={!!result}>
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
                <strong>分享手账长图</strong>
                <p>把大家的一天，拼成一张温柔的手账。</p>
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
                <strong>下载素材压缩包</strong>
                <p>原始照片、贴纸和文字，留给下一次创作。</p>
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
              {busy === 'images' ? '正在把大家的一天拼起来…' : '正在整理原始素材…'}
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
            手账做好了！点下方保存，手机也可以长按图片。
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
                  <a className="text-button" href={`${src}?download=1`} download>
                    <ArrowDownToLine size={16} />
                    保存图片
                  </a>
                </figcaption>
              </figure>
            ))}
          </div>
          <a href={result.archiveUrl} className="primary full" download>
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
