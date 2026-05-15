已创建 BabelTower 的 Upload & Parse 页面设计，文件位于 `ui-design/pencil/upload-parse.pen`。

## 页面结构

**左侧导航栏** (240px, #1E293B 深色背景)
- BabelTower 品牌标识区域
- 5个导航项：Upload & Parse (当前激活，蓝色左边框)、Conflict Handling、Dictionary Search、Task Snapshots、Export Config
- 底部用户区域（头像缩写 "ZG" + 名称 "赵刚"）

**顶部栏**
- 页面标题 "Upload & Parse" (20px, font-weight 600)
- 语言对选择器 "zh-CN → en-US" (带边框的 pill 样式)

**主内容区 - 两部分**

**第一部分：File Upload**
- 拖拽上传区域：虚线边框、cloud-upload 图标、提示文字、支持格式列表 (.json .yaml .csv .po .xliff，使用 JetBrains Mono 字体)
- Recent Uploads 表格：4列 (File Name, Language, Entries, Status, Time)，3条示例数据记录，带绿色/橙色状态圆点徽章

**第二部分：Pipeline Status**
- 5步水平进度条：Input (绿色完成) → Parser (蓝色进行中) → Standard JSON (灰色待处理) → Conflict Check (灰色待处理) → Database (灰色待处理)，箭头连接
- Parse Results Preview 卡片：标题栏 + 4条键值对预览 (如 `app.greeting → 你好 / Hello`，key 使用蓝色等宽字体)

## 设计规范
- 主色调：#2563EB
- 字体：Inter (UI)、JetBrains Mono (代码/翻译键)
- 背景：#FFFFFF 主内容区，#F8FAFC 次要背景
- 边框：#E2E8F0
- 已设置为设计变量，便于后续统一调整
