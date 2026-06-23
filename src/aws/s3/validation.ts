import { S3_BUCKET_NAME_MAX_LENGTH } from "../../security/limits.js";
import { S3Error } from "./types.js";

const BUCKET_NAME_PATTERN = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;

export function validateBucketName(bucketName: string): void {
  const trimmed = bucketName.trim();
  if (!trimmed) {
    throw new S3Error("validation_error", "bucketName is required.");
  }
  if (trimmed.length > S3_BUCKET_NAME_MAX_LENGTH) {
    throw new S3Error(
      "validation_error",
      `bucketName must be at most ${S3_BUCKET_NAME_MAX_LENGTH} characters.`,
    );
  }
  if (trimmed.includes("..") || trimmed.includes(".-") || trimmed.includes("-.")) {
    throw new S3Error("validation_error", "bucketName has an invalid format.");
  }
  if (!BUCKET_NAME_PATTERN.test(trimmed)) {
    throw new S3Error("validation_error", "bucketName has an invalid format.");
  }
}
