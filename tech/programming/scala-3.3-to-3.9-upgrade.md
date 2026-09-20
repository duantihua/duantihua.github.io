# Scala 3.3 升级到 3.9 备注

2026-09-03 Scala **3.9.0 LTS** 发布（release 标题就是 `3.9.0 LTS`）。3.3 线在 Maven Central
上停在 3.3.8，此后没有新版本，LTS 基线转到 3.9。

这篇记录从 3.3.8 升到 3.9.0 需要动什么、以及升级时会碰到的坑。

## 1. 升级动作：一般只改一行

`scalaVersion` 从 `"3.3.8"` 改成 `"3.9.0"`，编译选项不用动：

| 项 | 3.3.8 | 3.9.0 |
|---|---|---|
| `scalaVersion` | `3.3.8` | `3.9.0` |
| `-Xtarget:21` | 支持 | 仍支持，无告警 |
| JDK | 21+ | 21+（不变）；Beangle 后来把目标统一切到 25，见 §5 |

在 Beangle 里就是 `parent/src/main/scala/org/beangle/parent/Settings.scala` 里的一行
—— 版本由 `Settings.common` 统一下发，各模块继承，不用逐仓改。
（2026-09-20 起同一处还把 `-Xtarget:25`、`javacOptions --release 25` 一起提上去了。）

## 2. 需要改的写法（3.4 起陆续弃用）

| 3.3 的写法 | 3.9 的写法 | 说明 |
|---|---|---|
| `Class[_]`、`Map[String, _]` | `Class[?]`、`Map[String, ?]` | `[_]` 自 3.4 起弃用，`-deprecation` 下每处都告警 |
| `var x: Foo = _` | `var x: Foo = scala.compiletime.uninitialized` | 同样已弃用 |

编译器自己告诉了批量改的开关（原话：
`This construct can be rewritten automatically under -rewrite -source 3.4-migration.`）：

```bash
sbt -batch 'set scalacOptions ++= Seq("-rewrite", "-source:3.4-migration") ; compile'
```

> 实测结论：rewriter 可用，但有三个注意点 —— 档位**不叠加**（3.4 / 3.6 / 3.7 要逐档跑）、
> `set scalacOptions` 只对当前 project 生效（多模块要逐 project 设置），
> 它会直接改源文件且偶尔产出非法语法（例如把 `.flatten(using e => …)` 写成中缀 `toSeq flatten (using e => …)`）需要手改。
> 详见 [Beangle 工作区 Scala 3.9 / sbt 2.0.9 升级实录](/tech/programming/beangle-scala39-migration.md)。

### 2.1 字母数字方法名当中缀：在声明处补 `infix`

DSL 喜欢把 `is`/`are`/`equal`/`gt` 这类**字母方法名**当中缀用（`e.name.first is (unique)`）。
3.4 起这类写法会报：

```
Alphanumeric method is is not declared infix; it should not be used as infix operator.
Instead, use method syntax .is(...) or backticked identifier `is`.
The latter can be rewritten automatically under -rewrite -source 3.4-migration.
```

3.9 下默认只是**警告**（开 `-Werror` 或 `-source future` 才变 error），但 IDE 会一直标黄，
且 `-source future` 迟早成为默认，所以该改。三种消解方式：

| 做法 | 写法 | 评价 |
|---|---|---|
| 声明处加 `infix` | `infix def is(declarations: PropertyDeclaration*)` | **推荐**：一处改动覆盖所有调用点 |
| 反引号 | ``e.name.first `is` (unique)`` | 方法不在自己手里时的办法；也是 `-rewrite` 的产物 |
| 点号 | `e.name.first.is(unique)` | 无告警，但把 `a & b & c are notnull` 这类中缀链拆散，DSL 可读性变差 |

几个要点：

- **只有字母数字名受约束**（`is`、`are`、`or`、`and`、`equal`）；符号名（`&`、`+`）本来就允许中缀，不用管。
- `infix` 只是声明意图，不改字节码、不影响点号调用（`e.id.is("bitand(_,?) > 0", 8)` 照旧）。
- 库里的方法加 `infix`，比在每个调用点加反引号划算：调用点可能散在下游仓库（`openurp`/`xurp`/`she`），
  反引号得逐仓逐个改，`infix` 改一次就全静默。
- 给 `is` 后面补个空格（`c.code is (notnull, …)`）**不能**消警告，漏改一处照样标黄；
  加了 `infix` 之后也不必再写反引号，两种风格混在同一文件里最难看（`data` 仓库就是先被 `-rewrite` 刷成了反引号）。

Beangle `data` 的落地（2026-09-21）：在 `DeclareProp.is` / `DeclareProps.are`、
`Prop.like/equal/gt/ge/lt/le/is/between/in`、`OqlBuilder.Var` 的同名算子以及
`OqlBuilder.Expression.and/or` 上加了 `infix`，随后 `model/Test/compile` 中缀告警为 0，
调用点无需反引号。

## 3. 坑：`@elidable` 在 Scala 3 里根本不生效

`@elidable` 自 3.8.0 起标记弃用，理由是 **Scala 3 不支持 elision**：

```
class elidable in package scala.annotation is deprecated since 3.8.0:
@elidable is not supported by Scala 3
```

也就是说 `@elidable(FINEST)` 这种"让编译器把调用点在编译期裁掉"的用法，
**在 Scala 3 下从来没有生效过**，只是从 3.8 开始才给出告警。
看到它不要以为"这段逻辑已经不进生产包了" —— 它照常执行。
需要"仅调试期执行"，改用日志级别判断或显式开关。

## 4. 另外几个变化

- **不再自动收集 entry points。** 编译器不再自动往 manifest 里写入口点信息；
  `-Xmain-class` 保留，不指定就不写。走 sbt `Compile / mainClass` 或 `java -cp` 显式指定主类的
  方式不受影响，只有依赖 manifest 里那个属性时才会察觉。
- **`into` 转正。** SIP-71 的 `into`（允许完全隐式转换）在 3.9 稳定，不再是 `-preview` 特性。
- **标准库坐标变了。** 自 3.8 起 `org.scala-lang:scala-library` 与编译器同版本号，
  3.9.0 依赖的是 `scala-library:3.9.0`，而不再是 2.13.x。

## 5. 实测记录（Beangle 工作区）

2026-09-20 完成：31 个 sbt 工程（含下游 `otk`/`spa`）全部升到 3.9.0 + sbt 2.0.9，
`Test/compile` 全绿、`warns=0`；`parent` 同时把目标提到 JDK 25（`-Xtarget:25` / `--release 25`），
抽查产物字节码为 major version 69。

- 改动规模：744 个 `.scala` 文件，`+3419 / -2828` 行；其中 `[_]` 889 处、`var x: T = _` 1469 处、`x: _*` 67 处。
- 机械替换之外，真正需要人改的只有少数几处：`map { case (k,v) => }` 的 E029 误报、
  `if … else None` 的 E190、删 `@elidable`、以及几处自有库 API 漂移。
- 工程过程与坑（sbt 2 构建缓存假成功、thin client 僵尸注册、`-Xcheck-macros` 抓出的宏卫生、
  rewriter 产出非法语法等）见
  [Beangle 工作区 Scala 3.9 / sbt 2.0.9 升级实录](/tech/programming/beangle-scala39-migration.md)。

---
<div style="text-align: right;"><small>最后更新：2026-09-21</small></div>
