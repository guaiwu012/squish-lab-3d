# 捏捏实验室 · Squish Lab 3D

一个可扩展的浏览器 3D 触感实验室：用单指、双指和连续多点触摸拉扯、旋转、按压不同材质，并让形变、回弹和声音保持一致。

> 如果你喜欢这个项目，别忘了给仓库留个 ⭐ Star！

## 当前材质

- 起泡胶：黏稠的局部拉伸和低频摩擦
- 水果：带糖衣的立体果肉，糖衣可像剥鸡蛋一样逐片剥落
- 泡泡纸：独立泡泡、随机爆裂，不连续制造鼓点
- 果冻：低频湿润摆动、稀疏摩擦和长吸附尾音
- 透明泡泡、气球：薄膜拉伸与一次性戳破
- 啤酒瓶、冰块、蜡球：分阶段敲击、局部裂纹与碎片
- 香皂、动力沙、海绵：慢回弹、塌落和多孔压缩

完整的可量化验收指标见 [ACCEPTANCE.md](./ACCEPTANCE.md)。材质目录按“场景 + 注册表”驱动，当前覆盖 12 个常见解压原型。

## 调研依据

本轮材质扩展参考了 [Fun Tap 的泡泡纸、起泡胶和挤压玩具](https://www.routinery.app/funtap)、[ASMR World 的 Pop-It、蜡壳、肥皂切割和黄油捏捏](https://theasmrworld.com/)、[ASMR Slicing 的肥皂与动力沙](https://www.jellypile.com/download/514)，以及 [Satisfying Lab 的泡泡、弹珠和水面互动](https://satisfylab.me/en/)。这些产品共同反复验证了“按压 / 拉伸 / 戳破 / 脆裂 / 切割 / 塌落”几类触感原型。

材质导航采用“场景 + 注册表”结构，新增材质时只需要补充注册信息、三维构建器和声音 profile，不需要复制导航骨架。

## 本地运行

```bash
npm install
npm run build
npm run qa:static
```

构建产物位于 `dist/`。直接用任意静态服务器托管 `dist/` 即可，例如：

```bash
python3 -m http.server 4173 --directory dist
```

然后打开 <http://localhost:4173>。

## CloudBase 自动部署

仓库已包含 GitHub Actions 工作流：推送到 `main` 或手动运行工作流时，会把 `dist/` 部署到 CloudBase 环境 `fay-d5gs45yh46ccad4d7`。首次启用前，请在 GitHub 仓库的 Settings → Secrets and variables → Actions 添加 `TCB_SECRET_ID` 和 `TCB_SECRET_KEY` 两个 Secrets；密钥只放在 GitHub Secrets 中，不要提交到代码。

## 交互

- 拖动球体表面：局部形变
- 拖动外圈：旋转
- 双指：沿两指方向拉伸，同时支持旋转
- 水果：先敲击糖衣，逐片剥落后才能拉伸果肉
- 啤酒瓶 / 蜡球 / 冰块：达到验收次数后才解锁局部形变
- 透明泡泡 / 气球：拖动薄膜，点击触发一次性塌陷或泄气
- 香皂 / 动力沙 / 海绵：分别保留慢回弹、塌落和多孔恢复
- 复原：清理形变、碎片、裂痕和临时音频节点

## 技术栈

- Three.js 0.185
- 原生 HTML / CSS / JavaScript
- Web Audio API
- ESBuild

## 许可

本项目使用 [MIT License](./LICENSE)。
