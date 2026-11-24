# MissionHub 娘 · 桌面宠物套件（Desktop Pets）

面向各类 **Agent 桌面端**（Electron、Tauri、WebView、VS Code Pets、Shimeji、macOS / Windows 原生桌面端）打造的独立全身 Q 版 MissionHub 娘宠物资产与零依赖运行库，遵循 [Apache License 2.0](../../../LICENSE)。

## 预制透明动图预览（`animations/` · 256×256 · GIF89a）

| 待机眨眼 (`idle.gif`) | 四帧漫步 (`walk.gif`) | 欢呼摸头 (`happy.gif`) | 三段挥剑 (`strike.gif`) |
| :---: | :---: | :---: | :---: |
| <img src="animations/idle.gif" width="124" alt="待机眨眼"> | <img src="animations/walk.gif" width="124" alt="四帧漫步"> | <img src="animations/happy.gif" width="124" alt="欢呼摸头"> | <img src="animations/strike.gif" width="124" alt="三段挥剑"> |

| 四段跳跃 (`jump.gif`) | 悬空踢腿 (`dangling.gif`) | 跪坐打盹 (`sleep.gif`) |
| :---: | :---: | :---: |
| <img src="animations/jump.gif" width="124" alt="四段跳跃"> | <img src="animations/dangling.gif" width="124" alt="悬空踢腿"> | <img src="animations/sleep.gif" width="124" alt="跪坐打盹"> |

## 目录结构

| 路径 | 规格与用途 |
| --- | --- |
| [`pet.json`](pet.json) | 标准化桌面宠物元数据（图集坐标、20 帧清单、7 组动画时长与 Agent 状态映射） |
| [`atlas/pet-sprites.webp`](atlas/pet-sprites.webp) | 5×4 单文件透明 WebP 精灵图集（`1280 × 1024 px`，每帧 `256 × 256 px`，单次加载无闪烁） |
| [`frames/`](frames/) | 20 张独立 `256 × 256 px` 透明 PNG 单帧（`01-idle.png` 至 `20-sleep2.png`），便于原生端或 Shimeji 直接读取 |
| [`animations/`](animations/) | 7 组独立 `256 × 256 px` 透明底循环 GIF，适合 VS Code Pets 与零脚本 `<img>` 挂件直接导入 |
| [`runtime/missionhub-pet.mjs`](runtime/missionhub-pet.mjs) | 零依赖 ES Module 交互运行时，内置 60 FPS 画布渲染、物理重力、摸头/拖拽交互与 Agent 状态 API |
| [`runtime/preview.html`](runtime/preview.html) | 本地交互预览页（在仓库根目录执行 `python3 -m http.server 8080` 后访问） |

## Agent 状态映射规范

`pet.json` 与 `runtime/missionhub-pet.mjs` 统一定义了 8 种 Agent 生命周期状态，桌面端宿主直接将当前会话状态传入 `pet.setAgentState(state)` 即可联动：

| Agent 状态 | 对应动作序列 | 适用时机 |
| --- | --- | --- |
| `idle` | `idle` ↔ `idle_blink` + 偶发自主漫步 | 空闲待命 |
| `thinking` | `curious`（歪头思考 + 轻缓眨眼） | 模型推理或规划中 |
| `working` | `walk1 → walk_pass1 → walk2 → walk_pass2` | 正在执行代码编辑、构建或测试 |
| `tool_call` | `swing_windup → swing → swing_follow` | 调用工具、命令或脚本 |
| `success` | `crouch → jump → fall → crouch → happy` | 任务或测试全部完成 |
| `error` | `dangling` 惊跳 → `swing` 持剑反击 | 工具报错或构建失败 |
| `waiting` | `idle_wave` ↔ `idle` 挥手提醒 | 等待用户确认或回复 |
| `sleeping` | `sleep` ↔ `sleep2` 跪坐呼吸 + `z` / `Z` | 会话暂停或长时间无操作 |

## 快速集成

### 1. Electron / Tauri / WebView / 浏览器端

```js
import { createMissionHubPet } from './runtime/missionhub-pet.mjs';

const pet = createMissionHubPet(document.body, {
  atlasUrl: './atlas/pet-sprites.webp',
  size: 132,
  floorOffset: 24,
});

// 随 Agent 状态实时联动
pet.setAgentState('thinking');
pet.setAgentState('tool_call');
pet.setAgentState('success');

// 卸载组件时清理事件监听
// pet.destroy();
```

### 2. VS Code Pets / 轻量图片挂件

直接使用 [`animations/`](animations/) 中的 7 组透明 GIF（`idle.gif`、`walk.gif`、`happy.gif`、`strike.gif`、`jump.gif`、`dangling.gif`、`sleep.gif`），无需额外脚本即可作为透明桌面角色展示。

### 3. macOS（SwiftUI / AppKit）/ Windows（WinUI / WPF）/ Qt / Shimeji

解析 [`pet.json`](pet.json) 读取 `frames/` 下的 20 张 `256 × 256 px` 透明 PNG（脚底基线已统一对齐至 `y = 0.977`），或直接按 `5 × 4` 网格裁切 [`atlas/pet-sprites.webp`](atlas/pet-sprites.webp)。
