import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { BOARD, MAIN_TRACK_ORDER } from "./board.js";
import { EVENTS, RANDOM_POOL, REFLECTION_GUIDE, VACATION_POOL } from "./events.js";
import { determineEnding } from "./endings.js";
import { writeSessionLog } from "./sessionLogger.js";

function collectChoices(event) {
  return [
    ...(event.choices ?? []),
    ...(event.conditionalVariants ?? []).flatMap((variant) => variant.choices ?? []),
  ];
}

test("48-month board and main events are aligned", () => {
  const ids = Array.from({ length: 48 }, (_, index) => String(index + 1));

  assert.deepEqual(Object.keys(EVENTS), ids);
  assert.deepEqual(MAIN_TRACK_ORDER, ids);
  assert.deepEqual(Object.keys(BOARD), ids);
  assert.equal(BOARD["48"].next, null);
});

test("main events cover living alone, career, romance, faculty, and never subtract credits", () => {
  const livingAloneMonths = ["1", "6", "13"];
  for (const month of livingAloneMonths) {
    const choices = collectChoices(EVENTS[month]);
    assert.equal(
      choices.some((choice) => choice.flagEffects?.living_alone === true),
      true,
      `month ${month} should allow living_alone`,
    );
  }

  assert.equal(
    collectChoices(EVENTS["30"]).some((choice) => choice.flagEffects?.career_path),
    true,
  );
  for (const month of ["37", "38", "39"]) {
    assert.ok(EVENTS[month].conditionalVariants?.length >= 3);
  }

  const allChoices = Object.values(EVENTS).flatMap(collectChoices);
  const romanceChoiceCount = allChoices.filter(
    (choice) => choice.dynamicRandomChance || choice.cheatAction,
  ).length;
  assert.ok(romanceChoiceCount >= 5);

  const facultyVariantCount = Object.values(EVENTS)
    .flatMap((event) => event.conditionalVariants ?? [])
    .filter((variant) => variant.condition?.faculty === "education" || variant.condition?.faculty === "medical")
    .length;
  assert.ok(facultyVariantCount >= 4);

  for (const choice of allChoices) {
    assert.ok((choice.effects?.credits ?? 0) >= 0, `${choice.id} subtracts credits`);
    assert.ok((choice.randomBonusEffects?.credits ?? 0) >= 0, `${choice.id} bonus subtracts credits`);
    assert.ok((choice.randomPenaltyEffects?.credits ?? 0) >= 0, `${choice.id} penalty subtracts credits`);
    assert.ok((choice.dynamicRandomChance?.onSuccess?.credits ?? 0) >= 0, `${choice.id} success subtracts credits`);
    assert.ok((choice.dynamicRandomChance?.onFailure?.credits ?? 0) >= 0, `${choice.id} failure subtracts credits`);
  }
});

test("vacation and random pools provide the required event volume", () => {
  assert.ok(Object.keys(VACATION_POOL).length >= 10);
  assert.ok(Object.keys(RANDOM_POOL).length >= 10);
  assert.ok(Object.values(RANDOM_POOL).some((event) => event.polarity === "positive"));
  assert.ok(Object.values(RANDOM_POOL).some((event) => event.polarity === "negative"));
});

test("career failure resolves to jobless before credit checks", () => {
  const ending = determineEnding({
    id: "p1",
    name: "Aoi",
    faculty: "humanities",
    resources: { time: 10, money: 3, credits: 80, health: 10 },
    experience: {
      intellect: 1,
      connections: 1,
      work_tolerance: 1,
      action_power: 1,
      romance_exp: 1,
    },
    flags: {
      living_alone: false,
      has_partner: false,
      has_license: false,
      studying_abroad: false,
      on_leave: false,
      in_seminar: false,
      teaching_cert: false,
      cheating: false,
      career_path: "standard",
      career_failed: true,
      club_type: null,
      job_type: null,
    },
    position: "48",
    online: true,
    badLuckPoints: 0,
    flagHistory: [],
    choiceHistory: [],
  });

  assert.equal(ending.id, "jobless");
});

test("reflection data and session log output are available", () => {
  assert.ok(REFLECTION_GUIDE.jobless);
  assert.ok(REFLECTION_GUIDE.ryuunen);

  const filePath = writeSessionLog({
    sessionId: "test-session",
    startedAt: "2026-05-17T00:00:00.000Z",
    endedAt: "2026-05-17T00:01:00.000Z",
    mode: "board",
    players: [],
    results: [],
  });
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  assert.equal(parsed.sessionId, "test-session");
  assert.deepEqual(parsed.results, []);
  fs.unlinkSync(filePath);
});
