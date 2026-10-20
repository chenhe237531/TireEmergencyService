# 图形资源许可声明

本目录下的 SVG 为**构建期素材**，由 `scripts/fetch-graphics.js` 从开源图标库拉取，
构建时被 UnoCSS 内联进样式（SVG data URI）。目录本身不参与运行时代码打包。

**请勿手工修改本目录下的 SVG。** 需要更换图标时，修改 `scripts/fetch-graphics.js`
里 `MANIFEST` 的映射关系，然后重跑：

```bash
node ./scripts/fetch-graphics.js --force
```

当前来源与许可（全部允许商业使用）：

| 图标集 | 上游项目 | 许可 | 是否需署名 | 是否传染 |
|---|---|---|---|---|
| `fluent-emoji-flat` | [Microsoft Fluent Emoji](https://github.com/microsoft/fluentui-emoji) | **MIT** | 否 | 否 |

MIT 许可要求保留版权声明。原文：

```
MIT License

Copyright (c) Microsoft Corporation.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## 未采用的图标集及原因

选型时评估过以下同样常见的开源图标集，出于许可或体积原因未采用，记录在此避免后续重复评估：

| 图标集 | 许可 | 未采用原因 |
|---|---|---|
| `noto`（Google Noto Emoji） | Apache-2.0 / OFL | 单个 SVG 平均约 4.2 KB，是 Fluent 的 3.7 倍，小程序包体积不可接受 |
| `twemoji`（Twitter Emoji） | CC-BY 4.0 | 体积更大（平均 1.6 KB），且 CC-BY 要求署名 |
| `openmoji` | CC-BY-**SA** 4.0 | 传染性许可，会波及衍生作品，排除 |
| `game-icons` | CC-BY 3.0 | 需署名；且为单色，可直接用已引入的 Tabler（MIT）替代 |
| `streamline-emojis` | CC-BY 4.0 | 需署名，体积无优势 |
| LottieFiles 免费动图 | Lottie Simple License | 逐条许可不一致，部分禁止商业使用，无法一次性确认，放弃 |

## 关于"动图"

动图**不使用外部资源**。原因见 `docs/09` 的技术说明：
小程序不支持 `<svg>` 标签，且 CSS `background-image` 内联的 SVG **不会播放**
SMIL/CSS 动画，因此 Lottie / SVG 动图在小程序端要么不可用、要么需要额外运行时。

项目采用**「分层元素 + CSS 动画」合成动图**，零资源体积、可被动效档位统一降级，
实现见 `src/style/graphics.scss`。
