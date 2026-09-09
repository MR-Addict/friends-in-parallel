export interface Person {
  id: string;
  nickname: string;
  color: string;
  background: string;
  avatar: string;
}
export interface Sticker {
  id: string;
  packId: string;
  name: string;
  category: string;
  emoji: string;
  file: string;
}
export interface Pack {
  id: string;
  name: string;
  brand: string;
  license: string;
  source: string;
  ext: string;
}
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
export interface MusicAsset extends Omit<VideoMusic, 'previewUrl'> {
  file: string;
  sha256: string;
  download: string;
}
export interface AppConfig {
  accessCode: string;
}
