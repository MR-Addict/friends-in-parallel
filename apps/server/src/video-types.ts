import type { VideoStyle, VideoMusic } from '@parallel/config';
export type { VideoStyle, VideoMusic } from '@parallel/config';
export interface VideoExportOptions {
  styles: VideoStyle[];
  music: VideoMusic[];
  defaultStyleId: string;
  available: boolean;
  unavailableReason?: string;
}
export interface VideoExportResult {
  videoUrl: string;
  coverUrl: string;
  duration: number;
  styleId: string;
  musicId: string;
  expiresAt: string;
}
export interface VideoExportJob {
  jobId: string;
  statusUrl: string;
  date: string;
  styleId: string;
  musicId: string;
  status: 'rendering' | 'ready' | 'failed';
  phase: string;
  progress: number;
  result?: VideoExportResult;
  error?: string;
}
