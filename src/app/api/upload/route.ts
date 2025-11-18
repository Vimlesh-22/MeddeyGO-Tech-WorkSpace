import { NextResponse, type NextRequest } from "next/server";
import { requireSessionUserFromRequest } from "@/lib/auth/guards";
import { saveUploadedFile, type UploadType } from "@/lib/storage/upload";
import { getDbPool } from "@/lib/db";
import { type ResultSetHeader } from "mysql2/promise";
import { logActivity } from "@/lib/auth/activity";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rateLimit";

function extractClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUserFromRequest(request);
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const type = (formData.get("type") as UploadType) || "banner";
    const description = (formData.get("description") as string) || "";

    // SECURITY: Rate limiting for file uploads
    const clientIp = extractClientIp(request);
    const userRateLimit = checkRateLimit(String(user.id), RATE_LIMITS.FILE_UPLOAD);
    if (!userRateLimit.allowed) {
      return NextResponse.json(
        {
          error: `Rate limit exceeded. Maximum 20 uploads per hour. Try again after ${new Date(userRateLimit.resetAt).toLocaleString()}`,
        },
        { status: 429 }
      );
    }

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate upload type
    const validTypes: UploadType[] = ["banner", "video", "dev-image"];
    if (!validTypes.includes(type)) {
      return NextResponse.json({ error: "Invalid upload type" }, { status: 400 });
    }

    // Check if user has permission for dev-image uploads
    if (type === "dev-image" && user.role !== "dev") {
      return NextResponse.json({ error: "Dev role required for dev-image uploads" }, { status: 403 });
    }

    // Save file
    const uploadResult = await saveUploadedFile(file, type, user.id);

    // Save to database based on type
    const pool = getDbPool();

    if (type === "dev-image") {
      // Save to dev_images table
      await pool.query<ResultSetHeader>(
        `INSERT INTO dev_images (name, file_path, file_url, file_size, mime_type, description, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          file.name,
          uploadResult.filePath,
          uploadResult.fileUrl,
          uploadResult.fileSize,
          uploadResult.mimeType,
          description || null,
          user.id,
        ]
      );
    } else if (type === "banner") {
      // Save to user_banners table
      await pool.query<ResultSetHeader>(
        `INSERT INTO user_banners (user_id, name, file_path, file_url, file_size, mime_type, is_active)
         VALUES (?, ?, ?, ?, ?, ?, 0)`,
        [
          user.id,
          file.name,
          uploadResult.filePath,
          uploadResult.fileUrl,
          uploadResult.fileSize,
          uploadResult.mimeType,
        ]
      );
    } else if (type === "video") {
      // Save to user_videos table
      await pool.query<ResultSetHeader>(
        `INSERT INTO user_videos (user_id, name, file_path, file_url, file_size, mime_type, description)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          user.id,
          file.name,
          uploadResult.filePath,
          uploadResult.fileUrl,
          uploadResult.fileSize,
          uploadResult.mimeType,
          description || null,
        ]
      );
    }

    // SECURITY: Comprehensive logging
    await logActivity(user.id, "file_uploaded", {
      type,
      fileName: file.name,
      fileSize: uploadResult.fileSize,
      ip: clientIp,
      userAgent: request.headers.get("user-agent") || "unknown",
      mimeType: uploadResult.mimeType,
    });

    return NextResponse.json({
      ok: true,
      file: {
        fileName: uploadResult.fileName,
        fileUrl: uploadResult.fileUrl,
        fileSize: uploadResult.fileSize,
        mimeType: uploadResult.mimeType,
      },
    });
  } catch (error) {
    // SECURITY: Log upload errors
    const clientIp = extractClientIp(request);
    console.error("[SECURITY] Upload error", {
      error: error instanceof Error ? error.message : String(error),
      ip: clientIp,
      path: request.nextUrl.pathname,
    });

    if (error instanceof Error && "status" in error) {
      const httpError = error as { status: number; message: string };
      return NextResponse.json({ error: httpError.message }, { status: httpError.status });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to upload file" },
      { status: 500 }
    );
  }
}

