# 此刻，同频

一份朋友们的平行生活手账。移动端优先，记录同一时间大家各自在做什么。

**Node + Express / Vite + React / TypeScript / pnpm workspace**。无需数据库、无需登录；一个 Node 进程托管页面、接口和图片。

## 开始使用

需要 Node.js **22.12 或更高版本**、pnpm，以及可写入的本地磁盘。仓库通过 `packageManager` 固定 pnpm 12.3.4，使用 `pnpm-workspace.yaml` 和 `pnpm-lock.yaml` 管理工作区与依赖。

```sh
pnpm install
pnpm setup:browser
pnpm dev
```

打开 [本地开发页面](http://localhost:5173)。前端端口为 5173，后端为 3000，开发代理已配置。手机与电脑处于同一网络时，可通过电脑的局域网 IP 加上 `:5173` 访问。

开发时后端默认使用 3000 端口；修改它时，需同步修改 Vite 的代理配置。

### 构建与运行

```sh
pnpm build
pnpm start
```

打开 [生产模式页面](http://localhost:3000)。根目录构建命令先构建前端，再编译后端，后端构建自动把页面、贴纸、字体与配置复制到 `apps/server/dist`。构建顺序由 `scripts/build.ts` 管理，复制逻辑在 `scripts/copy-web.ts`，均由 tsx 执行，不引入额外 monorepo 构建工具。生产启动仍直接运行编译后的 JavaScript。

Linux 服务器首次使用长图导出前，安装 Chromium 和所需系统依赖：

```sh
pnpm --filter @parallel/server exec playwright install --with-deps chromium
```

系统依赖安装可能需要管理员权限。请用实际运行 Node 服务的用户安装浏览器，或通过 `PLAYWRIGHT_BROWSERS_PATH` 指向该用户可以访问的浏览器目录。升级 Playwright 后重新运行安装命令。

可先在构建环境执行 `pnpm install --frozen-lockfile && pnpm build`，再把工程与构建产物放到服务器，执行 `pnpm install --prod --frozen-lockfile`、安装 Chromium 后 `pnpm start`。浏览器可执行文件不打进 JavaScript 产物。

```sh
PORT=8080 DATA_DIR=/absolute/path/to/parallel-data pnpm start
```

- `PORT`：默认 3000。
- `DATA_DIR`：默认仓库根目录的 `data`。生产环境建议使用独立持久目录。
- 一个 Node 进程负责所有请求，不使用多进程集群。由你选择的进程管理器保持运行即可。
- 使用公网域名时，可在 Node 前配置 HTTPS 反向代理。上传请求体上限至少 21 MB，长图导出请求超时至少 120 秒。

## Docker 部署

构建镜像并启动：

```sh
docker build -t friends-in-parallel .
docker run -d --name friends-in-parallel \
  --init --restart unless-stopped --shm-size=1g \
  -p 3000:3000 \
  --mount type=volume,source=parallel-data,target=/data \
  friends-in-parallel
```

打开 [应用页面](http://localhost:3000)。如果本机 3000 端口已占用，可改为 `-p 8080:3000`，然后访问 8080 端口。

- 多阶段构建使用 pnpm 锁文件和 TypeScript 构建脚本；最终镜像包含编译后的后端、前端静态资源、生产依赖及匹配版本的 Chromium。
- 以非 root 的 `node` 用户运行。`/data` 保存记录、照片与临时导出，命名卷在容器重建后继续保留。
- `--init` 回收浏览器子进程，`--shm-size=1g` 为 Chromium 分配共享内存。浏览器和 Linux 依赖在构建时安装，运行时不用再次下载。实现参考 [Playwright Docker 文档](https://playwright.dev/docs/docker)。
- 镜像含 HTTP 健康检查；使用 `docker logs friends-in-parallel` 查看日志。
- `.dockerignore` 排除本机依赖、构建产物、数据、环境文件和测试输出，避免将本地数据或配置打入镜像。

如需使用宿主机目录代替命名卷，该目录必须允许容器中的 UID 1000 写入。备份前停止容器，再备份卷里的 `entries.json` 和 `uploads`。

## 使用方式

首页是手账封面，点「上传动态」后才会选择人物。选择名字、点下一步，再选择照片 / Emoji / 贴纸之一，填写可选描述和北京时间。

- 人物：陆语涵、水水、童浩然、蔡建文、甲醛。
- 照片：JPEG、PNG、WebP，最大 20 MB，服务器保留原文件。暂不支持 HEIC 与动画 GIF。
- 描述最多 500 字；允许补记，禁止未来时间。
- 发布后跳转到相应日期，并定位新动态；返回人物步骤保留填写内容。
- 时间线按北京时间分小时，小时内按人物归组、按发生时间排序。可切换日期、筛选人物、编辑与删除。
- 无登录，所有访问者都能查看和修改记录，适用于互相信任的朋友小圈子。
- 进入时间线、切换日期、手动刷新时重新读取数据；没有实时推送。

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

包含上传原文件、实际选用的贴纸、Emoji PNG，以及 JSON / UTF-8 BOM CSV 清单。清单记录人物 ID、最新昵称、北京时间、描述、素材路径及署名，可用于剪辑视频或整理归档。CSV 对公式起始字符做安全处理；JSON 保留原始文字。

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

浏览器测试启动独立的生产服务器（3101 端口），使用临时数据目录，验证 375px / 430px 视口、分步发布、三套贴纸、照片与表情、失败保留输入、编辑删除、实际下载和长图分页。截图写入 `test-results`；不会向日常使用的数据目录写入测试记录。

## 代码格式

已配置 Prettier 和 EditorConfig：2 空格缩进、单引号、分号、100 字符换行宽度、LF 换行。

```sh
pnpm format        # 格式化代码
pnpm format:check  # 仅检查格式，可用于 CI
```

`.prettierignore` 排除构建产物、依赖、数据、第三方素材、生成的素材清单与锁文件。
