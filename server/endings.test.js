import test from "node:test";
import assert from "node:assert/strict";

import { generateResults } from "./endings.js";

const baseFlags = {
  housing: "family",
  living_alone: false,
  has_partner: false,
  has_license: false,
  studying_abroad: false,
  on_leave: false,
  in_seminar: false,
  teaching_cert: false,
  cheating: false,
  career_path: null,
  career_failed: false,
  club_type: null,
  job_type: null,
};

function buildPlayer(overrides = {}) {
  return {
    id: overrides.id ?? "p1",
    name: overrides.name ?? "Aoi",
    faculty: "humanities",
    resources: {
      time: 8,
      money: 8,
      credits: 128,
      health: 8,
      ...(overrides.resources ?? {}),
    },
    experience: {
      intellect: 8,
      connections: 6,
      work_tolerance: 6,
      action_power: 6,
      romance_exp: 6,
      ...(overrides.experience ?? {}),
    },
    flags: {
      ...baseFlags,
      ...(overrides.flags ?? {}),
    },
    position: "48",
    online: true,
    badLuckPoints: 0,
    flagHistory: [],
    pathScores: overrides.pathScores ?? {},
    yearAnchors: overrides.yearAnchors ?? [],
    milestones: overrides.milestones ?? [],
    choiceHistory: overrides.choiceHistory ?? [],
  };
}

function historyEntry(round, choiceLabel, intentTags) {
  return {
    round,
    eventId: String(round),
    eventTitle: `Event ${round}`,
    choiceId: `${round}A`,
    choiceLabel,
    effects: {},
    intentTags,
    storyTags: intentTags,
  };
}

test("board results do not turn high intellect alone into the scholar life archetype", () => {
  const highIntellectOnly = buildPlayer({
    experience: {
      intellect: 10,
      connections: 4,
      work_tolerance: 4,
      action_power: 4,
      romance_exp: 4,
    },
    choiceHistory: [
      historyEntry(1, "友人と過ごす", ["social"]),
      historyEntry(2, "アルバイトを続ける", ["work"]),
      historyEntry(3, "休む", ["rest"]),
    ],
  });

  const [result] = generateResults([highIntellectOnly]);

  assert.equal(result.academicStatus.id, "graduated");
  assert.notEqual(result.lifeArchetype.id, "scholar");
  assert.notEqual(result.ending.id, "scholar");
});

test("board results use choice history to distinguish similar final stats", () => {
  const researchPlayer = buildPlayer({
    id: "research",
    name: "Research",
    choiceHistory: [
      historyEntry(20, "ゼミで研究を進める", ["study", "research"]),
      historyEntry(28, "論文を読む", ["study", "research"]),
      historyEntry(35, "卒論テーマを深める", ["study", "research"]),
      historyEntry(43, "研究発表をする", ["study", "research"]),
    ],
  });
  const romancePlayer = buildPlayer({
    id: "romance",
    name: "Romance",
    choiceHistory: [
      historyEntry(20, "恋人との時間を作る", ["romance", "social"]),
      historyEntry(28, "記念日を大事にする", ["romance"]),
      historyEntry(35, "相手と将来を話す", ["romance", "career"]),
      historyEntry(43, "二人の関係を整える", ["romance", "rest"]),
    ],
  });

  const results = generateResults([researchPlayer, romancePlayer]);
  const byId = new Map(results.map((result) => [result.playerId, result]));

  assert.equal(byId.get("research").lifeArchetype.id, "scholar");
  assert.equal(byId.get("romance").lifeArchetype.id, "romantic");
  assert.notEqual(byId.get("research").storyAward.id, byId.get("romance").storyAward.id);
});

test("year anchors contribute to the board life archetype even before final stats diverge", () => {
  const careerAnchored = buildPlayer({
    yearAnchors: [
      { year: 1, choiceId: "year_anchor:1:career", choiceLabel: "進路を早めに見る", intentTags: ["career"] },
      { year: 2, choiceId: "year_anchor:2:career", choiceLabel: "インターンを軸にする", intentTags: ["career"] },
      { year: 3, choiceId: "year_anchor:3:career", choiceLabel: "就活を仕上げる", intentTags: ["career"] },
    ],
    choiceHistory: [
      historyEntry(8, "授業をこなす", ["study"]),
      historyEntry(16, "友人と過ごす", ["social"]),
    ],
  });

  const [result] = generateResults([careerAnchored]);

  assert.equal(result.lifeArchetype.id, "career_builder");
  assert.match(result.summary, /進路|就活|インターン/);
});

test("romance commitments can define the life archetype without being swallowed by broad social ties", () => {
  const romanceCommitted = buildPlayer({
    flags: {
      has_partner: true,
    },
    pathScores: {
      social: 10,
      community: 2,
      romance: 5,
      study: 2,
      research: 0,
      career: 1,
      work: 1,
      creative: 0,
      adventure: 0,
      rest: 1,
      risk: 0,
    },
    yearAnchors: [
      {
        year: 2,
        choiceId: "year_anchor:2:romance",
        choiceLabel: "恋愛もちゃんと大事にする",
        intentTags: ["romance", "social"],
      },
    ],
    choiceHistory: [
      historyEntry(14, "気になる人と二人で出かける", ["romance"]),
      historyEntry(21, "関係をはっきりさせる", ["romance"]),
      historyEntry(33, "恋人との将来を話す", ["romance", "career"]),
    ],
  });

  const [result] = generateResults([romanceCommitted]);

  assert.equal(result.lifeArchetype.id, "romantic");
  assert.equal(result.storyAward.id, "romance_episode");
});
