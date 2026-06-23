import {
  ECR_IMAGE_DIGEST_MAX_LENGTH,
  ECR_IMAGE_TAG_MAX_LENGTH,
  ECR_REPOSITORY_NAME_MAX_LENGTH,
} from "../../security/limits.js";
import { EcrError } from "./types.js";

const REPOSITORY_NAME_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const IMAGE_TAG_PATTERN = /^[\w][\w.-]{0,127}$/;
const IMAGE_DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/;

export function validateRepositoryName(repositoryName: string): void {
  const trimmed = repositoryName.trim();
  if (!trimmed) {
    throw new EcrError("validation_error", "repositoryName is required.");
  }
  if (trimmed.length > ECR_REPOSITORY_NAME_MAX_LENGTH) {
    throw new EcrError(
      "validation_error",
      `repositoryName must be at most ${ECR_REPOSITORY_NAME_MAX_LENGTH} characters.`,
    );
  }
  if (!REPOSITORY_NAME_PATTERN.test(trimmed)) {
    throw new EcrError("validation_error", "repositoryName has an invalid format.");
  }
}

export function validateImageTag(imageTag: string): void {
  const trimmed = imageTag.trim();
  if (!trimmed) {
    throw new EcrError("validation_error", "imageTag must be non-empty when provided.");
  }
  if (trimmed.length > ECR_IMAGE_TAG_MAX_LENGTH) {
    throw new EcrError(
      "validation_error",
      `imageTag must be at most ${ECR_IMAGE_TAG_MAX_LENGTH} characters.`,
    );
  }
  if (!IMAGE_TAG_PATTERN.test(trimmed)) {
    throw new EcrError("validation_error", "imageTag has an invalid format.");
  }
}

export function validateImageDigest(imageDigest: string): void {
  const trimmed = imageDigest.trim();
  if (!trimmed) {
    throw new EcrError("validation_error", "imageDigest must be non-empty when provided.");
  }
  if (trimmed.length > ECR_IMAGE_DIGEST_MAX_LENGTH) {
    throw new EcrError("validation_error", "imageDigest has an invalid format.");
  }
  if (!IMAGE_DIGEST_PATTERN.test(trimmed)) {
    throw new EcrError("validation_error", "imageDigest must be a sha256 digest.");
  }
}

export function validateImageSelector(imageTag?: string, imageDigest?: string): void {
  if (imageTag && imageDigest) {
    throw new EcrError(
      "validation_error",
      "Provide imageTag or imageDigest, not both.",
    );
  }
  if (imageTag) {
    validateImageTag(imageTag);
  }
  if (imageDigest) {
    validateImageDigest(imageDigest);
  }
}
