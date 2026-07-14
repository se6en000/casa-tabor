const string = (description) => ({ type: 'string', description })
const boolean = (description) => ({ type: 'boolean', description })
const stringArray = (description) => ({ type: 'array', items: { type: 'string' }, description })

function tool({ name, domain, effect, description, properties, required = [], legacyTool = null }) {
  return Object.freeze({
    name,
    domain,
    effect,
    description,
    legacyTool,
    inputSchema: Object.freeze({
      type: 'object',
      additionalProperties: false,
      properties: Object.freeze(properties),
      required: Object.freeze(required),
    }),
  })
}

export const AGENT_TOOL_DEFINITIONS = Object.freeze([
  tool({
    name: 'calendar.search',
    domain: 'calendar',
    effect: 'read',
    legacyTool: 'search_events',
    description: 'Find authoritative calendar events before answering or proposing a mutation.',
    properties: {
      query: string('Optional title or description search text.'),
      start: string('Optional inclusive ISO range start with UTC offset.'),
      end: string('Optional exclusive ISO range end with UTC offset.'),
      member_name: string('Optional family member filter.'),
    },
  }),
  tool({
    name: 'calendar.get_range',
    domain: 'calendar',
    effect: 'read',
    description: 'List authoritative calendar events overlapping an explicit time range.',
    properties: {
      start: string('Inclusive ISO range start with UTC offset.'),
      end: string('Exclusive ISO range end with UTC offset.'),
      member_names: stringArray('Optional family member filters.'),
    },
    required: ['start', 'end'],
  }),
  tool({
    name: 'calendar.check_conflicts',
    domain: 'calendar',
    effect: 'read',
    description: 'Check whether a proposed event time overlaps authoritative calendar events.',
    properties: {
      start: string('Proposed ISO start with UTC offset.'),
      end: string('Proposed ISO end with UTC offset.'),
      ignore_event_id: string('Existing event ID to exclude when evaluating a move.'),
      member_names: stringArray('Optional family members whose conflicts matter.'),
    },
    required: ['start', 'end'],
  }),
  tool({
    name: 'calendar.create',
    domain: 'calendar',
    effect: 'write',
    legacyTool: 'create_event',
    description: 'Propose creation of one calendar event.',
    properties: {
      title: string('Event title without invented details.'),
      start: string('ISO start with UTC offset.'),
      end: string('ISO end with UTC offset.'),
      location: string('Optional place name or address.'),
      members: stringArray('Family member names to include.'),
      notes: string('Optional user-provided notes.'),
      all_day: boolean('Whether the event is all day.'),
      event_type: string('One of event or reminder.'),
    },
    required: ['title', 'start', 'end'],
  }),
  tool({
    name: 'calendar.update',
    domain: 'calendar',
    effect: 'write',
    legacyTool: 'update_event',
    description: 'Propose an update to one exact authoritative calendar event.',
    properties: {
      id: string('Exact event UUID returned by a calendar read tool.'),
      expected_updated_at: string('Authoritative version timestamp used for stale-write protection.'),
      title: string('Replacement event title.'),
      start: string('Replacement ISO start with UTC offset.'),
      end: string('Replacement ISO end with UTC offset.'),
      location: string('Replacement location; empty string clears it.'),
      address: string('Replacement address; empty string clears it.'),
      notes: string('Replacement visible notes; empty string clears them.'),
      members_add: stringArray('Family member names to add.'),
      members_remove: stringArray('Family member names to remove.'),
      all_day: boolean('Replacement all-day status.'),
    },
    required: ['id', 'expected_updated_at'],
  }),
  tool({
    name: 'calendar.delete',
    domain: 'calendar',
    effect: 'destructive',
    legacyTool: 'delete_event',
    description: 'Propose deletion of one exact authoritative calendar event.',
    properties: {
      id: string('Exact event UUID returned by a calendar read tool.'),
      expected_updated_at: string('Authoritative version timestamp used for stale-write protection.'),
      title: string('Authoritative event title shown during confirmation.'),
    },
    required: ['id', 'expected_updated_at', 'title'],
  }),
  tool({
    name: 'grocery.get_list',
    domain: 'grocery',
    effect: 'read',
    description: 'Read authoritative grocery list items and their checked state.',
    properties: {
      list_id: string('Optional grocery list UUID; omit to use the household default.'),
      include_checked: boolean('Whether checked items should be returned.'),
    },
  }),
  tool({
    name: 'grocery.add_items',
    domain: 'grocery',
    effect: 'write',
    legacyTool: 'add_grocery_items',
    description: 'Add one or more explicit grocery items to a list.',
    properties: {
      list_id: string('Target grocery list UUID.'),
      items: {
        type: 'array',
        description: 'Items to add.',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            name: string('Grocery item name.'),
            quantity: string('Optional quantity text.'),
            unit: string('Optional unit text.'),
            category: string('Optional category.'),
          },
          required: ['name'],
        },
      },
    },
    required: ['items'],
  }),
  tool({
    name: 'grocery.update_item',
    domain: 'grocery',
    effect: 'write',
    legacyTool: 'update_grocery_item_quantity',
    description: 'Update one exact grocery item quantity or checked state.',
    properties: {
      id: string('Exact grocery item UUID returned by grocery.get_list.'),
      quantity: string('Replacement quantity text.'),
      unit: string('Replacement unit text.'),
      checked: boolean('Replacement checked state.'),
    },
    required: ['id'],
  }),
  tool({
    name: 'grocery.remove_item',
    domain: 'grocery',
    effect: 'destructive',
    legacyTool: 'remove_grocery_item',
    description: 'Remove one exact authoritative grocery item.',
    properties: {
      id: string('Exact grocery item UUID returned by grocery.get_list.'),
      name: string('Authoritative item name shown during confirmation.'),
    },
    required: ['id', 'name'],
  }),
  tool({
    name: 'recipe.find',
    domain: 'cooking',
    effect: 'read',
    description: 'Find saved recipes matching the current cooking need.',
    properties: {
      query: string('Recipe, ingredient, cuisine, or meal search.'),
      max_results: { type: 'number', description: 'Maximum results, capped by policy.' },
    },
    required: ['query'],
  }),
  tool({
    name: 'recipe.get',
    domain: 'cooking',
    effect: 'read',
    description: 'Read one exact saved recipe and its ingredients and steps.',
    properties: {
      id: string('Exact recipe UUID returned by recipe.find.'),
    },
    required: ['id'],
  }),
  tool({
    name: 'recipe.suggest_substitution',
    domain: 'cooking',
    effect: 'read',
    description: 'Suggest a cooking substitution grounded in household food preferences.',
    properties: {
      ingredient: string('Ingredient being replaced.'),
      recipe_context: string('Optional recipe or technique context.'),
      reason: string('Optional reason such as allergy, availability, or preference.'),
    },
    required: ['ingredient'],
  }),
  tool({
    name: 'recipe.add_ingredients_to_grocery',
    domain: 'cooking',
    effect: 'write',
    description: 'Propose adding selected recipe ingredients to a grocery list.',
    properties: {
      recipe_id: string('Exact recipe UUID.'),
      list_id: string('Target grocery list UUID.'),
      ingredient_names: stringArray('Explicit ingredient names to add.'),
    },
    required: ['recipe_id', 'ingredient_names'],
  }),
])

const toolsByName = new Map(AGENT_TOOL_DEFINITIONS.map((definition) => [definition.name, definition]))
const toolsByLegacyName = new Map(
  AGENT_TOOL_DEFINITIONS
    .filter((definition) => definition.legacyTool)
    .map((definition) => [definition.legacyTool, definition]),
)
const toolsByGeminiName = new Map(
  AGENT_TOOL_DEFINITIONS.map((definition) => [geminiFunctionName(definition.name), definition]),
)

export function getAgentTool(name) {
  return toolsByName.get(String(name ?? '')) ?? null
}

export function getAgentToolByLegacyName(name) {
  return toolsByLegacyName.get(String(name ?? '')) ?? null
}

export function getAgentToolByGeminiName(name) {
  return toolsByGeminiName.get(String(name ?? '')) ?? null
}

export function legacyToolNameFor(name) {
  return getAgentTool(name)?.legacyTool ?? null
}

export function toGeminiFunctionDeclaration(definition) {
  if (!definition) return null
  return {
    name: geminiFunctionName(definition.name),
    description: definition.description,
    parameters: toGeminiSchema(definition.inputSchema),
  }
}

function geminiFunctionName(name) {
  return name.replaceAll('.', '_')
}

function toGeminiSchema(schema) {
  const converted = { ...schema, type: String(schema.type).toUpperCase() }
  delete converted.additionalProperties
  if (schema.properties) {
    converted.properties = Object.fromEntries(
      Object.entries(schema.properties).map(([name, property]) => [name, toGeminiSchema(property)]),
    )
  }
  if (schema.items) converted.items = toGeminiSchema(schema.items)
  return converted
}
