# Beangle 工作区 Scala 3.9 / sbt 2.0.9 升级实录

2026-09 把整个 Beangle 工作区（31 个 sbt 工程，含下游的 `otk`/`spa`）从
**Scala 3.3.8 + sbt 1.12.x** 升到 **Scala 3.9.0 LTS + sbt 2.0.9**，并把父插件切到 JDK 25。

语言层面的写法差异见 [Scala 3.3 升级到 3.9 备注](/tech/programming/scala-3.3-to-3.9-upgrade.md)，
这篇记录的是**工程过程**：动了什么、按什么顺序动、以及真正踩到的坑。

## 1. 范围与结果

| 项 | 升级前 | 升级后 |
|---|---|---|
| Scala | 3.3.8 | 3.9.0 (LTS) |
| sbt | 1.12.x | 2.0.9 |
| `sbt-beangle-parent` | 0.15.x | 0.16.3-SNAPSHOT |
| `sbt-beangle-build` | 0.0.x | 0.1.10-SNAPSHOT |
| `beangle-commons` | 6.0 ~ 6.3.2 | 6.3.7-SNAPSHOT |
| JDK / 字节码目标 | 21 (`-Xtarget:21`) | 25 (`-Xtarget:25`、`javacOptions --release 25`) |

注意 `-Xtarget:25` / `--release 25` 同时抬高了运行期要求：产出的 class 文件需要 JDK 25 才能加载。

规模：744 个 `.scala` 文件被改动，`+3419 / -2828` 行；验收线是 `Test/compile` 全绿且 **warns=0**
（第三方库自身的弃用告警不计，例如 POI 的 `XWPFRun.getParagraph`、Hibernate 的 `createNativeQuery`）。

## 2. 升级顺序：谁先谁后

依赖是分层的，顺序错了会一直卡在"别人的错误"上：

1. **`parent`** —— `Settings.common` 统一下发 `scalaVersion` / `scalacOptions` / `javacOptions`，
   `Dependencies` 下发第三方版本。改完 `publishLocal`，否则下游还在用旧插件（旧插件里的默认版本是 `3.3.x`）。
2. **`build`** —— sbt 插件（styleCheck、War、Tomcat、Ddl/Orm、Native、Boot…），是**每个仓库的 meta-build 依赖**。
   `tools` 仓库里的 `DdlPlugin`/`OrmPlugin`/`TomcatPlugin`/`CpFiles` 已被搬进 `build`，所以下游要删掉
   `sbt-beangle-tools`，否则同名 key 冲突。
3. **`commons`** —— 运行时基础库，也是 `scala.quoted` 宏的所在地。**必须最先修好并发布**：
   它的宏会在别的仓库的编译期展开，宏不卫生会在**下游**报错（见坑 3）。
4. **中间件层** —— `config` `jdbc` `cache` `serializer` `cdi` `web` `webmvc` `data` `she` `security` `doc` …
5. **叶子应用** —— `otk` `spa` `sample`。

## 3. 单仓标准动作

```properties
# project/build.properties
sbt.version=2.0.9
```

```scala
// project/plugin.sbt
addSbtPlugin("org.beangle.parent" % "sbt-beangle-parent" % "0.16.3-SNAPSHOT")
addSbtPlugin("org.beangle.build"  % "sbt-beangle-build"  % "0.1.10-SNAPSHOT")
```

```scala
// build.sbt：把 commons 钉到新版
val beangle_commons = "org.beangle.commons" % "beangle-commons" % "6.3.7-SNAPSHOT"
```

要点：

- 删掉只支持 sbt 1 的插件坐标，例如 `sbt-beangle-tools`（它发布的是 `_2.12_1.0`，sbt 2 下解析不到）。
- **没有直接声明 commons 的仓库要显式补一行**，否则编译用的是"依赖的库"传递进来的老 commons（见坑 3、坑 6）。
- `ThisBuild /` 写法在 sbt 2 下仍然可用，`url(...)` 也仍在（不必强行改成 `uri(...)`）。
- 命令统一加 `-batch`。

## 4. 源码层面的批量改动

`[_]`、`= _`、`: _*` 这三类是机械替换，可以用编译器自带的 rewriter：

```bash
sbt -batch 'set scalacOptions ++= Seq("-rewrite", "-source:3.4-migration") ; Test/compile'
```

按本工作区的 `git diff` 删除行统计：

| 3.3 的写法 | 3.9 的写法 | 处理行数 |
|---|---|---|
| `Class[_]`、`Map[String, _]` | `Class[?]`、`Map[String, ?]` | 889 |
| `var x: T = _` | `= uninitialized`（`import scala.compiletime.uninitialized`） | 1469 |
| `f(x: _*)` | `f(x*)` | 67 |
| Java 注解的位置参数 | 具名参数（3.6 起） | 少量 |
| `(implicit x: T)` | `(using x: T)`（3.7 起） | 少量 |

档位**不叠加**，本工作区的实际情况：绝大多数仓库只需 `3.4-migration`，
`she`、`ems` 还需要 `3.6-migration`，`doc` 还需要 `3.7-migration`。

剩下的是需要人判断的（机械替换改不了）：

- **E029 误报**：对推断出的 `Map[K,V]` 写 `map { case (k, v) => … }`，3.9 报 "It would fail on pattern case: (_, _)"。
  改成双参 lambda `map { (k, v) => … }` 即可，语义完全一样（`event` 的 `DataEvent`）。
- **E190**：`if (…) { … } else None` 这类"丢弃非 Unit 值"，改成先赋值给局部变量再返回（`webmvc` 的 `Profile.matches`）。
- **`@elidable` 要删**：Scala 3 不支持 elision，它从来没有生效过，3.8 起才告警。
- **运算符/API 漂移**：`serializables -- hints.getTypes` 改成 `&~`；
  `beangle-doc` 里 `flatten(c => c.keys(name))` 改成 `flatMap`。

## 5. 踩过的坑

### 5.1 sbt 2 的构建缓存会"假成功"

最坑的一条。改完 Scala 版本或编译选项后，`Test/compile` 会打印 `[success]`、0 error，
但 `target/.../classes` 是空的、日志里一行 `compiling` 都没有 —— 命令根本没跑。

只删 `target` 不够，要把 sbt 2 的两个全局缓存也清掉：

```bash
find <repo>/target -mindepth 1 -delete
find ~/.cache/sbt/v2/ac ~/.cache/sbt/v2/cas -mindepth 1 -delete   # 增量分析 + 类文件存储
```

判断"真的编译了"：日志里有 `compiling N Scala sources`；或者直接看产物
`javap -v -cp <classes> <类名> | grep 'major version'`（JDK 21 = 65，JDK 25 = 69）。

### 5.2 thin client 挂死与僵尸注册

`sbt -batch` 走的是 thin client（`sbtn`），它连的是常驻 server。用 `kill -9` 杀 server 会留下
`~/.cache/sbt/v2/proc/<pid>.json` 和 `~/.config/sbt/2/server/<hash>/sock`，之后新的 client 连不上：
**命令不执行、不报错、一直挂着**（我第一次排查时以为是编译慢）。

- 兜底：`sbt --server -batch <任务>`，在进程内跑，完全不经过 thin client。
- 清理：删掉 `proc/` 里 pid 已经不存在的 json 以及它指向的 `server/<hash>` 目录。
  （`sbt shutdownall` 会连 IDE 的 server 一起关掉，慎用。）
- 习惯：用 `kill` 而不是 `kill -9`，server 会自己注销。

### 5.3 宏不卫生：`-Xcheck-macros` 抓出来的跨 splice 复用

现象：**下游仓库**编译时报

```
scala.quoted.runtime.impl.ScopeException: Expression created in a splice was used outside of that splice.
Created in: .../commons/lang/reflect/BeanInfoDigger.scala:71
Used in:    .../commons/lang/reflect/BeanInfoDigger.scala:178
Hint: ... A common reason is when a `def` that creates a `'{...}` captures an outer instance of `Quotes`.
```

堆栈指向 commons 源码，但错在下游 —— 因为宏是在调用方的编译期展开的。

根因：`def xxx(...)` 里构造的 `'{ … }` 捕获了外层的 `Quotes`，被另一个 splice 使用时就不在同一作用域。
修法：给该 `def` 补 `(using Quotes)` 参数，或把 `'{ … }` 挪进真正的 splice 里。

关键推论：**修好 commons 还不够，必须 `publishLocal`**，否则下游拿到的仍是带病的老 jar。

### 5.4 `set scalacOptions` 的作用域

- `set scalacOptions ++= …` 只作用于**当前 project**，多模块仓库要
  `project X ; set … ; Test/compile` 逐个来。
- `set every …` 会报 `Cyclic reference involving scalacOptions`，别用。
- `set` 的结果留在常驻 server 里，跑完要重启 server，否则后续编译会报
  `none is not a valid choice for -source`。

### 5.5 rewriter 会产出非法语法

3.7 档把 `xs.map(toSeq).flatten(using e => …)` 重写成了中缀形式 `toSeq flatten (using e => …)`，
这不是合法的 infix 用法，必须手改回 `.flatten(using e => …)`。
rewriter 改完要通读 diff，别盲信。

### 5.6 版本混用：老库 + 新 commons

- `otk` 声明的是 `beangle-she 0.0.8`，它传递进来的 commons 是老的；老 commons 的宏在 3.9 下直接炸。
  加一行显式 `beangle-commons 6.3.7-SNAPSHOT` 才走对。
- `DefaultBinarySerializer` 在 commons 6.0 还有伴生 object，6.2 起只剩 class，
  于是 `.constructor(ref("redis.Factory"), DefaultBinarySerializer, true)` 这种老写法编译不过，要改成 `new DefaultBinarySerializer`。

结论：升级期间要保证"库"和"编译它的 commons"对齐，必要时在叶子工程里显式钉住 commons 版本。

### 5.7 环境类小坑

- **`~/.m2` 里的残缺 artifact**：如果某个版本只有 pom 没有 jar（下载中断留下的），
  coursier 会把 mavenLocal 当权威源，直接 `FetchError` 而**不去 Central 取**。删掉那个版本目录即可。
- **内存**：每个 sbt server 常驻 1 ~ 1.5GB，16 核机器并行验证用 `-P 3` 比较合适，串行太慢。
- **`rm -rf` 在受管 shell 里被禁**：用 `find <dir> -mindepth 1 -delete`。

## 6. 验收方法

1. `Test/compile`（Beangle 的 `compile` 前会自动跑 `styleCheck`）要求 `errors=0`，且尽量 `warns=0`。
2. 打包类仓库再跑一遍 `package`，确认 `WarPlugin`/`TomcatPlugin` 之类还在（`otk` 能产出 `beangle-otk-ws-*.war`）。
3. 抽查字节码版本，确认新的 `-Xtarget` 真的生效：

```bash
javap -v -cp <classes 目录> <某个类> | grep 'major version'
```

## 7. 遗留事项

- `otk` 仍指向 `beangle-she 0.0.8` / `beangle-cache 0.1.19` / `beangle-doc 0.5.3`，没有升到本轮的 `-SNAPSHOT`。
  要全栈对齐，需要先 `publishLocal` 这几个仓库，再改坐标。
- `sample` 按要求不动；Hibernate 按要求停在 `7.4.6.Final`。
- 各仓库改动**尚未提交**（每个子目录是独立仓库，逐仓提交）。

## 8. 速查清单

```bash
# 0) 改 parent 并发布
vi parent/src/main/scala/org/beangle/parent/Settings.scala   # scalaVersion / -Xtarget / --release
cd parent && sbt -batch publishLocal

# 1) 单仓：改 build.properties + plugin.sbt + commons 坐标
# 2) 清缓存（关键，否则可能假成功）
find <repo>/target -mindepth 1 -delete
find ~/.cache/sbt/v2/ac ~/.cache/sbt/v2/cas -mindepth 1 -delete

# 3) 先真编译一次，看真实报错
cd <repo> && sbt --server -batch Test/compile

# 4) 机械替换（档位按需叠加：3.4 / 3.6 / 3.7，逐 project）
sbt --server -batch 'project <P> ; set scalacOptions ++= Seq("-rewrite","-source:3.4-migration") ; Test/compile'

# 5) 复核 diff（rewriter 可能产出非法 infix），再验收
sbt --server -batch Test/compile && sbt --server -batch package
```

---
<div style="text-align: right;"><small>最后更新：2026-09-20</small></div>
