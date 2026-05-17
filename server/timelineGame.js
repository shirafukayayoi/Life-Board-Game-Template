export const LIFE_TRAIT_KEYS = [
  "academic",
  "stability",
  "wellbeing",
  "relationships",
  "freedom",
  "challenge",
  "career",
  "memory",
  "selfhood",
];

const DEFAULT_TRAITS = Object.fromEntries(
  LIFE_TRAIT_KEYS.map((key) => [key, 6]),
);

const ACADEMIC_STATUSES = {
  graduated: {
    id: "graduated",
    title: "卒業",
    description: "必要なものを回収し、大学生活をひと区切りにした。",
  },
  barely_graduated: {
    id: "barely_graduated",
    title: "ギリ卒業",
    description: "危なかったが、なんとか卒業にこぎつけた。",
  },
  on_leave_or_retained: {
    id: "on_leave_or_retained",
    title: "休学・留年",
    description: "制度上は止まったが、その時間にも別の意味が残った。",
  },
  retained: {
    id: "retained",
    title: "留年",
    description: "卒業条件には届かなかった。だが4年間が空白だったわけではない。",
  },
};

const LIFE_ARCHETYPES = {
  steady_builder: {
    id: "steady_builder",
    title: "静かな土台づくり型",
    description: "派手さよりも生活、学業、将来の足場を整え続けた。",
  },
  social_burnout: {
    id: "social_burnout",
    title: "燃え尽き型の人脈モンスター",
    description: "人とのつながりと勢いで走り抜け、生活の余白を燃やし切った。",
  },
  self_searcher: {
    id: "self_searcher",
    title: "自分探しの自由人",
    description: "制度のレールより、自分の納得と変化を優先した。",
  },
  adventurer: {
    id: "adventurer",
    title: "挑戦偏重型",
    description: "安定よりも、何かを始めることに大学生活を使った。",
  },
  social_connector: {
    id: "social_connector",
    title: "キャンパス接続型",
    description: "人間関係を広げ、誰かとの関わりから生活を作った。",
  },
  balanced: {
    id: "balanced",
    title: "ほどほど統合型",
    description: "極端な偏りは少ないが、そのぶん複数の軸を保った。",
  },
};

const STORY_AWARDS = {
  quietly_built_future: {
    id: "quietly_built_future",
    title: "静かに未来を組み立てた人",
    description: "派手な事件より、続けたことと整えたことが残った。",
  },
  campus_legend_retained: {
    id: "campus_legend_retained",
    title: "伝説だけ残して単位を落とした人",
    description: "卒業条件は落としたが、キャンパスには確かな存在感を残した。",
  },
  left_with_selfhood: {
    id: "left_with_selfhood",
    title: "単位より自分を持って帰った人",
    description: "制度上の成果は薄くても、自分の輪郭は濃くなった。",
  },
  nonlinear_beauty: {
    id: "nonlinear_beauty",
    title: "まっすぐ戻らなかった人",
    description: "予定された道から外れたぶん、誰にも似ていない物語を持ち帰った。",
  },
  protected_blank_space: {
    id: "protected_blank_space",
    title: "空白を守り抜いた人",
    description: "何もしない時間を、逃げではなく自分を保つ場所として使った。",
  },
  hard_landing: {
    id: "hard_landing",
    title: "現実に着地した人",
    description: "最後は楽ではなかったが、生活の重さを知って前に進んだ。",
  },
  campus_memory_keeper: {
    id: "campus_memory_keeper",
    title: "思い出の密度で勝った人",
    description: "点数では測れない場面を、誰より多く持ち帰った。",
  },
};

function clampTrait(value) {
  return Math.max(0, Math.min(20, value));
}

export function createTimelinePlayer(id, name) {
  return {
    id,
    name,
    traits: { ...DEFAULT_TRAITS },
    storyTags: [],
    history: [],
  };
}

export function getChoicePreview(choice) {
  return {
    id: choice.id,
    label: choice.label,
    tone: choice.tone,
    gain: [...(choice.preview?.gain ?? [])],
    cost: [...(choice.preview?.cost ?? [])],
    risk: choice.preview?.risk ?? "unknown",
    storyTags: [...(choice.storyTags ?? [])],
  };
}

export function applyTimelineChoice(player, seasonEvent, choice) {
  const next = {
    ...player,
    traits: { ...player.traits },
    storyTags: [...player.storyTags],
    history: [...player.history],
  };

  for (const [key, delta] of Object.entries(choice.effects ?? {})) {
    if (!LIFE_TRAIT_KEYS.includes(key)) continue;
    next.traits[key] = clampTrait((next.traits[key] ?? 0) + delta);
  }

  for (const tag of choice.storyTags ?? []) {
    if (!next.storyTags.includes(tag)) {
      next.storyTags.push(tag);
    }
  }

  next.history.push({
    seasonId: seasonEvent.id,
    seasonLabel: seasonEvent.label,
    theme: seasonEvent.theme,
    choiceId: choice.id,
    choiceLabel: choice.label,
    tone: choice.tone,
    storyTags: [...(choice.storyTags ?? [])],
  });

  return next;
}

export function determineAcademicStatus(player) {
  const academic = player.traits.academic;
  const hasLeaveStory = player.storyTags.includes("休学");

  if (academic >= 16) return ACADEMIC_STATUSES.graduated;
  if (academic >= 12) return ACADEMIC_STATUSES.barely_graduated;
  if (hasLeaveStory) return ACADEMIC_STATUSES.on_leave_or_retained;
  return ACADEMIC_STATUSES.retained;
}

export function determineLifeArchetype(player) {
  const t = player.traits;

  if (t.relationships >= 14 && t.challenge >= 12 && (t.wellbeing <= 5 || t.stability <= 5)) {
    return LIFE_ARCHETYPES.social_burnout;
  }
  if (t.freedom >= 14 && t.selfhood >= 14) {
    return LIFE_ARCHETYPES.self_searcher;
  }
  if (t.academic >= 14 && t.stability >= 14) {
    return LIFE_ARCHETYPES.steady_builder;
  }
  if (t.challenge >= 15) {
    return LIFE_ARCHETYPES.adventurer;
  }
  if (t.relationships >= 14) {
    return LIFE_ARCHETYPES.social_connector;
  }
  return LIFE_ARCHETYPES.balanced;
}

export function determineStoryAward(player, academicStatus, lifeArchetype) {
  if (academicStatus.id === "retained" && lifeArchetype.id === "social_burnout") {
    return STORY_AWARDS.campus_legend_retained;
  }
  if (
    player.storyTags.includes("空白の夏") ||
    player.storyTags.includes("余白") ||
    player.storyTags.includes("静かな冬")
  ) {
    return STORY_AWARDS.protected_blank_space;
  }
  if (
    player.storyTags.includes("別ルート") ||
    player.storyTags.includes("キャンパス残留") ||
    player.storyTags.includes("学外拠点")
  ) {
    return STORY_AWARDS.nonlinear_beauty;
  }
  if (lifeArchetype.id === "self_searcher") {
    return STORY_AWARDS.left_with_selfhood;
  }
  if (lifeArchetype.id === "steady_builder") {
    return STORY_AWARDS.quietly_built_future;
  }
  if (player.traits.memory >= 15) {
    return STORY_AWARDS.campus_memory_keeper;
  }
  return STORY_AWARDS.hard_landing;
}

export function summarizeTimelineResult(player, academicStatus, lifeArchetype, storyAward) {
  const tagText = player.storyTags.slice(0, 5).join("、") || "目立つ肩書きなし";
  return `${player.name}は${lifeArchetype.title}として、${tagText}を残した。学業上は「${academicStatus.title}」。${storyAward.description}`;
}

export function generateTimelineResults(players) {
  return players.map((player) => {
    const academicStatus = determineAcademicStatus(player);
    const lifeArchetype = determineLifeArchetype(player);
    const storyAward = determineStoryAward(player, academicStatus, lifeArchetype);
    return {
      playerId: player.id,
      playerName: player.name,
      academicStatus,
      lifeArchetype,
      storyAward,
      summary: summarizeTimelineResult(player, academicStatus, lifeArchetype, storyAward),
      traits: { ...player.traits },
      storyTags: [...player.storyTags],
      history: [...player.history],
    };
  });
}
