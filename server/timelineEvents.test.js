import test from "node:test";
import assert from "node:assert/strict";

import { TIMELINE_EVENTS, getPublicTimelineEvent } from "./timelineEvents.js";

test("timeline event deck covers four years of seasonal life questions", () => {
  assert.equal(TIMELINE_EVENTS.length, 16);
  assert.equal(TIMELINE_EVENTS[0].id, "year1-spring");
  assert.equal(TIMELINE_EVENTS.at(-1).id, "year4-winter");
  assert.deepEqual(
    TIMELINE_EVENTS.map((event) => event.year),
    [1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4],
  );
});

test("public timeline event choices show previews without numeric effects", () => {
  const publicEvent = getPublicTimelineEvent(TIMELINE_EVENTS[0]);

  assert.equal(publicEvent.choices.length >= 4, true);
  for (const choice of publicEvent.choices) {
    assert.equal(typeof choice.label, "string");
    assert.equal(Array.isArray(choice.gain), true);
    assert.equal(Array.isArray(choice.cost), true);
    assert.equal(["low", "medium", "high", "unknown"].includes(choice.risk), true);
    assert.equal(Object.hasOwn(choice, "effects"), false);
  }
});

test("timeline deck supports stable, social, and free play identities", () => {
  const tones = new Set(
    TIMELINE_EVENTS.flatMap((event) => event.choices.map((choice) => choice.tone)),
  );
  const tags = new Set(
    TIMELINE_EVENTS.flatMap((event) => event.choices.flatMap((choice) => choice.storyTags)),
  );

  assert.equal(tones.has("安定"), true);
  assert.equal(tones.has("社交"), true);
  assert.equal(tones.has("自由"), true);
  assert.equal(tones.has("挑戦"), true);
  assert.equal(tags.has("休学"), true);
  assert.equal(tags.has("サークル"), true);
  assert.equal(tags.has("授業勢"), true);
});
