# 此刻，同频

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

### 加速重复构建

- 普通改动继续使用 `docker build -t friends-in-parallel .`，保留同一个 Docker builder 的缓存，不需要 `--no-cache` 或清理构建缓存。
- pnpm 下载目录使用 BuildKit cache mount，本地依赖变化后仍可复用已下载包；GitHub Actions 另用每架构独立的 `type=gha,mode=max` 层缓存（cache mount 本身不会由 GHA 自动保存）。
- Chromium 和 Linux 库独立成层，只依赖基础镜像及锁定的 `playwright-core` 文件。修改页面或添加其他依赖时，可继续复用浏览器安装层；升级 Playwright 后会自动安装匹配的浏览器。
- 运行镜像仅安装服务端生产依赖；HEIC 转换库等前端依赖只保留构建后的网页文件。
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

「表情」统一包含三套素材，独立选择页提供套餐、搜索、分类和最近使用，选好即返回编辑器；新动态使用 `sticker` 存储。旧 `emoji` 动态仍可展示和导出，编辑保存时转为对应的微软素材，无需迁移历史数据。时间线的编辑、删除入口位于动态卡片的「更多操作」菜单。首页按发生时间从新到旧排列，小时及小时内的动态均倒序，不受人物配置顺序影响。表情与描述横向排列，照片保留完整大图。导出预览底部固定「下载图片」主按钮，多张时可翻页并下载当前图片，图片合集作为次要下载选项。

- 人物：陆语涵、水水、童浩然、蔡建文、甲醛。
- 照片：JPEG、PNG、WebP，最大 20 MB，服务器保留原文件。暂不支持 HEIC 与动画 GIF。
- 描述最多 500 字；允许补记，禁止未来时间。
- 发布后跳转到相应日期，并定位新动态；返回人物步骤保留填写内容。
- 首页时间线按北京时间分小时，小时从新到旧，小时内所有人物的动态按发生时间倒序。可切换日期、筛选人物、编辑与删除。
- 无个人账号，输入共享暗号后可以使用页面查看和修改记录，适用于互相信任的朋友小圈子；API 本身不校验暗号。
- 进入时间线、切换日期、手动刷新时重新读取数据；没有实时推送。

## 微信通知（PushPlus）

发布新动态成功后，服务端通过 PushPlus 微信公众号发送通知；编辑、删除不会发送。通知包含人物昵称、记录时间、动态编号和可选网站地址。Token 只用于服务端，不进入前端或镜像。

将 `.env.example` 复制为项目根目录的 `.env`，填写：

- `PUSHPLUS_TOKEN`：PushPlus Token，留空关闭通知。发送账号需完成实名认证。
- `PUSHPLUS_TOPIC`：可选订阅群组编码；留空仅通知 Token 所属用户，填写后通知群组订阅者。
- `SITE_URL`：可选网站公网地址，用于通知内查看手账。

`pnpm dev`、`pnpm start` 自动读取根目录 `.env`，已有环境变量优先；Docker Compose 也会将以上变量传入容器。修改后需重启服务。部署时在服务器单独配置 `.env`，并使用包含此功能的新镜像；`docker run` 可加 `--env-file .env`。

通知异步发送，超时为 10 秒，失败记录日志，不影响动态保存。请求至少间隔 13 秒以适配普通账号每分钟 5 次的限制；每日额度仍由 PushPlus 控制。队列保存在内存中，重启会丢失待发送通知，失败不自动重试。接口成功仅表示 PushPlus 接受请求，最终送达可在 PushPlus 消息记录中查看。

接口与额度参考 [PushPlus 文档](https://www.pushplus.plus/doc/guide/api.html)。

## 两种导出

导出总是包含所选日期**全部人物**，不受人物筛选影响。

### 分享手账长图

服务端使用 Playwright + Chromium、项目内的 Noto 中文字体和图片渲染独立模板。输出宽度 1080px，超过 12000px 时按完整卡片拆成多页；支持单张预览、保存、手机长按保存和图片合集 ZIP。字体及素材加载失败会报错，不静默漏图。

一次只渲染一份长图，同时发起的其他请求会收到稍后重试提示。生成最长约 90 秒，失败清理临时文件；下载地址保留 1 小时，定期清理过期文件。

### 素材 ZIP

服务器读取同一份记录快照并流式输出 ZIP，浏览器用原生下载接收，无需在手机内存中生成或拼装压缩包。下载前进行一次素材完整性检查。

```text
parallel-2026-08-29-materials.zip
├── lu-yuhan/
│   └── 2026-08-29_09-30_<动态ID>.png
├── shui-shui/
│   └── ...
├── manifest.json
├── manifest.csv
└── licenses/
```

包含上传文件（网页新上传照片为优化后的版本）、实际选用的贴纸、Emoji PNG，以及 JSON / UTF-8 BOM CSV 清单。清单记录人物 ID、最新昵称、北京时间、描述、素材路径及署名，可用于剪辑视频或整理归档。CSV 对公式起始字符做安全处理；JSON 保留原始文字。

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

原始素材未经修改；页面、长图及 ZIP 保留相应署名。完整许可在 `apps/web/public/licenses`。若修改 OpenMoji 素材，修改后的素材需遵守相同方式共享要求。

重新下载缺失的原始素材：

```sh
pnpm assets:download
```

下载脚本 `scripts/download-assets.ts` 通过 tsx 执行，使用 `asset-sources.json` 固定的上游提交，不在日常构建中联网下载。增加贴纸时同步维护配置与本地文件；已有动态引用的贴纸 ID 和文件应保持可用。

## 数据与备份

```text
data/
├── entries.json  # 动态记录
├── uploads/      # 上传原文件
└── exports/      # 可重新生成的临时长图及合集
```

JSON 通过进程内串行写入和临时文件原子替换保存；构建不会触碰数据目录。替换照片或删除动态会删除旧上传文件；导出快照在同一读写锁下读取，之后的修改不会改变正在生成的内容。

备份时停止 Node 服务，复制 `entries.json` 和 `uploads`；恢复到 `DATA_DIR` 后启动。完整迁移也需带上对应的工程配置和贴纸资源。`exports` 可不备份。部署容器时需要挂载持久卷。

## 接口

成功返回 JSON；删除成功为 204；失败为 `{ "error": "中文提示" }`。

| 方法   | 路径                                   | 用途                                                             |
| ------ | -------------------------------------- | ---------------------------------------------------------------- |
| GET    | `/api/entry-dates?month=YYYY-MM`       | 查询指定月份每天的记录数量（仅返回有记录的日期）                 |
| GET    | `/api/entries?date=YYYY-MM-DD`         | 按北京时间查询一天                                               |
| POST   | `/api/entries`                         | 发布                                                             |
| PATCH  | `/api/entries/:id`                     | 编辑                                                             |
| DELETE | `/api/entries/:id`                     | 删除及清理照片                                                   |
| POST   | `/api/exports/images`                  | `{ "date": "YYYY-MM-DD" }` → `images`, `archiveUrl`, `expiresAt` |
| GET    | `/api/exports/archive?date=YYYY-MM-DD` | 素材 ZIP；加 `check=1` 仅校验素材                                |
| GET    | `/api/exports/files/:token/:name`      | 短期导出文件；加 `download=1` 强制下载 PNG                       |

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

网页支持 JPEG、PNG、WebP 和 iPhone HEIC/HEIF 照片（原图最大 50 MB）。选择后先在设备本地转换和压缩，再保存草稿或上传：最长边默认 2560px，以 85% 质量优先编码 WebP，不支持时使用 JPEG；超过 3 MB 时降低质量并逐步缩小尺寸。小于 3 MB 的照片也尝试优化，若原文件更小则保留原文件。HEIC 解码器按需加载；转换失败可重试，之前选择的照片会保留。新上传的照片及导出素材使用优化版，历史照片不受影响。
