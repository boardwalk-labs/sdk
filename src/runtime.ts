// SPDX-License-Identifier: MIT

// @boardwalk-labs/workflow/runtime — the ENGINE/LOADER-facing API.
//
// The runner's loader imports this to drive a run over the host protocol: `connectHost()`
// (the server side lives in the runner; it sets BOARDWALK_HOST_SOCK), `client.bootstrap()`
// → `{ input, context }`, import the entry, `run(input, context)`, then
// `client.reportReturn(value)`. It also re-exports the protocol contract (frame + method
// schemas) the reference server validates against, and the schema-guided revival pass the
// runner applies to a typed run's input. Authors never import this subpath — they import the
// capabilities from "@boardwalk-labs/workflow" (and `installTestHost` for unit tests).

export {
  HOST_SOCK_ENV,
  HostClient,
  connectHost,
  getHost,
  peekHost,
  resetHost,
  installTestHost,
  type ConnectOptions,
  type HostInterface,
  type TestHostHandle,
  type TestHostOverrides,
  type WorkflowCallResult,
} from "./host_client.js";

export { reviveBySchema } from "./revive.js";

export {
  // Errors + run-fatality (the shared cross-SDK semantics).
  HostError,
  isRunFatal,
  RUN_FATAL_CODES,
  protocolErrorSchema,
  type ProtocolErrorShape,
  // Frames.
  rpcFrameSchema,
  rpcRequestFrameSchema,
  rpcNotificationFrameSchema,
  rpcSuccessFrameSchema,
  rpcErrorFrameSchema,
  type RpcFrame,
  type RpcRequestFrame,
  type RpcNotificationFrame,
  type RpcSuccessFrame,
  type RpcErrorFrame,
  type RpcId,
  // Method registries (params/result schema per method, by direction).
  clientToHostRequests,
  clientToHostNotifications,
  hostToClientRequests,
  hostToClientNotifications,
  type HostMethod,
  type HostMethodParams,
  type HostMethodResult,
  type ToolInvokeParams,
  // Payload shapes.
  jsonValueSchema,
  agentWireOptionsSchema,
  toolDeclarationSchema,
  sleepWireArgSchema,
  humanInputResultSchema,
  humanInputWireOptionsSchema,
  artifactWireBodySchema,
  artifactRefSchema,
  shellResultSchema,
  usageSnapshotSchema,
  type AgentWireOptions,
  type ToolDeclaration,
  type SleepWireArg,
  type ArtifactWireBody,
  type ShellResult,
  type UsageDimension,
  type UsageSnapshot,
  // Context data (the `bootstrap` payload) + the live Context type.
  actorSchema,
  triggerInfoSchema,
  contextDataSchema,
  type Actor,
  type TriggerInfo,
  type ContextData,
  type Context,
} from "./protocol.js";

export type { McpServerRef } from "./meta.js";
export type {
  AgentOptions,
  AgentAttachment,
  ToolDef,
  ArtifactBody,
  ArtifactRef,
  BrowserSession,
  BrowserSessionOptions,
  ConsoleEntry,
  NetworkEntry,
  CallOptions,
  HumanInputOptions,
  HumanInputSpec,
  HumanInputTextSpec,
  HumanInputChoiceSpec,
  HumanInputMultiSelectSpec,
  HumanInputResult,
  HumanTextResult,
  HumanChoiceResult,
  HumanMultiSelectResult,
  JsonValue,
  PhaseOptions,
  ScheduleOptions,
  SleepArg,
  JsonSchema,
} from "./types.js";
