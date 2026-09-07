# 和朋友的同一时间

一份朋友们的平行生活手账。移动端优先，记录同一时间大家各自在做什么。

**Node + Express / Vite + React / TypeScript / pnpm workspace**。无需数据库、无需账号；一个 Node 进程托管页面、接口和图片。

## 开始使用

需要 Node.js **22.12 或更高版本**、pnpm，以及可写入的本地磁盘。仓库通过 `packageManager` 固定 pnpm 12.3.4，使用 `pnpm-workspace.yaml` 和 `pnpm-lock.yaml` 管理工作区与依赖。

```sh
pnpm install
pnpm setup:browser
pnpm dev
```

打开 [本地开发页面](http://localhost:5173)。前端端口为 5173，后端为 4500，开发代理已配置。手机与电脑处于同一网络时，可通过电脑的局域网 IP 加上 `:5173` 访问。

开发时后端默认使用 4500 端口；修改它时，需同步修改 Vite 的代理配置。

### 构建与运行

```sh
pnpm build
pnpm start
```

打开 [生产模式页面](http://localhost:4500)。根目录构建命令先构建前端，再编译后端，后端构建自动把页面、贴纸、字体与配置复制到 `apps/server/dist`。构建顺序由 `scripts/build.ts` 管理，复制逻辑在 `scripts/copy-web.ts`，均由 tsx 执行，不引入额外 monorepo 构建工具。生产启动仍直接运行编译后的 JavaScript。

Linux 服务器首次使用长图导出前，安装 Chromium 和所需系统依赖：

```sh
pnpm --filter @parallel/server exec playwright install --with-deps chromium
```

系统依赖安装可能需要管理员权限。请用实际运行 Node 服务的用户安装浏览器，或通过 `PLAYWRIGHT_BROWSERS_PATH` 指向该用户可以访问的浏览器目录。升级 Playwright 后重新运行安装命令。

可先在构建环境执行 `pnpm install --frozen-lockfile && pnpm build`，再把工程与构建产物放到服务器，执行 `pnpm install --prod --frozen-lockfile`、安装 Chromium 后 `pnpm start`。浏览器可执行文件不打进 JavaScript 产物。

```sh
PORT=8080 DATA_DIR=/absolute/path/to/parallel-data pnpm start
```

- `PORT`：默认 4500。
- `DATA_DIR`：默认仓库根目录的 `data`。生产环境建议使用独立持久目录。
- 一个 Node 进程负责所有请求，不使用多进程集群。由你选择的进程管理器保持运行即可。
- 使用公网域名时，可在 Node 前配置 HTTPS 反向代理。上传请求体上限至少 21 MB，长图导出请求超时至少 120 秒。

## Docker 部署

构建镜像并启动：

```sh
docker build -t friends-in-parallel .
docker run -d --name friends-in-parallel \
  --init --restart unless-stopped --shm-size=1g \
  -p 4500:4500 \
  --mount type=volume,source=parallel-data,target=/data \
  friends-in-parallel
```

打开 [应用页面](http://localhost:4500)。如果本机 4500 端口已占用，可改为 `-p 8080:4500`，然后访问 8080 端口。

- 多阶段构建使用 pnpm 锁文件和 TypeScript 构建脚本；最终镜像包含编译后的后端、前端静态资源、生产依赖及匹配版本的 Chromium。
- 以非 root 的 `node` 用户运行。`/data` 保存记录、照片与临时导出，命名卷在容器重建后继续保留。
- `--init` 回收浏览器子进程，`--shm-size=1g` 为 Chromium 分配共享内存。浏览器和 Linux 依赖在构建时安装，运行时不用再次下载。实现参考 [Playwright Docker 文档](https://playwright.dev/docs/docker)。
- 镜像含 HTTP 健康检查；使用 `docker logs friends-in-parallel` 查看日志。
- `.dockerignore` 排除本机依赖、构建产物、数据、环境文件和测试输出，避免将本地数据或配置打入镜像。

如需使用宿主机目录代替命名卷，该目录必须允许容器中的 UID 1000 写入。备份前停止容器，再备份卷里的 `entries.json` 和 `uploads`。

### 手机照片上传失败排查

- `Unexpected end of form` 表示请求结束时 multipart 表单缺少结束边界，发生在照片解码之前；仅凭该日志无法判断是浏览器、网络还是代理截断了请求。
- 浏览器当前上传超时为 120 秒，且上传的是原文件，预览缩略图不会减少上传大小。如果约两分钟后失败，先检查上传耗时与网络状况。
- 单张照片上限为 20 MiB，反向代理请求体上限至少设为 21 MiB，以容纳表单字段和边界。检查代理访问日志和错误日志中的 413、408、504 或客户端断开记录，并与应用日志时间对照。
- 在可信网络中使用相同照片分别测试直连容器端口和域名访问，可帮助判断故障是否发生在代理链路。不要为排查而扩大公网端口暴露范围。
- 应用会将已识别的 multipart 格式错误返回为 400，并记录 `[upload]` 诊断信息；这能改善提示，不能恢复已经丢失的上传数据。日志里的 `complete` 仅表示 HTTP 消息是否完整，不表示 multipart 表单完整。

### 加速重复构建

- 普通改动继续使用 `docker build -t friends-in-parallel .`，保留同一个 Docker builder 的缓存，不需要 `--no-cache` 或清理构建缓存。
- pnpm 下载目录使用 BuildKit cache mount，本地依赖变化后仍可复用已下载包；GitHub Actions 另用每架构独立的 `type=gha,mode=max` 层缓存（cache mount 本身不会由 GHA 自动保存）。
- Chromium 和 Linux 库独立成层，只依赖基础镜像及锁定的 `playwright-core` 文件。修改页面或添加其他依赖时，可继续复用浏览器安装层；升级 Playwright 后会自动安装匹配的浏览器。
- 运行镜像仅安装服务端生产依赖；前端依赖只保留构建后的网页文件，HEIC 解码使用独立缓存的原生 libheif 工具。
- Linux 库安装与 Chromium 下载分开缓存；APT 下载目录按架构缓存，失败重试可复用已下载的安装包。
- 首次构建、基础镜像或 Playwright 更新仍需下载。可用 `docker build --progress=plain -t friends-in-parallel .` 查看哪些步骤标记为 `CACHED`。

### Docker Compose

`docker-compose.yaml` 使用工作流发布的 `mraddict063/friends-in-parallel:latest` 镜像，主机和容器均使用 4500 端口，并通过命名卷保存数据：

```sh
docker compose pull
docker compose up -d
```

访问 [应用页面](http://localhost:4500)。更新镜像时重复以上两条命令。普通 `down` 会保留数据卷；不要加 `--volumes`，除非需要删除数据。

如需运行本地构建的镜像：

```sh
docker build -t friends-in-parallel:local .
IMAGE=friends-in-parallel:local docker compose up -d --pull never
```

### 镜像发布工作流

`.github/workflows/docker.yaml` 在 PR 中仅构建，不登录或推送 Docker Hub。推送到 `main` 或在 `main` 手动触发时，发布 AMD64 / ARM64 镜像 `mraddict063/friends-in-parallel:latest`；在其他分支手动触发只构建。AMD64 和 ARM64 分别在原生 Ubuntu runner 上并行构建，避免 QEMU 模拟；两者成功后才合并发布 `latest`。每个架构使用独立的 GitHub Actions 构建缓存，同一分支的新运行会取消旧运行。

仓库需要配置 `DOCKERHUB_TOKEN` secret，令牌必须能写入 `mraddict063/friends-in-parallel`。Docker actions 版本和工作区构建方式参考 [官方 build-push-action 文档](https://github.com/docker/build-push-action)。

## 访问暗号

页面使用一个共享暗号作为轻量前端入口，以普通文本输入。暗号直接配置在 `apps/web/src/config/app.json` 的 `accessCode` 字段中，默认是「我们五个要一直在一起」。修改配置后重新构建即可，Docker 构建也会自动包含该配置，无需环境变量或 GitHub secret。未设置暗号时，页面保持锁定并提示联系主人。

输入正确暗号后，浏览器写入 `parallel_access` Cookie，有效期从验证成功起固定为 7 天，刷新不会续期。到期后重新输入；已打开的页面也会检查到期状态。Cookie 使用 `Path=/`、`SameSite=Lax`，HTTPS 下附带 `Secure`。清除此 Cookie 可提前退出。

这是前端保护：暗号会包含在构建后的 JavaScript 中，Cookie 也可以由客户端修改，不会限制 API、照片或导出文件的直接访问。它适合朋友小圈子的简单入口，不用于保护敏感数据。

## 使用方式

首页采用米白手账布局，独立日期栏支持前一天、后一天和回到今天；点日期打开月历，圆点标出有记录的日子，可切换月份或直接选择年月，日期和记录数量均按北京时间计算；头像筛选显示当天有记录的朋友，摘要随人物筛选更新。同一小时有多位朋友记录时，显示头像组与人数。底部固定「记下一刻」按钮，浏览历史日期时显示「补记这一天」，新记录默认使用所浏览日期和当前北京时间的时分。

首次记录选择人物后进入编辑页，后续直接使用上次人物，仍可随时更换。照片、表情、描述和时间按浏览日期自动保存为此设备的草稿；关闭或刷新后重新选择该日期即可继续。草稿使用浏览器 IndexedDB（含照片），不会同步到其他设备；存储不可用时界面会提示仅暂存于当前页面。发布成功会清理对应草稿，也可在编辑器底部清空。清空后 10 秒内可撤销，恢复照片、表情、文字和时间；重新输入或关闭编辑器后撤销入口结束。编辑已发布动态不使用新记录草稿。编辑页直接展示最近使用的表情，更多素材可进入完整选择页。

「表情」统一包含三套素材，编辑器保留一个选择／更换入口，独立选择页提供套餐、分类和最近使用，选好即返回编辑器；新动态使用 `sticker` 存储。旧 `emoji` 动态仍可展示和导出，编辑保存时转为对应的微软素材，无需迁移历史数据。点击动态卡片的素材、文字或留白均可打开预览，编辑、删除入口独立保留在「更多操作」菜单。首页按发生时间从新到旧排列，小时及小时内的动态均倒序，不受人物配置顺序影响。表情与描述横向排列，照片保留完整大图。导出预览底部固定「下载图片」主按钮，多张时可翻页并下载当前图片，并提供图片合集下载。

- 人物：陆语涵、水水、童浩然、蔡建文、甲醛。
- 照片：JPEG、PNG、WebP、HEIC/HEIF，服务端上传上限 20 MB；HEIC 必须转换为可显示的格式才会保存，压缩失败可以继续上传。损坏的图片会被拒绝，暂不支持动画 GIF。
- 描述最多 500 字；允许补记，禁止未来时间。
- 发布后跳转到相应日期，并定位新动态；返回人物步骤保留填写内容。
- 首页时间线按北京时间分小时，小时从新到旧，小时内所有人物的动态按发生时间倒序。可切换日期、筛选人物、编辑与删除。
- 无个人账号，输入共享暗号后可以使用页面查看和修改记录，适用于互相信任的朋友小圈子；API 本身不校验暗号。
- 进入时间线、切换日期、手动刷新时重新读取数据；没有实时推送。

## 微信通知（PushPlus）

发布新动态成功后，服务端通过 PushPlus 微信公众号发送通知；编辑、删除不会发送。通知使用 HTML，包含人物昵称、记录时间、最多 200 字的文字预览、照片或表情预览，以及可点击的网站链接和动态编号。Token 只用于服务端，不进入前端或镜像。

将 `.env.example` 复制为项目根目录的 `.env`，填写：

- `PUSHPLUS_TOKEN`：PushPlus Token，留空关闭通知。发送账号需完成实名认证。
- `PUSHPLUS_TOPIC`：可选订阅群组编码；留空仅通知 Token 所属用户，填写后通知群组订阅者。
- `SITE_URL`：可选网站公网地址（HTTP/HTTPS），用于通知内的可点击链接和图片绝对地址；例如 `https://friends.cael.top`。未配置或地址无效时仅显示文字和 Emoji，省略图片与链接。图片需要可通过公网访问。链接打开手账首页。

`pnpm dev`、`pnpm start` 自动读取根目录 `.env`，已有环境变量优先；Docker Compose 也会将以上变量传入容器。修改后需重启服务。部署时在服务器单独配置 `.env`，并使用包含此功能的新镜像；`docker run` 可加 `--env-file .env`。

通知异步发送，超时为 10 秒，失败记录日志，不影响动态保存。请求至少间隔 13 秒以适配普通账号每分钟 5 次的限制；每日额度仍由 PushPlus 控制。队列保存在内存中，重启会丢失待发送通知，失败不自动重试。接口成功仅表示 PushPlus 接受请求，最终送达可在 PushPlus 消息记录中查看。

HTML 预览位于 PushPlus 消息详情页，微信会话中的通知卡片展示由微信与 PushPlus 控制；实际样式和图片显示以客户端为准。

接口与额度参考 [PushPlus 文档](https://www.pushplus.plus/doc/guide/api.html)。

## 三种导出

导出总是包含所选日期**全部人物**，不受人物筛选影响。

### 分享手账长图

服务端使用 Playwright + Chromium、项目内的 Noto 中文字体和图片渲染独立模板。输出宽度 1080px，超过 12000px 时按完整卡片拆成多页；支持单张预览、保存、手机长按保存和图片合集 ZIP。字体及素材加载失败会报错，不静默漏图。

相同日期、相同内容优先复用已生成的长图和合集 ZIP，不重复启动 Chromium。缓存指纹包含动态内容、人物配置、素材字节、字体、渲染代码及许可文件；内容发生变化、缓存过期或文件缺失时重新生成，服务重启后仍可复用有效缓存。只更新时间、未改变内容的编辑不会触发重新生成。

相同内容的并发请求共用一次生成；长图与视频共用一个渲染名额，其他未命中缓存的请求会收到 429 稍后重试提示，已有缓存仍可立即使用。长图渲染最长约 90 秒，失败清理临时文件；长图与图片合集自生成完成起缓存 24 小时，复用和下载不会延长有效期。

长图按小时形成最多六条的自适应拼版区块，超量均衡拆分；连续小时各一条时合并，空白小时或多条动态的小时中断。区块按时段纵向串联，内部按照片比例、贴纸和文字选择稳定随机布局。照片完整展示，贴纸区域紧凑；正文至少 28px，姓名和时间至少 24px。单张保持 1080px 宽、最高 12000px，优先保留完整时段，必要时在区块间分图并标注续页；极长文字按实际高度续页，不截断内容。

真实素材验收可运行 `node --import tsx scripts/image-collage-demo.ts 2026-09-07`，默认读取此前导入的 `data/video-demo-2026-09-07`，PNG 与 ZIP 输出到 `test-results/image-collage-2026-09-07`；第三个参数可指定其他本地数据目录。

### 回忆视频

导出弹窗在长图与素材 ZIP 中间提供「生成回忆视频」。服务端以 Chromium 渲染中文场景，FFmpeg 分段合成为 1080×1920、30fps、H.264 / AAC MP4（`yuv420p`、faststart）。手机和桌面均可预览、拖动播放及直接下载。

内置 12 种独立样式：暖纸手账、清晨极简、森系清新、旅行明信片、拍立得相册、复古胶片、黑白电影、夜色留白、糖果派对、漫画日常、霓虹都市、像素游戏。每种样式提供两首推荐音乐；24 首配乐可自由搭配，也可选择无音乐。配乐仅在点击试听时播放，切换或离开页面会停止。

视频完整包含当天所有朋友，按北京时间从早到晚播放：日期片头（2 秒）、按小时自动拼版的内容页、轻松的结尾页（2 秒：“今天先到这儿 / 明天接着冒泡。”），结尾不展示版权或模板信息。每页最多 6 条，同小时超量时均衡分页；连续小时各只有一条时合并，遇到空白小时或多条动态的小时中断。小时或时间范围直接显示在内容页，多页时标注页码。页内根据照片横竖比例、贴纸和文字选择合适布局，位置无需按时间顺序；相同日期、内容和风格的排版保持一致，切换音乐不改变排版。照片保持完整，文字放不下时降低同页密度，必要时单条拆成续页，不截断、不自动摘要。每页停留 `ceil(max(4, 条数 × 1.5, 全页字符数 / 6 + 1))` 秒，转场另计 0.5 秒（夜色样式 1 秒）。背景音乐循环或裁剪至成片长度，统一响度后首尾淡入淡出；无音乐视频不包含音轨。

首次生成返回后台任务，页面显示真实阶段和编码进度。可以关闭弹窗或刷新，重新打开所选日期的视频入口会继续查询；成品及封面支持服务重启后复用，未完成任务在重启后需重新生成。每份视频最多生成 30 分钟，超时、失败或服务退出会终止编码并回收半成品。

直接运行 Node 时需安装 FFmpeg（包含 `libx264`、AAC、`xfade`）和 FFprobe：macOS 使用 `brew install ffmpeg`，Debian/Ubuntu 使用 `apt-get install ffmpeg`。Docker 的 AMD64 / ARM64 镜像自动安装。缺少视频组件只影响视频生成，长图与素材 ZIP 仍可使用。视频生成采用短请求加轮询，不需要为视频任务将反向代理请求超时提高到 30 分钟。

音乐文件位于 `apps/web/public/music`，约 147 MiB，已加入 `.gitignore` 和 `.dockerignore`，不再由 Git 跟踪。Git 仅保留曲目清单 `video-music.json`、官方源地址、ISRC、许可与固定 SHA-256。`pnpm dev`、`pnpm build`、`pnpm test` 会自动下载缺失或损坏的音乐并校验，已有有效文件不重复下载，也不修改清单；可单独运行 `pnpm assets:music` 准备资源。首次准备需要联网，下载失败或校验不符时直接报错。Docker 在独立资源层下载音乐，再打包到最终镜像，日常代码变更可复用该层；运行时仍无需请求外站。下载本身不依赖 FFmpeg，视频生成仍需要 FFmpeg/FFprobe。音乐由 Kevin MacLeod 创作，按 [Incompetech 署名说明](https://incompetech.com/music/royalty-free/faq.html)使用 CC BY 4.0；曲名、作者、许可和音乐处理说明统一放在首页底部的“素材鸣谢”中，视频不显示模板名、版权信息或鸣谢片尾。完整曲目列表与说明见 `apps/web/public/licenses/music.txt`。

### 共享导出缓存

`ExportCache` 为长图、图片合集、视频和封面管理同一个 `DATA_DIR/exports` 目录。成品写入临时目录，全部校验成功后记录完成时间与固定的 24 小时过期时间，再原子发布。缓存指纹包含实际内容、素材、字体、相关渲染代码与许可；视频额外包含样式及所选配乐字节，单纯修改 `updatedAt` 不使缓存失效。

每次 `/api/exports` 请求（选项、生成、状态、试听、预览或下载）都会触发清理；并发请求共享正在执行的扫描，没有定时清理器。清理依据元数据的 `expiresAt`，不会因读取或目录时间变化续期。正在生成及传输的目录受保护，传输结束后释放并清理过期文件。损坏元数据、缺失或大小不匹配的文件、旧格式缓存与崩溃遗留临时目录都会回收；旧链接需重新生成。无请求时不会主动扫描磁盘，下一次导出请求才会清理过期文件。

### 素材 ZIP

服务器读取同一份记录快照并流式输出 ZIP，浏览器用原生下载接收，无需在手机内存中生成或拼装压缩包。下载前进行一次素材完整性检查。

```text
和朋友的同一时间-2026-08-29-素材包.zip
├── lu-yuhan/
│   └── 2026-08-29-09-30-<动态ID>.png
├── shui-shui/
│   └── ...
├── manifest.json
├── manifest.csv
└── licenses/
```

包含服务器保存的照片（优化成功后的版本，或处理失败时的原文件）、实际选用的贴纸、Emoji PNG，以及 JSON / UTF-8 BOM CSV 清单。清单记录人物 ID、最新昵称、北京时间、描述、素材路径及署名，可用于剪辑视频或整理归档。CSV 对公式起始字符做安全处理；JSON 保留原始文字。

## 修改人物和素材

### 人物

编辑 `apps/web/src/config/people.json`：

```json
{
  "id": "lu-yuhan",
  "nickname": "陆语涵",
  "color": "#e5a36c",
  "background": "#fff0db",
  "avatar": "1f431"
}
```

后端动态数据**只保存人物 ID**，不会保存昵称。修改昵称后重新构建，前端和后端导出使用同一份最新配置。已有记录的人物 ID 应保持稳定；建议只改昵称、颜色和头像。

### 贴纸

`apps/web/src/config/stickers.json` 管理套餐和 72 张精选贴纸，文件位于 `apps/web/public/stickers`。包含中文名称、分类、Emoji 和许可来源。浏览器记住最近使用的贴纸及上次选择的人物。

三套素材均随仓库保存，开发、生产运行和导出不需要请求外部素材站：

| 套餐     | 来源                                                                  | 许可           |
| -------- | --------------------------------------------------------------------- | -------------- |
| 软萌立体 | [Microsoft Fluent Emoji](https://github.com/microsoft/fluentui-emoji) | MIT            |
| 糖果扁平 | [Twemoji](https://github.com/jdecked/twemoji)                         | 图形 CC BY 4.0 |
| 线条涂鸦 | [OpenMoji](https://github.com/hfg-gmuend/openmoji)                    | CC BY-SA 4.0   |
| 中文字体 | [Noto Sans CJK](https://github.com/notofonts/noto-cjk)                | SIL OFL 1.1    |

原始素材未经修改；首页“素材鸣谢”及 ZIP 内保留相应署名，其他界面和长图不展示版权信息。完整许可在 `apps/web/public/licenses`。若修改 OpenMoji 素材，修改后的素材需遵守相同方式共享要求。

重新下载缺失的原始素材：

```sh
pnpm assets:download
```

下载脚本 `scripts/download-assets.ts` 通过 tsx 执行，使用 `asset-sources.json` 固定的上游提交，不在日常构建中联网下载。增加贴纸时同步维护配置与本地文件；已有动态引用的贴纸 ID 和文件应保持可用。

## 数据与备份

```text
data/
├── entries.json  # 动态记录
├── uploads/      # 优化后的照片，或处理失败时保留的原文件
└── exports/      # 可重新生成的长图、合集、视频与封面（24 小时缓存）
```

JSON 通过进程内串行写入和临时文件原子替换保存；构建不会触碰数据目录。替换照片或删除动态会删除旧上传文件；导出快照在同一读写锁下读取，之后的修改不会改变正在生成的内容。

备份时停止 Node 服务，复制 `entries.json` 和 `uploads`；恢复到 `DATA_DIR` 后启动。完整迁移也需带上对应的工程配置和贴纸资源。`exports` 可不备份。部署容器时需要挂载持久卷。

## 接口

成功返回 JSON；删除成功为 204；失败为 `{ "error": "中文提示" }`。

| 方法   | 路径                                   | 用途                                                                     |
| ------ | -------------------------------------- | ------------------------------------------------------------------------ |
| GET    | `/api/entry-dates?month=YYYY-MM`       | 查询指定月份每天的记录数量（仅返回有记录的日期）                         |
| GET    | `/api/entries?date=YYYY-MM-DD`         | 按北京时间查询一天                                                       |
| POST   | `/api/entries`                         | 发布                                                                     |
| PATCH  | `/api/entries/:id`                     | 编辑                                                                     |
| DELETE | `/api/entries/:id`                     | 删除及清理照片                                                           |
| POST   | `/api/exports/images`                  | `{ "date": "YYYY-MM-DD" }` → `images`, `archiveUrl`, `expiresAt`         |
| GET    | `/api/exports/archive?date=YYYY-MM-DD` | 素材 ZIP；加 `check=1` 仅校验素材                                        |
| GET    | `/api/exports/files/:token/:name`      | 24 小时导出文件；`download=1` 强制下载，MP4 支持 Range                   |
| GET    | `/api/exports/video-options`           | 12 种样式、24 首音乐、默认样式及视频组件可用状态                         |
| POST   | `/api/exports/videos`                  | `{date, styleId, musicId}`；`none` 为无音乐，200 命中成品或 202 返回任务 |
| GET    | `/api/exports/videos/:jobId`           | `status`、`phase`、`progress`，完成后附 `result`，失败附 `error`         |
| GET    | `/api/exports/music/:musicId`          | 本地配乐试听，支持 Range                                                 |

发布 / 编辑字段：`personId`、`description`、带时区的 ISO `occurredAt`、`mediaType`。照片使用 multipart 的 `photo` 文件；编辑保留照片时传原 `filename`，后端只允许引用该动态原有照片。Emoji 使用 `emoji`，贴纸使用 `stickerId`。无文件时也可以提交 JSON。

## 验证

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

`pnpm typecheck` 同时检查前端、后端和 TypeScript 工具脚本。

接口测试使用临时数据目录，验证并发保存、重启读取、时间边界、字段及文件校验、照片原始字节、ZIP 清单和清理行为。

浏览器测试启动独立的生产服务器（3101 端口），使用临时数据目录，验证 375px / 430px 视口、首次分步发布与后续快捷发布、日期翻页与历史补记、照片草稿关闭及刷新恢复和日期隔离、筛选摘要与同小时多人提示、三套贴纸、照片与表情、失败保留输入、编辑删除、实际下载和长图分页，以及旧 Emoji 编辑兼容、取消表情选择和缩小视口下的输入框与固定按钮可见性。缩小视口用于模拟键盘挤压布局，仍建议在真实手机检查系统键盘行为。截图写入 `test-results`；不会向日常使用的数据目录写入测试记录。

## 代码格式

已配置 Prettier 和 EditorConfig：2 空格缩进、单引号、分号、100 字符换行宽度、LF 换行。

```sh
pnpm format        # 格式化代码
pnpm format:check  # 仅检查格式，可用于 CI
```

`.prettierignore` 排除构建产物、依赖、数据、第三方素材、生成的素材清单与锁文件。

分享长图按北京时间从早到晚划分小时章节，每小时双列展示朋友的动态，卡片保留具体时间。小时内按发生时间升序排列；整小时能放下时保持同页，超长小时只在完整卡片行之间分页，并在下一页标注「续」。素材 ZIP 清单同样按发生时间升序。

```bash
pnpm dev
```

开发启动由 `scripts/dev.ts` 统一管理，直接启动 Vite 和 Node watch，不再使用 pnpm 并行任务转发退出信号。Ctrl+C 会停止前后端及其子进程；退出超过 1.5 秒会清理残留进程。启动前检查端口，发现占用会明确报错，不会自动结束其他服务或切换端口。默认后端 4500、前端 5173；可使用 `PORT` 和 `DEV_WEB_PORT` 覆盖，Vite 代理同步使用后端端口。

### 照片上传优化

浏览器直接上传原文件，草稿也保留原文件。选择 HEIC/HEIF 时优先使用浏览器原生预览，否则按需加载 `heic-to`，在工作线程中生成最长边 1280px 的预览；预览不会替换上传文件，关闭编辑器或更换照片会清理预览资源。预览失败不阻止提交，最终由后端判断照片是否可用。

服务端通过 Multer 将上传原件限制为 20 MiB（界面显示 20 MB），并验证图片像素可正常解码，最多 8000 万像素。HEIC/HEIF 依次尝试原生 `heif-dec`、`heif-convert`、Sharp 和独立工作线程中的备用 `heic-convert` 解码器，转换为 PNG 后再压缩。所有转换方式均失败时返回错误，不创建动态、不替换已有照片，也不发送发布通知。

3 MB 仅为优化目标：Sharp/libvips 自动纠正方向、最长边默认缩至 2560px，以 WebP 85% 质量编码；仍过大时尝试降低质量及尺寸。小图也尝试压缩，但不会用更大的结果替换可显示的源文件。压缩失败或超时保留已完成的较小结果，或保留可读取的原图；HEIC 保留的是转换后的 PNG，绝不退回 HEIC 原件。转换结果可能大于上传原件或 20 MiB，不会因为压缩失败而拒绝已经转换成功的照片。

Docker 自动安装 `libheif-examples`，该层与应用代码独立缓存。直接运行 Node 时建议安装最新 libheif 命令行工具（Debian/Ubuntu: `apt-get install libheif-examples`；macOS: `brew install libheif`），确保 `heif-dec` 或 `heif-convert` 在 PATH 中；缺失时会尝试备用解码器。之前已保存的 HEIC 原件不会自动迁移，若无法导出可重新上传，让服务器执行新的转换流程。

### 用导出素材交给 AI 创作

选择「下载素材 ZIP」后进入提示词页，可在文本框内阅读并一键复制完整提示词，复制成功时图标短暂变为对勾。提示词说明 `manifest.json` / `manifest.csv`、朋友素材目录、北京时间、描述和素材路径的含义与用法，默认创作手账图片，也可向 AI 补充视频或风格要求。点击底部固定的「下载压缩包」，将 ZIP 和提示词一起交给 AI；无需先复制也可直接下载，浏览器不允许自动复制时可手动选择复制。

下载文件名仅保留动态日期，以连字符分隔，例如 `和朋友的同一时间-2026-08-30-手账-01.png`、`和朋友的同一时间-2026-08-30-素材包.zip`；分页长图带两位页码，合集内的图片也使用该命名规则。单张照片下载另含发生时间，例如 `和朋友的同一时间-2026-08-30-14-30-照片.jpg`。

### 视频与共享缓存验证

`tests/video-layout.test.ts` 覆盖小时合并、六条上限、均衡分页、照片方向、稳定随机和全部 12 种风格的混排。可用真实素材包生成本地验收截图与 MP4：

```bash
node --import tsx scripts/video-collage-demo.ts "/path/to/materials.zip" --video
DATA_DIR="$PWD/data/video-demo-2026-09-07" pnpm dev
```

演示数据写入 `data/video-demo-<日期>`，重复运行复用该目录，不覆盖已有动态；截图和视频位于 `test-results/video-collage-<日期>`。两处均被 Git 忽略，真实素材不进入仓库。省略 `--video` 时只生成各风格截图和场景清单。

`pnpm test` 包含缓存 24 小时边界、请求清理、下载保护、缓存损坏、24 首音乐校验、完整文字续页、真实有声/无声 MP4、重启复用、Range 下载、编码进程终止与失败回收测试。需要本地 Chromium、FFmpeg 和 FFprobe。

完整样式验收运行 `VIDEO_QA=1 pnpm exec tsx --test --test-name-pattern="all twelve" tests/videos.test.ts`：实际生成全部 12 种样式及各两首配乐组合，并将第一首配乐样片和截图保存在 `test-results/video-samples`。`pnpm test:e2e` 覆盖 375px、430px、桌面端配置、试听、关闭/刷新恢复、播放器拖动与视频分享。

### 系统分享

首页「制作回忆」入口可将所选日期的动态生成手账长图、回忆视频，或下载素材 ZIP。单张图片预览和视频结果支持系统分享，按资源类型检测 `navigator.canShare`。有图片的动态操作菜单保留「分享图片」入口；ZIP 不提供分享入口，仍可下载。视频结果使用「分享视频」主按钮和「修改样式与音乐」次按钮，不再提供视频下载按钮；不支持文件分享的浏览器会隐藏分享按钮。

分享文件在点击后才读取。准备完成后按钮恢复原文案，再次点击即可打开系统分享面板。失败提示直接替换按钮文案，不增加额外提示行。关闭页面内弹窗或切换资源会取消准备并释放暂存文件；取消系统分享不显示错误，视频过期后需重新生成。
