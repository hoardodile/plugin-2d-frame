# 导出数据格式（消费端契约）

本插件读取的是**已导出的角色数据**。所有字段名都是发布接口：改动它们要同时改本仓库的
`src/boundary/schema.ts`、`src/kernel/types.ts` 和这一份文档。

- 编码：UTF-8，JSON，**紧凑分隔符**（无多余空白）
- 路径：文档内所有相对路径都相对**该文档所在目录**，只用 `/`，不用 `..`、不用绝对路径
- 未知字段：解码时忽略（消费者不因为多一个字段而失败）

## 1. 目录布局

```
<export root>/
  catalog.json                  # 合集索引（可选）
  characters/
    catalog.json                # 精简合集索引（只含角色目录）
    <id>/
      character.json            # 必需：这个角色的全部渲染数据
      atlas/*.png               # 图集页
      audio/*.ogg               # 该角色引用到的音频
      audio-map.json            # 事件路径 -> 音频文件
      cover.png                 # 卡片封面（可选）
```

`characters/<id>/` 是**自包含**的：把整个目录拷到别处（或删掉其它角色）后仍然可用，
`audio/` 与 `audio-map.json` 都在里面。

识别规则：

- 目录（或资源）根含 `catalog.json` → **合集**；
- 根含 `character.json` → **单个角色**；
- 否则 → 不匹配。

`characters/<id>/character.json` 这种嵌套位置也算单个角色，此时 `detect` 会把
`characters/` 与 `/character.json` 之间的部分当作 `id`。

## 2. `character.json`

```jsonc
{
  "schemaVersion": 1,
  "id": "test0001",
  "name": "…",                  // 显示名，未知时 null
  "sourceGroup": "…",           // 导出端的分组标签（原样显示，不解释）
  "sourceBundle": "…",          // 导出端的数据来源标识（原样显示，不解释）
  "sourceFormat": {             // 可选：payload 是什么，而不是谁产生的
    "container": "asset-bundle",
    "version": 8
  },
  "atlases": [
    { "file": "atlas/page0.png", "width": 1024, "height": 1024 }
  ],
  "sprites": [ /* 见 2.1 */ ],
  "clips": [ /* 见 2.2 */ ],
  "sounds": [ /* 见 2.3 */ ],
  "voices": [ /* 见 2.4，可选 */ ],
  "points": [{ "name": "layer0", "position": [0, 0, 0] }],
  "layers": [
    { "name": "layer0", "sortingOrder": 0, "sortingLayer": 0, "z": 0 }
  ],
  "audio": { "events": 12, "resolved": 12, "unresolved": 0 },
  "stats": {
    "sprites": 150, "clips": 75, "soundEvents": 12, "maxClipMs": 3100
  }
}
```

> 本文档里的 id、名称、计数**全是编的**：示例不得出现任何真实导出里的标识符。

- `atlases[].file` 是**图集页文件相对本目录的路径**（`atlas/page0.png`）。
- `points[].position` 是图层锚点在世界空间的位置；`layers[].z` 是它的 z。
  绘制顺序由 `layers[].sortingOrder` / `sortingLayer` 决定。
- `audio.events` 必须等于 `sounds` 与 `voices` 里出现的**去重事件路径数**，
  且 `events == resolved + unresolved`。
- `stats` 是冗余摘要，供 `sourceMeta` 不读整份文档就能显示。

### 2.1 `sprites[]`

```jsonc
{
  "name": "body_idle_0000",
  "atlas": "atlas/page0.png",       // 与 atlases[].file 对应
  "rect": [x, y, width, height],    // 像素，原点在图集页**左下角**
  "pivot": [px, py],                // 归一化，相对 rect 左下角；允许落在 rect 之外
  "pixelsToUnit": 100               // 图素 -> 世界单位
}
```

- 图集页在导出时已经**去掉邻接碎图并重新打包**，因此同一页内任意两个
  `rect` 都**不重叠**，渲染就是一次普通矩形贴图：**没有** mesh / 掩码 / 裁切字段。
- `rect` 的 y 轴原点在左下角，canvas 是左上角，因此绘制时要翻一次
  （`atlasSource`）。
- `pivot` 是绘制锚点：把 `pivot` 位置对齐到图层的位置，其余部分按 `pixelsToUnit`
  × 图层缩放摆放（`quadFor`）。

### 2.2 `clips[]`

```jsonc
{
  "name": "idle_loop",
  "group": "idle",              // idle|move|attack|skill|damage|state|other
  "sampleRate": 30,             // 帧率
  "frameCount": 50,
  "durationMs": 1666.67,
  "tracks": [ /* 见下 */ ],
  "constants": {
    "layer0": { "position": [0,0,0], "scale": [1,1,1], "euler": [0,0,0] }
  }
}
```

- **`group` 由导出端写入**，取值就是上表七个。前端只读不猜：clip 的命名约定属于导出端。
  旧文档没有这个字段时按 `other` 处理。
- 时间是毫秒，`durationMs` 是整段时长（循环回绕以它为准）。
- `constants[layer]` 是**整段恒定**的图层变换；出现过的分量不必在 tracks 里重复。
- `tracks[]` 有两种，按 `kind` 判别：

```jsonc
// 精灵换帧曲线：kind 恒为 "sprite"
{ "layer": "layer0", "kind": "sprite", "keys": [[0, "spriteName"], [33.33, null]] }

// 数值曲线：kind 是 "position" | "scale" | "euler" | "rotation" | "attribute<哈希>"
{ "layer": "layer0", "kind": "position", "curves": [[[0,0],[16,10]], [[0,0]], [[0,0]]] }
```

- `keys` 是 `[timeMs, spriteName | null]`：**null 表示这一帧该层不绘制**。
- `curves` 是**每个分量一条**（x/y/z）；`rotation` 是四元数（4 条）。
- `attribute<哈希>` 是引擎把脚本字段哈希出来的绑定：保留在文档里但**不参与绘制**。
  消费者应接受任意 `kind` 字符串并按"不绘制"处理未知值。
- 采样语义：sprite 曲线**阶梯式**（一个 key 保持到下一个 key），
  数值曲线保持最近一个键值。首帧是 `t=0`。

### 2.5 版本 2：逐帧仿射变换与样式

消费者接受 `schemaVersion: 1` 和 `2`；版本 1 保持既有变换行为。
`clips[].displayScale` 是可选的整段动作建议显示比例，必须为有限数且 `0 < 值 <= 1`，
缺省为 `1`。它只影响最终画布尺寸和绘制倍率，不修改图集、图层变换、动作时长或声音帧号。
例如 `0.8` 将整帧（包括各层之间的位移）按 80% 显示。
播放器的“缩小显示”选项默认开启，关闭时按 `1` 显示；没有此字段的旧文档保持原尺寸。
倍率在一段动作内固定，不随播放帧变化。检视面板继续显示原始坐标与变换数值。

版本 2 在数值轨道的 `kind` 中增加以下通用语义，所有分量沿用
`curves: [[[timeMs, value], ...], ...]`，按键值保持采样：

| kind | 分量 | 含义 |
| --- | --- | --- |
| `matrix` | 6 | `[a,b,c,d,tx,ty]`，世界坐标中 `x'=a*x+c*y+tx`、`y'=b*x+d*y+ty` |
| `opacity` | 1 | 不透明度，默认 1，绘制时限制在 0 到 1 |
| `color` | 3 | RGB 乘色，默认 `[1,1,1]`，绘制时逐分量限制在 0 到 1 |
| `order` | 1 | 绘制顺序，较大值在后绘制；缺省时使用静态图层顺序 |

矩阵已包含父节点变换；存在时替代同图层的 position/scale/euler，
保留镜像和剪切。位移使用世界单位，精灵自身的像素大小仍通过
`pixelsToUnit` 换算。透明度为零、空精灵或奇异矩阵的图层不绘制。
矩阵与颜色等轨道必须包含表中规定数量的分量，数值必须有限。
检视面板中的位置、缩放、旋转为矩阵的摘要；完整矩阵保留剪切信息。

音频映射仍为单个事件到普通文件的映射，支持 WAV。
`match: "metadata-preview"` 表示导出端已将多段事件合成为一次离线试听；
随机分支及循环试听约定由导出工具记录，播放器不推测原事件图。

### 2.3 `sounds[]`

```jsonc
{
  "name": "attack_slash",
  "frames": [
    { "frame": 1, "events": ["event:/sfx/demo/hit_01"] },
    { "frame": 3, "events": ["event:/sfx/demo/hit_02", "event:/sfx/demo/voice_01"], "volumes": [0.5, 1] }
  ]
}
```

- `frame` 是**帧号**（不是毫秒），换算用 `clip.sampleRate`。
- `volumes` 与 `events` **下标对齐**；导出端在整帧音量都为 1.0 时省略整个字段。
- 消费者无增益级时按 `min(1, max(0, volume))` 钳制，但必须**保留**原始值用于显示。

### 2.4 `voices[]`（可选）

```jsonc
[
  { "name": "voice_a", "slot": 0, "event": "event:/sfx/demo/voice_a" },
  { "name": "voice_b", "slot": 1, "event": "event:/sfx/demo/voice_b" }
]
```

- **角色级的音效事件**，和 `sounds[]` 的区别是**没有帧号**：源数据只说"这个角色拥有这些
  事件"，没有说哪个动作的第几帧播它。所以消费端把它们当**试听列表**呈现，
  **不得**把它们排进任何 clip 的时间轴。
- `slot` 是源数据里该事件的槽位序号，仅用于显示顺序，不参与播放逻辑。
- 缺省（老导出、或源数据没有语音的角色）即没有这个键；消费者按"没有语音"处理。
- 事件解析仍走 `audio-map.json`：`event` 到 `file` 的映射与 `sounds[]` 共用同一张表。

## 3. `audio-map.json`

```jsonc
[
  { "event": "event:/sfx/demo/hit_01", "file": "audio/hit_01.ogg", "match": "metadata" },
  { "event": "event:/sfx/demo/hit_99", "file": null, "match": "unresolved" }
]
```

- 与 `character.json` 的 `sounds[].frames[].events` **以及 `voices[].event`** 的并集
  **集合相等**（不要求顺序）。
- `file` 为 `null` 表示该事件没有解析到样本，`match` 恒为 `unresolved`；
  否则 `file` 指向本目录内一个**存在且非空**的文件。
- `match` 是命中来源的标签（`metadata` / `name` / `override`），消费者只显示不解释。

## 4. `catalog.json`

```jsonc
{
  "schemaVersion": 1,
  "counts": {
    "characters": 3,
    "portraits": 1,               // 同一棵树里附带、本插件不解析的其它 rig 数量
    "charactersWithAudio": 2,
    "audioEvents": 12,
    "bytes": 1048576
  },
  "characters": [
    {
      "id": "test0001",
      "name": null,
      "directory": "characters/test0001",   // 相对**本 catalog 所在目录**
      "sourceGroup": "…",
      "sprites": 150, "clips": 75, "soundEvents": 12, "maxClipMs": 3100,
      "audio": { "events": 12, "resolved": 12, "unresolved": 0 },
      "bytes": 524288,
      "hasCover": true
    }
  ]
}
```

- `counts.characters` 必须等于 `characters` 数组长度。
- `directory` 是**相对本 catalog 文件所在目录**的路径，因此同一份合集内容在导出根
  （`characters/<id>`）和 `characters/` 里的精简 catalog（`<id>`）都能用。
- 插件只读 `counts.characters` 与 `counts.portraits`；其余字段留给其它消费方。

## 5. 覆盖率与容错

| 情况 | 期望行为 |
| --- | --- |
| `clip.group` 缺失或不在七个取值内 | 归入 `other` |
| `sounds[].frames[].volumes` 缺失 | 该帧音量全为 1.0 |
| `sourceFormat` 缺失 | 正常解码，不显示出处 |
| `points` / `layers` 里缺某个图层 | 该图层用默认变换（位置与旋转 0、缩放 1）绘制 |
| `audio-map.json` 缺失 | 音频面板显示"暂无事件映射"，帧动画照常 |
| `clips` 为空数组（只有精灵、图集和音效） | 与解码失败区分：显示「这个导出里没有动作」的空状态并列出精灵/图集数量，**不报加载失败** |
| `cover.png` 缺失 | 宿主用占位图 |
| 出现未知字段 / 未知 `kind` | 忽略该字段 / 该轨不绘制，**不报错** |
| 必填字段类型不对 | 解码失败，插件报 `Could not load this character` |
