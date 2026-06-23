import type { DescribeImagesResponse, EcrImageScanSummary, EcrImageStatusResult } from "./types.js";

export function parseEcrImageReference(
  image: string,
  repositoryName: string,
): {
  matchesRepository: boolean;
  tag?: string;
  digest?: string;
} {
  const atIndex = image.lastIndexOf("@");
  if (atIndex >= 0) {
    const digest = image.slice(atIndex + 1);
    const beforeAt = image.slice(0, atIndex);
    const repoPart = beforeAt.split("/").pop() ?? "";
    return {
      matchesRepository: repoPart === repositoryName,
      digest,
    };
  }

  const colonIndex = image.lastIndexOf(":");
  if (colonIndex >= 0) {
    const tag = image.slice(colonIndex + 1);
    const beforeColon = image.slice(0, colonIndex);
    const repoPart = beforeColon.split("/").pop() ?? "";
    return {
      matchesRepository: repoPart === repositoryName,
      tag,
    };
  }

  const repoPart = image.split("/").pop() ?? "";
  return {
    matchesRepository: repoPart === repositoryName,
  };
}

function normalizeScanSummary(
  summary?: { CRITICAL?: number; HIGH?: number },
): EcrImageScanSummary | undefined {
  if (!summary) return undefined;
  const criticalCount = summary.CRITICAL ?? 0;
  const highCount = summary.HIGH ?? 0;
  if (criticalCount === 0 && highCount === 0) {
    return { criticalCount: 0, highCount: 0 };
  }
  return { criticalCount, highCount };
}

function selectLatestImage(
  images: NonNullable<DescribeImagesResponse["imageDetails"]>,
): NonNullable<DescribeImagesResponse["imageDetails"]>[number] | undefined {
  if (images.length === 0) return undefined;
  return images.reduce((latest, current) => {
    const latestPushed = latest.imagePushedAt ?? 0;
    const currentPushed = current.imagePushedAt ?? 0;
    return currentPushed > latestPushed ? current : latest;
  });
}

export function normalizeImageDetail(
  region: string,
  repositoryName: string,
  image: NonNullable<DescribeImagesResponse["imageDetails"]>[number],
): EcrImageStatusResult {
  const scanSummary = normalizeScanSummary(image.imageScanFindingSummary);
  return {
    region,
    repositoryName,
    found: true,
    imageDigest: image.imageDigest,
    ...(image.imageTags && image.imageTags.length > 0 ? { tags: image.imageTags } : {}),
    ...(image.imagePushedAt
      ? { pushedAt: new Date(image.imagePushedAt).toISOString() }
      : {}),
    ...(image.imageSizeInBytes !== undefined
      ? { imageSizeInBytes: image.imageSizeInBytes }
      : {}),
    ...(image.imageScanStatus?.status ? { scanStatus: image.imageScanStatus.status } : {}),
    ...(scanSummary ? { scanSummary } : {}),
  };
}

export function buildNotFoundImageStatus(
  region: string,
  repositoryName: string,
): EcrImageStatusResult {
  return {
    region,
    repositoryName,
    found: false,
  };
}

export function pickImageFromResponse(
  response: DescribeImagesResponse,
  region: string,
  repositoryName: string,
): EcrImageStatusResult {
  const images = response.imageDetails ?? [];
  if (images.length === 0) {
    return buildNotFoundImageStatus(region, repositoryName);
  }

  const selected = images.length === 1 ? images[0] : selectLatestImage(images);
  if (!selected) {
    return buildNotFoundImageStatus(region, repositoryName);
  }

  return normalizeImageDetail(region, repositoryName, selected);
}
