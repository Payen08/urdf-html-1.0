# urtf-html

## 启动

使用项目自带的本地服务启动页面，以便通过同源代理读取机械臂 grpcui：

```bash
node server.mjs
```

浏览器打开 `http://127.0.0.1:8000`。

可以通过同源查询参数直接加载一组测试文件：

```text
http://127.0.0.1:8000/?model=测试glb/mcr0717.glb&urdf=测试glb/urdf.json
```

GLTFLoader 会清洗 Blender 的节点名称，例如 `joint6.001` 会变成 `joint6001`。页面会自动将唯一的数字后缀节点匹配到 JSON 中的 `joint6`；也可通过 `modelNodeName` 显式指定模型节点。

## 坐标配置

关节上报值按弧度、右手系处理。`axis` 所属坐标系由 `rotationSpace` 决定。

模型根坐标转换可在 JSON 中配置：

```json
{
  "urdf": {
    "modelRotationDeg": {"x": 90, "y": 0, "z": 0},
    "modelRotationOrder": "XYZ",
    "joints": []
  }
}
```

`x: 90` 保持原有的 GLB Y-up 到页面 Z-up 转换；如果数字孪生平台直接使用 GLB 的 Y-up 坐标，可改为 `x: 0` 做对照。

每个关节可通过 `rotationSpace` 指定旋转轴所在坐标系：

```json
{
  "name": "joint1_left",
  "reportedJointName": "joint1",
  "axis": {"x": 1, "y": 0, "z": 0},
  "rotationReference": "absolute",
  "rotationSpace": "local"
}
```

- `local`：`axis` 属于 GLB 关节节点的局部坐标系。
- `parent`：`axis` 属于关节节点的父坐标系。
- `rotationReference: "absolute"`：把上报值作为绝对关节角。页面会对 GLB 绑定四元数做 swing–twist 分解，只移除绑定姿态在当前关节轴上的角度，保留其他固定坐标变换。这是默认模式，能自动处理不同 GLB 中各关节自带的 ±90°/180°。
- `rotationReference: "relative"`：保留旧行为，把上报角继续叠加到完整 GLB 绑定姿态上。

未填写 `rotationSpace` 时默认使用 `local`；未填写 `rotationReference` 时默认使用 `absolute`。

算法不按 `joint2` 等名称设置特殊偏移。`positionOffsetDeg` 默认始终为 0；只有经过额外机械零位标定后才需要手动填写。
