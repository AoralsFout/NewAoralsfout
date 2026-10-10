/** 展示站显式样例模式；导出独立演示内容与副本工厂，公开 API 模式不会调用这些内容作为回退。 */
import type {
  ContributionDay,
  ShowcaseContributions,
  ShowcaseData,
  ShowcaseProject,
} from "./types";

export const staticProjects: ShowcaseProject[] = [
  {
    slug: "neoblog",
    title: "NEOBLOG",
    subtitle: "给思考一个安静的空间。",
    category: "网站开发",
    year: "2026",
    description:
      "一个从阅读体验出发的个人博客。让文字、图片与音乐各得其所，把零散的思考整理成可以不断生长的数字档案。",
    stack: ["Vue 3", "TypeScript", "Node.js", "MySQL"],
    accent: "blue",
    featured: true,
    challenge: [
      "内容很多的时候，阅读应该依然轻松。设计从清晰的层级和舒适的行宽出发，让读者能把注意力留给文字。",
      "前台阅读与后台管理各自承担明确的职责，身份验证和内容数据由后端统一维护。",
    ],
    outcome: [
      "文章、标签和归档形成连续的阅读路径；音乐作为可自主选择的背景，保留安静浏览的空间。",
      "这是一份作品展示样例，呈现的是项目方向与界面表达。",
    ],
  },
  {
    slug: "aoralsfout",
    title: "AORALSFOUT",
    subtitle: "一场关于文字与秩序的实验。",
    category: "网站开发",
    year: "2026",
    description:
      "把个人网站当作一场数字展览。用超大文字、鲜明的颜色和连续的滚动节奏，连接作品、思考与生活的切片。",
    stack: ["Vue 3", "GSAP", "Vite", "CSS"],
    accent: "yellow",
    featured: true,
    challenge: [
      "如何让一个以文字为主角的页面拥有空间感？通过字号、裁切、留白和层级建立节奏，再让运动帮助访客理解内容。",
      "视觉表达需要足够大胆，同时保留明确的导航、清晰的阅读和对键盘操作的支持。",
    ],
    outcome: [
      "页面以章节串联作品和动态，在强烈的视觉变化之间安排安静的阅读区域。",
      "公开内容可逐步接入现有服务，尚未提供的数据使用明确标识的展示样例。",
    ],
  },
  {
    slug: "orbit-lab",
    title: "ORBIT LAB",
    subtitle: "让交互走出平面。",
    category: "交互实验",
    year: "2025",
    description:
      "收集一些还在生长的交互想法：会响应指针的空间、滚动中的文字和有一点意外的界面。保持好奇，也保持动手。",
    stack: ["Three.js", "WebGL", "GSAP"],
    accent: "ink",
    featured: false,
    challenge: [
      "让空间变化服务于操作和反馈，避免复杂的视觉效果抢走内容本身的注意力。",
    ],
    outcome: [
      "将小型实验整理为可反复探索的交互草稿，这份内容作为展示样例使用。",
    ],
  },
];

/** 样例热力图使用确定性序列，刷新页面不会产生随机闪动。 */
function createContributions(): ShowcaseContributions {
  const start = new Date("2026-04-13T00:00:00Z");
  const days: ContributionDay[] = Array.from({ length: 182 }, (_, index) => {
    const date = new Date(start.getTime() + index * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const seed = (index * 17 + Math.floor(index / 7) * 13 + 31) % 29;
    const count =
      seed < 9 ? 0 : seed < 17 ? 2 : seed < 23 ? 5 : seed < 27 ? 9 : 14;
    const level =
      count === 0 ? 0 : count < 3 ? 1 : count < 7 ? 2 : count < 12 ? 3 : 4;
    return { date, count, level };
  });
  let streak = 0;
  let longestStreak = 0;
  days.forEach((day) => {
    streak = day.count > 0 ? streak + 1 : 0;
    longestStreak = Math.max(longestStreak, streak);
  });
  return {
    total: days.reduce((sum, day) => sum + day.count, 0),
    days,
    longestStreak,
    activeWeeks: new Set(
      days
        .filter((day) => day.count > 0)
        .map((day) =>
          Math.floor(
            (Date.parse(day.date) - start.getTime()) / (7 * 86_400_000),
          ),
        ),
    ).size,
  };
}

export const mockShowcaseData: ShowcaseData = {
  profile: {
    name: "AoralsFout",
    handle: "aoralsfout",
    tagline: "设计与开发，把想法变成可触摸的体验。",
    bio: "关注界面的秩序，也在寻找秩序之外的惊喜。写代码、做设计，记录每一次从想法到实现的过程。",
    location: "中国 · 在线",
  },
  status: {
    text: "正在打磨个人网站，也在探索文字与交互的新可能。",
    label: "正在创造",
    updatedAt: "2026-10-08T09:30:00Z",
  },
  projects: staticProjects,
  // 显式样例使用独立的示例仓库命名，字节数与百分比一致，不用来描述真实技能。
  languages: [
    {
      name: "NeoBlog",
      fullName: "sample/NeoBlog",
      languages: [
        { name: "TypeScript", bytes: 1200, percentage: 60 },
        { name: "Vue", bytes: 800, percentage: 40 },
      ],
    },
    {
      name: "AoralsFout",
      fullName: "sample/AoralsFout",
      languages: [
        { name: "TypeScript", bytes: 600, percentage: 30 },
        { name: "Vue", bytes: 1400, percentage: 70 },
      ],
    },
  ],
  articles: [
    {
      id: "type-as-interface",
      title: "当文字成为界面",
      summary: "字号、留白与运动，如何一起建立页面的情绪与秩序。",
      category: "设计思考",
      date: "2026-10-06",
      readingMinutes: 6,
      tags: ["排版", "交互设计"],
      content: [
        "文字是界面的信息，也是界面的形状。当一个标题被放大，它不再只是告诉你这一页是什么，还会决定页面的重量、方向和节奏。",
        "我的习惯是先把页面上的装饰拿走，只留下文字与网格。通过字号、间距、对齐和分割线，观察内容是否已经拥有清晰的阅读顺序。",
        "运动应该延续这套秩序：用位移连接两个位置，用遮罩揭示下一层内容，在最需要阅读的时候留出停顿。",
        "这是一篇展示样例，记录一种从文字出发思考界面的方式。",
      ],
    },
    {
      id: "small-systems",
      title: "从一个小系统开始",
      summary: "把重复的问题整理成规则，为长期迭代留一点空间。",
      category: "开发手记",
      date: "2026-09-24",
      readingMinutes: 8,
      tags: ["前端开发", "设计系统"],
      content: [
        "一个项目最初可能只有几个页面。随着功能增长，重复的颜色、间距与状态会越来越多，修改也会变得越来越难追踪。",
        "我倾向于从最容易重复的地方开始：统一间距、确定文字层级，再把按钮与表单的状态整理清楚。小而明确的规则比一次性搭建庞大的系统更容易维护。",
        "好的抽象应当减少下一次修改需要理解的事情。它让内容能变化，也让页面始终保有一致的性格。",
        "这篇展示样例讨论的是一种逐步建立界面规则的工作方法。",
      ],
    },
    {
      id: "keep-exploring",
      title: "保持一点无用的好奇",
      summary: "偶尔离开熟悉的工具，把一个不成熟的想法做成小实验。",
      category: "日常记录",
      date: "2026-09-12",
      readingMinutes: 4,
      tags: ["创作", "日常"],
      content: [
        "有些实验并没有明确的用途：一段会旋转的文字、一片随指针变化的光，或者一个只能完成一件小事的页面。",
        "它们很小，却能让人重新感受到制作东西的乐趣。把一个想法做出来之后，新的问题往往会自己出现。",
        "我想给这些没有确定答案的尝试保留一个角落。完成一件大事之前，也可以先完成一件有趣的小事。",
        "这是一篇日常记录的展示样例。",
      ],
    },
  ],
  goals: [
    {
      id: "creative-code",
      title: "创意编程与 WebGL",
      description: "从简单的形状开始，探索浏览器中的空间与运动。",
      progress: 68,
      status: "active",
    },
    {
      id: "type-system",
      title: "搭建自己的排版系统",
      description: "整理字号、网格和阅读节奏，让设计有迹可循。",
      progress: 42,
      status: "active",
    },
    {
      id: "daily-writing",
      title: "持续记录，持续输出",
      description: "把项目里的发现写下来，也留下创作过程中的思考。",
      progress: 26,
      status: "active",
    },
  ],
  activity: [
    {
      id: "sample-1",
      type: "PushEvent",
      title: "打磨展示页的阅读节奏",
      repo: "AoralsFout / showcase",
      date: "2026-10-08T09:30:00Z",
    },
    {
      id: "sample-2",
      type: "ReleaseEvent",
      title: "为博客整理新的内容模块",
      repo: "AoralsFout / NeoBlog",
      date: "2026-10-05T05:00:00Z",
    },
    {
      id: "sample-3",
      type: "CreateEvent",
      title: "开启一个新的交互实验",
      repo: "AoralsFout / orbit-lab",
      date: "2026-10-02T12:00:00Z",
    },
  ],
  contributions: createContributions(),
  steamProfile: null,
  steamStatus: null,
  collections: [
    {
      id: "game-1",
      title: "HOLLOW KNIGHT",
      subtitle: "在遗忘的王国里，继续向前。",
      category: "game",
      accent: "ink",
      sourceId: "sample-game",
      playtimeMinutes: 2400,
      lastPlayedAt: "2026-10-08T00:00:00Z",
    },
    {
      id: "anime-1",
      title: "葬送的芙莉莲",
      subtitle: "关于旅途、时间和相遇。",
      category: "anime",
      accent: "blue",
      sourceId: "sample-anime",
      rate: 9,
      collectionStatus: "watched",
    },
    {
      id: "book-1",
      title: "设计中的设计",
      subtitle: "重新看见日常里的设计。",
      category: "book",
      accent: "yellow",
    },
  ],
  contacts: [
    { id: 'sample-work-email', type: 'email', label: '工作联系', value: 'hello@example.com', url: null },
    { id: 'sample-github', type: 'github', label: '代码与项目', value: 'GitHub', url: 'https://github.com/aoralsfout' },
  ],
  sampleSections: [
    "profile",
    "status",
    "projects",
    "languages",
    "articles",
    "goals",
    "contacts",
    "activity",
    "contributions",
    "collections",
  ],
};

/** 每次创建独立副本，防止组件状态影响下一次加载与其他实例。 */
export function createMockShowcaseData(): ShowcaseData {
  return structuredClone(mockShowcaseData);
}
