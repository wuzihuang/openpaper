# Paper Canvas 对齐任务

更新日期：2026-11-10

## 目标

以 Paper.design 为参照，持续对齐画布编辑器的视觉与功能。页面需要像 Figma 一样独立切换；项目、页面和图层都要支持复制深链，接收链接的人或 AI 能定位到对应内容。

## 当前状态

核心编辑闭环、结构化填充系统和钢笔矢量绘制已完成并通过浏览器验证（CDP 驱动）。填充模型与 Paper 真实构建包中的模型对齐：solid / linear / radial / conic 渐变、含中点的色标、oklab 插值。当前版本仍不是 Paper 全量功能的最终实现：矢量锚点级编辑、Flex 自动布局、多层填充堆叠和组件系统仍属于后续迭代。

## 已完成

### 界面与页面

- Paper 风格的工具栏、图层面板、属性面板、HUD 和右键菜单。
- 多页面创建、重命名、删除和切换。
- 画板缩略图与页面缩略图。
- 本地文档持久化。

### 链接与定位

- 项目链接、页面链接、图层链接。
- 深链格式：`#/p/<pageId>`、`#/p/<pageId>/n/<nodeId>`。
- 打开节点深链时立即切换页面、选中图层并适配画布。
- `window.paper` 提供文档快照、链接和定位接口。

### 编辑操作

- 复制、剪切、粘贴、原位粘贴、粘贴以替换、创建副本。
- 多选、全选、选择父级、选择子级。
- 成组、解组、置顶、置底、上移一层、下移一层。
- 隐藏、锁定、删除、重命名。
- 方向键微移，Shift 方向键大步微移。
- Alt 拖动复制，复制与拖动合并为一次撤销。
- Shift 拖动锁定主轴；Shift 点击已选图层时取消选择。
- 画板可拖动：按住画板标题拖拽即可移动（支持 Alt 复制、Shift 加选）。
- 单击优先选中画板直属顶层图层（Paper/Figma 语义）；⌘-点击直达最深节点；顶层已选中时拖拽移动整卡、原地单击穿透下钻到内层节点。
- 拖拽位移按视口差值计算，画布中途跳变（字体加载重取景等）不再把节点甩飞。
- 复制样式、粘贴样式。

### 绘制与画布

- 移动、平移、画板、矩形、椭圆、文本、钢笔和图片工具。
- 画板/容器的 Flex 自动布局：横向/纵向排布、间距、边距、主轴与交叉轴对齐、高度自适应。
- Flex 尺寸约束：子项宽/高支持固定/填充/适应三种模式（主轴 fill 弹性分配、交叉轴 fill 拉伸、hug 适配内容）；容器支持宽/高自适应内容（fit-content）。
- 弹性容器内拖动子项按主轴位置实时重排。
- 组件与实例：`⌘K` 把所选容器标记为组件（再次按下取消）、`⌥⌘K` 生成实例；实例实时镜像组件子树、紫色虚线标识。
- 实例覆盖：文本内容与形状填充可在检查器中按子项覆盖，重置覆盖/分离实例（深克隆落地）。
- 对齐与分布：`⌥A/D/W/S` 边对齐、`⌥H/V` 水平/垂直居中（兼容 `⇧⌥S/W`）、`⌥⇧H/V` 等距分布、`⌃⌘` 方向键对齐，右键菜单同项。快捷键绑定与 Paper 构建包中的 `alignSelectionTo*` / `distributeNodes*` 一致。
- `window.paper.select` 支持节点 id 数组（多选定位）。
- `⇧X` 填充↔描边互换（`swapFillAndStroke`）。
- 数字键 `0–9` 直接设置选中不透明度（0→100%，1–9→10–90%）。
- `⌥⇧⌘R` 适配内容（Flex 容器双轴 hug；普通容器收缩到子项包围盒并平移子项）；`⌥⇧⌘F` 弹性子项双轴填充。
- `⌘⇧'` 像素对齐开关（默认开启，关闭后移动/缩放保留小数位）。
- `⌥L` 全部折叠图层面板。
- 按住 `⌥` 悬停测量：与选中节点分离时显示四向间隙标尺，重叠时显示四边偏移量（Figma/Paper 习惯）。
- `i`/`⌃C` 取色器（原生 EyeDropper API，拾取颜色写入选中项主填充）。
- 右键菜单「复制为 JSX」：节点树序列化为带内联样式的 JSX（文本/矢量/图片/弹性布局/fill 渐变均覆盖）。
- 左侧面板新增「组件」页签：列出全部组件（层数+实例数），单击在视口中心插入实例、双击定位源组件；图层树中组件/实例显示紫色菱形图标。
- 评论工具：`C`/`Y` 或工具栏图标激活，画布点击落评论锚点，Enter 保存；编号图钉随相机缩放、点击展开弹层可编辑/解决/删除，评论随文档持久化到 `doc.comments`。
- 着色器菜单：`S` 键弹出着色器预设（极光/日落/海洋/霓虹/晨雾/熔岩），将多层径向渐变网格 + 底色作为填充堆叠应用到所选节点，可撤销。
- 嵌套实例：组件可包含实例，实例化外层组件时内层实例子树递归渲染（CDP 验证 DOM 4 层后代），可正常分离/删除。
- 层级导航与 UI 开关（对照真实绑定）：`Tab`/`⇧Tab` 同级图层循环，`Enter`/`Esc` 下钻/上选，`n`/`⇧n` 切换画板，`PageUp/Down` 切换页面，`⌘⇧A` 选中其他同级，`⌘⇧⌥L` 全部解锁，`⌘\` 隐藏/显示全部 UI，`⌘⇧\` 折叠左侧面板，`⌥⇧C` 显示/隐藏评论图钉。
- 复制为 Tailwind：右键菜单导出节点树为 Tailwind utility class 的 className 结构（尺寸/颜色/圆角/阴影/Flex/文字均覆盖）。
- 排版增强：`⌘B`/`⌘I` 切换粗体/斜体（文字节点 fontWeight/fontStyle），检查器 B/I 按钮 + OpenType 特性面板（liga/calt/case/frac/numr/dnom/ordn/sups/subs/sinf/zero → font-feature-settings，随渲染与 JSX 导出）。
- 快捷键速查面板：`⌃⇧?` 呼出分组快捷键表（工具/选择/编辑/排列/视图/文字 6 组 60+ 项），Esc/×/遮罩点击关闭。
- 像素网格：`⇧'` 开关（真实绑定），缩放 ≥400% 时在视口显示 1px 世界单位网格。
- 实例覆盖扩展：除文本/填充外新增「可见性」覆盖 —— 覆盖列表每行尾部眼睛按钮可单独隐藏组件子项（仅作用于该实例），重置覆盖一并还原；已清理历史测试残留实例。
- 深色主题：`⌥2`（Paper `showTheme` 真实绑定）切换亮/暗 UI，暗色令牌取自真实样式表（panel #2a2a2a / root #222 / canvas #282828 / separator #373737 / focus oklch(60% .15 258) 等），localStorage 持久化。
- `⌘F` 聚焦图层搜索框（真实绑定，面板隐藏时自动展开）；右键菜单新增「复制为 React CSS」（节点 → 内联样式对象字面量，含字体特性/Flex/阴影）。
- UI 度量对齐真实包：左右面板固定 240px（`w-240`）、图层行高 28px（`h-28`）；评论弹层改为主题令牌配色（双主题适配）。
- 画板尺寸预设（`artboardPresetState`）：画板工具激活时工具轨右侧弹出预设面板，7 类 53 项真实设备尺寸（iPhone 18 Pro→Pixel Fold/iPad/MacBook/Slide/Apple Watch/A4–Tabloid/社交媒体），点击插入对应尺寸画板并复位工具；CDP 验证通过。
- 效果体系（Paper Filter/Backdrop/InnerShadow）：阴影支持内阴影+扩散半径；节点新增 `filter`（模糊/灰度/反相/复古/饱和/对比/色相）与 `backdropBlur` 背景模糊，检查器新增对应控件，JSX/React CSS 导出同步；CDP 验证 inset/grayscale 渲染正确。
- 智能参考线修复：`computeSnap` 已产生对齐 guides 但从未渲染——新增 `GuidesOverlay` 红色对齐线（1px 屏幕宽、随缩放反向缩放、拖放结束清除）；CDP 实测拖拽吸附时线条出现。
- 独立圆角（Paper `cornerRadius.split/combine`）：`radiusCorners[tl,tr,br,bl]`，检查器圆角旁拆分按钮 → 四角独立字段，JSX/Tailwind 导出同步；CDP 验证 24px 22px 22px 渲染。
- 布局约束（Paper `constraints`）：子节点横向/纵向约束（左/中/右/拉伸 × 顶/中/底/拉伸），父容器手柄拖拽缩放时按约束变换子项——右=跟随右缘、中=跟随半距、拉伸=等比缩放；检查器双下拉，CDP 实测 +66px 右跟随精确。
- 节点旋转（Paper `rotate` 属性）：`rotation` 角度字段，绕中心 transform 渲染，检查器布局区数字字段，JSX/ReactCSS 导出 `transform: rotate()`。
- 文字装饰与大小写（Paper `textDecoration`/`textTransform`）：下划线/删除线 × 实/点/虚/波浪线型，大写/小写/首字母转换；检查器两个下拉，渲染+导出同步。
- 微调距离设置（Paper `nudgeSettings`/`nudgeAmounts`）：默认 [1,8]（修正原硬编码 10），画布右键「微调距离…」对话框自定义小/大步长，localStorage 持久化，方向键动态取值。
- 导出格式扩展（Paper PNG/JPG/WebP/质量）：导出区新增格式选择（PNG/JPG/WebP）+ 0.5× 倍率 + 有损格式质量档（低/中/高），JPG 自动白底合成；右键「导出 PNG…」路径保留。
- 页面管理补齐：页面右键菜单新增「复制页面」（深克隆全部画板+节点+评论，命名「xx 副本」）与「上移/下移页面」排序；CDP 验证克隆 2 画板并激活。
- 右键菜单补齐（Paper 真实标签）：节点菜单「复制为 SVG」（makeSvg → 剪贴板）；画布菜单「粘贴(不含图片)」（`PasteMode: 'noImages'`，克隆时跳过 image 子树避免悬空引用）。
- 多选「选中颜色」（Paper Selection colors）：多选时检查器列出所选子树中全部去重色值（fill/stroke/文字色/可见实心 fills），改某色批量替换所有匹配节点，CDP 验证 #111111→#ff0000 仅命中 h_batt、撤销还原。
- 描边体系扩展（Paper `svgStroke`）：`strokeDash[]` 虚线数组 + `strokeCap` 端点样式；非矢量节点以居中 SVG 覆盖层渲染自定义虚线（含独立圆角路径/椭圆），矢量直接输出 dasharray/linecap；检查器「线型」预设（实/虚/点/长虚线）+ 矢量「端点」下拉；SVG 导出同步。`⇧⌘E` 导出快捷键（`exportImages`）。CDP 验证 dash [6,4] 覆盖层渲染、CSS border 卸载、撤销还原。
- 快捷键全量对照真实 hotkey 注册表补齐：`a`/`z` 工具（z 点击放大、⌥点击缩小）、`.`/`⇧.`/`⇧|` UI/面板开关、`⌥1` 显示图层面板、`⇧C` 评论显隐、`⇧G` 参考线开关、`⌘'`/`⌘⇧'` 网格/像素吸附、`1`/`2`/`0`+`⌘0` 缩放、`⌘+/-` 缩放、`⌘⌥G` 框选成组、`⇧A`/`⌥⇧A` Flex 增删、`⌥C` 裁剪内容、`⌘⌥L/T/R/J` 文字对齐（含 justify）、`⇧⌘K` 置入图片；`window.paper.snapshot()` 新增 `ui`/`camera` 字段便于外部工具读取编辑器状态。CDP 21 项验证通过。
- 点击或拖拽创建图层，Shift 绘制正方形和正圆。
- 文本创建后直接进入编辑。
- 图片文件导入、替换和填充方式设置。
- 缩放、适应画布、100% 缩放、缩放至所选内容。
- 吸附参考线、框选、调整尺寸和 Shift 等比缩放。

### 属性与导出

- 结构化填充：纯色、线性/径向/圆锥渐变、图片填充；渐变条支持添加/拖动/删除色标和过渡中点。
- 多层填充堆叠：添加/删除填充、逐层显隐，画布按 CSS 背景层叠渲染。
- 圆角、不透明度、混合模式、描边和阴影。
- 字体、字号、字重、行高、字距、颜色和对齐方式。
- 图片适应、填充和裁剪。
- 导出 SVG、导出 1×–4× PNG、复制为 PNG；渐变与矢量路径同步导出为 SVG defs/path。
- 导出内容来自文档数据，不是应用界面截图。

### 矢量绘制与编辑

- 钢笔工具（P）：点击落锚点，按住拖动拉出对称贝塞尔手柄。
- 回到首点（8px 容差）闭合路径；Enter 提交，Esc 放弃；钢笔保持激活可继续绘制。
- 绘制中显示路径、锚点与手柄的实时叠加层。
- 双击矢量进入锚点编辑：拖动锚点、拖动贝塞尔手柄（Alt 独立控制）、点击选中锚点。
- 双击路径段按 de Casteljau 拆分插入新锚点；Delete 删除选中锚点（少于两点时删除节点）。
- Enter 或 Esc 退出锚点编辑；拖动锚点/手柄为一次撤销步。
- 生成的矢量节点支持填充、描边、移动、缩放、复制、编组和导出。

## 验证结果

- TypeScript 类型检查通过（2026-11-10 最新代码）。
- Vite 生产构建通过（2026-11-10 最新代码）。
- 核心编辑浏览器测试：28/28 通过，无控制台错误（早于填充/矢量改造）。
- 菜单、页面和深链回归测试：35/35 通过（早于填充/矢量改造）。
- 填充与钢笔 CDP 验证：8/8 通过 —— 应用挂载、画布几何、钢笔激活、草稿贝塞尔路径、矢量节点生成、填充类型切换、渐变 defs 注入、撤销；无控制台错误。
- 锚点编辑 CDP 验证：7/7 通过 —— 三角矢量创建、双击进入锚点编辑（3 锚点叠加层）、拖动锚点改变路径、Delete 删除锚点、双击路径段插入锚点、Esc 退出、节点删除。
- 多层填充 CDP 验证：8/8 通过 —— 填充卡渲染、添加填充、双层 CSS 背景叠放、显隐切换、删除、撤销还原。
- 渐变画布手柄 CDP 验证：7/7 通过 —— 线性渐变端点拖拽改角度、径向中心拖拽、最近手柄命中（小节点）、CSS 同步、撤销还原。
- Flex 布局 CDP 验证：纵向/横向排布子节点按流式排列、间距/边距/主轴/交叉轴参数提交、撤销还原。
- 组件/实例 CDP 验证：10/10 通过 —— ⌘K 建组件、⌥⌘K 建实例、实例完整渲染组件子树（19/19 后代）、尺寸同步、检查器分离按钮、分离落地克隆、删除/取消无残留；文本覆盖另测通过（实例显示覆盖值，组件保持原值）。
- Flex 约束 CDP 验证：子项 fill 在主轴弹性扩展、交叉轴拉伸对齐、容器 hugW/hugH 按内容收缩/扩展（真实拖拽创建的画板场景，误差 ≤5px 为缩放取整）。
- 对齐/分布 CDP 验证：6/6 通过 —— ⌥A 左对齐、⌥D 右对齐、⌥V 垂直居中、⌥⇧H 等距分布（间隙相等）、⌥S 底对齐、撤销全部还原。
- 快捷操作批 CDP 验证：8/8 通过 —— 数字键不透明度（5→0.5、0→1）、⌥L 折叠图层（6→0 caret）、⌥⇧⌘F 子项 fill、⌥⇧⌘R 容器双轴 hug、⌥悬停测量标尺出现/释放消失。
- ⇧X 互换 + JSX 导出 CDP 验证：检查器设描边后互换成功并撤销还原；JSX 序列化输出含样式/文本内容。

## 后续大型迭代

1. 组件细化：跨页面组件库面板、嵌套实例、更多可覆盖属性（可见性/描边/圆角）、实例内部直接编辑跳转。
2. 持续对照 Paper 的真实交互和视觉细节（画布标尺、注释、原型连接等长尾功能）。

## 本地运行

```bash
npm install
npm run dev
```

类型检查与生产构建：

```bash
npx tsc --noEmit && npx vite build
```

## 主要代码入口

- `src/model/store.ts`：文档状态、历史记录、剪贴板和编辑动作。
- `src/model/types.ts`：文档数据模型（含 Fill / VectorPoint）。
- `src/model/fills.ts`：填充默认值、CSS 背景与 SVG stop 展开。
- `src/model/vector.ts`：矢量路径 `d` 生成与点集包围盒。
- `src/model/navigation.ts`：深链与 AI 定位接口。
- `src/model/export.ts`：SVG/PNG 导出。
- `src/canvas/Canvas.tsx`：画布交互、绘制、拖拽和快捷键。
- `src/ui/menuActions.ts`：项目、画布、图层和缩放菜单。
- `src/ui/Inspector.tsx`：属性与导出面板。
- 导出为 PDF（Paper "Export as PDF"）：选区栅格化 JPEG 后嵌入最小 PDF 容器（PDF-1.4 DCTDecode XObject，无外部依赖），导出面板格式新增 PDF 选项；CDP 验证 %PDF-1.4 头+xref/EOF 结构合法。
- 描边/轮廓收尾（Paper `svgStroke`/`outline`/`textStroke`）：新增 `outline`（宽+色+偏移，CSS outline）与 `textStroke`（WebKit 文字描边）模型+检查器控件；文字对齐按钮补「齐」justify；导出同步 `dashed` 边框/outline/WebkitTextStroke。CDP 验证 outline `rgb(17,17,17) solid 1px`、textStroke `1px #111`、justify 生效，均撤销还原。
- 设计变量（Paper `tokenState` 本地等价）：左栏新增「变量」页签 —— 从选中图层创建颜色变量、单击应用到选中、双击行内重命名、色块改值实时传播到所有绑定节点（`fillToken` 字段）、删除自动解绑；修复 selector `?? []` 新数组导致的 useSyncExternalStore 死循环。CDP 全链路验证：创建 tok_1sfod→绑定 h_card_a→应用 h_batt→改值 #ff5500 双节点同步→重命名→删除还原。
- 多选变换区（Paper multi-bounds）：多选检查器新增「位置与尺寸」X/Y/W/H —— X/Y 编辑平移全部选中项，W/H 以选区左上角为锚点等比缩放（含矢量点/字号/句柄，`scaleSelection`）；CDP trusted-input 验证 X +20 双节点同步位移、W×1.5 双侧缩放、撤销还原。
- 图层面板拖拽排序（Paper layer drag）：行可拖拽，上 30%/下 30% 为同级前/后插入（蓝色指示线），中段悬停 frame 行高亮为嵌套放入；`reparentNode` 处理画板级与子级重排 + 祖先环检查；修复运算符优先级 bug 导致非 frame 目标永远判定 before。CDP 验证 Title 下移、Time 嵌套入 Hero Card、撤销双还原。
- `⌘⇧<`/`⌘⇧>` 字号阶梯增减（Paper `decreaseFontSize`/`increaseFontSize` 真实绑定）：`adjustFontSize` 按 1/2/4/8 阶梯步进，作用于全部选中文字节点；另确认 `⇧X` 交换填充/描边色、`⇧⌘V` 原位粘贴已存在。
- 选择导航收尾（Paper `selectParents`/`enter`/`selectInverse` 真实动作）：`⇧Enter` 选择父级（`Enter` 选择全部子级与 Paper "Select children" 语义一致）、节点菜单新增「反选」— 反选当前所有同级未锁定节点，空选时选全部画板；CDP 验证 ⇧Enter→art_home、Enter→9 子级全选、[h_time,h_title] 反选得其余 7 同级。
- `⌘⇧<`/`⌘⇧>` 字号阶梯增减（Paper `decreaseFontSize`/`increaseFontSize`）：`adjustFontSize` 1/2/4/8 阶梯，验证 34→38→34 双向 + 撤销还原。
- 画布拖拽旋转（Paper corner-rotate）：选区四角外侧 16px 旋转热区（`rotateAt`），按下绕选区中心旋转、Shift 吸附 15°、光标切 move；`rotation` 属性此前已建模，现与检查器数字字段互通。CDP 真实指针路径验证 45.05° 写入 + 撤销还原。
- 画布拖拽旋转（Paper corner-rotate）：四角外 16px 热区绕中心旋转、Shift 15° 吸附；CDP 真实指针验证 45.05°。
- LOD 剔除（Paper `hideUnderWorldPx` 阶梯原值 7.5/15/30/60/120 ↔ 缩放 .4/.2/.1/.05/.025）：低于 40% 缩放时跳过小于阈值的元素渲染，CDP 验证 3% 缩放剔除 3 节点、放大恢复。
- 快捷键补齐（bundle `hotkey:default` 全量比对）：`⌘Backspace` 解组（原误触发删除！）、`\` 选择父级（Paper `selectParents` 第二绑定）、`⌥R` 复制 React CSS、`⌘⌥↑/↓` 后/前移一层；全部 CDP 验证。
- 文件拖放导入：图片文件拖入画布在落点创建节点、落入下方画板为父级；`importImageFileAt` 复用 readImageFile；CDP DataTransfer 合成 File 验证建点/父级/命名。
- 工具提示对齐复核：Paper tooltip 标签（对齐六向/四角点/Resize to fit-fill/Copy 色值格式 OKLCH·OKLAB·P3·HSL·RGB）—— 对齐/角点/resize 已覆盖；色值多格式复制属取色器细节待后续。
- Paper 无编组概念确认：`preventGroup ⌘G` 仅屏蔽浏览器默认，frame 即其编组原语（⇧F/⌘⌥G 等价已实现）。
- 色值多格式复制（Paper "Copy RGB/HSL/OKLCH/OKLAB/Display P3"）：新增 model/color.ts（sRGB→linear→OKLab/OKLCH/HSL/Display-P3 矩阵换算，OKLCH 265.3°@#3366ff 校验吻合）；检查器色板右键弹出 6 格式复制菜单（HEX/RGB/HSL/OKLCH/OKLAB/Display P3），写入剪贴板；CDP 验证菜单项与换算值。
- 综合回归（CDP 10 项）：节点渲染/画板标签/双面板240px/工具轨/图层行/深链API/hash路由/UI显隐切换全部通过，页面零异常。bundle 可提取功能面确认穷尽（无 present/原型/标尺/编组/布尔/蒙版/布局网格）。
- 文字自动宽度（Paper 单击=自适应/拖拽=固定宽）：新增 `widthAuto` 字段；单击创建的文字 `whiteSpace:pre` + `width:max-content` 随内容增长；`onInput`/`useLayoutEffect` 将渲染尺寸回写 node.width/height（无历史记录，保证命中测试与边界正确）；手动缩放清除 widthAuto 转固定宽；编辑器重聚焦守卫防光标跳位。CDP 验证 41→250px 实时增长、blur 提交、删除还原。
- Fast Refresh 修复：NodeView.tsx 的 primaryPaint/svgGradient 非组件导出改内部函数，消除 Vite HMR invalidate 警告。
- 持久化/状态卫生复核：localStorage 仅存 doc（无 pen/drag 瞬态泄漏），normalizeDoc 兜底、reload 后节点+选择完整恢复（CDP round-trip 验证）。
- 落点重父级（Figma/Paper drop-reparent）：move drag 结束时，完全被另一 frame/画板包含的图层重父级到最深容器（含逃出父框回画板）；同事务内 relink + 文档系→父系坐标换算；子孙环/同批移动祖先检查。CDP 验证 rect art_home→h_card_a 落点重父级 + 坐标 x=2,y=42 正确 + 单撤销完整还原。
- 拖放目标高亮（Paper/Figma drop-target glow）：ui.dropTargetId + move 中实时计算最深可包含容器，Hud 画布叠加层绘制 2px 蓝色外扩描边；drag 结束兜底清除；与落点重父级共用 dropTargetFor。CDP 验证 rect 拖入 h_card_a 完成重父级（目标计算正确）。
- lineClamp 行数截断（Paper CSS 属性表）：text 节点 `lineClamp` → -webkit-box/line-clamp 渲染；检查器「截断」字段；JSX/ReactCSS 导出同步。CDP 验证 clamp=2 应用+撤销。
- textDecoration 补齐（Paper thickness/skipInk）：`textDecorationThickness` + `textDecorationSkipInk` 字段/渲染/检查器「粗细」数值+「跳字」开关/导出。
- 填充级混合模式（Paper Fill.blendMode）：Fill 增加 blendMode → CSS background-blend-mode（仅可见层对齐映射，≥2 层才输出）；FillRow 每条填充加「混合」16 模式下拉；JSX/ReactCSS 导出同步。CDP 验证 multiply,normal 逐层渲染+撤销。
- Flex 绝对定位子项（Paper isFreeformChild）+ margin：`absoluteInFlex` → flex 父内 position:absolute 按 node.x/y 定位移出流；`margin` 统一外边距；检查器 flex 子项区加「绝对定位」开关 +「外边距」字段。CDP 验证 relative→absolute(22,22) + 撤销。
- Flex 模型补齐（Paper justifyItems/flexWrap/alignContent/alignSelf/paddingXY）：layout.wrap+alignContent（换行+行间对齐）、paddingX/paddingY 分向边距、子项 alignSelf 覆盖父交叉轴；检查器 flex 区加「换行」开关+「换行对齐」+分向边距字段、子项区加「对齐」下拉；NodeView flexWrap/alignContent/alignSelf 渲染。
- 分边描边（Paper border{Top,Right,Bottom,Left}{Width,Color}）：strokeSides 模型，NodeView sideBorders() 逐边回退统一描边、width:0 隐藏单边、虚线映射 CSS dashed/dotted；检查器「边」选择（全部/上/右/下/左）+「覆盖此边」开关+分边色/宽字段；JSX/ReactCSS 导出同步 borderTop 等；CDP 验证 top=16px/left=1px+撤销。
- 快捷键终审计（Paper 完整 hotkey 表 diff）：确认 ⌘⌥L/T/R=文字对齐（alignText* 实证，曾误改对象对齐已回退）；层序键位 Paper 用 ⌘]/⌘[/]/[（前移/后移/置顶/置底早已就位，⌘⌥↑↓ 纠正为 nudge）；Mod/Alt+箭头全部 = nudge（Shift=大步长，Paper u9 实证）；⌘R 重命名、⌘⇧K/I 图片、⌥⇧⌘R/F resize、Escape=选父级、Tab/⇧Tab 同级遍历、PageUp/Down 翻页均已覆盖。
- 双数字不透明度（Paper prevOpacityDigits+timeout）：快速连击两数字 → NN%（3+5→0.35）、单数字→N0%、00→0%，600ms 窗口；单按 2 归不透明度（与 Paper 一致，缩放走 ⇧2）；HMR []-effect 旧监听伪迹识别。
- 菜单标签审计批（Paper context-menu 全集 diff）：① 四边 padding（Individual padding）layout.paddingSides 优先于 paddingX/Y，检查器「独立边距」开关+4 字段；② textDecoration 补 overline；③ crossAlign 补 baseline/baseline-last（Paper First/Last baseline）；④ 渐变插值实际接入 CSS（in oklab/oklch + longer/increasing/decreasing hue，此前字段存在但未输出）+ 检查器「插值」下拉；⑤ 「包进 Flex」菜单项 wrapInFlex（frameSelection 带 layout 参数，同事务）。CDP：baseline、四边 padding、in oklch longer hue、overline、wrap-flex 全部验证+撤销。
- 合并导出 PDF（Paper "Export combined PDF"）：buildMultiPagePdf 多页容器（每画板一页，DCTDecode XObject）+ rasterizeSvg 重构共用；导出面板「合并导出 PDF」按钮（跟随倍率设置）；CDP 验证 2 页/2 图/%PDF-1.4/xref 合法。
- 细节批（Paper 菜单标签续）：渐变「均分色标」（Paper gradientStops.distribute/"Distribute colors"，CDP 0.4→0.5 验证）；文字「省略号」textEllipsis（nowrap+textOverflow:ellipsis）与「保持词组」keepWords（wordBreak:keep-all，Paper "Keep words"/"Truncation" 实证）；确认微调步长对话框、无图粘贴、Lorem ipsum（仅预览占位）均已覆盖或为非功能。
- Paper 偏好开关批：ui.prefs{wheelZooms,invertZoom,rightClickPan,zoomCentersSelection,deepSelection}+localStorage 持久化+setPref；滚轮缩放/反转/选区居中（selectionBounds 中心为锚点）、右键平移（pointerdown button:2 放行+pan drag，contextmenu 延迟到抬起未拖移>4px 才开菜单）、深层选择（deep=meta||pref）；空态检查器「偏好」区 5 开关；CDP 验证滚轮缩放 1.0→2.7、反转、深选命中 p_title。注：本会话 CDP Input 域失效（鼠标事件不到页面），改用 JS PointerEvent/KeyboardEvent 派发验证。
- Pattern 填充（Paper Shader 系统近似）：Fill.type='pattern'+patternKind(dot-grid/halftone/lines/noise)+patternSize，CSS 平铺近似（radial-gradient 点阵/半调、repeating-linear-gradient 条纹、feTurbulence data-URI 噪声）；检查器「图案」类型+图案/墨色/尺寸字段；SHADER_PRESETS 新增点阵/半调/条纹/噪点 4 预设（S 菜单共 10 项）；SVG 导出回退墨色；CDP 实测 S→点阵→radial-gradient 平铺渲染+模型+撤销。注：Paper 26 种 WebGL shader 自 shaders.paper.design 远程加载，离线不可 1:1。
- 布局参考线（Paper guides 系统=布局网格）：LayoutGuide{type:grid|column|row,trackSize,count(-1=auto),gap,align,margin}+DocNode.layoutGuides；移植 Paper cCe 轨道算法（stretch/center/start/end 四向排布）；LayoutGuidesOverlay 渲染半透明玫红条带（rgba(255,77,121,.12)），grid 型为 repeating 网格线，受 ⇧G guidesEnabled 总控、单 guide 可隐藏；检查器「布局参考线」区：类型下拉+轨宽/数量/间距/边距/对齐+增删+显隐；CDP 验证：加纵向轨道→模型+条带渲染、stretch count=-1=1 满轴轨（与 Paper 算法一致）、网格平铺、双撤销清空。
- 逐节点导出条目（Paper exportMeta.entries）：ExportEntry{scale,format:png|jpg|webp|pdf,suffix}+DocNode.exportMeta；exportNodeEntries 按条目逐一下载（命名 节点名@Nx.ext，PDF 走 JPEG→buildPdfFromJpeg）；单选时导出区显示条目列表（倍率/格式/删除/添加/「导出 N 项」），多选保留快捷导出按钮；CDP 验证添加/改格式/撤销。
- Pin 约束网格（Paper 3×3 Pin UI）：PinGrid 9 格控制——角格=双轴设定、边格=单轴 Pin（对边已激活→stretch/Inset、同边再点→回默认）、中心格=双轴居中；激活态按 constraintsX/Y 渲染（stretch 亮两边）；替换约束区顶部展示，下拉保留；CDP 验证：点右→stretch、点左→还原、激活格计数、撤销。
- 导出条目 quality/resampling（Paper PDF 条目字段）：ExportEntry.quality/resampling，rasterizeSvg 支持 imageSmoothing 开关（pixelated=关闭平滑）；PDF 条目显示质量/重采样下拉；tsc/build 干净。
- 比例锁定（Paper aspectRatio/链锁）：DocNode.ratioLocked；W/H 字段间链式按钮（lock/unlock 图标）；锁定时 W 改→H 按比例联动、反向同；resize 拖拽：角柄等同 Shift 等比，边柄按比例双轴缩放（对边锚定/垂直轴居中）；CDP 验证锁开关+W=600→H=344 联动+撤销。
- text-decoration-color（Paper 专属装饰线颜色字段）：textDecorationColor 模型+NodeView textDecorationColor 渲染+ReactCSS 导出；检查器装饰线启用时显示「线色」字段（默认=文字色，同色时省略）。
- Spacing token（Paper tokenState.spacing）：DesignToken.type=color|spacing+FlexLayout.gapToken；createSpacingToken/applyTokenToSelection 按类型分派（spacing→flex gap 绑定）；updateToken 数值传播到 gapToken 绑定节点、deleteToken 清绑；TokenList 间距行 sz 徽标+数值行内编辑+「新建间距变量」按钮；NodeView gap 经 token 解析；CDP 验证建/绑/改 24px 传播/撤销。
- 修复画板不可拖动：artboard-label 的 onPointerDown stopPropagation 吞掉事件导致画布标签条 beginMove 分支永远失效——改为冒泡，画布 pointerdown 命中标签条→选中+拖动+解组事务正常；CDP 验证 -395,-190→-252,-118+撤销。
- 修复 ⌘\ 全屏塌缩：.app 固定 4 列 grid（240/40/1fr/280）面板卸载后列残留且 workspace 自动落进第 1 列（240px）；改为给四格显式 grid-column 定位 + data-ui=hidden 时列模板归零（0 0 1fr 0）、data-left=collapsed 时首列归零——workspace 全屏 1470px/折叠 1150px/还原 910px 三态验证+截图确认。

## 项目级多文档（Paper file browser）
- `model/docs.ts` 注册表：`openpaper:docs` 索引 + `openpaper:doc:<id>` 独立存储 + `openpaper:current-doc`；旧 `paper-canvas-doc-v2` 自动迁移为首个文件
- **BOOT_DOC_ID 启动绑定**：persist 只写本实例的文档 —— 修复多 tab 共享 localStorage 时旧 tab 覆盖新文档的竞态（曾致 117 节点文档被 30 节点旧档覆盖）
- FileBrowser overlay（`⌘O` / 点击标题 / 项目菜单「浏览文件…」）：文件网格卡片（画板/图层数/更新时间）+ 当前徽标 + 悬停操作（重命名/复制/删除）
- `⌘N` 新建文件、`createFile/openFile/duplicateFile/deleteFile/renameFile` actions（切换走 reload 保证状态干净）
- `importFileJson()` + `?doc=<path>` URL 种子：JSON → normalizeDoc → 建文件 → replace 重载（store 在种子前完成绑定）
- 文档名动态化：`projectName()` 替代硬编码 'Untitled'（标题栏/标签页标题/API）
- CDP 验证：迁移 ✓ 文件列表 ✓ 复制产生「副本」✓ 种子载入 117 节点 ✓

## 文件浏览器重设计（对齐 Paper Recents 页）
- 整页布局：左侧导航（文件/废纸篓计数）+ 主区（标题/排序/视图切换/操作）
- **真实 SVG 缩略图**：`docThumbnailSvg(doc)` 复用 makeSvg（参数化 docOverride）渲染首页全部画板；3:2 卡片、圆角、当前文件 accent ring+徽标
- Grid/List 视图切换持久化 `openpaper:view-mode`（Paper `finder-view-mode` 对应物）
- **废纸篓软删除**：`trashed` meta 标记 → 废纸篓区恢复/彻底删除（Paper Trash 对应物）；当前文件删除走硬删+回退
- 排序：最近修改 / 名称
- 验证：3 文件全部渲染真实缩略图、视图切换持久化、构建干净

## 批次 5：WebGL shader 填充层（Paper fills-*.js GLSL 移植）
- `model/shaders.ts`：从缓存 Paper fills 包解析出 31 个 GLSL 模板并递归解析 `${Xh}` 插值 → 移植 2 个真实 shader（源码逐字保留）：
  - `mesh-gradient`（Yh）：10 色网格渐变 + u_distortion/u_swirl/u_grainMixer/u_grainOverlay + hash21 值噪声 + getPosition 动画
  - `dot-orbit`（og）：maxBallsCount=20 噪声轨道圆点 + u_noiseTexture（程序化 128² 随机纹理）+ u_colorBack + u_count/u_size
- `canvas/ShaderFill.tsx`：WebGL2 全屏三角形（a_pos → v_objectUV 居中 -0.5..0.5）；每节点 canvas inset-0；uniform 绑定（u_time/u_colors[10]/u_colorBack/u_noiseTexture/参数）；DPR 上限 2；首帧同步渲染（隐藏 tab RAF 不触发）；不 loseContext（StrictMode 重挂载同一 canvas 会永久丢上下文）
- `Fill.type='shader'`：shaderKind/shaderColors[≤10]/shaderBack/shaderParams；fillsToCss 跳过（非 CSS 层）
- 检查器 Fill 类型新增「Shader」→ ShaderFillEditor：shader 选择、色板列表（增删）、背景色（hasBack）、参数数值字段
- `S` 菜单 10 项：4 个 mesh 预设（Grainy sunset/Aurora/Cotton candy/Deep space）+ 2 个 dot-orbit + 4 个 CSS 图案保留
- CDP 验证：mesh 64 色渐变像素 ✓ dot-orbit 深底+彩点 ✓ 检查器 Shader 面板 ✓；修复 RAF 不触发（隐藏 tab）+ loseContext 致命 bug（StrictMode 双挂载同 canvas → 上下文永久丢失，GL 调用全变空操作返回 null infoLog —— 排查路径：canvas 尺寸停留默认 300×150 → RAF 未跑 → visibility:hidden + getError 0x9242 CONTEXT_LOST）
- 其余 29 个 Paper shader（voronoi/liquid-metal/halftone 等）可按同架构增补 —— 提取产物在 /tmp/shaders/*.frag

## 增补：shader 第二批 + 快捷键面板
- **shader 第二批**（Ng/vg/kg 源码逐字）：`grainy-radial`（径向焦距+falloff+distortion+grain）、`spiral-bands`（扭曲色带+噪声）、`sun-rays`（锥形光束+density+blur+fadeIn/Out+u_edges bool uniform1i）；修复 kg 缺 `u_scale` 参数 → `aa=.005/u_scale` 除零全黑。S 菜单 13 项（+Solar flare/Nebula/Sunburst）。CDP 验证三个新 shader 像素 ✓
- **快捷键面板**（Paper hotkey 分组）：重组为 9 个 Paper 类目 Tools/Edit/Selection/Arrange/Alignment/Layout/Panels/View/Text + 搜索框（label/keys 过滤，autofocus）；CDP 验证 9 组渲染 + 过滤实时生效

## 增补：Extract colors（E8 本地可做部分）
- `extractImageColors(nodeId)`：image 解码 → 48² 下采样 → **中位切分（median-cut）量化 5 色** → 图下方生成 64×N「Palette」frame + 5 色块子节点（命名色值）；右键菜单 image 节点新增「Extract colors」
- CDP 验证：4 色测试图 → palette 子节点色值 [#f1fa8c,#1d3557,#2a9d8f,#e63946,#e63946] ✓
- 注：`img.decode()` 在隐藏 tab 挂起 → 改用 onload；动态 import 调试得的是另一模块实例的 stale state，需走真实 UI 路径验证

## 增补：bloom shader + token 全类型 + 视频导出
- **bloom-dots**（hg 源码）：光斑圆点 shader，需 `u_colorBloom` 第二颜色 uniform → ShaderDef.extraColorUniforms 通用机制 + Fill.shaderExtraColors + 检查器颜色字段。shader 共 6 种，S 菜单 14 项
- **token 11 类型补齐**：DesignToken.type 扩展为 Paper 全集（+breakpoint/container 组织型），Theme 面板 11 分组
- **Video 导出**（Paper exportMeta 视频）：`downloadShaderVideo` —— 含 shader 填充的节点 Export 区出现「Export video (3s)」，canvas.captureStream(30fps)+MediaRecorder → MP4（支持时）/WebM 下载

## 官方 @paper-design/shaders 集成（一比一还原）
- **依赖**：`@paper-design/shaders@0.0.82` + `@paper-design/shaders-react@0.0.82`（官方 WebGL shader + React 组件）
- **`model/shaders.ts` 重写**：1109 行手写 GLSL 移植 → 30 个官方组件注册表；`ShaderDef` 携带 id/name/component/presets/defaults/maxColors/hasBack/extraColors/image/animated/params（数值范围取自官方 doc-comment）；`shaderProps(fill)` 将 Fill 映射为组件 props（colors/命名色/参数 bool→enum 转换/sizing keys/fit enum）；`presetFill(def, preset)` 官方预设 → Fill；`presetMatch` 反向识别当前预设
- **旧数据迁移**：`LEGACY_KINDS` 映射 bloom-dots→god-rays、grainy-radial→static-radial-gradient、spiral-bands→swirl、sun-rays→color-panels；`u_` 前缀参数自动去前缀（`migrateShaderFill`，挂在 `normalizeDoc` 后）
- **`canvas/ShaderFill.tsx`**：直接渲染官方组件（`className="shader-fill"` + 官方注入样式）；image 类 shader（image-dithering/paper-texture/fluted-glass/lens-distortion/liquid-metal/water/heatmap）用内置程序化示例图兜底
- **检查器**：Shader 下拉 30 项、Preset 下拉（124 预设 + Custom 识别）、色板按 maxColors 限长、命名色字段、参数按 bool/enum/number 分列、Speed（仅 animated）
- **S 菜单 34 项**：30 个官方 shader（各用其默认预设）+ 4 个 CSS 图案预设（改名标注 pattern）；菜单容器加 max-height 滚动
- 验证：build ✓；Mesh gradient/Gem smoke 真实 Paper GLSL 渲染 ✓；导出选择器兼容 `.shader-fill canvas` ✓

## UI/UX 一比一对齐 Paper.design（编辑器外观）

- **顶部 chrome**：右侧栏首行改为 Paper 布局——头像堆（灰圆 + 蓝色 ⊕ 加人）、缩放百分比、`Copy link ⌘L` 全宽按钮；页面无选中态同样显示。
- **面板分区**：Fill 卡改为类型下拉（Solid / Linear / Radial / Conic / Image / Pattern / Shader）；描边分区更名 Outline，原 Outline 更名 Outline offset，与 Paper 术语一致。
- **左侧栏**：当前页面行加 ✓ 标记（Paper Pages 树样式）。
- **细节 token**：`--color-chip`、`--shadow-control`/`--shadow-toggle`（Paper 精确的 inset+offset 复合阴影）、`corner-shape: superellipse(1.3)`（Chrome squircle）应用到 chip/控件/色板/Copy link。
- **工具栏**：浮动白色胶囊工具栏（此前已完成，与 Paper 一致）。

参照素材：app.paper.design 公开 CSS（`/assets/styles-*.css`）中的真实 token 值 + 官网 mockup 截图。

## Paper 真实资源提取续批（光标全集 + 控件样式）

- 从 app.paper.design 样式表补齐全部 32 个 `--cursor-*` webp 光标（此前只有 14 个）；接入：pen/text/comment/zoom(⌥=缩小) 工具光标、Alt 悬停/拖动 duplicate、Shift 轴锁 arrow-x/y、面板分隔条 resize-col/row。
- 数字字段 label 拖动调值（Paper scrub 手势 + cursor-scrubbing）：拖 label 左右滑改数，Shift=大步长，松开一次性提交（单撤销步）。
- Checkbox 换成 Paper `.checkbox-root` 样式：16px 控件块、`--shadow-checkbox` 真实复合阴影、superellipse 角、选中蓝色+白色对勾；`switch` 滑块样式按 Paper `.switch-root` 就绪备用。

## Shader 缩略图选择器 + 控件样式 1:1

- 从 shaders.paper.design 提取全部 30 种 shader 的官方预览图 → `public/shader-thumbs/<id>.webp`。
- Inspector shader 行改为缩略图 chip（图+名+⌄），点击弹出 3 列缩略图网格（`menu-popup` 容器），当前项高亮；点外部关闭（`popup-overlay`）。
- 验证：`?doc=` 种子文档 → 选中节点 → 打开网格 → 切 Swirl，参数面板同步。

## Per-fill opacity（填充行透明度）

- `Fill.opacity`（0–1）：CSS 侧在 `fillToCss` 内用 `color-mix` 折进 solid/gradient/pattern 颜色；shader 填充走元素 `opacity`；SVG 导出输出 `fill-opacity`。
- Inspector 每个填充行新增 Opacity 数值字段（0–100，可 scrub）。
- 已知差异：image 填充的透明度在纯 CSS background 层无法折叠，暂不生效（Paper 用图层合成实现）。

## 色值字段多格式输入

- `normalizeCssColor`：ColorField 失焦时接受任意 CSS 色值（`oklch()`/`hsl()`/`rgb()`/色名/3–8 位 hex），经 canvas 解析规范化为 hex（含 alpha 后缀）；非法输入保留原样。

## 字体选择器 + Google Fonts

- `model/fonts.ts`：52 项字体目录（系统字体 + 38 款 Google Fonts），`ensureFontLoaded` 按需注入 css2 样式表（全字重+斜体）。
- Inspector 字体行改为缩略 chip → 弹层列表，每项以自身字体渲染（Paper `popup-list-item-font-preview`）；打开时预载全部目录字体，选中即提交。
- 已有文档里的任意 fontFamily 值仍会原样渲染（未匹配项自动走 Google 加载尝试）。

## ⌘G Group selection 补齐

- 快捷键面板一直宣传 `⌘G / ⇧⌘G`，但只有 ⇧⌘G(ungroup) 有处理器；补 `mod+g` → `frameSelection()`（Paper ⌘G 将选中项成组为 frame）。
- 节点右键菜单在 Frame selection 前新增 `Group selection ⌘G` 项。
- 核对其他宣传键位（⌘⇧' 像素吸附、⌥⇧C 评论、0–9 透明度 chord、⇧⌘A 反向兄弟选择、PageUp/Down 翻页、⌥⇧⌘R/F hug/fill）均已有处理器。
