export interface VideoStyle {
  id: string;
  name: string;
  tag: string;
  background: string;
  accent: string;
  ink: string;
  paper: string;
  transition: string;
  defaultMusicId: string;
  secondMusicId: string;
}
export interface VideoMusic {
  id: string;
  title: string;
  tag: string;
  artist: string;
  isrc: string;
  duration: number;
  source: string;
  license: string;
  licenseUrl: string;
  previewUrl: string;
}
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
