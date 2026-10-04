# 构建与验证

安装包的支持目标为 Windows 10/11 x64。桌宠使用 Electron，仪表盘由 Python 标准库本机 HTTP 服务提供，无需数据库或云端后端。

## 获取与运行

~~~powershell
git clone https://github.com/FanxingMeng1999/GoWIN-Buddy.git
cd GoWIN-Buddy
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/bootstrap-local-deps.ps1
$env:PATH = (Join-Path (Get-Location) 'tools/runtime/node') + ';' + $env:PATH
& ./tools/runtime/node/npm.cmd ci --prefix apps/pet-desktop
& ./tools/runtime/node/npm.cmd run start --prefix apps/pet-desktop
~~~

引导脚本从官方 Windows 下载地址准备 Node 24.14.0 与 Python 3.11.9，并校验 Node 压缩包的固定 SHA-256。运行时与下载缓存存放在 tools/，不纳入 Git。仪表盘 Host 不需要 pip 依赖。安装器构建会寻找或下载 NSIS 3.10。

重新安装源码依赖前先退出正在使用这些依赖的源码实例。安装器在独立目录安装依赖，可以与其他已安装版本同时运行。运行时路径遵循“显式 GoWIN 环境变量 → 内置运行时 → 系统回退”；独立安装包的构建始终准备内置运行时。

## 验证命令

~~~powershell
& ./tools/runtime/node/npm.cmd test --prefix apps/pet-desktop
& ./tools/runtime/python/windows-x64/3.11.9/python.exe scripts/tests/test_dashboard_host.py
& ./tools/runtime/node/npm.cmd run test:e2e:dashboard --prefix apps/pet-desktop
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/tests/Test-QualityProcessScope.ps1
~~~

浏览器测试使用已安装的 Edge/Chrome，或 PLAYWRIGHT_CHROMIUM_PATH 指定的 Chromium；测试数据放在隔离目录。[发布验收记录](validation.md)列出实际结果。

## 生成安装包

~~~powershell
powershell -NoProfile -ExecutionPolicy Bypass -File installer/windows/build-installer.ps1
~~~

输出为 installer/windows/dist/GoWINBuddy-Setup.exe。构建使用锁文件，在 installer/windows/build/pet-版本号/ 安装依赖，打包 Electron、本机 Host、原创素材、运行时许可证和中英文使用指南，再编译当前用户级 NSIS 安装器。Koffi 的编译用源码、厂商测试和文档不进入安装包；本机解析配置与个人存档同样不参与打包。

GitHub 下载不可达时，可设置 Electron 已支持的镜像变量：

~~~powershell
$env:ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'
$env:ELECTRON_CUSTOM_DIR = '41.10.7'
~~~

构建工具可通过 GOWIN_NPM_PATH、GOWIN_NSIS_PATH 指定；运行时可通过 GOWIN_NODE_PATH、GOWIN_BUNDLED_PYTHON 指定。开发验收用 GOWIN_USER_DATA_ROOT 选择独立存档。无需填写开发者电脑上的绝对路径。

这里的可复现指相同源码、锁文件和构建步骤可重复执行。安装包包含构建时间与安装器元数据，不承诺逐字节一致。

## 原创素材再生成（可选）

日常构建直接使用仓库内已提交的图标。需要修改素材时，用 Python 3.9+ 和 Pillow：

~~~powershell
python -m pip install 'Pillow>=9.5,<13'
python scripts/generate-public-art.py --root .
node scripts/render-mascot-gallery.cjs  # 更新中英角色总览图，需要 Microsoft Edge
node scripts/render-mascot-preview.cjs  # 渲染并测量 25 帧/秒动作，同样需要 Microsoft Edge
python scripts/render-mascot-preview.py  # 合成十角色与螃蟹特写动图
python scripts/sync-brand-icons.py --root .
~~~

设计源文件在 assets/brand/source/，SVG/PNG 导出和元数据在 assets/brand/extracted/，运行时图标在 assets/brand/runtime/。新增素材应具有可再分发许可。

目录职责：apps/pet-desktop/ 为桌宠与测试，apps/rpg-hub/ 为本机 Host 和网页，scripts/ 为工具，launcher/windows/ 为启动器，installer/windows/ 为安装器，assets/brand/ 为原创素材，docs/ 为双语文档和实际演示。不依赖任何外部 RIOS 项目路径；部分旧内部标识为兼容保留。

## 自动发布

推送与应用版本一致的标签（例如 `v0.2.4`）会触发 Windows 安装器工作流。工作流构建带版本号的 EXE 和 SHA-256 清单，使用 `docs/release-<version>.md` 发布 GitHub Release，并检查两个发布资源是否齐全。手动运行工作流只生成同样的安装包资源，不会发布 Release。
