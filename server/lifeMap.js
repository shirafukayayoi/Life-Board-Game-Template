export function getSeasonHubSquareId(event) {
  return `${event.id}:hub`;
}

export function getRouteSquareId(event, choice) {
  return `${event.id}:route:${choice.id}`;
}

function getNextSeasonHubId(events, index) {
  const nextEvent = events[index + 1];
  return nextEvent ? getSeasonHubSquareId(nextEvent) : null;
}

function previewFromChoice(choice) {
  return {
    gain: [...(choice.preview?.gain ?? [])],
    cost: [...(choice.preview?.cost ?? [])],
    risk: choice.preview?.risk ?? "unknown",
  };
}

export function buildLifeMap(events) {
  const squares = {};
  const seasonOrder = [];

  events.forEach((event, index) => {
    const hubId = getSeasonHubSquareId(event);
    const routeIds = event.choices.map((choice) => getRouteSquareId(event, choice));
    const nextHubId = getNextSeasonHubId(events, index);
    seasonOrder.push(hubId);

    squares[hubId] = {
      id: hubId,
      type: "season_hub",
      seasonId: event.id,
      year: event.year,
      season: event.season,
      label: event.label,
      theme: event.theme,
      description: event.description,
      next: routeIds,
    };

    event.choices.forEach((choice) => {
      const routeId = getRouteSquareId(event, choice);
      squares[routeId] = {
        id: routeId,
        type: "life_route",
        seasonId: event.id,
        choiceId: choice.id,
        year: event.year,
        season: event.season,
        label: choice.label,
        tone: choice.tone,
        preview: previewFromChoice(choice),
        storyTags: [...(choice.storyTags ?? [])],
        next: nextHubId ? [nextHubId] : [],
      };
    });
  });

  return {
    squares,
    seasonOrder,
    startSquareId: seasonOrder[0] ?? null,
  };
}

export function getPublicLifeMapSquares(map) {
  return Object.values(map.squares).map((square) => {
    if (square.type === "season_hub") {
      return { ...square, next: [...square.next] };
    }
    return {
      id: square.id,
      type: square.type,
      seasonId: square.seasonId,
      choiceId: square.choiceId,
      year: square.year,
      season: square.season,
      label: square.label,
      tone: square.tone,
      preview: {
        gain: [...square.preview.gain],
        cost: [...square.preview.cost],
        risk: square.preview.risk,
      },
      storyTags: [...square.storyTags],
      next: [...square.next],
    };
  });
}
