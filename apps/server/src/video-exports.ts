import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { ExportCache, EXPORT_TTL, contentFingerprint } from './export-cache.js';
import { publicDir } from './config.js';
import { HttpError } from './model.js';
import type { SnapshotItem } from './exports.js';
import { musicBytes, videoMusic, videoSelection, videoStyles } from './video-catalog.js';
import { videoCapability } from './video-process.js';
import { renderVideo } from './video-renderer.js';
import type { VideoExportJob, VideoExportOptions, VideoExportResult } from './video-types.js';

export class VideoExports {
  private jobs = new Map<string, { job: VideoExportJob; touched: number }>();
  private running = new Map<string, string>();
  private capability?: Promise<boolean>;
  constructor(readonly cache: ExportCache) {}
  private available() {
    return (this.capability ??= videoCapability());
  }
  async options(): Promise<VideoExportOptions> {
    const available = await this.available();
    return {
      styles: videoStyles,
      music: videoMusic.map(({ file: _file, sha256: _hash, download: _url, ...music }) => ({
        ...music,
        previewUrl: `/api/exports/music/${music.id}`,
      })),
      defaultStyleId: 'paper',
      available,
      ...(!available
        ? { unavailableReason: '视频生成暂不可用，请稍后再试；长图和素材下载仍可使用。' }
        : {}),
    };
  }
  private prune() {
    for (const [id, record] of this.jobs) {
      if (record.job.status !== 'rendering' && Date.now() - record.touched >= EXPORT_TTL)
        this.jobs.delete(id);
    }
  }
  private ready(token: string, date: string, result: VideoExportResult): VideoExportJob {
    return {
      jobId: token,
      statusUrl: `/api/exports/videos/${token}`,
      date,
      styleId: result.styleId,
      musicId: result.musicId,
      status: 'ready',
      phase: '视频已生成',
      progress: 100,
      result,
    };
  }
  async status(id: string): Promise<VideoExportJob> {
    this.prune();
    const record = this.jobs.get(id);
    if (record && record.job.status !== 'ready') return { ...record.job };
    const meta = await this.cache.read<VideoExportResult>(id);
    if (meta?.kind === 'video') return this.ready(id, meta.date, meta.result);
    throw new HttpError(404, '视频已过期或生成任务已中断，请重新生成');
  }
  async start(
    items: SnapshotItem[],
    date: string,
    styleId: unknown,
    musicId: unknown,
  ): Promise<VideoExportJob> {
    this.prune();
    if (!items.length) throw new HttpError(400, '这一天还没动态，先冒个泡吧');
    const { style, music } = videoSelection(styleId, musicId);
    const [font, audio, ...sources] = await Promise.all([
      readFile(path.join(publicDir, 'fonts/NotoSansCJKsc-Regular.otf')),
      music ? musicBytes(music) : Promise.resolve(undefined),
      ...[
        'video-exports',
        'video-renderer',
        'video-layout',
        'video-process',
        'exports',
        'export-cache',
      ].map((name) =>
        readFile(
          new URL(`./${name}${import.meta.url.endsWith('.ts') ? '.ts' : '.js'}`, import.meta.url),
        ),
      ),
      readdir(path.join(publicDir, 'licenses')).then(async (names) =>
        Buffer.concat(
          await Promise.all(
            names
              .sort()
              .map(async (name) =>
                Buffer.concat([
                  Buffer.from(name),
                  await readFile(path.join(publicDir, 'licenses', name)),
                ]),
              ),
          ),
        ),
      ),
    ]);
    const key = contentFingerprint(items, [
      'video',
      date,
      JSON.stringify(style),
      JSON.stringify(music || 'none'),
      font,
      audio || Buffer.alloc(0),
      ...sources,
    ]);
    return this.cache.singleFlight(`start:${key}`, async () => {
      const meta = await this.cache.find<VideoExportResult>(key, 'video');
      if (meta) return this.ready(meta.token, date, meta.result);
      const pending = this.running.get(key);
      if (pending) return this.status(pending);
      if (!(await this.available()))
        throw new HttpError(503, '视频生成暂不可用，请检查服务端 FFmpeg 安装后重试');
      const work = this.cache.reserve(30 * 60_000);
      const job: VideoExportJob = {
        jobId: work.token,
        statusUrl: `/api/exports/videos/${work.token}`,
        date,
        styleId: style.id,
        musicId: music?.id || 'none',
        status: 'rendering',
        phase: '正在准备画面',
        progress: 0,
      };
      this.jobs.set(work.token, { job, touched: Date.now() });
      this.running.set(key, work.token);
      const finished = (async () => {
        try {
          const { duration } = await renderVideo(
            work,
            items,
            date,
            style,
            music,
            audio,
            font,
            (phase, progress) => {
              job.phase = phase;
              job.progress = Math.max(job.progress, progress);
            },
          );
          const result = await this.cache.publish(
            work,
            'video',
            key,
            date,
            {
              'video.mp4': `和朋友的同一时间-${date}-回忆视频.mp4`,
              'cover.jpg': `和朋友的同一时间-${date}-视频封面.jpg`,
            },
            (expiresAt): VideoExportResult => ({
              videoUrl: `/api/exports/files/${work.token}/video.mp4`,
              coverUrl: `/api/exports/files/${work.token}/cover.jpg`,
              duration,
              styleId: style.id,
              musicId: music?.id || 'none',
              expiresAt,
            }),
          );
          Object.assign(job, this.ready(work.token, date, result));
        } catch (error) {
          console.error('Video export failed:', error);
          job.status = 'failed';
          job.phase = '生成未完成';
          job.error = work.signal.aborted
            ? '生成超时或服务已重启，请重新生成'
            : '视频生成失败，请重试；若持续失败，请检查服务端视频组件与素材';
        } finally {
          this.running.delete(key);
          this.jobs.set(work.token, { job, touched: Date.now() });
          await this.cache.finish(work);
        }
      })();
      this.cache.track(work, finished);
      void finished.catch(console.error);
      return { ...job };
    });
  }
}
