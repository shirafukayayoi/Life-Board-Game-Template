import type {
  Player,
  Ending,
  PlayerResult,
  ExperienceKey,
  IntentTag,
} from "./gameShared";
import { EXPERIENCE_KEYS } from "./gameShared";

// ─── Score Calculation ───────────────────────────────────────────

const EXPERIENCE_WEIGHTS: Record<ExperienceKey, number> = {
  intellect: 3,
  connections: 3,
  work_tolerance: 2,
  action_power: 2,
  romance_exp: 1,
};

export function calculateScore(player: Player): number {
  return calculateScoreBreakdown(player).total;
}

export function calculateScoreBreakdown(player: Player) {
  const exp = player.experience;
  const res = player.resources;

  let experience = 0;

  // Weighted experience sum
  for (const key of EXPERIENCE_KEYS) {
    experience += exp[key] * EXPERIENCE_WEIGHTS[key];
  }

  // Resource contributions
  const health = res.health * 1;
  const money = res.money * 0.5;

  // Credit bonus / penalty (卒業要件: 124単位)
  let credits = -10;
  if (res.credits >= 140) {
    credits = 15;
  } else if (res.credits >= 124) {
    credits = 10;
  } else if (res.credits >= 100) {
    credits = 3;
  }

  return {
    experience,
    health,
    money,
    credits,
    total: experience + health + money + credits,
  };
}

// ─── Ending Data ─────────────────────────────────────────────────

const ENDINGS: Record<string, Ending> = {
  jobless: {
    id: "jobless",
    title: "無職エンド",
    emoji: "😶",
    description: "予定通りにはいかなかった。でも、ここで終わりではない。",
    flavorText: "進路はまだ決まっていない。少し休んでから考え直せる。",
  },
  ryuunen: {
    id: "ryuunen",
    title: "留年エンド",
    emoji: "🔄",
    description: "まだキャンパスにいる。もう1周。",
    flavorText: "足りなかった単位は、次の作戦会議の材料になる。",
  },
  therapy: {
    id: "therapy",
    title: "療養エンド",
    emoji: "🏥",
    description: "頑張りすぎた。まずは休もう。",
    flavorText: "無理を続けるより、一度休む判断をした。",
  },
  realist: {
    id: "realist",
    title: "稼ぐ現実主義者",
    emoji: "💰",
    description: "金の力を知った学生時代。投資もう始めてそう。",
    flavorText: "お金や生活のことをちゃんと見て動けるようになった。",
  },
  balanced: {
    id: "balanced",
    title: "バランス最強の理想型",
    emoji: "⭐",
    description: "何でもできる。器用貧乏とも言う。",
    flavorText: "授業、友達、生活を少しずつ守って卒業まで来た。",
  },
  void: {
    id: "void",
    title: "虚無…だが自由",
    emoji: "😴",
    description: "何もしなかった。でも後悔はない…たぶん。",
    flavorText: "何もしていないように見えても、自分のペースは守っていた。",
  },
  scholar: {
    id: "scholar",
    title: "学究の道",
    emoji: "📚",
    description: "知を追い求めた4年間。研究者か、それに近い何か。",
    flavorText: "気になったことを追い続けた結果、研究の道が見えてきた。",
  },
  popular: {
    id: "popular",
    title: "愛されキャンパス王",
    emoji: "🤝",
    description: "誰からも慕われる存在。人脈が最大の財産。",
    flavorText: "卒業後も連絡できる人がたくさん残った。",
  },
  worker: {
    id: "worker",
    title: "プロ社会人",
    emoji: "💼",
    description: "即戦力。上司が泣いて喜ぶ新人。",
    flavorText: "レポート、バイト、締切の積み重ねが社会に出る準備になった。",
  },
  adventurer: {
    id: "adventurer",
    title: "冒険者タイプ",
    emoji: "🚀",
    description: "誰もやらないことをやった。起業か、旅か、革命か。",
    flavorText: "普通の進路から少し外れたぶん、選択肢は増えた。",
  },
  romantic: {
    id: "romantic",
    title: "恋に生きた4年間",
    emoji: "💕",
    description: "恋愛経験値MAX。結婚式のスピーチが長い。",
    flavorText: "心が動いた場面の多さが、この4年間の熱量だった。",
  },
};

// ─── Ending Determination ────────────────────────────────────────

const BOARD_INTENT_TAGS: IntentTag[] = [
  "study",
  "research",
  "social",
  "community",
  "romance",
  "career",
  "work",
  "creative",
  "adventure",
  "rest",
  "risk",
];

const ACADEMIC_STATUSES: Record<string, Ending> = {
  career_unsettled: {
    id: "career_unsettled",
    title: "進路保留",
    emoji: "🧭",
    description: "卒業は見えたが、進路はまだ決め切れていない。",
    flavorText: "急がず決め直す時間も、大学生活の続きにある。",
  },
  retained: {
    id: "retained",
    title: "卒業は持ち越し",
    emoji: "🔄",
    description: "単位が足りず、卒業はもう少し先になった。",
    flavorText: "足りない分が見えたので、次は取り返せる。",
  },
  recovery_first: {
    id: "recovery_first",
    title: "休む判断",
    emoji: "🏥",
    description: "まずは体調と生活を戻すことを優先した。",
    flavorText: "止まる判断が、次に進むための準備になった。",
  },
  graduated: {
    id: "graduated",
    title: "卒業",
    emoji: "🎓",
    description: "必要な単位を取り切り、卒業までたどり着いた。",
    flavorText: "派手ではなくても、4年間を終えた事実は強い。",
  },
};

const LIFE_ARCHETYPES: Record<string, Ending> = {
  scholar: {
    id: "scholar",
    title: "研究・学び型",
    emoji: "📚",
    description: "授業や研究を積み重ね、自分の問いを持つようになった。",
    flavorText: "知性の高さではなく、問い続けた履歴がこの結果を作った。",
  },
  campus_connector: {
    id: "campus_connector",
    title: "人間関係の中心",
    emoji: "🤝",
    description: "友人、先輩、学外のつながりが学生生活の軸になった。",
    flavorText: "困った時に名前を呼べる相手が増えた。",
  },
  romantic: {
    id: "romantic",
    title: "恋愛も大事にした人",
    emoji: "💕",
    description: "恋愛や近い関係にちゃんと時間を使った。",
    flavorText: "心が動いた選択が、4年間の記憶に残った。",
  },
  career_builder: {
    id: "career_builder",
    title: "進路を作った人",
    emoji: "💼",
    description: "バイト、インターン、就活を通して進路を早めに形にした。",
    flavorText: "進路や就活を後回しにせず、少しずつ現実にしていった。",
  },
  creative_runner: {
    id: "creative_runner",
    title: "制作・挑戦型",
    emoji: "🚀",
    description: "趣味、制作、旅、企画など、外へ踏み出す選択が多かった。",
    flavorText: "普通の学生生活から少しはみ出した分だけ、話せることが増えた。",
  },
  rest_keeper: {
    id: "rest_keeper",
    title: "生活を守った人",
    emoji: "🌿",
    description: "無理をしすぎず、体調や生活リズムを守りながら進んだ。",
    flavorText: "派手さよりも、続けられる状態を選んだ。",
  },
  balanced_life: {
    id: "balanced_life",
    title: "バランス型",
    emoji: "⭐",
    description: "学業、友人、生活、進路を大きく崩さずに進めた。",
    flavorText: "突出はしなくても、ちゃんと自分の形になった。",
  },
};

const STORY_AWARDS: Record<string, Ending> = {
  research_episode: {
    id: "research_episode",
    title: "問いを持ち帰った4年間",
    emoji: "🔎",
    description: "研究や授業で気になったことが、卒業後にも残った。",
  },
  friendship_episode: {
    id: "friendship_episode",
    title: "人に恵まれた4年間",
    emoji: "🫶",
    description: "誰と過ごしたかが、一番の思い出になった。",
  },
  romance_episode: {
    id: "romance_episode",
    title: "ちゃんと好きになった4年間",
    emoji: "💕",
    description: "恋愛や近い関係に向き合った時間が残った。",
  },
  career_episode: {
    id: "career_episode",
    title: "進路を早めに見た4年間",
    emoji: "🧳",
    description: "インターン、就活、働く経験が次の道を作った。",
  },
  creative_episode: {
    id: "creative_episode",
    title: "自分の活動が残った4年間",
    emoji: "🎨",
    description: "制作、企画、挑戦の記憶が卒業後の話題になった。",
  },
  recovery_episode: {
    id: "recovery_episode",
    title: "立て直しを覚えた4年間",
    emoji: "🧩",
    description: "崩れた時に戻す経験も、学生生活の一部になった。",
  },
  ordinary_episode: {
    id: "ordinary_episode",
    title: "自分のペースで終えた4年間",
    emoji: "🌱",
    description: "大きな事件より、続けてきた生活が残った。",
  },
};

function defaultPathScores(): Record<IntentTag, number> {
  return Object.fromEntries(BOARD_INTENT_TAGS.map((tag) => [tag, 0])) as Record<IntentTag, number>;
}

function addScore(scores: Record<IntentTag, number>, tag: IntentTag, amount = 1): void {
  scores[tag] += amount;
}

function collectPathScores(player: Player): Record<IntentTag, number> {
  const savedScores = {
    ...defaultPathScores(),
    ...(player.pathScores ?? {}),
  };
  const hasSavedScores = Object.values(savedScores).some((value) => value > 0);
  const scores = hasSavedScores ? savedScores : defaultPathScores();

  if (!hasSavedScores) {
    for (const entry of player.choiceHistory ?? []) {
      for (const tag of entry.intentTags ?? []) addScore(scores, tag, 1);
    }
  }

  for (const anchor of player.yearAnchors ?? []) {
    for (const tag of anchor.intentTags ?? []) addScore(scores, tag, 2);
  }

  return scores;
}

function scoreGroup(scores: Record<IntentTag, number>, tags: IntentTag[]): number {
  return tags.reduce((sum, tag) => sum + scores[tag], 0);
}

function countAnchors(player: Player, tags: IntentTag[]): number {
  return (player.yearAnchors ?? []).filter((anchor) => (
    anchor.intentTags.some((tag) => tags.includes(tag))
  )).length;
}

function topIntentTags(scores: Record<IntentTag, number>, limit = 3): IntentTag[] {
  return Object.entries(scores)
    .filter(([, value]) => value > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([tag]) => tag as IntentTag);
}

export function determineBoardAcademicStatus(player: Player): Ending {
  if (player.flags.career_failed) return ACADEMIC_STATUSES.career_unsettled;
  if (player.resources.credits < 124) return ACADEMIC_STATUSES.retained;
  if (player.flags.on_leave || player.resources.health <= 1) return ACADEMIC_STATUSES.recovery_first;
  return ACADEMIC_STATUSES.graduated;
}

export function determineBoardLifeArchetype(player: Player): Ending {
  const scores = collectPathScores(player);
  const researchScore = scoreGroup(scores, ["study", "research"]);
  const socialAnchorCount = countAnchors(player, ["social", "community"]);
  const socialScore = (scores.social * 0.65)
    + (scores.community * 1.4)
    + (socialAnchorCount * 2);
  const careerScore = scoreGroup(scores, ["career", "work"]);
  const creativeAnchorCount = countAnchors(player, ["creative", "adventure"]);
  let creativeScore = (scores.creative * 0.9)
    + (scores.adventure * 0.25)
    + (creativeAnchorCount * 2);
  if (scores.creative < 5 && creativeAnchorCount === 0) {
    creativeScore *= 0.35;
  }
  const rawRomanceScore = scores.romance;
  const romanceAnchorCount = countAnchors(player, ["romance"]);
  const romanceCommitmentBonus = (player.flags.has_partner ? 3 : 0) + (romanceAnchorCount * 4);
  const romanceScore = rawRomanceScore + romanceCommitmentBonus;
  const restScore = scores.rest;
  const nonAcademicTop = Math.max(socialScore, careerScore, creativeScore, romanceScore, restScore);

  const studyAnchorCount = countAnchors(player, ["study", "research"]);
  const hasResearchPath = (scores.research >= 4 && scores.research >= nonAcademicTop)
    || (scores.research >= 4 && studyAnchorCount >= 2)
    || (player.flags.career_path === "grad_school" && researchScore >= 4);
  if (hasResearchPath) return LIFE_ARCHETYPES.scholar;

  const hasCommittedRomancePath = (
    (player.flags.has_partner && rawRomanceScore >= 2)
    || (romanceAnchorCount >= 2 && rawRomanceScore >= 4)
  )
    && romanceScore + 9 >= socialScore;
  if (hasCommittedRomancePath) return LIFE_ARCHETYPES.romantic;

  const ranked: Array<[string, number]> = [
    ["career_builder", careerScore],
    ["romantic", romanceScore],
    ["campus_connector", socialScore],
    ["creative_runner", creativeScore],
    ["rest_keeper", restScore],
  ];
  ranked.sort((a, b) => b[1] - a[1]);

  const [topId, topScore] = ranked[0];
  if (topScore >= 4) return LIFE_ARCHETYPES[topId];
  if (topScore >= 2 && ranked[1] && topScore - ranked[1][1] >= 1) return LIFE_ARCHETYPES[topId];
  return LIFE_ARCHETYPES.balanced_life;
}

export function determineBoardStoryAward(
  player: Player,
  academicStatus: Ending,
  lifeArchetype: Ending,
): Ending {
  if (academicStatus.id === "retained" || academicStatus.id === "recovery_first") {
    return STORY_AWARDS.recovery_episode;
  }
  if (lifeArchetype.id === "scholar") return STORY_AWARDS.research_episode;
  if (lifeArchetype.id === "romantic") return STORY_AWARDS.romance_episode;
  if (lifeArchetype.id === "career_builder") return STORY_AWARDS.career_episode;
  if (lifeArchetype.id === "campus_connector") return STORY_AWARDS.friendship_episode;
  if (lifeArchetype.id === "creative_runner") return STORY_AWARDS.creative_episode;

  const scores = collectPathScores(player);
  if (scores.risk >= 4 || scores.rest >= 4) return STORY_AWARDS.recovery_episode;
  return STORY_AWARDS.ordinary_episode;
}

export function summarizeBoardResult(
  player: Player,
  academicStatus: Ending,
  lifeArchetype: Ending,
  storyAward: Ending,
): string {
  const anchorText = (player.yearAnchors ?? [])
    .map((anchor) => anchor.choiceLabel)
    .slice(-2)
    .join("、");
  const anchorSentence = anchorText ? `途中では「${anchorText}」を選んだ。` : "";
  return `${player.name}は「${lifeArchetype.title}」として4年間を終えた。学業上は「${academicStatus.title}」。${anchorSentence}${storyAward.description}`;
}

export function determineEnding(player: Player): Ending {
  if (player.flags.career_failed) return ENDINGS.jobless;
  if (player.resources.credits < 124) return ENDINGS.ryuunen;
  if (player.flags.on_leave || player.resources.health <= 1) return ENDINGS.therapy;

  const lifeArchetype = determineBoardLifeArchetype(player);
  return ENDINGS[lifeArchetype.id] ?? lifeArchetype;
}

// ─── Generate Results ────────────────────────────────────────────

export function generateResults(players: Player[]): PlayerResult[] {
  const scored = players.map((player) => ({
    player,
    score: calculateScore(player),
    scoreBreakdown: calculateScoreBreakdown(player),
    academicStatus: determineBoardAcademicStatus(player),
    lifeArchetype: determineBoardLifeArchetype(player),
  }));

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  return scored.map((entry, index) => {
    const storyAward = determineBoardStoryAward(
      entry.player,
      entry.academicStatus,
      entry.lifeArchetype,
    );
    const pathScores = collectPathScores(entry.player);

    return {
      playerId: entry.player.id,
      playerName: entry.player.name,
      score: entry.score,
      rank: index + 1,
      ending: determineEnding(entry.player),
      academicStatus: entry.academicStatus,
      lifeArchetype: entry.lifeArchetype,
      storyAward,
      summary: summarizeBoardResult(entry.player, entry.academicStatus, entry.lifeArchetype, storyAward),
      scoreBreakdown: entry.scoreBreakdown,
      resources: entry.player.resources,
      experience: entry.player.experience,
      flags: entry.player.flags,
      flagHistory: entry.player.flagHistory,
      pathScores,
      yearAnchors: entry.player.yearAnchors,
      milestones: entry.player.milestones,
      storyTags: topIntentTags(pathScores),
      choiceHistory: entry.player.choiceHistory,
    };
  });
}
