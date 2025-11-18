import nodemailer from "nodemailer";
import { ensureSingleEmail, validateEmail } from "@/lib/security/validation";

let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (transporter) {
    return transporter;
  }

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD } = process.env;
  
  console.log("🔧 Initializing SMTP Configuration:");
  console.log("  SMTP_HOST:", SMTP_HOST || "NOT SET");
  console.log("  SMTP_PORT:", SMTP_PORT || "NOT SET");
  console.log("  SMTP_USER:", SMTP_USER || "NOT SET");
  console.log("  SMTP_PASSWORD:", SMTP_PASSWORD ? "***SET***" : "NOT SET");
  
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASSWORD) {
    throw new Error("SMTP configuration missing. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD in .env");
  }

  const port = Number(SMTP_PORT);
  const isSecure = port === 465;

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: port,
    secure: isSecure,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASSWORD,
    },
    tls: {
      rejectUnauthorized: false, // Allow self-signed certificates for testing
    },
    connectionTimeout: 10000, // 10 seconds
    greetingTimeout: 10000, // 10 seconds
  });

  console.log(`✓ SMTP Transporter created: ${SMTP_HOST}:${port} (secure: ${isSecure})`);

  return transporter;
}

export type EmailPayload = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
};

export async function sendEmail(payload: EmailPayload) {
  const smtpFrom = process.env.SMTP_FROM || process.env.SMTP_USER;
  const smtpUser = process.env.SMTP_USER;
  
  // SECURITY: Ensure 'to' is a single email, never an array
  // This prevents email array manipulation attacks
  let validatedTo: string;
  try {
    validatedTo = ensureSingleEmail(payload.to);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Invalid email address";
    console.error("❌ Email validation failed:", errorMessage);
    throw new Error(`Email validation failed: ${errorMessage}`);
  }

  // Validate email format
  const emailValidation = validateEmail(validatedTo);
  if (!emailValidation.valid) {
    const error = emailValidation.error || "Invalid email address";
    console.error("❌ Email validation failed:", error);
    throw new Error(`Email validation failed: ${error}`);
  }
  
  console.log("\n📧 Preparing to send email:");
  console.log("  To:", validatedTo);
  console.log("  Subject:", payload.subject);
  console.log("  From User:", smtpUser);
  console.log("  From Display:", smtpFrom);
  
  if (!smtpFrom || !smtpUser) {
    const error = "SMTP_FROM or SMTP_USER must be configured for outbound email";
    console.error("❌", error);
    throw new Error(error);
  }

  try {
    const transport = getTransporter();
    
    // Verify SMTP connection before sending
    console.log("🔍 Verifying SMTP connection...");
    await transport.verify();
    console.log("✓ SMTP connection verified");
    
    // Use a professional sender name with the actual SMTP email
    // This way Gmail accepts it, but recipients see the professional name
    const fromAddress = `"Meddey Tech Workspace" <${smtpUser}>`;
    
    const mailOptions = {
      from: fromAddress,
      to: validatedTo, // Use validated email, never from payload directly
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
      replyTo: payload.replyTo || smtpFrom || smtpUser,
      headers: {
        'X-Mailer': 'Meddey Tech Workspace',
        'X-Priority': '1',
      }
    };
    
    console.log("📤 Sending email...");
    const result = await transport.sendMail(mailOptions);
    console.log(`✅ Email sent successfully to ${validatedTo}`);
    console.log("  Message ID:", result.messageId);
    console.log("  Response:", result.response);
    return result;
  } catch (error) {
    console.error("\n❌ Failed to send email:");
    console.error("  To:", validatedTo);
    console.error("  Subject:", payload.subject);
    console.error("  Error Type:", error instanceof Error ? error.constructor.name : typeof error);
    console.error("  Error Message:", error instanceof Error ? error.message : String(error));
    
    if (error instanceof Error && 'code' in error) {
      console.error("  Error Code:", (error as { code?: string }).code);
    }
    
    if (error instanceof Error && error.stack) {
      console.error("  Stack Trace:", error.stack);
    }
    
    // Still throw the error so calling code knows it failed
    throw new Error(`Email send failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
