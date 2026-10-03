# Original Sprout themes / 原创小芽主题

All bundled pet SVGs, brand icons and tones in this public edition are original MIT assets. The theme directory contains the default Sprout Buddy plus Mint Chip, Blue Hour, Matcha Lab, Strawberry Milk, Sunset Soda, Paper Parade, Aurora Pop, Campfire Cocoa and Sprout Pro. Choose one from the pet's right-click or tray menu.

The original default theme ID **clawd** and several inherited filenames remain internal compatibility identifiers. Their contents are new round seed/leaf artwork; the upstream pet imagery is not included.

To create your own theme, copy apps/pet-desktop/themes/template/ into %APPDATA%/gowin-buddy-pet/themes/your-theme-id/. Edit theme.json, put the theme's SVG assets beside it and restart the pet. The loader validates the theme and falls back to the bundled default if it cannot load it. Use the template's required idle/working/attention/error/sleeping state mappings and its declared viewBox. Eye tracking requires the declared body, eyes and shadow IDs in the idle SVG.

For the bundled art, edit scripts/generate-public-art.py and regenerate it as described in the build guide. The asset manifest records theme IDs, relative paths and SHA-256 hashes. SVG source belongs under assets/brand/source/; exported PNG/SVG and metadata belong under assets/brand/extracted/.

公开版内置十套小芽主题，角色、品牌图标和提示音均为原创 MIT 素材。右键或托盘菜单可切换。旧的 clawd 标识和文件名保留用于兼容，文件内容已替换为新的圆形种子角色。

自定义主题可从 themes/template/ 复制到用户存档的 themes/你的主题名/，编辑 theme.json 并放入对应 SVG 后重启。保留模板要求的状态映射和 viewBox；需要跟随鼠标的眼睛时，SVG 中应有配置声明的 body、eyes、shadow ID。素材的许可与署名需要一起保留。
