import { randomInt } from 'node:crypto';

export const endingVariants = [
  'postcard',
  'orbit',
  'ticket',
  'bouquet',
  'bubbles',
  'credits',
] as const;
export type EndingVariant = (typeof endingVariants)[number];
export const randomEnding = (): EndingVariant => endingVariants[randomInt(endingVariants.length)];
export const endingTransitions: Record<EndingVariant, string> = {
  postcard: 'slideleft',
  orbit: 'fade',
  ticket: 'smoothup',
  bouquet: 'circleopen',
  bubbles: 'circleopen',
  credits: 'fadeblack',
};

// Decorations stay outside the measured media/text flow so dense collages retain their capacity.
export const artDirectionStyles = `
.frame .brand,.frame .scene-heading,.frame .board,.frame .hero{z-index:1;position:relative}
.scene-heading:before{content:attr(data-label);font-size:20px;letter-spacing:3px;color:var(--accent);margin-right:20px}.scene-heading>span{margin-right:auto}
.paper .scene-heading{border-bottom:2px dashed var(--accent)}
.paper .board{background:linear-gradient(90deg,transparent 36px,#bd786c33 36px 38px,transparent 38px)}
.entry.paper .board .card:nth-child(even):before{transform:rotate(5deg);background:#9ab8a399}
.entry.paper .board .card{border-radius:4px 14px 14px 4px;border-left:5px solid #cbb897}
.minimal .scene-heading{border-top:8px solid var(--ink);padding-top:12px;font-weight:600}
.entry.minimal .board .card{border-top:2px solid var(--accent);background:linear-gradient(90deg,var(--paper) 0 98%,var(--accent) 98%);box-shadow:none}
.minimal.title .hero{justify-content:flex-start;padding-top:220px;border-bottom:16px solid var(--ink)}
.minimal.title .hero:after{content:'01';position:absolute;bottom:90px;left:0;font-size:200px;color:var(--accent);line-height:1;opacity:.35}
.forest{background-image:radial-gradient(ellipse at 0 85%,#53795d33 0 16%,transparent 16.2%),radial-gradient(ellipse at 100% 8%,#aac29288 0 20%,transparent 20.2%)}
.forest .scene-heading{border-bottom:2px solid #53795d66}
.entry.forest .board .card:nth-child(even){border-radius:14px 40px 14px 40px;background:#f0f5df}
.forest.title .hero{border-left:3px solid var(--accent);margin-left:30px;padding-left:50px}
.postcard .scene-heading{border:2px dashed var(--accent);padding:0 18px}
.entry.postcard .board .person time{border-bottom:2px dashed var(--accent)}
.entry.postcard .board .card{background-image:repeating-linear-gradient(0deg,transparent 0 39px,#be67490a 39px 40px)}
.postcard.title .hero:after{content:'寄给一起生活的我们';font-size:28px;letter-spacing:5px;margin-top:100px;border-top:2px solid var(--accent);padding-top:30px}
.polaroid{background-image:radial-gradient(#956b6929 1.5px,transparent 1.5px);background-size:24px 24px}
.entry.polaroid .board .person{order:2;margin:14px 0 0}.entry.polaroid .board .copy{order:3}
.entry.polaroid .board .card:after{content:'';position:absolute;top:-10px;right:26px;width:56px;height:24px;background:#d7b898aa;transform:rotate(7deg)}
.polaroid.title .hero{height:1300px;margin-top:70px;background:var(--paper);border:24px solid white;box-shadow:18px 18px 0 #956b6933;transform:rotate(-2deg)}
.film .scene-heading{border-top:1px solid var(--accent);border-bottom:1px solid var(--accent)}
.entry.film .board .card{border-left:12px solid #201c19;border-right:12px solid #201c19;background-image:linear-gradient(#d4ac7815,transparent)}
.entry.film .board .media-box{border-radius:0;box-shadow:0 0 0 2px #d4ac7855}
.film.title .hero{border-top:16px double var(--accent);border-bottom:16px double var(--accent);height:1300px;margin-top:70px}
.entry.cinema .board .card{background:#17191c;border-top:3px solid #777;border-bottom:3px solid #777}
.entry.cinema .board .media-box{border-radius:0;background:#000}.entry.cinema .board .media-box:not(.sticker) img{filter:grayscale(1)}
.entry.cinema .board .person{order:2;margin:14px 0 0}.entry.cinema .board .copy{order:3;text-align:center}
.cinema .scene-heading:before{border:1px solid var(--accent);padding:3px 12px}
.cinema.title .hero:before{content:'●  ●  ●';color:var(--accent);letter-spacing:20px;font-size:22px;margin-bottom:110px}
.night .scene-heading{border-bottom:1px solid #b0bbdf66}
.entry.night .board .card{border-radius:32px 32px 8px 32px;background:linear-gradient(150deg,#304369,#1b2944)}
.night.title .hero{justify-content:flex-end;padding-bottom:240px}.night.title .hero h1{font-size:90px}
.candy{background-image:radial-gradient(circle at 0 55%,#fff4b0 0 260px,transparent 262px),radial-gradient(circle at 100% 85%,#d69bd966 0 330px,transparent 332px)}
.candy .scene-heading{border-radius:32px;background:#fff9ce;padding:0 22px}
.entry.candy .board .card:nth-child(3n+2){background:#f5e7ff;border-color:#b98bc8}.entry.candy .board .card:nth-child(3n){background:#e2f5ed;border-color:#82bfa6}
.entry.candy .board .person strong{background:#fbd4e2;border-radius:9px;padding:0 6px}
.candy.title .hero h1{font-size:108px;text-shadow:5px 6px #fff9ce}
.comic{background-image:radial-gradient(#262b3729 2px,transparent 2px);background-size:20px 20px}
.comic .scene-heading{background:var(--ink);color:#fff;padding:0 18px;transform:skew(-3deg)}.comic .scene-heading:before,.comic .scene-heading small{color:#ffe178}
.entry.comic .board .person strong{background:#ffe178;padding:0 6px}.entry.comic .board .copy{border-top:3px solid var(--ink);padding-top:8px}
.comic.title .hero h1{background:var(--paper);border:7px solid var(--ink);box-shadow:16px 16px var(--ink);padding:36px;font-size:92px}
.neon{background-image:linear-gradient(150deg,transparent 20%,#b17ce329 20% 20.3%,transparent 20.3% 80%,#73e5de29 80% 80.3%,transparent 80.3%)}
.neon .scene-heading{border-left:10px solid #b17ce3;padding-left:20px}
.entry.neon .board .card{border-width:2px 2px 2px 8px;border-left-color:#b17ce3;background:linear-gradient(135deg,#302847,#192737)}
.entry.neon .board .person time{color:#d1a8f5}.neon.title .hero{border-left:4px solid var(--accent);border-right:4px solid #b17ce3}
.pixel .scene-heading{border:4px solid var(--accent);padding:0 14px;background:#151832}
.entry.pixel .board .card{border-width:4px;box-shadow:6px 6px 0 #151832}
.entry.pixel .board .person{border-bottom:3px dashed #8eedb266;padding-bottom:8px}
.pixel.title .hero:after{content:'▰ ▰ ▰ ▰ ▱';font-size:64px;letter-spacing:12px;color:var(--accent);margin-top:100px}

.frame.ending .ornament{display:none}
.frame.ending .hero{height:1470px;margin:0;padding:90px 50px;display:flex;flex-direction:column;justify-content:center;text-align:center;border:0;transform:none;background:none;box-shadow:none}
.frame.ending .hero h1{font-size:82px;font-weight:600;line-height:1.5;letter-spacing:4px;margin:32px 0 24px;color:var(--ink);text-shadow:none}
.frame.ending .hero p{font-size:34px;line-height:1.9}
.ending .eyebrow{font-size:24px;letter-spacing:6px;margin:0;color:var(--accent)}
.ending-art{height:370px;position:relative;width:100%;margin-bottom:64px;color:var(--accent);flex-shrink:0}
.ending-art i{display:block;position:absolute}
.ending-foot{margin-top:70px;font-size:22px;letter-spacing:5px;color:var(--accent)}
.ending-postcard .ending-art{width:520px;height:310px;align-self:center;border:8px solid var(--accent);background:var(--paper);transform:rotate(-7deg);box-shadow:18px 18px 0 color-mix(in srgb,var(--accent) 20%,transparent)}
.ending-postcard .ending-art:before{content:'';position:absolute;inset:0;background:linear-gradient(32deg,transparent 49.5%,var(--accent) 50% 51%,transparent 51.5%),linear-gradient(-32deg,transparent 49.5%,var(--accent) 50% 51%,transparent 51.5%);clip-path:polygon(0 0,100% 0,50% 60%)}
.ending-postcard .ending-art:after{content:'明日见';position:absolute;right:28px;bottom:28px;border:3px dashed var(--accent);padding:12px;font-size:28px;transform:rotate(7deg)}
.ending-orbit .ending-art{width:430px;height:430px;align-self:center;border:2px solid var(--accent);border-radius:50%;box-shadow:0 0 0 45px color-mix(in srgb,var(--accent) 9%,transparent),0 0 0 90px color-mix(in srgb,var(--accent) 5%,transparent)}
.ending-orbit .ending-art:before{content:'✦';position:absolute;inset:0;display:grid;place-items:center;font-size:170px}
.ending-orbit .ending-art i{width:22px;height:22px;background:var(--accent);border-radius:50%;left:var(--x);top:var(--y)}
.frame.ending-ticket .hero{height:1230px;margin-top:110px;background:var(--paper);border:3px solid var(--accent);border-radius:70px}
.ending-ticket .ending-art{height:150px;border-bottom:4px dashed var(--accent);display:grid;place-items:center;font-size:52px;letter-spacing:12px}
.ending-ticket .ending-art:before{content:'往明天 · 单程票'}
.ending-ticket .ending-foot{padding-bottom:85px;background:repeating-linear-gradient(90deg,var(--ink) 0 3px,transparent 3px 9px,var(--ink) 9px 16px,transparent 16px 20px) center bottom / 420px 48px no-repeat}
.ending-bouquet .ending-art{height:420px;width:540px;align-self:center}
.ending-bouquet .ending-art:before{content:'';position:absolute;width:230px;height:220px;background:var(--paper);border:3px solid var(--accent);bottom:0;left:155px;clip-path:polygon(0 0,100% 0,65% 100%,35% 100%)}
.ending-bouquet .ending-art i{font-style:normal;font-size:140px;line-height:1;left:var(--x);top:var(--y);transform:translate(-50%,-50%);text-shadow:4px 4px var(--paper)}
.ending-bouquet .ending-art i:nth-child(2n){color:var(--ink);font-size:110px}
.ending-bubbles .ending-art{width:650px;height:380px;align-self:center}
.ending-bubbles .ending-art i{width:260px;padding:36px 12px;background:var(--paper);border:3px solid var(--accent);border-radius:70px 70px 70px 8px;font-style:normal;font-size:32px;left:var(--x);top:var(--y);transform:rotate(-6deg)}
.ending-bubbles .ending-art i:nth-child(2){border-radius:70px 70px 8px 70px;transform:rotate(7deg);background:var(--accent);color:var(--bg)}
.frame.ending-credits .hero{justify-content:flex-start;padding-top:170px;text-align:left;border-left:2px solid var(--accent);padding-left:70px}
.ending-credits .ending-art{height:150px;display:flex;align-items:center;gap:22px;margin-bottom:80px}
.ending-credits .ending-art:before{content:'FIN.';font-size:150px;letter-spacing:12px;font-family:Georgia,serif}
.ending-credits .ending-foot{border-top:2px solid var(--accent);padding-top:36px;width:100%;margin-top:110px}
`;

export const styleLabels: Record<string, string> = {
  paper: '今日手记',
  minimal: '日常切片',
  forest: '林间拾光',
  postcard: '旅途来信',
  polaroid: '相册一页',
  film: '记忆底片',
  cinema: '生活放映',
  night: '星夜电台',
  candy: '快乐收集',
  comic: '日常连载',
  neon: '城市信号',
  pixel: '今日存档',
};

export function endingArtwork(variant: EndingVariant): string {
  const positions =
    variant === 'bouquet'
      ? [
          [25, 32],
          [45, 18],
          [67, 30],
          [40, 47],
          [66, 52],
        ]
      : [
          [5, 26],
          [78, 6],
          [91, 69],
          [24, 92],
        ];
  const content =
    variant === 'bubbles'
      ? ['冒个泡', '明天见！', '晚安呀']
          .map(
            (label, i) => `<i style="--x:${[0, 55, 12][i]}%;--y:${[0, 32, 62][i]}%">${label}</i>`,
          )
          .join('')
      : variant === 'orbit' || variant === 'bouquet'
        ? positions
            .map(
              ([x, y]) => `<i style="--x:${x}%;--y:${y}%">${variant === 'bouquet' ? '✿' : ''}</i>`,
            )
            .join('')
        : '';
  return `<div class="ending-art" aria-hidden="true">${content}</div>`;
}
