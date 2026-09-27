# Beangle otk 的 GraalVM native 镜像迁移

> 用途：把 `otk` 按 `ems` 的路子做成 native 镜像，并记下这次唯一"不报错但画不出来"的坑。
> 环境：GraalVM CE **25.3.4.1**（JDK 25）+ Scala 3.9 / sbt 2.0.9。
> 通用的 native 构建/打包规则在 `beangle/build` 的 `docs/native.md`，otk 自己的细节在 `otk/docs/native.md`。

## 1. 做了什么

| 项 | 结果 |
|---|---|
| 镜像 | `otk-ws` 150MB，启动后 Tomcat/ CDI 52 beans / 11 actions 正常 |
| 接口 | 验证码、二维码/条码、Excel、PDF（CDP 驱动 Chrome）、LanguageTool、拼音、行政区划、时间、密码 全部 200 |
| 入口 | `Compile / mainClass = org.beangle.sas.engine.tomcat.Bootstrap`（`beangle-sas-engine` + `tomcat-embed-core` 走 `% "provided"`） |
| 插件 | `WarPlugin, TomcatPlugin, NativeImagePlugin` + `AotPlugin, MetaPlugin, ProxyPlugin` |
| 关键选项 | `--sun-misc-unsafe-memory-access=allow`、`-Os`、`-H:+AddAllCharsets`、`-H:IncludeResourceBundles=...`、`--initialize-at-build-time=...` |

`nativeDist` 一次约 2 分 10 秒，产物同时装到 `~/.m2/snapshots/`，`nativeDistUpload` 上传到
`sas.openurp.net` 的 native 仓库。

## 2. native 里没有 `java.home`

`System.getProperty("java.home")` 在原生镜像里**是 null**（JVM 上永远非空），而 JDK 的字体代码依赖它：

1. `sun.awt.FontConfiguration.findFontConfigFile` 直接抛
   `java.lang.Error: java.home property not set`；
2. 就算补上 `java.home`，`X11FontManager.createFontConfiguration` 也只在 `<java.home>/lib`
   **存在**时才会去试 `FcFontConfiguration`（用 fontconfig 现场合成字体配置），
   否则回落 `MFontConfiguration` 并抛
   `RuntimeException: Fontconfig head is null, check your fonts or fonts configuration`。

解决办法是在应用启动最早处（`beangle.xml` 的 `<web><initializer>`，`order = -2`，
早于 she 的 `ConfigInitializer(-1)`）造一个**带空 `lib/` 子目录**的假 `java.home`，
并把 `java.awt.headless` 固定为 `true`：

```scala
val lib = Paths.get(System.getProperty("java.io.tmpdir"), "beangle-otk-home", "lib")
Files.createDirectories(lib)
System.setProperty("java.home", lib.getParent.toString)
System.setProperty("java.awt.headless", "true")
```

两个附带结论：

- **不能用 `-D` 传**：构建期 `-D` 不会进入镜像，必须是运行期早于 AWT 类初始化；
- `headless` 必须显式设：镜像跑在带 `DISPLAY` 的机器上时 JDK 会走 X11 分支，
  在 `X11GraphicsEnvironment.initDisplay` 的 JNI `FindClass sun/awt/SunToolkit` 上失败；
- 字形来自宿主机 fontconfig（与 JVM 部署一致）；首次运行会写 `~/.java/fonts/<jdk 版本>/fcinfo-*.properties`。

## 3. 最大的坑：TextLayout 静默画空白

现象：`/captcha/image/{id}` 返回 **200 + 一张纯白 JPEG**（`distinctColor = 1`），日志里**没有任何异常**。

### 3.1 定位：先缩小复现面

别在 150MB 的服务镜像上反复试。写一个 40 行的小程序单独打 native（约 35 秒），
打印每步的像素统计与 `TextLayout.getAdvance()`：

```java
BufferedImage img = new BufferedImage(90, 35, BufferedImage.TYPE_INT_RGB);
Graphics2D g = img.createGraphics();
g.setFont(new Font("Dialog", Font.BOLD, 21));
g.drawString("abcd", 5, 25);                       // ✅ native 正常
AttributedString as = new AttributedString("abcd");
for (int i = 0; i < 4; i++) as.addAttribute(TextAttribute.FONT, f, i, i + 1);
g.drawString(as.getIterator(), 5f, 25f);           // ❌ native 什么都没有
System.out.println(new TextLayout(as.getIterator(), g.getFontRenderContext()).getAdvance());
```

对照结果：

| 调用 | JVM | native（修复前） |
|---|---|---|
| `drawString(String, int, int)` | 正常 | 正常 |
| `drawString(AttributedCharacterIterator, float, float)` | 正常 | **空白** |
| `new TextLayout(aci, frc).getAdvance()` | 50.625 | **0.0** |
| `Font.createGlyphVector` / `getLineMetrics` / `getStringBounds` | 正常 | 正常 |

也就是说：**只有走 `TextLayout`（= HarfBuzz 排版）这一条路退化成空**，字形数据本身是好的。

### 3.2 根因：`HBShaper` 建 face 时用 `MethodHandles.lookup().findStatic`，失败被吞

JDK 24 起文本排版默认引擎是 HarfBuzz，`sun.font.HBShaper` 通过 FFM 调 `libharfbuzz`。
给 HarfBuzz 建 face 时要回调字体表数据，而方法句柄是这么拿的：

```java
private void createFace() {
    try {
        get_table_data_fn = getBoundUpcallStub(Arena.ofAuto(), Font2D.class, font2D,
            "getFontTableData", JAVA_INT, JAVA_INT, ADDRESS);
        if (get_table_data_fn == null) return;
        face = (MemorySegment) create_face_handle.invokeExact(get_table_data_fn);
    } catch (Throwable t) { }          // ← 异常全部丢弃
}
// getBoundUpcallStub 内部：
MethodHandle mh = MH_LOOKUP.findStatic(HBShaper.class, mName, mType);  // 找不到 → return null
```

`findStatic` 在 native 里查的是**反射注册表**。没登记
`sun.font.HBShaper.getFontTableData(Font2D, int, MemorySegment)` 时它不在方法表里，
`findStatic` 失败 → upcall stub 为 null → face 为 null → `SunLayoutEngine.layout` 里
`if (face != null)` 不成立，**整个排版悄无声息地什么都不做**。

修复就是一条反射注册：

```json
{
  "type": "sun.font.HBShaper",
  "methods": [
    {"name": "getFontTableData",
     "parameterTypes": ["sun.font.Font2D", "int", "java.lang.foreign.MemorySegment"]}
  ]
}
```

加上之后 native 与 JVM 逐项一致（`getAdvance()` 50.625，验证码 768 色）。

### 3.3 为什么会漏掉这条

`jdk-awt/reachability-metadata.json` 是 agent 采的，原先 75 条**全是 `jniAccessible: true`**，
看起来就是一份"JNI 回调清单"。手工按 `jniAccessible` 收敛时，这条**普通反射方法**条目
（没有 `jniAccessible`）就被过滤掉了 —— 而 agent 本来是采到了的。

教训，写下来备查：

- **过滤 agent 输出时粒度是"条目"，不是"文件"，更不是"`jniAccessible`"**；
- JDK 内部用 `MethodHandles.Lookup.findStatic/findVirtual` 找方法的地方，
  native 必须给它登记反射，否则**往往是被 `catch (Throwable)` 吞掉**，表现为功能静默失效；
- 所以：**接口 200 不等于功能正确**，对"生成图片/文档"这类接口要做像素级/内容级断言
  （native 与 JVM 各跑一遍同一个请求，比对 `distinctColor`、字节数、关键字）。

### 3.4 顺带记住的排查套路

1. 现象 → 缩小到最小可复现（独立小程序 + 单独打 native，35 秒一轮）；
2. JVM 与 native 跑**同一份**代码，逐项打印中间量，找第一个不一致的点；
3. 不一致点落到 JDK 内部方法时，读 JDK 源码（`$GRAALVM_HOME/lib/src.zip`）找
   `try { ... } catch (Throwable)` 与 `findStatic`/`Class.forName`；
4. 反射注册是**按签名精确匹配**的（参数类型、返回类型），JDK 升级后要复核。

## 4. 其它两道元数据

| 文件 | 作用 |
|---|---|
| `jdk-management/` | `sun.management.VMManagementImpl` 等 JMX 的 JNI 字段 |
| `otk-cdp/` | PDF 走 CDP over WebSocket，Tyrus 用 ServiceLoader/`Class.forName` 发现 `GrizzlyClientContainer`，静态分析看不到，缺了就在 `ClientManager.createClient()` 抛 `DeploymentException` |
| `META-INF/beangle/aot-registrars.txt` → `OtkAotHints` | otk 自己的资源（拼音库、行政区划、LanguageTool 语言与规则类）在构建期扫描 classpath 注册 |

`AotPlugin` 的 `aotHints` 是 **pre-compile** 钩子，改完 registrar 要先跑一次
`sbt -batch "Compile/aotHints"`，否则 `nativeDist` 用的是上一版编译结果。

## 5. 重新采集 agent 元数据

```bash
java -Djava.awt.headless=true -Duser.home=/tmp/fresh-home \
  -agentlib:native-image-agent=config-output-dir=/tmp/otk-agent \
  -cp <classpath> org.beangle.sas.engine.tomcat.Bootstrap --port=8090
curl -s -o /dev/null http://localhost:8090/captcha/image/<50 字符 id>
curl -s -o /dev/null "http://localhost:8090/doc/pdf?url=http://localhost:8090/about"
kill -INT <pid>     # 必须优雅退出，agent 在关机钩子里写文件
```

`-Duser.home=<空目录>` 不能省：`~/.java/fonts` 有缓存时 JVM 不走 `FontConfigManager`，
那些 JNI 条目就采不到。

---
<div style="text-align: right;"><small>最后更新：2026-09-21</small></div>
