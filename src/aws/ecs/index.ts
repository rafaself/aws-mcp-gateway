export {
  getServiceHealth,
  listEcsTasks,
  getRecentStoppedEcsTasks,
  getTaskDefinitionMetadata,
} from "./client.js";
export { compareServiceImageWithEcr } from "./image-compare.js";
export { EcsError } from "./types.js";
export type {
  EcsServiceHealth,
  EcsTaskSummary,
  EcsStoppedTaskDiagnostic,
  EcsListTasksOptions,
  EcsStoppedTasksOptions,
  EcsDesiredStatus,
  EcsEcrImageComparisonResult,
} from "./types.js";
