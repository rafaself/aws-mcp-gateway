export { getInstanceHealth, assertInstanceExists } from "./client.js";
export { RdsError, type RdsInstanceHealth } from "./types.js";
export {
  validateDbInstanceIdentifier,
  validateLookbackMinutes,
  validatePeriodSeconds,
} from "./validation.js";
