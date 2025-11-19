import { put } from "@vercel/blob";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";

export type UploadType = "banner" | "video" | "dev-image";

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"];
const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/ogg"];
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100MB

export interface UploadResult {
  fileName: string;
  filePath: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
}

export function validateFile(file: File, type: UploadType): { valid: boolean; error?: string } {
  // Check file size
  const maxSize = type === "video" ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE;
  if (file.size > maxSize) {
    return {
      valid: false,
      error: `File size exceeds maximum allowed size (${maxSize / 1024 / 1024}MB)`,
    };
  }

  // Check file type
  if (type === "video") {
    if (!ALLOWED_VIDEO_TYPES.includes(file.type)) {
      return {
        valid: false,
        error: `Invalid video type. Allowed: ${ALLOWED_VIDEO_TYPES.join(", ")}`,
      };
    }
  } else {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      return {
        valid: false,
        error: `Invalid image type. Allowed: ${ALLOWED_IMAGE_TYPES.join(", ")}`,
      };
    }
  }

  return { valid: true };
}

export async function saveUploadedFile(
  file: File,
  type: UploadType,
  _userId?: number
): Promise<UploadResult> {
  const validation = validateFile(file, type);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const storageStrategy =
    process.env.FILE_STORAGE_STRATEGY?.toLowerCase() ||
    (process.env.VERCEL ? "blob" : "local");
  const useBlobStorage = storageStrategy === "blob";

  // Generate unique filename
  const fileExt = file.name.split(".").pop() || "";
  const fileName = `${randomUUID()}${fileExt ? `.${fileExt}` : ""}`;

  if (useBlobStorage) {
    const blobToken =
      process.env.BLOB_READ_WRITE_TOKEN ||
      process.env.BLOB_TOKEN ||
      process.env.BLOB_RW_TOKEN;

    if (!blobToken) {
      throw new Error(
        "Blob storage enabled but BLOB_READ_WRITE_TOKEN is not configured. Set FILE_STORAGE_STRATEGY=local to store files on disk during development."
      );
    }

    const blobPath = `uploads/${type}/${fileName}`;
    const blob = await put(blobPath, file, {
      access: "public",
      contentType: file.type,
      token: blobToken,
      addRandomSuffix: false,
    });

    return {
      fileName,
      filePath: blob.pathname,
      fileUrl: blob.url,
      fileSize: file.size,
      mimeType: file.type,
    };
  }

  // Local filesystem fallback for development environments
  const uploadDir = join(process.cwd(), "public", "uploads", type);
  await mkdir(uploadDir, { recursive: true });

  const filePath = join(uploadDir, fileName);

  // Convert File to Buffer and save
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  await writeFile(filePath, buffer);

  // Generate public URL
  const fileUrl = `/uploads/${type}/${fileName}`;

  return {
    fileName,
    filePath,
    fileUrl,
    fileSize: file.size,
    mimeType: file.type,
  };
}

