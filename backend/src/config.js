import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sensitiveWordsPath = path.resolve(__dirname, "../data/sensitive-words.txt");
const runtimeStatePath = path.resolve(__dirname, "../runtime/state.json");

const parseNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const loadSensitiveWords = () =>
  fs
    .readFileSync(sensitiveWordsPath, "utf8")
    .split(/\r?\n/)
    .map((word) => word.trim())
    .filter(Boolean);

export const DEFAULT_TOPICS = [
  { id: "canteen", title: "食堂高峰排队太久" },
  { id: "study-room", title: "自习室占座难" },
  { id: "course-info", title: "课程信息分散" },
  { id: "club-match", title: "社团活动难找同伴" },
  { id: "campus-map", title: "新生找路成本高" }
];

export const TOPICS = DEFAULT_TOPICS;

export const CODE_TASKS = [
  {
    id: "merge-guard",
    language: "JavaScript",
    title: "合并前先看测试",
    filePath: "src/merge.js",
    prompt: "补全条件：只有测试通过时，PR 才能被合并。",
    snippet: ["export function mergeIfReady(pr) {", "  if (____) {", "    return merge(pr);", "  }", "}"],
    choices: [
      { id: "tests-passed", label: "pr.testsPassed" },
      { id: "has-title", label: "pr.title" },
      { id: "is-draft", label: "pr.isDraft" }
    ],
    correctChoiceId: "tests-passed",
    resultLabel: "tests passed"
  },
  {
    id: "reviewers-filter",
    language: "JavaScript",
    title: "筛出已通过评审",
    filePath: "src/reviews.js",
    prompt: "补全数组方法：只保留 approved 为 true 的评审。",
    snippet: ["const approvedReviews = reviews.____(", "  (review) => review.approved", ");"],
    choices: [
      { id: "filter", label: "filter" },
      { id: "map", label: "map" },
      { id: "reduce", label: "reduce" }
    ],
    correctChoiceId: "filter",
    resultLabel: "review filtered"
  },
  {
    id: "fork-copy",
    language: "JavaScript",
    title: "Fork 不要改原仓库",
    filePath: "src/fork.js",
    prompt: "补全返回值：Fork 应该生成一个新对象，而不是复用原对象。",
    snippet: ["export function fork(repo) {", "  return ____;", "}"],
    choices: [
      { id: "copy", label: "{ ...repo, parentId: repo.id }" },
      { id: "same", label: "repo" },
      { id: "empty", label: "{}" }
    ],
    correctChoiceId: "copy",
    resultLabel: "fork created"
  },
  {
    id: "issue-template",
    language: "JavaScript",
    title: "Issue 需要标题",
    filePath: "src/issues.js",
    prompt: "补全空值合并：没有标题时给出默认文案。",
    snippet: ["const issueTitle = input.title ____ \"Untitled issue\";"],
    choices: [
      { id: "nullish", label: "??" },
      { id: "plus", label: "+" },
      { id: "equal", label: "=" }
    ],
    correctChoiceId: "nullish",
    resultLabel: "fallback ready"
  },
  {
    id: "conflict-marker",
    language: "JavaScript",
    title: "识别冲突文件",
    filePath: "src/conflicts.js",
    prompt: "补全判断：文件中包含冲突标记时返回 true。",
    snippet: ["export const hasConflict = (content) =>", "  content.____(\"<<<<<<<\");"],
    choices: [
      { id: "includes", label: "includes" },
      { id: "push", label: "push" },
      { id: "join", label: "join" }
    ],
    correctChoiceId: "includes",
    resultLabel: "conflict detected"
  },
  {
    id: "commit-message",
    language: "JavaScript",
    title: "提交信息不能空",
    filePath: "src/commit.js",
    prompt: "补全判断：空字符串不允许提交。",
    snippet: ["if (message.____().length === 0) {", "  throw new Error(\"empty commit\");", "}"],
    choices: [
      { id: "trim", label: "trim" },
      { id: "slice", label: "slice" },
      { id: "split", label: "split" }
    ],
    correctChoiceId: "trim",
    resultLabel: "message checked"
  },
  {
    id: "star-count",
    language: "JavaScript",
    title: "Star 数递增",
    filePath: "src/stars.js",
    prompt: "补全更新：收到一个 Star 后，计数加一。",
    snippet: ["repo.stars = repo.stars ____ 1;"],
    choices: [
      { id: "plus", label: "+" },
      { id: "minus", label: "-" },
      { id: "times", label: "*" }
    ],
    correctChoiceId: "plus",
    resultLabel: "star added"
  },
  {
    id: "async-ci",
    language: "JavaScript",
    title: "等待 CI 完成",
    filePath: "src/ci.js",
    prompt: "补全关键字：在继续前等待异步测试。",
    snippet: ["const result = ____ runTests(pr);"],
    choices: [
      { id: "await", label: "await" },
      { id: "yield", label: "yield" },
      { id: "return", label: "return" }
    ],
    correctChoiceId: "await",
    resultLabel: "ci complete"
  },
  {
    id: "python-pr-label",
    language: "Python",
    title: "给 PR 加标签",
    filePath: "scripts/labels.py",
    prompt: "补全方法：把 needs-review 标签加入列表。",
    snippet: ["def add_review_label(labels):", "    labels.____(\"needs-review\")", "    return labels"],
    choices: [
      { id: "append", label: "append" },
      { id: "pop", label: "pop" },
      { id: "clear", label: "clear" }
    ],
    correctChoiceId: "append",
    resultLabel: "label added"
  },
  {
    id: "python-safe-default",
    language: "Python",
    title: "读取默认配置",
    filePath: "scripts/config.py",
    prompt: "补全字典读取：没有 branch 时默认使用 main。",
    snippet: ["branch = config.____(\"branch\", \"main\")"],
    choices: [
      { id: "get", label: "get" },
      { id: "keys", label: "keys" },
      { id: "items", label: "items" }
    ],
    correctChoiceId: "get",
    resultLabel: "default branch"
  },
  {
    id: "java-review-required",
    language: "Java",
    title: "至少一位 Reviewer",
    filePath: "src/main/java/ReviewGate.java",
    prompt: "补全判断：Reviewer 数量大于 0 才能进入合并流程。",
    snippet: ["if (pullRequest.getReviewers().____() > 0) {", "    merge(pullRequest);", "}"],
    choices: [
      { id: "size", label: "size" },
      { id: "clear", label: "clear" },
      { id: "hashCode", label: "hashCode" }
    ],
    correctChoiceId: "size",
    resultLabel: "review gate"
  },
  {
    id: "java-issue-prefix",
    language: "Java",
    title: "Issue 标题前缀",
    filePath: "src/main/java/IssueFormatter.java",
    prompt: "补全字符串方法：判断标题是否已经带有 BUG 前缀。",
    snippet: ["if (!title.____(\"BUG:\")) {", "    title = \"BUG: \" + title;", "}"],
    choices: [
      { id: "startsWith", label: "startsWith" },
      { id: "endsWith", label: "endsWith" },
      { id: "trim", label: "trim" }
    ],
    correctChoiceId: "startsWith",
    resultLabel: "issue formatted"
  },
  {
    id: "go-ci-error",
    language: "Go",
    title: "CI 失败要返回错误",
    filePath: "internal/ci/check.go",
    prompt: "补全判断：当 err 不为空时立即返回。",
    snippet: ["result, err := RunTests(pr)", "if err ____ nil {", "    return result, err", "}"],
    choices: [
      { id: "not-equal", label: "!=" },
      { id: "equal", label: "==" },
      { id: "assign", label: ":=" }
    ],
    correctChoiceId: "not-equal",
    resultLabel: "ci guarded"
  },
  {
    id: "go-commit-slice",
    language: "Go",
    title: "追加 Commit",
    filePath: "internal/git/commit.go",
    prompt: "补全内置函数：把新 Commit 追加到列表末尾。",
    snippet: ["commits = ____(commits, newCommit)"],
    choices: [
      { id: "append", label: "append" },
      { id: "copy", label: "copy" },
      { id: "delete", label: "delete" }
    ],
    correctChoiceId: "append",
    resultLabel: "commit appended"
  },
  {
    id: "js-default-reviewer",
    language: "JavaScript",
    title: "没有 Reviewer 时使用机器人",
    filePath: "src/reviewer.js",
    prompt: "补全空值合并：没有人工 Reviewer 时交给 bot。",
    snippet: ["const reviewer = pr.reviewers?.[0] ____ \"bot\";"],
    choices: [
      { id: "nullish", label: "??" },
      { id: "and", label: "&&" },
      { id: "minus", label: "-" }
    ],
    correctChoiceId: "nullish",
    resultLabel: "reviewer fallback"
  },
  {
    id: "js-unique-contributors",
    language: "JavaScript",
    title: "贡献者去重",
    filePath: "src/contributors.js",
    prompt: "补全集合类型：去掉重复贡献者。",
    snippet: ["const uniqueContributors = new ____(contributors);"],
    choices: [
      { id: "set", label: "Set" },
      { id: "map", label: "Map" },
      { id: "date", label: "Date" }
    ],
    correctChoiceId: "set",
    resultLabel: "contributors deduped"
  },
  {
    id: "python-approved-comprehension",
    language: "Python",
    title: "筛选通过的 Review",
    filePath: "scripts/reviews.py",
    prompt: "补全属性名：只留下已经通过的 Review。",
    snippet: ["approved = [review for review in reviews if review.____]"],
    choices: [
      { id: "approved", label: "approved" },
      { id: "title", label: "title" },
      { id: "draft", label: "draft" }
    ],
    correctChoiceId: "approved",
    resultLabel: "approved reviews"
  },
  {
    id: "python-json-loads",
    language: "Python",
    title: "解析 Webhook JSON",
    filePath: "scripts/webhook.py",
    prompt: "补全方法：把 JSON 字符串解析成对象。",
    snippet: ["payload = json.____(raw_body)"],
    choices: [
      { id: "loads", label: "loads" },
      { id: "load", label: "load" },
      { id: "dump", label: "dump" }
    ],
    correctChoiceId: "loads",
    resultLabel: "json parsed"
  },
  {
    id: "python-path-exists",
    language: "Python",
    title: "检查配置文件是否存在",
    filePath: "scripts/files.py",
    prompt: "补全方法：判断路径是否存在。",
    snippet: ["if config_path.____():", "    load_config(config_path)"],
    choices: [
      { id: "exists", label: "exists" },
      { id: "write_text", label: "write_text" },
      { id: "unlink", label: "unlink" }
    ],
    correctChoiceId: "exists",
    resultLabel: "config found"
  },
  {
    id: "python-raise-empty",
    language: "Python",
    title: "空 Issue 要报错",
    filePath: "scripts/issues.py",
    prompt: "补全关键字：标题为空时抛出异常。",
    snippet: ["if not title.strip():", "    ____ ValueError(\"empty issue\")"],
    choices: [
      { id: "raise", label: "raise" },
      { id: "return", label: "return" },
      { id: "yield", label: "yield" }
    ],
    correctChoiceId: "raise",
    resultLabel: "issue validated"
  },
  {
    id: "python-sort-stars",
    language: "Python",
    title: "按 Star 倒序排序",
    filePath: "scripts/stars.py",
    prompt: "补全参数：Star 多的仓库排在前面。",
    snippet: ["repos.sort(key=lambda repo: repo[\"stars\"], ____)"],
    choices: [
      { id: "reverse", label: "reverse=True" },
      { id: "reverse-false", label: "reverse=False" },
      { id: "key-none", label: "key=None" }
    ],
    correctChoiceId: "reverse",
    resultLabel: "repos sorted"
  },
  {
    id: "python-env-get",
    language: "Python",
    title: "读取默认分支环境变量",
    filePath: "scripts/env.py",
    prompt: "补全方法：没有环境变量时使用 main。",
    snippet: ["branch = os.environ.____(\"BRANCH\", \"main\")"],
    choices: [
      { id: "get", label: "get" },
      { id: "popitem", label: "popitem" },
      { id: "clear", label: "clear" }
    ],
    correctChoiceId: "get",
    resultLabel: "env loaded"
  },
  {
    id: "python-merge-dict",
    language: "Python",
    title: "合并配置覆盖项",
    filePath: "scripts/merge.py",
    prompt: "补全变量：用 overrides 覆盖 base 配置。",
    snippet: ["merged = {**base, **____}"],
    choices: [
      { id: "overrides", label: "overrides" },
      { id: "base", label: "base" },
      { id: "None", label: "None" }
    ],
    correctChoiceId: "overrides",
    resultLabel: "config merged"
  },
  {
    id: "python-test-prefix",
    language: "Python",
    title: "识别测试函数",
    filePath: "scripts/tests.py",
    prompt: "补全方法：Python 测试函数通常以 test_ 开头。",
    snippet: ["if name.____(\"test_\"):", "    collect(name)"],
    choices: [
      { id: "startswith", label: "startswith" },
      { id: "endswith", label: "endswith" },
      { id: "replace", label: "replace" }
    ],
    correctChoiceId: "startswith",
    resultLabel: "test collected"
  },
  {
    id: "java-empty-message",
    language: "Java",
    title: "提交信息不能为空",
    filePath: "src/main/java/CommitValidator.java",
    prompt: "补全方法：去掉空格后判断是否为空。",
    snippet: ["if (message.trim().____()) {", "    throw new IllegalArgumentException(\"empty\");", "}"],
    choices: [
      { id: "isEmpty", label: "isEmpty" },
      { id: "length", label: "length" },
      { id: "toString", label: "toString" }
    ],
    correctChoiceId: "isEmpty",
    resultLabel: "message validated"
  },
  {
    id: "java-label-add",
    language: "Java",
    title: "添加 Review 标签",
    filePath: "src/main/java/Labels.java",
    prompt: "补全方法：向列表中添加 needs-review。",
    snippet: ["labels.____(\"needs-review\");"],
    choices: [
      { id: "add", label: "add" },
      { id: "remove", label: "remove" },
      { id: "clear", label: "clear" }
    ],
    correctChoiceId: "add",
    resultLabel: "label added"
  },
  {
    id: "java-optional-branch",
    language: "Java",
    title: "Optional 默认分支",
    filePath: "src/main/java/Branch.java",
    prompt: "补全方法：Optional 为空时使用 main。",
    snippet: ["String target = branch.____(\"main\");"],
    choices: [
      { id: "orElse", label: "orElse" },
      { id: "get", label: "get" },
      { id: "empty", label: "empty" }
    ],
    correctChoiceId: "orElse",
    resultLabel: "branch resolved"
  },
  {
    id: "java-stream-filter",
    language: "Java",
    title: "Stream 过滤通过评审",
    filePath: "src/main/java/Reviews.java",
    prompt: "补全 Stream 方法：筛选已通过评审。",
    snippet: ["reviews.stream()", "    .____(Review::isApproved)", "    .toList();"],
    choices: [
      { id: "filter", label: "filter" },
      { id: "map", label: "map" },
      { id: "peek", label: "peek" }
    ],
    correctChoiceId: "filter",
    resultLabel: "stream filtered"
  },
  {
    id: "java-map-default",
    language: "Java",
    title: "Map 默认值",
    filePath: "src/main/java/Config.java",
    prompt: "补全方法：没有 branch 配置时默认 main。",
    snippet: ["String branch = config.____(\"branch\", \"main\");"],
    choices: [
      { id: "getOrDefault", label: "getOrDefault" },
      { id: "put", label: "put" },
      { id: "remove", label: "remove" }
    ],
    correctChoiceId: "getOrDefault",
    resultLabel: "config fallback"
  },
  {
    id: "java-throw-invalid",
    language: "Java",
    title: "非法输入要抛异常",
    filePath: "src/main/java/InputGuard.java",
    prompt: "补全关键字：输入非法时抛出异常。",
    snippet: ["if (!valid) {", "    ____ new IllegalArgumentException(\"invalid\");", "}"],
    choices: [
      { id: "throw", label: "throw" },
      { id: "return", label: "return" },
      { id: "break", label: "break" }
    ],
    correctChoiceId: "throw",
    resultLabel: "input guarded"
  },
  {
    id: "java-equals-main",
    language: "Java",
    title: "判断是否 main 分支",
    filePath: "src/main/java/BranchGuard.java",
    prompt: "补全方法：安全比较字符串是否等于 main。",
    snippet: ["if (\"main\".____(branch)) {", "    deploy();", "}"],
    choices: [
      { id: "equals", label: "equals" },
      { id: "contains", label: "contains" },
      { id: "split", label: "split" }
    ],
    correctChoiceId: "equals",
    resultLabel: "branch checked"
  },
  {
    id: "java-conflict-contains",
    language: "Java",
    title: "检测冲突标记",
    filePath: "src/main/java/ConflictScanner.java",
    prompt: "补全方法：内容中包含冲突标记时返回 true。",
    snippet: ["return content.____(\"<<<<<<<\");"],
    choices: [
      { id: "contains", label: "contains" },
      { id: "concat", label: "concat" },
      { id: "trim", label: "trim" }
    ],
    correctChoiceId: "contains",
    resultLabel: "conflict scanned"
  },
  {
    id: "go-map-ok",
    language: "Go",
    title: "读取标签是否存在",
    filePath: "internal/labels/read.go",
    prompt: "补全变量：map 读取时用 ok 判断键是否存在。",
    snippet: ["_, ok := labels[\"reviewed\"]", "if ____ {", "    return true", "}"],
    choices: [
      { id: "ok", label: "ok" },
      { id: "nil", label: "nil" },
      { id: "labels", label: "labels" }
    ],
    correctChoiceId: "ok",
    resultLabel: "label checked"
  },
  {
    id: "go-trim-message",
    language: "Go",
    title: "清理提交信息空格",
    filePath: "internal/git/message.go",
    prompt: "补全函数：去掉提交信息两侧空格。",
    snippet: ["message = strings.____(message)"],
    choices: [
      { id: "TrimSpace", label: "TrimSpace" },
      { id: "Contains", label: "Contains" },
      { id: "Split", label: "Split" }
    ],
    correctChoiceId: "TrimSpace",
    resultLabel: "message trimmed"
  },
  {
    id: "go-len-reviewers",
    language: "Go",
    title: "Reviewer 数量检查",
    filePath: "internal/review/check.go",
    prompt: "补全内置函数：没有 Reviewer 时返回错误。",
    snippet: ["if ____(reviewers) == 0 {", "    return errors.New(\"reviewer required\")", "}"],
    choices: [
      { id: "len", label: "len" },
      { id: "cap", label: "cap" },
      { id: "copy", label: "copy" }
    ],
    correctChoiceId: "len",
    resultLabel: "reviewer checked"
  },
  {
    id: "go-make-map",
    language: "Go",
    title: "初始化标签表",
    filePath: "internal/labels/map.go",
    prompt: "补全内置函数：创建一个 map。",
    snippet: ["labels := ____(map[string]bool)"],
    choices: [
      { id: "make", label: "make" },
      { id: "new", label: "new" },
      { id: "append", label: "append" }
    ],
    correctChoiceId: "make",
    resultLabel: "map ready"
  },
  {
    id: "go-defer-close",
    language: "Go",
    title: "延迟关闭文件",
    filePath: "internal/files/open.go",
    prompt: "补全关键字：函数返回前自动关闭文件。",
    snippet: ["file, err := os.Open(path)", "if err != nil { return err }", "____ file.Close()"],
    choices: [
      { id: "defer", label: "defer" },
      { id: "go", label: "go" },
      { id: "fallthrough", label: "fallthrough" }
    ],
    correctChoiceId: "defer",
    resultLabel: "file deferred"
  },
  {
    id: "go-context-todo",
    language: "Go",
    title: "创建临时 Context",
    filePath: "internal/ci/context.go",
    prompt: "补全函数：暂时没有上游 context 时使用 TODO。",
    snippet: ["ctx := context.____()"],
    choices: [
      { id: "TODO", label: "TODO" },
      { id: "Sleep", label: "Sleep" },
      { id: "Println", label: "Println" }
    ],
    correctChoiceId: "TODO",
    resultLabel: "context ready"
  },
  {
    id: "go-strings-contains",
    language: "Go",
    title: "检测冲突标记",
    filePath: "internal/conflict/scan.go",
    prompt: "补全函数：判断文本是否包含冲突标记。",
    snippet: ["return strings.____(content, \"<<<<<<<\")"],
    choices: [
      { id: "Contains", label: "Contains" },
      { id: "TrimSpace", label: "TrimSpace" },
      { id: "Join", label: "Join" }
    ],
    correctChoiceId: "Contains",
    resultLabel: "conflict found"
  },
  {
    id: "go-test-fatal",
    language: "Go",
    title: "测试失败立即停止",
    filePath: "internal/ci/check_test.go",
    prompt: "补全测试方法：遇到致命错误时停止当前测试。",
    snippet: ["if !passed {", "    t.____(\"expected tests passed\")", "}"],
    choices: [
      { id: "Fatal", label: "Fatal" },
      { id: "Log", label: "Log" },
      { id: "Skip", label: "Skip" }
    ],
    correctChoiceId: "Fatal",
    resultLabel: "test guarded"
  }
];

export const DEFAULT_PRIZES = [
  {
    id: "sticker",
    title: "“开源贡献者”像素风贴纸",
    description: "满 2 分后可参与抽取",
    threshold: 2,
    totalStock: 200,
    drawEnabled: true
  },
  {
    id: "badge",
    title: "“OpenPixel 共创者”金属徽章",
    description: "满 3 分后可参与抽取",
    threshold: 3,
    totalStock: 100,
    drawEnabled: true
  },
  {
    id: "grand",
    title: "终极大奖",
    description: "满 3 分后可参与抽取",
    threshold: 3,
    totalStock: 1,
    drawEnabled: true
  },
  {
    id: "mvp",
    title: "“最具价值贡献者”大奖",
    description: "活动结束时 Star 数最高的创意作者获得",
    threshold: null,
    totalStock: 1,
    drawEnabled: false
  }
];

export const CONFIG = {
  port: parseNumber(process.env.PORT, 3000),
  redisUrl: process.env.REDIS_URL || "",
  adminToken: process.env.ADMIN_TOKEN || "",
  adminAuthMaxFailures: parseNumber(process.env.ADMIN_AUTH_MAX_FAILURES, 3),
  adminAuthFailureWindowMs: parseNumber(process.env.ADMIN_AUTH_FAILURE_WINDOW_MS, 10 * 60 * 1000),
  adminAuthBanDurationMs: parseNumber(process.env.ADMIN_AUTH_BAN_DURATION_MS, 10 * 60 * 1000),
  muteDurationMs: parseNumber(process.env.MUTE_DURATION_MS, 5 * 60 * 1000),
  tokenCapacity: parseNumber(process.env.TOKEN_CAPACITY, 5),
  tokenRefillMs: parseNumber(process.env.TOKEN_REFILL_MS, 60 * 1000),
  canvasSize: 100,
  clientOrigin: process.env.CLIENT_ORIGIN || "*",
  runtimeStatePath: process.env.RUNTIME_STATE_PATH || runtimeStatePath,
  sensitiveWords: loadSensitiveWords()
};
