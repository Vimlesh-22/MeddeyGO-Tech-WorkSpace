import { NextResponse } from "next/server";
import { getSessionUserFromCookies } from "@/lib/auth/session";
import { getUserThemePreference, saveUserThemePreference, type ThemeMode } from "@/lib/theme/preferences";

type ThemePrefs = {
  themeMode: ThemeMode;
  bgColor: string | null;
  textColor: string | null;
  cardBgColor: string | null;
  borderColor: string | null;
  primaryColor: string | null;
  hoverColor: string | null;
  mutedBgColor: string | null;
  mutedTextColor: string | null;
  fontFamily: string | null;
};

// Fallback theme storage (in-memory when DB unavailable)
const fallbackThemes = new Map<number, ThemePrefs>();

// GET - Load user theme preferences
export async function GET() {
  try {
    const session = await getSessionUserFromCookies();
    
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.id;

    // Try database first
    try {
      const preferences = await getUserThemePreference(userId);
      
      if (preferences) {
        return NextResponse.json({
          themeMode: preferences.themeMode,
          bgColor: preferences.bgColor,
          textColor: preferences.textColor,
          cardBgColor: preferences.cardBgColor,
          borderColor: preferences.borderColor,
          primaryColor: preferences.primaryColor,
          hoverColor: preferences.hoverColor,
          mutedBgColor: preferences.mutedBgColor,
          mutedTextColor: preferences.mutedTextColor,
          fontFamily: preferences.fontFamily,
        });
      }

      // Return default theme if no preferences found
      return NextResponse.json({
        themeMode: "system",
        bgColor: null,
        textColor: null,
        cardBgColor: null,
        borderColor: null,
        primaryColor: null,
        hoverColor: null,
        mutedBgColor: null,
        mutedTextColor: null,
        fontFamily: null,
      });
    } catch (dbError) {
      console.error("Database unavailable, using fallback theme storage:", dbError);
      
      // Use in-memory fallback
      const fallbackPrefs = fallbackThemes.get(userId);
      
      if (fallbackPrefs) {
        return NextResponse.json(fallbackPrefs);
      }

      // Return default (light theme)
      return NextResponse.json({
        themeMode: "light",
        bgColor: null,
        textColor: null,
        cardBgColor: null,
        borderColor: null,
        primaryColor: null,
        hoverColor: null,
        mutedBgColor: null,
        mutedTextColor: null,
        fontFamily: null,
      });
    }
  } catch (error) {
    console.error("Error in GET /api/user/theme:", error);
    return NextResponse.json(
      { error: "Failed to load theme preferences" },
      { status: 500 }
    );
  }
}

// POST - Save user theme preferences
export async function POST(req: Request) {
  try {
    const session = await getSessionUserFromCookies();
    
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.id;
    const body = await req.json();

    // Validate theme mode
    const validThemeModes: ThemeMode[] = ["light", "dark", "system"];
    if (body.themeMode && !validThemeModes.includes(body.themeMode)) {
      return NextResponse.json(
        { error: "Invalid theme mode" },
        { status: 400 }
      );
    }

    const preferences = {
      themeMode: body.themeMode,
      bgColor: body.bgColor || null,
      textColor: body.textColor || null,
      cardBgColor: body.cardBgColor || null,
      borderColor: body.borderColor || null,
      primaryColor: body.primaryColor || null,
      hoverColor: body.hoverColor || null,
      mutedBgColor: body.mutedBgColor || null,
      mutedTextColor: body.mutedTextColor || null,
      fontFamily: body.fontFamily || null,
    };

    // Try database first
    try {
      const success = await saveUserThemePreference(userId, preferences);
      
      if (success) {
        return NextResponse.json({ 
          success: true,
          message: "Theme preferences saved successfully" 
        });
      }

      // If saveUserThemePreference returns false, it might be a fallback user or user doesn't exist
      // Use in-memory fallback storage
      console.log(`Theme preference save returned false for user ${userId}, using fallback storage`);
      fallbackThemes.set(userId, preferences);
      
      return NextResponse.json({ 
        success: true,
        message: "Theme preferences saved (fallback mode)",
        fallback: true
      });
    } catch (dbError) {
      console.error("Database unavailable, using fallback theme storage:", dbError);
      
      // Use in-memory fallback
      fallbackThemes.set(userId, preferences);
      
      return NextResponse.json({ 
        success: true,
        message: "Theme preferences saved (fallback mode)",
        fallback: true
      });
    }
  } catch (error) {
    console.error("Error in POST /api/user/theme:", error);
    return NextResponse.json(
      { error: "Failed to save theme preferences" },
      { status: 500 }
    );
  }
}
