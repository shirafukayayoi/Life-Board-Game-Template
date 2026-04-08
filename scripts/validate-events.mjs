import { EVENTS, THRESHOLD_EVENTS } from "../server/events.js";
import { BOARD } from "../server/board.js";

const errors = [];
const warnings = [];

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateEffects(effects, context) {
  if (!isPlainObject(effects)) {
    errors.push(`${context}: effects must be an object`);
    return;
  }
  for (const [key, value] of Object.entries(effects)) {
    if (typeof value !== "number" || Number.isNaN(value)) {
      errors.push(`${context}: effect '${key}' must be a number`);
    }
  }
}

function validateChoices(choices, context) {
  if (!Array.isArray(choices)) {
    errors.push(`${context}: choices must be an array`);
    return;
  }

  const seenChoiceIds = new Set();
  for (let index = 0; index < choices.length; index += 1) {
    const choice = choices[index];
    const choiceContext = `${context} choice[${index}]`;

    if (!isPlainObject(choice)) {
      errors.push(`${choiceContext}: choice must be an object`);
      continue;
    }

    if (!choice.id || typeof choice.id !== "string") {
      errors.push(`${choiceContext}: missing string id`);
    } else if (seenChoiceIds.has(choice.id)) {
      errors.push(`${context}: duplicate choice id '${choice.id}'`);
    } else {
      seenChoiceIds.add(choice.id);
    }

    if (!choice.label || typeof choice.label !== "string") {
      errors.push(`${choiceContext}: missing string label`);
    }

    validateEffects(choice.effects, choiceContext);

    if (choice.branchRoute && !BOARD[choice.branchRoute]) {
      errors.push(`${choiceContext}: branchRoute '${choice.branchRoute}' is not in BOARD`);
    }

    if (choice.randomChance !== undefined) {
      if (typeof choice.randomChance !== "number" || choice.randomChance < 0 || choice.randomChance > 1) {
        errors.push(`${choiceContext}: randomChance must be between 0 and 1`);
      }
    }

    if (choice.randomBonusEffects !== undefined) {
      validateEffects(choice.randomBonusEffects, `${choiceContext} randomBonusEffects`);
    }
    if (choice.randomPenaltyEffects !== undefined) {
      validateEffects(choice.randomPenaltyEffects, `${choiceContext} randomPenaltyEffects`);
    }
  }
}

function validateEventMap(eventMap, mapName, { enforceBoardSquareMatch }) {
  if (!isPlainObject(eventMap)) {
    errors.push(`${mapName}: event map must be an object`);
    return;
  }

  const seenEventIds = new Set();
  for (const [key, event] of Object.entries(eventMap)) {
    const context = `${mapName}['${key}']`;

    if (enforceBoardSquareMatch && !BOARD[key]) {
      warnings.push(`${context}: key is not present in BOARD`);
    }

    if (!isPlainObject(event)) {
      errors.push(`${context}: event must be an object`);
      continue;
    }

    if (!event.id || typeof event.id !== "string") {
      errors.push(`${context}: missing string id`);
    } else if (seenEventIds.has(event.id)) {
      errors.push(`${mapName}: duplicate event id '${event.id}'`);
    } else {
      seenEventIds.add(event.id);
    }

    if (!event.title || typeof event.title !== "string") {
      errors.push(`${context}: missing string title`);
    }

    if (typeof event.description !== "string") {
      errors.push(`${context}: description must be a string`);
    }

    validateChoices(event.choices, context);

    if (event.conditionalVariants !== undefined) {
      if (!Array.isArray(event.conditionalVariants)) {
        errors.push(`${context}: conditionalVariants must be an array`);
      } else {
        for (let i = 0; i < event.conditionalVariants.length; i += 1) {
          const variant = event.conditionalVariants[i];
          const variantContext = `${context} conditionalVariants[${i}]`;
          if (!isPlainObject(variant)) {
            errors.push(`${variantContext}: variant must be an object`);
            continue;
          }
          validateChoices(variant.choices, variantContext);
        }
      }
    }
  }
}

validateEventMap(EVENTS, "EVENTS", { enforceBoardSquareMatch: true });
validateEventMap(THRESHOLD_EVENTS, "THRESHOLD_EVENTS", { enforceBoardSquareMatch: false });

if (warnings.length > 0) {
  console.warn("Warnings:");
  for (const warning of warnings) {
    console.warn(`- ${warning}`);
  }
}

if (errors.length > 0) {
  console.error("Event validation failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`OK: ${Object.keys(EVENTS).length} main events, ${Object.keys(THRESHOLD_EVENTS).length} threshold events.`);
