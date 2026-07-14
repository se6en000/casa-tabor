import { AGENT_TOOL_DEFINITIONS } from './assistant-agent-tools.mjs'

export const AGENT_CONTRACT_VERSION = 'bounded-agent-v1'

export const AGENT_RESPONSIBILITIES = Object.freeze({
  planner: Object.freeze([
    'interpret_language',
    'resolve_conversation_references',
    'choose_tools',
    'propose_tool_arguments',
    'request_clarification',
    'summarize_verified_results',
  ]),
  policy: Object.freeze([
    'authorize_household_scope',
    'validate_tool_arguments',
    'enforce_confirmation',
    'prevent_duplicates',
    'protect_stale_writes',
    'enforce_recurring_event_scope',
    'bound_tool_calls_and_retries',
  ]),
  executor: Object.freeze([
    'query_authoritative_data',
    'apply_idempotent_writes',
    'report_verified_results',
    'emit_audit_telemetry',
  ]),
})

export const AGENT_EXECUTION_BUDGET = Object.freeze({
  maxToolCallsPerTurn: 3,
  maxPlannerRetries: 1,
  plannerTimeoutMs: 2500,
  readTurnP95Ms: 3500,
  writeProposalP95Ms: 4500,
})

export const AGENT_ACCEPTANCE_THRESHOLDS = Object.freeze({
  readToolPlanAccuracy: 0.97,
  writeToolPlanAccuracy: 0.95,
  correctionContinuityAccuracy: 0.95,
  destructiveTargetAccuracy: 1,
  unauthorizedExecutionRate: 0,
  duplicateWriteRate: 0,
  unverifiedSuccessClaimRate: 0,
  fixtureCleanupRate: 1,
})

export const TARGET_AGENT_TOOLS = Object.freeze(
  AGENT_TOOL_DEFINITIONS.map(({ name, domain, effect }) => ({ name, domain, effect })),
)

export const CURRENT_ASSISTANT_TOOL_INVENTORY = Object.freeze([
  { name: 'search_events', domain: 'calendar', effect: 'read', execution: 'assistant' },
  { name: 'create_event', domain: 'calendar', effect: 'write', execution: 'action' },
  { name: 'update_event', domain: 'calendar', effect: 'write', execution: 'action' },
  { name: 'bulk_update_events', domain: 'calendar', effect: 'write', execution: 'action' },
  { name: 'delete_event', domain: 'calendar', effect: 'destructive', execution: 'action' },
  { name: 'delete_events_by_title', domain: 'calendar', effect: 'destructive', execution: 'action' },
  { name: 'search_places', domain: 'places', effect: 'read', execution: 'assistant' },
  { name: 'search_web', domain: 'web', effect: 'read', execution: 'assistant' },
  { name: 'get_weather_forecast', domain: 'weather', effect: 'read', execution: 'assistant' },
  { name: 'get_travel_eta', domain: 'travel', effect: 'read', execution: 'assistant' },
  { name: 'add_grocery_items', domain: 'grocery', effect: 'write', execution: 'action' },
  { name: 'check_grocery_item', domain: 'grocery', effect: 'write', execution: 'action' },
  { name: 'remove_grocery_item', domain: 'grocery', effect: 'destructive', execution: 'action' },
  { name: 'update_grocery_item_quantity', domain: 'grocery', effect: 'write', execution: 'action' },
  { name: 'clear_checked_grocery_items', domain: 'grocery', effect: 'destructive', execution: 'action' },
  { name: 'create_recipe', domain: 'cooking', effect: 'write', execution: 'action' },
])

export const AGENT_CONFIRMATION_POLICY = Object.freeze({
  read: 'never',
  write: 'risk_based',
  destructive: 'always',
})

export const AGENT_ROLLOUT_STAGES = Object.freeze([
  'contract',
  'tool_api',
  'conversation_state',
  'policy_gateway',
  'read_shadow',
  'write_shadow',
  'read_authoritative',
  'write_authoritative',
  'parser_pruning',
  'default_with_kill_switch',
])
