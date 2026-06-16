# Browser Workspace Plan

## 1. Background

Novayxk 目前已经具备这些能力：

- 本地桌面容器：Electron
- 项目工作区：文件树、编辑器、终端任务
- AI 协作：模型调用、流式输出、命令执行、文件操作
- 本地权限能力：主进程、IPC、管理员模式、日志系统

下一步希望扩展一块新的“浏览器工作区”能力，让 Novayxk 不只面向代码仓库和终端，也能面向真实网页和 Web 应用进行观察、记录、辅助操作和自动化执行。

这个能力的目标不是单纯做一个网页容器，而是做一个：

- 可内嵌浏览网页
- 可记录用户操作
- 可观察页面网络/API 请求
- 可由 AI 和用户共同操作
- 可为脚本、自动化、站点任务提供运行上下文

的 Browser Workspace。

---

## 2. Product Goal

为 Novayxk 增加一个内嵌浏览器工作区，使其能够：

1. 打开和浏览任意网页
2. 允许用户直接点击、输入、滚动和导航
3. 记录用户的关键页面操作
4. 观察页面发出的网络请求和接口调用
5. 允许 AI 在明确边界下辅助完成页面操作
6. 为未来的网站脚本、流程录制、自动化任务、调试与数据采集提供基础设施

---

## 3. Core Use Cases

### 3.1 用户手动浏览 + AI 旁观分析

例子：

- 用户在内嵌浏览器里打开一个后台系统
- 用户自己点击页面
- Novayxk 记录页面结构变化、关键操作和网络请求
- AI 根据这些上下文解释接口关系、定位前端行为、分析站点逻辑

### 3.2 页面自动化辅助

例子：

- 用户要求 AI 打开某个页面
- AI 自动点击某个按钮、填写表单、等待结果
- AI 观察页面 DOM 和网络请求，判断当前步骤是否成功

### 3.3 网站脚本开发与调试

例子：

- 用户编写一个站点脚本
- 在 Browser Workspace 中注入执行
- 查看脚本日志、DOM 变化、网络请求效果
- 快速调试脚本逻辑

### 3.4 流程录制与回放

例子：

- 用户手动完成一遍站点操作
- 系统记录点击、输入、等待和导航步骤
- 后续生成“可回放流程”或“AI 可复用动作”

### 3.5 Web API 观察与逆向辅助

例子：

- 用户打开一个 Web 应用
- 系统观察请求 URL、Method、Status、Timing
- 用户查看接口序列、触发条件和返回结构

说明：

这里说的“逆向辅助”仅指页面行为分析、接口调试、脚本开发和自动化场景，不应默认朝绕过站点风控、验证码、权限控制的方向演进。

---

## 4. Non-Goals

第一阶段不做这些事情：

1. 不做完整的多标签浏览器替代品
2. 不做默认的全站敏感数据抓取
3. 不做默认的 Cookie/Token/密码采集器
4. 不做“绕过风控”“破解验证”“自动登录盗号”类能力
5. 不做移动端设备仿真平台
6. 不做通用爬虫云平台

---

## 5. Functional Scope

### 5.1 浏览器基础能力

- 地址栏输入 URL
- 前进、后退、刷新、停止加载
- 显示当前页面标题和 URL
- 显示加载状态
- 显示当前页面是否可注入脚本、是否启用观察

### 5.2 页面操作记录

记录这些高价值事件：

- 点击
- 双击
- 表单输入
- 选择框变化
- 提交事件
- 页面跳转
- 历史路由变化
- 滚动

记录内容建议包括：

- 时间戳
- 页面 URL
- 事件类型
- 目标元素描述
- 目标元素 selector 候选
- 可见文本摘要

### 5.3 网络/API 观察

观察这些信息：

- 请求 URL
- HTTP Method
- Status Code
- 发起时间与耗时
- Resource Type
- Request Headers 的安全子集
- Response Headers 的安全子集

在用户明确授权时可进一步支持：

- Request Body 预览
- Response Body 预览
- HAR 导出

### 5.4 AI 辅助操作

定义一组浏览器动作：

- `open(url)`
- `reload()`
- `goBack()`
- `goForward()`
- `click(selector)`
- `type(selector, text)`
- `select(selector, value)`
- `scroll(x, y)`
- `waitFor(selector)`
- `runScript(js)`
- `captureDom()`
- `captureNetwork()`

### 5.5 脚本能力

支持用户或 AI：

- 注入页面脚本
- 获取脚本执行结果
- 查看 `console.log`
- 捕获脚本异常
- 保存脚本草稿

### 5.6 会话隔离

建议支持：

- 独立 session
- 可选持久化 session
- 可清理缓存、Cookie、Storage
- 域名级权限开关

---

## 6. High-Level Architecture

推荐分成五层。

### 6.1 UI Layer

前端 React 界面新增 Browser Workspace 区域：

- 浏览器容器
- 地址栏与导航栏
- 网络面板
- 操作记录面板
- 脚本面板
- 权限与安全状态提示

### 6.2 Browser Host Layer

Electron 主进程负责：

- 创建浏览器视图
- 管理 `webContents`
- 管理 session
- 生命周期控制
- 安全策略控制

建议优先评估：

- `WebContentsView`
- 或 Electron 当前稳定方案中的 `BrowserView`

### 6.3 Instrumentation Layer

通过 preload 注入页面观察逻辑：

- DOM 事件监听
- `MutationObserver`
- `history.pushState` / `replaceState` 包装
- `console` 消息桥接
- 页面内脚本执行桥接

### 6.4 Network Observation Layer

推荐两级能力：

#### 基础级

用 `session.webRequest` 获取：

- 请求开始
- 请求完成
- 重定向
- 错误

#### 高级级

用 `webContents.debugger` 接 DevTools Protocol：

- `Network.requestWillBeSent`
- `Network.responseReceived`
- `Network.loadingFinished`
- `Runtime.consoleAPICalled`
- `Page` / `DOM` 部分事件

高级级更强，但也更复杂，适合作为二阶段增强。

### 6.5 Automation Layer

由主进程统一调度浏览器动作：

- 执行点击/输入/脚本
- 统一超时与重试
- 统一错误返回
- 统一权限校验

---

## 7. Security and Privacy Model

这是这个功能最重要的部分。

### 7.1 默认原则

默认应当：

- 不自动开启所有页面观察
- 不默认记录密码字段
- 不默认保存响应体
- 不默认导出 Cookie、localStorage、sessionStorage
- 不默认让 AI 自动操作敏感站点

### 7.2 敏感信息保护

应屏蔽或降权处理：

- `input[type=password]`
- Cookie
- Authorization Header
- Token 类字段
- 支付页面信息
- 银行/邮箱/身份认证类站点

### 7.3 域名权限模型

建议做域名级权限：

- 允许观察操作
- 允许观察网络元数据
- 允许读取响应体
- 允许 AI 自动点击
- 允许注入脚本
- 允许持久化 session

### 7.4 显式提示

用户必须清楚知道：

- 当前页面是否正在被观察
- 当前页面是否允许 AI 自动操作
- 当前是否记录网络请求
- 当前是否允许脚本注入

### 7.5 风险边界

明确禁止默认支持这些场景：

- 绕过验证码
- 模拟盗号或撞库
- 窃取站点敏感凭据
- 大规模静默抓取个人数据
- 在未授权站点上偷偷记录全部操作

---

## 8. Recommended Implementation Phases

## Phase 0: Technical Spike

目标：

- 验证 Electron 中嵌浏览器视图的实现方式
- 验证页面 preload 注入
- 验证事件采集和网络观察最小链路

输出：

- 一个独立实验分支
- 能打开 URL
- 能看到点击日志
- 能看到请求列表

验收：

- 打开 `https://example.com`
- 点击页面元素
- 面板中出现操作记录
- 网络面板中出现请求记录

## Phase 1: MVP Browser Workspace

目标：

- 把浏览器工作区正式接入主产品
- 先支持“用户操作 + 系统观察”，暂不默认开放 AI 自动执行

范围：

- 浏览器面板
- 地址栏
- 导航控制
- 页面加载状态
- 点击/输入/跳转记录
- 基础请求列表

验收：

- 用户可在应用内浏览网页
- 可见操作记录
- 可见请求列表
- 页面崩溃或加载失败时有清晰错误反馈

## Phase 2: AI Assisted Browser Actions

目标：

- 让 AI 在明确授权下执行基础浏览器动作

范围：

- `open`
- `click`
- `type`
- `scroll`
- `waitFor`
- 截图或 DOM 摘要

验收：

- AI 能完成简单页面导航
- AI 动作可在 UI 中回显
- 每步动作有日志和失败原因

## Phase 3: Script and Automation Workspace

目标：

- 支持页面脚本与站点自动化

范围：

- 脚本编辑与执行
- 控制台输出
- 错误捕获
- 步骤录制与回放
- 流程保存

验收：

- 用户可以注入一段脚本并查看结果
- 用户可以回放一段录制流程

## Phase 4: Advanced Observation

目标：

- 增强网络与运行时观察能力

范围：

- DevTools Protocol 接入
- 更完整的请求/响应事件
- 可选响应体观察
- HAR 导出
- 控制台、异常和性能指标增强

验收：

- 对复杂 SPA 的接口时序观察更稳定
- 能导出可分析的网络记录

---

## 9. Data Model Proposal

### 9.1 Browser Session

```ts
type BrowserSession = {
  id: string;
  name: string;
  startUrl: string;
  currentUrl: string;
  title: string;
  persistProfile: boolean;
  permissions: BrowserPermissionSet;
  createdAt: string;
  updatedAt: string;
};
```

### 9.2 Browser Permission Set

```ts
type BrowserPermissionSet = {
  observeUserActions: boolean;
  observeNetworkMeta: boolean;
  observeResponseBody: boolean;
  allowAiActions: boolean;
  allowScriptInjection: boolean;
  persistStorage: boolean;
};
```

### 9.3 Browser Action Record

```ts
type BrowserActionRecord = {
  id: string;
  sessionId: string;
  source: "user" | "ai" | "system";
  action: "click" | "input" | "navigate" | "scroll" | "submit" | "script";
  url: string;
  selector?: string;
  textPreview?: string;
  createdAt: string;
};
```

### 9.4 Network Record

```ts
type BrowserNetworkRecord = {
  id: string;
  sessionId: string;
  url: string;
  method: string;
  statusCode?: number;
  resourceType?: string;
  durationMs?: number;
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
  requestBodyPreview?: string;
  responseBodyPreview?: string;
  createdAt: string;
};
```

---

## 10. IPC Surface Proposal

建议新增一组独立 IPC，而不是把浏览器逻辑混进现有 project / ai / memory IPC 中。

### 10.1 Session Control

- `browser:createSession`
- `browser:closeSession`
- `browser:listSessions`
- `browser:setActiveSession`

### 10.2 Navigation

- `browser:openUrl`
- `browser:reload`
- `browser:goBack`
- `browser:goForward`

### 10.3 Observation

- `browser:getActionLog`
- `browser:getNetworkLog`
- `browser:clearLogs`

### 10.4 Automation

- `browser:runAction`
- `browser:runScript`
- `browser:captureDom`
- `browser:captureScreenshot`

### 10.5 Renderer Subscriptions

- `browser:pageEvent`
- `browser:networkEvent`
- `browser:consoleEvent`
- `browser:actionEvent`

---

## 11. Suggested UI Layout

推荐两种方案，优先选方案 A。

### 方案 A：作为新主面板

- 左侧：项目树
- 中间：编辑器 / 浏览器可切换
- 右侧：AI 助手
- 底部：终端 / 网络 / 操作日志

优点：

- 和现在的工作区结构兼容
- 用户认知负担小

### 方案 B：独立 Browser Workspace 模式

- 顶部：导航栏
- 中间：网页
- 右侧：AI 和脚本
- 底部：网络与操作日志

优点：

- 浏览器任务更沉浸

建议：

先做方案 A，保守接入，后续再考虑模式切换。

---

## 12. Technical Risks

### 12.1 Electron 浏览器承载复杂度

风险：

- 嵌入浏览器视图和 React 布局同步复杂
- 多 session 生命周期管理麻烦

应对：

- 第一阶段只做单 session
- 先不做多 tab

### 12.2 站点兼容性

风险：

- 某些站点 CSP 严格
- 某些站点 iframe 很重
- 某些站点会检测自动化

应对：

- 第一阶段只承诺基础浏览和观察
- 自动化场景逐步灰度

### 12.3 数据量膨胀

风险：

- 网络日志和操作日志很快变大
- 响应体会严重占用内存

应对：

- 先只保留固定长度环形缓存
- 响应体预览默认关闭

### 12.4 隐私与合规风险

风险：

- 记录了用户不想记录的信息
- 误采集密码、Token、Cookie

应对：

- 默认脱敏
- 默认最小记录
- 明显 UI 提示
- 关键权限显式开启

---

## 13. Engineering Recommendations

1. 浏览器能力单独建模块，不要塞进现有 `project` 或 `terminal` 逻辑里
2. 先做单 session、单页面，不要一开始就做多标签
3. 先实现“用户操作 + 观察”，后实现“AI 自动操作”
4. 网络观察先做 metadata，再做 body
5. 对敏感字段一开始就做统一脱敏工具
6. 为所有浏览器动作和观察事件打结构化日志
7. 浏览器 IPC 和权限模型从第一天就单独设计

---

## 14. MVP Definition

一个合格的第一版 MVP，至少应满足：

- 应用内可打开网页
- 可前进后退刷新
- 可记录点击和输入
- 可看到请求列表
- 页面错误和加载状态可见
- 不记录密码字段
- 不默认开放 AI 自动操作
- 不默认记录响应体

---

## 15. Future Extensions

后续可扩展能力：

- 录制用户站点流程并生成自动化脚本
- 为特定域名保存脚本模板
- 将页面操作转换为 AI 可编辑动作序列
- DOM 结构快照对比
- 网络请求断点与过滤器
- 页面元素检查器
- 自动表单填写助手
- 截图与视觉理解辅助

---

## 16. Suggested Immediate Next Steps

建议按这个顺序推进：

1. 先做一个技术 Spike，验证 Electron 中嵌浏览器 + preload 事件桥 + `session.webRequest`
2. 在主界面中预留 Browser Workspace 面板位置
3. 先接入地址栏、导航和页面加载
4. 再接入点击/输入记录
5. 再接入网络请求列表
6. 最后再讨论 AI 自动点击和脚本注入权限

---

## 17. Final Recommendation

这个方向值得做，而且和 Novayxk 的产品路线是相符的。

如果你想把 Novayxk 从“本地 AI 代码工作台”扩展成“本地 AI 行动工作台”，Browser Workspace 会是一个非常关键的能力节点。它会把你的产品能力从：

- 文件
- 终端
- 模型

扩展到：

- 页面
- 用户交互
- 网络行为
- 站点自动化

但一定要记住，这个能力的上限非常高，所以第一版必须把安全边界和权限模型先钉牢，再去追求更大胆的自动化能力。
