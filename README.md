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

## GitHub Pages 与关节接口

GitHub Pages 只托管静态文件，不会运行项目中的 `server.mjs`，因此不能使用 `/api/latest-arm-joints` 代理普通 grpcui 页面。内网 HTTP grpcui 也会受到 HTTPS 混合内容、CORS 和 CSRF 限制。

- 使用 grpcui 地址时，请运行 `node server.mjs` 并从 `http://127.0.0.1:8000` 打开页面。
- GitHub Pages 上仍可手动粘贴 grpcui 的 Response Data。
- 如果已有真正支持 HTTPS、CORS 和 gRPC-Web 的网关，可填写该网关地址直接请求；不要填写以 `/grpcui/` 结尾的页面地址。

## 模型上传

- `选择文件`：可选择 GLB、GLTF、URDF 或 ZIP，页面会根据文件类型自动识别加载方式；也可以一次选择 URDF 和同目录资源。
- `选择文件夹`：用于包含多级 Mesh、纹理和材质目录的完整 URDF 文件包。

URDF 文件或文件包会解析：

- `link`、`joint`、`origin`、`axis`、`limit`
- `visual`、`collision`、`inertial`
- box、cylinder、sphere 几何体
- STL、DAE、OBJ/MTL、GLB/GLTF Mesh，以及对应纹理和材质

生成的模型使用 URDF 原生 Z-up 坐标，并按 `parent link → joint pivot → child link` 建立运动链。fixed joint 保留在结构和 JSON 数据中但不生成控制项；revolute / continuous joint 使用弧度关节上报，prismatic joint 使用原始线位移。

右侧关节控制支持 `° / rad` 显示切换。切换只改变旋转关节的滑杆、步长和输入框显示，内部姿态计算及 prismatic 线位移单位不变。

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
