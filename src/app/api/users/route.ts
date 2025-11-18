import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAdminFromRequest, HttpError } from "@/lib/auth/guards";
import { createUser, deleteUser, listUsers, updateUser } from "@/lib/auth/users";
import { logActivity } from "@/lib/auth/activity";
import { createVerificationCode } from "@/lib/auth/otp";
import { sendEmail } from "@/lib/email";
import { getBaseUrl } from "@/lib/domain-config";
import { getDbPool } from "@/lib/db";
import type { RowDataPacket } from "mysql2/promise";

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["admin", "user", "dev"]).optional().default("user"),
  displayName: z.string().max(120).nullable().optional(),
  isActive: z.boolean().optional().default(true),
});

const updateUserSchema = z.object({
  password: z.union([z.string().min(8), z.literal("")]).optional(),
  role: z.enum(["admin", "user", "dev"]).optional(),
  displayName: z.union([z.string().max(120), z.null(), z.literal("")]).optional(),
  isActive: z.boolean().optional(),
  emailVerified: z.boolean().optional(),
  adminConfirmed: z.boolean().optional(),
}).passthrough(); // Allow extra fields to pass through

const idSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdminFromRequest(request);
    const users = await listUsers();
    // Use null for fallback admin (-1), otherwise use real user ID
    await logActivity(admin.id === -1 ? null : admin.id, "admin_fetch_users", { count: users.length });

    return NextResponse.json({ users });
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("List users error", error);
    return NextResponse.json({ error: "Unable to load users" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdminFromRequest(request);
    const payload = await request.json().catch(() => null);
    if (!payload) {
      throw new HttpError(400, "Invalid payload");
    }

    const parsed = createUserSchema.parse(payload);
    const user = await createUser({
      ...parsed,
      createdByAdminId: admin.id === -1 ? null : admin.id,
      createdByAdminName: admin.displayName || admin.email,
    });
    
    // Log activity with detailed user information
    await logActivity(admin.id === -1 ? null : admin.id, "admin_create_user", { 
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      displayName: user.displayName || 'Not set'
    });

    const adminCode = await createVerificationCode(user.id, "admin_confirm", 30, {
      requestedBy: admin.email,
    });
    const userCode = await createVerificationCode(user.id, "user_verify", 30);

    // Get the base URL for verification links
    const baseUrl = getBaseUrl();
    const userVerifyLink = `${baseUrl}/login?email=${encodeURIComponent(user.email)}&verify=${userCode.code}`;

    try {
      await Promise.all([
        sendEmail({
          to: admin.email,
          subject: "Confirm New Meddey Tech Workspace User",
          text: `A new user account has been created for ${user.email}.

Admin Confirmation Code: ${adminCode.code}

This code expires in 30 minutes. Enter it in the admin panel to activate the user's account.

User Details:
- Email: ${user.email}
- Display Name: ${parsed.displayName || 'Not set'}
- Role: ${user.role}

Created by: ${admin.email}`,
          html: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
    .code-box { background: white; border: 2px solid #f5576c; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center; }
    .code { font-size: 32px; font-weight: bold; color: #f5576c; letter-spacing: 5px; }
    .info-box { background: white; border-left: 4px solid #f5576c; padding: 15px; margin: 15px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>👤 New User Created</h1>
    </div>
    <div class="content">
      <p>Hello <strong>${admin.displayName || admin.email}</strong>,</p>
      
      <p>A new user account has been created and requires your confirmation:</p>
      
      <div class="info-box">
        <strong>User Details:</strong><br>
        📧 Email: ${user.email}<br>
        👤 Display Name: ${parsed.displayName || 'Not set'}<br>
        🔐 Role: ${user.role}
      </div>
      
      <p>Please enter the following admin confirmation code to activate their account:</p>
      
      <div class="code-box">
        <div class="code">${adminCode.code}</div>
        <p style="margin: 10px 0 0 0; color: #666;">Valid for 30 minutes</p>
      </div>
      
      <p style="font-size: 12px; color: #999;">
        This confirmation ensures account security and proper onboarding.
      </p>
    </div>
  </div>
</body>
</html>`,
        }),
        sendEmail({
          to: user.email,
          subject: "Welcome to Meddey Tech Workspace - Verify Your Email",
          text: `Welcome to Meddey Tech Workspace!

Your account has been created by ${admin.displayName || admin.email}.

Please verify your email address using the code below:

Verification Code: ${userCode.code}

This code expires in 30 minutes.

Quick Verification: Click the link below to verify automatically:
${userVerifyLink}

After email verification, an admin will need to confirm your account before you can login.

Your temporary password: ${parsed.password}

Please change your password after your first login.

Account created by: ${admin.displayName || admin.email}

Best regards,
Meddey Tech Workspace Team`,
          html: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
    .code-box { background: white; border: 2px solid #667eea; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center; }
    .code { font-size: 32px; font-weight: bold; color: #667eea; letter-spacing: 5px; }
    .button { display: inline-block; background: #667eea; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; font-weight: bold; }
    .info-box { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 15px 0; }
    .admin-box { background: #e8f5e9; border-left: 4px solid #4caf50; padding: 15px; margin: 15px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎉 Welcome to Meddey Tech Workspace!</h1>
    </div>
    <div class="content">
      <p>Hello <strong>${user.email}</strong>,</p>
      
      <p>Your Meddey Tech Workspace account has been created successfully! Please verify your email address to continue.</p>
      
      <div class="admin-box">
        <strong>👤 Appointed by:</strong><br>
        ${admin.displayName || admin.email}
      </div>
      
      <div class="code-box">
        <p style="margin: 0 0 10px 0; color: #666;">Email Verification Code:</p>
        <div class="code">${userCode.code}</div>
        <p style="margin: 10px 0 0 0; color: #666;">Valid for 30 minutes</p>
      </div>
      
      <p style="text-align: center;">
        <a href="${userVerifyLink}" class="button">✅ Verify Email Now</a>
      </p>
      
      <div class="info-box">
        <strong>⚠️ Next Steps:</strong><br>
        1. Verify your email using the code above or click the button<br>
        2. Wait for admin confirmation (you'll receive a notification)<br>
        3. Login with your credentials
      </div>
      
      <div class="info-box">
        <strong>🔐 Your Credentials:</strong><br>
        Email: ${user.email}<br>
        Password: ${parsed.password}<br>
        <em style="color: #856404;">Please change your password after first login</em>
      </div>
      
      <p style="font-size: 12px; color: #999; margin-top: 30px;">
        If you didn't request this account, please contact the administrator.
      </p>
    </div>
  </div>
</body>
</html>`,
        }),
      ]);
      
      console.log(`✓ Verification emails sent to admin (${admin.email}) and user (${user.email})`);
    } catch (emailError) {
      console.error("Failed to send verification emails:", emailError);
      
      // Log codes for manual verification
      console.log("\n" + "=".repeat(60));
      console.log("VERIFICATION EMAILS FAILED - Manual codes:");
      console.log("Admin Code:", adminCode.code, "→", admin.email);
      console.log("User Code:", userCode.code, "→", user.email);
      console.log("User Verify Link:", userVerifyLink);
      console.log("=".repeat(60) + "\n");
    }

    return NextResponse.json({ user });
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    console.error("Create user error", error);
    return NextResponse.json({ error: "Unable to create user" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const admin = await requireAdminFromRequest(request);
    const payload = await request.json().catch(() => null);
    if (!payload) {
      throw new HttpError(400, "Invalid payload");
    }

    const { id, ...rest } = payload;
    const parsedId = idSchema.parse({ id }).id;
    
    // If no updates provided (only id), return early
    if (Object.keys(rest).length === 0) {
      return NextResponse.json({ ok: true, message: "No changes to apply" });
    }
    
    // Clean up the payload - remove empty strings, convert to proper types
    const cleanedRest: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(rest)) {
      // Handle password - skip if empty, validate if provided
      if (key === "password") {
        if (value && typeof value === "string" && value.length >= 8) {
          cleanedRest[key] = value;
        }
        // Skip empty passwords (no change)
        continue;
      }
      
      // For displayName, empty string becomes null
      if (key === "displayName") {
        if (value === "" || value === null || value === undefined) {
          cleanedRest[key] = null;
        } else {
          cleanedRest[key] = value;
        }
        continue;
      }
      
      // Convert string booleans to actual booleans
      if (key === "isActive" || key === "emailVerified" || key === "adminConfirmed") {
        if (typeof value === "string") {
          cleanedRest[key] = value === "true" || value === "1" || value === "on";
        } else if (typeof value === "boolean") {
          cleanedRest[key] = value;
        } else {
          // Skip invalid boolean values
          continue;
        }
        continue;
      }
      
      // Validate role
      if (key === "role") {
        if (value === "admin" || value === "user" || value === "dev") {
          cleanedRest[key] = value;
        }
        continue;
      }
      
      // Include other fields as-is
      cleanedRest[key] = value;
    }
    
    // If after cleaning there are no updates, return early
    if (Object.keys(cleanedRest).length === 0) {
      return NextResponse.json({ ok: true, message: "No changes to apply" });
    }
    
    const updates = updateUserSchema.parse(cleanedRest);

    // Prevent admins/devs from removing their own admin/dev privileges
    if (admin.id === parsedId && updates.role) {
      if ((admin.role === "admin" || admin.role === "dev") && updates.role === "user") {
        return NextResponse.json(
          { error: "You cannot remove your own admin or dev privileges. Ask another admin to change your role." },
          { status: 403 }
        );
      }
    }

    await updateUser(parsedId, updates);
    
    // Get user details for logging
    const pool = getDbPool();
    const [userRows] = await pool.query<RowDataPacket[]>(
      `SELECT email, role, display_name FROM users WHERE id = ?`,
      [parsedId]
    );
    const updatedUser = userRows[0] as { email: string; role: string; display_name: string | null };
    
    // Log activity with details of what was updated
    const updateDetails: Record<string, unknown> = { 
      userId: parsedId,
      userEmail: updatedUser.email,
      updatedFields: Object.keys(updates)
    };
    
    if (updates.role) updateDetails.newRole = updates.role;
    if (updates.displayName !== undefined) updateDetails.newDisplayName = updates.displayName || 'Cleared';
    if (updates.isActive !== undefined) updateDetails.newActiveStatus = updates.isActive;
    
    await logActivity(admin.id === -1 ? null : admin.id, "admin_update_user", updateDetails);

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    if (error instanceof z.ZodError) {
      console.error("Zod validation error:", error.errors);
      const errorMessages = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
      return NextResponse.json({ 
        error: "Invalid payload", 
        details: errorMessages 
      }, { status: 400 });
    }

    console.error("Update user error", error);
    return NextResponse.json({ error: "Unable to update user" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const admin = await requireAdminFromRequest(request);
    const { searchParams } = new URL(request.url);
    const idParam = searchParams.get("id");
    const parsedId = idSchema.parse({ id: idParam }).id;

    // Check if this is the last admin
    const pool = getDbPool();
    const [userRows] = await pool.query<RowDataPacket[]>(
      `SELECT role FROM users WHERE id = ?`,
      [parsedId]
    );
    
    if (userRows.length === 0) {
      throw new HttpError(404, "User not found");
    }
    
    const userToDelete = userRows[0] as { role: string };
    
    if (userToDelete.role === "admin") {
      const [adminCountRows] = await pool.query<RowDataPacket[]>(
        `SELECT COUNT(*) as count FROM users WHERE role = 'admin'`
      );
      const adminCount = (adminCountRows[0] as { count: number }).count;
      
      if (adminCount <= 1) {
        throw new HttpError(400, "Cannot delete the last admin user. At least one admin must remain in the system.");
      }
    }

    // Get user details before deletion for logging
    const [userDetailsRows] = await pool.query<RowDataPacket[]>(
      `SELECT email, role, display_name FROM users WHERE id = ?`,
      [parsedId]
    );
    const deletedUser = userDetailsRows[0] as { email: string; role: string; display_name: string | null };

    await deleteUser(parsedId);
    
    // Log activity with details of deleted user
    await logActivity(admin.id === -1 ? null : admin.id, "admin_delete_user", { 
      userId: parsedId,
      userEmail: deletedUser.email,
      userRole: deletedUser.role,
      displayName: deletedUser.display_name || 'Not set'
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    console.error("Delete user error", error);
    return NextResponse.json({ error: "Unable to delete user" }, { status: 500 });
  }
}
