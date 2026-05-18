export const INTENT_TAGS = [
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

const INTENT_TAG_SET = new Set(INTENT_TAGS);

const TEXT_RULES = [
  { tag: "research", regex: /研究|ゼミ|卒論|論文|発表|院進|大学院/ },
  { tag: "study", regex: /授業|履修|試験|単位|講義|教職|資格|勉強|レポート|過去問|必修|実習|教務/ },
  { tag: "romance", regex: /恋人|恋愛|告白|デート|相手|二人|記念日|浮気|恋|結婚/ },
  { tag: "career", regex: /就活|進路|インターン|企業|面接|内定|社会人|キャリア|教授相談/ },
  { tag: "work", regex: /バイト|働|仕事|稼|日払い|労働|副業|家庭教師|飲食/ },
  { tag: "social", regex: /友人|友達|先輩|同期|サークル|新歓|人間関係|合宿|飲み会|相談|輪/ },
  { tag: "community", regex: /地域|学外|コミュニティ|ボランティア|寮|シェア|チーム/ },
  { tag: "creative", regex: /制作|創作|作品|趣味|企画|学祭|イベント|起業|プロジェクト/ },
  { tag: "adventure", regex: /旅行|海外|留学|旅|挑戦|世界|遠く|飛び込|免許|ドライブ/ },
  { tag: "rest", regex: /休|寝|生活|体調|リズム|整える|療養|健康|回復|様子を見る/ },
  { tag: "risk", regex: /危機|一夜漬け|浮気|ギャンブル|無理|金欠|留年|倒れ|炎上|無灯火/ },
];

function addTag(tags, tag) {
  if (INTENT_TAG_SET.has(tag)) {
    tags.add(tag);
  }
}

export function normalizeIntentTags(tags = []) {
  const normalized = [];
  for (const tag of tags) {
    if (typeof tag !== "string") continue;
    if (!INTENT_TAG_SET.has(tag)) continue;
    if (!normalized.includes(tag)) normalized.push(tag);
  }
  return normalized;
}

export function deriveIntentTagsForChoice(choice = {}, event = {}) {
  const tags = new Set(normalizeIntentTags(choice.intentTags ?? event.intentTags));
  const text = [
    event.title,
    event.description,
    event.category,
    choice.label,
    choice.description,
    choice.tone,
    ...(choice.storyTags ?? []),
  ].filter(Boolean).join(" ");

  for (const rule of TEXT_RULES) {
    if (rule.regex.test(text)) addTag(tags, rule.tag);
  }

  const effects = choice.effects ?? {};
  if ((effects.credits ?? 0) > 0 || (effects.intellect ?? 0) > 0) addTag(tags, "study");
  if ((effects.connections ?? 0) > 0) addTag(tags, "social");
  if ((effects.work_tolerance ?? 0) > 0) addTag(tags, "work");
  if ((effects.action_power ?? 0) > 0) addTag(tags, "adventure");
  if ((effects.romance_exp ?? 0) > 0) addTag(tags, "romance");
  if ((effects.health ?? 0) > 0 || (effects.time ?? 0) > 0) addTag(tags, "rest");
  if ((effects.money ?? 0) > 0) addTag(tags, "work");
  if (
    choice.polarity === "negative"
    || event.polarity === "negative"
    || (typeof choice.badLuckDelta === "number" && choice.badLuckDelta > 0)
  ) {
    addTag(tags, "risk");
  }

  const flagEffects = choice.flagEffects ?? choice.setFlags ?? {};
  if (flagEffects.has_partner === true) addTag(tags, "romance");
  if (flagEffects.in_seminar === true) {
    addTag(tags, "study");
    addTag(tags, "research");
  }
  if (flagEffects.teaching_cert === true) {
    addTag(tags, "study");
    addTag(tags, "career");
  }
  if (flagEffects.studying_abroad === true || flagEffects.has_license === true) addTag(tags, "adventure");
  if (flagEffects.career_path || flagEffects.career_failed !== undefined) addTag(tags, "career");
  if (flagEffects.job_type) addTag(tags, "work");
  if (flagEffects.club_type) addTag(tags, flagEffects.club_type === "community" ? "community" : "social");
  if (flagEffects.housing === "dorm_share") {
    addTag(tags, "social");
    addTag(tags, "community");
  }
  if (flagEffects.housing === "alone" || flagEffects.living_alone === true) addTag(tags, "adventure");

  if (choice.cheatAction) {
    addTag(tags, "romance");
    addTag(tags, "risk");
  }

  if (tags.size === 0) addTag(tags, "rest");
  return [...tags];
}

export function deriveIntentTagsForEvent(event = {}) {
  const tags = new Set(normalizeIntentTags(event.intentTags));
  for (const choice of event.choices ?? []) {
    for (const tag of deriveIntentTagsForChoice(choice, event)) {
      tags.add(tag);
    }
  }
  return [...tags];
}
