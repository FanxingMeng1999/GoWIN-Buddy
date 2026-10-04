# Original pet characters / 原创桌宠角色

The ten bundled themes now differ in silhouette as well as palette. Their compact SVG footprint and click areas follow the original GoWIN!Buddy viewBox and hitbox. Character body shapes, face details and working/sleeping/reaction poses are generated as original MIT artwork.

| Theme | Character | 中文 |
| --- | --- | --- |
| clawd | Sprout Buddy | 小芽 |
| mint-chip | Mossy Turtle | 苔龟 |
| blue-hour | Midnight Penguin | 午夜企鹅 |
| matcha-lab | Matcha Frog | 抹茶蛙 |
| strawberry-milk | Rosy Crab | 蔷薇蟹 |
| sunset-soda | Soda Fox | 汽水狐狸 |
| paper-parade | Paper Mushroom | 纸伞蘑菇 |
| aurora-pop | Aurora Owl | 极光猫头鹰 |
| campfire-cocoa | Cocoa Cat | 可可猫 |
| pixel-pro | Pocket Robot | 口袋机器人 |

Original clawd theme IDs and older filenames remain internal compatibility keys; the generated character art is independently authored and MIT-licensed. Choose any character from the pet right-click or tray appearance menu.

To make your own theme, copy apps/pet-desktop/themes/template/ into %APPDATA%/gowin-buddy-pet/themes/your-theme-id/. Edit theme.json, place SVG assets beside it and restart the pet. Keep the required state mappings and declared viewBox; eye tracking requires its configured body, eyes and shadow SVG IDs.

Regenerate bundled art using scripts/generate-public-art.py as described in the build guide. The manifest records each character, asset path and SHA-256. Editable source designs live under assets/brand/source/; generated SVG/PNG files and the manifest live under assets/brand/extracted/.

## 中文

十套内置主题不仅颜色不同，角色轮廓也各不相同：小芽、苔龟、午夜企鹅、抹茶蛙、蔷薇蟹、汽水狐狸、纸伞蘑菇、极光猫头鹰、可可猫与口袋机器人。桌宠按 GoWIN!Buddy 较早版本的 viewBox 与点击热区缩小；原创 SVG 动作包含待机、工作、睡眠与交互姿态。

clawd 等既有主题 ID 与文件名仅保留作为内部兼容标识。

右键宠物或打开托盘“外观”菜单即可切换角色。从 themes/template/ 复制模板可创建自定义角色；须保留所需的状态映射、viewBox 与视线追踪 SVG ID。原创素材源文件位于 assets/brand/source/，导出的 SVG/PNG 和哈希清单位于 assets/brand/extracted/。
