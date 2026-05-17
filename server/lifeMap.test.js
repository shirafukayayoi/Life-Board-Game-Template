import test from "node:test";
import assert from "node:assert/strict";

import {
  buildLifeMap,
  getPublicLifeMapSquares,
  getRouteSquareId,
  getSeasonHubSquareId,
} from "./lifeMap.js";
import { TIMELINE_EVENTS } from "./timelineEvents.js";

test("expanded life map turns 16 seasons into more squares than the old board", () => {
  const map = buildLifeMap(TIMELINE_EVENTS);
  const squareIds = Object.keys(map.squares);

  assert.equal(squareIds.length, 80);
  assert.equal(squareIds.length > 49, true);
  assert.equal(map.seasonOrder.length, 16);
});

test("each season has a hub and one route square per life choice", () => {
  const map = buildLifeMap(TIMELINE_EVENTS);

  for (const event of TIMELINE_EVENTS) {
    const hub = map.squares[getSeasonHubSquareId(event)];
    assert.equal(hub.type, "season_hub");
    assert.equal(hub.next.length, event.choices.length);

    for (const choice of event.choices) {
      const routeSquare = map.squares[getRouteSquareId(event, choice)];
      assert.equal(routeSquare.type, "life_route");
      assert.equal(routeSquare.seasonId, event.id);
      assert.equal(routeSquare.choiceId, choice.id);
      assert.equal(routeSquare.tone, choice.tone);
      assert.equal(routeSquare.next.length <= 1, true);
    }
  }
});

test("public life map exposes route previews but not numeric effects", () => {
  const publicSquares = getPublicLifeMapSquares(buildLifeMap(TIMELINE_EVENTS));
  const routeSquare = publicSquares.find((square) => square.type === "life_route");

  assert.ok(routeSquare);
  assert.equal(Array.isArray(routeSquare.preview.gain), true);
  assert.equal(Array.isArray(routeSquare.preview.cost), true);
  assert.equal(Object.hasOwn(routeSquare, "effects"), false);
});
