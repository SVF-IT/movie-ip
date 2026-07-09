import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import Papa from "papaparse";

export async function POST(request: Request) {
  try {
    // Verify user is authenticated and has editor/admin role
    const serverClient = await createServerClient();
    const { data: { user } } = await serverClient.auth.getUser();

    if (!user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await serverClient
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || !["admin", "editor"].includes(profile.role)) {
      return NextResponse.json(
        { message: "Only admins and editors can import data" },
        { status: 403 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ message: "No file provided" }, { status: 400 });
    }

    // Validate file size (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { message: "File size must be under 10MB" },
        { status: 400 }
      );
    }

    // Validate file type
    if (!file.name.toLowerCase().endsWith(".csv") && file.type !== "text/csv") {
      return NextResponse.json(
        { message: "Only CSV files are accepted" },
        { status: 400 }
      );
    }

    const text = await file.text();
    const { data: rows, errors: parseErrors } = Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h: string) => h.trim().toLowerCase().replace(/\s+/g, "_"),
    });

    if (parseErrors.length > 0) {
      return NextResponse.json({
        message: "CSV parsing errors",
        errors: parseErrors.map((e: { row?: number; message: string }) => ({
          row: e.row || 0,
          message: e.message,
        })),
      }, { status: 400 });
    }

    // Admin client for inserts
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const results = { success: 0, errors: [] as { row: number; field?: string; message: string }[], total: rows.length };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] as Record<string, string>;
      const rowNum = i + 2; // 1-indexed + header

      try {
        const title = row.title || row.movie_name || row.name;
        if (!title || !title.trim()) {
          results.errors.push({ row: rowNum, field: "title", message: "Title is required" });
          continue;
        }

        // Determine source
        const sourceRaw = (row.source || row.type || "").toLowerCase();
        const source = sourceRaw.includes("acquired") ? "acquired" : "home_production";

        // Resolve language
        let language: string | undefined;
        const langName = row.language;
        if (langName && langName.trim()) {
          language = langName.trim().replace(/\s*[Dd]ubbed\s*/g, "").trim();
        }

        // Resolve production house - store raw name directly, create only individual houses
        let productionHouseId: string | undefined;
        let productionHouseName: string | undefined;
        const houseName = row.production_house || row.producer;
        if (houseName && houseName.trim()) {
          const trimmedName = houseName.trim();
          // Always store the raw CSV value as production_house_name
          productionHouseName = trimmedName;

          // If the name contains &, -, or ,, split and create only individual houses
          if (trimmedName.includes('&') || trimmedName.includes('-') || trimmedName.includes(',')) {
            const parts = trimmedName.split(/[&,-]/).map((p: string) => p.trim()).filter(Boolean);
            for (const part of parts) {
              const { data: existingPart } = await supabaseAdmin
                .from("production_houses")
                .select("id")
                .ilike("name", part)
                .single();
              if (!existingPart) {
                await supabaseAdmin
                  .from("production_houses")
                  .insert({ name: part })
                  .select("id")
                  .single();
              }
            }
            // User doesn't want to store any ID in movies table, name is enough
          } else {
            // Single house name - still create it for dropdown usage
            const { data: house } = await supabaseAdmin
              .from("production_houses")
              .select("id")
              .ilike("name", trimmedName)
              .single();
            if (!house) {
              await supabaseAdmin
                .from("production_houses")
                .insert({ name: trimmedName })
                .select("id")
                .single();
            }
          }
        }

        // Parse year (kept as string — DB column is TEXT, supports "UNRELEASED", "TBD")
        const yearRaw = row.release_year || row.year;
        const releaseYear = yearRaw ? String(yearRaw).trim() : undefined;

        // Normalize certification
        const certRaw = (row.certification || row.censor || "").toUpperCase().trim();
        const certMap: Record<string, string> = { U: "U", UA: "UA", "U/A": "U/A", A: "A", S: "S" };
        const certification = certMap[certRaw] || undefined;

        const movieData: Record<string, unknown> = {
          title: title.trim(),
          source,
          release_year: releaseYear || undefined,
          certification,
          language,
          production_house_name: productionHouseName,
          release_date: row.release_date || undefined,
          production_no: row.production_no || undefined,
          color_or_bw: row.color_or_bw || row.color || undefined,
          trailer_link: row.trailer_link || row.trailer || undefined,
          remarks: row.remarks || undefined,
          created_by: user.id,
        };

        // Remove undefined values
        Object.keys(movieData).forEach((k) => {
          if (movieData[k] === undefined || movieData[k] === "") delete movieData[k];
        });

        const { error: insertError } = await supabaseAdmin
          .from("movies")
          .insert(movieData);

        if (insertError) {
          results.errors.push({ row: rowNum, message: insertError.message });
        } else {
          results.success++;
        }
      } catch (err) {
        results.errors.push({
          row: rowNum,
          message: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    return NextResponse.json(results);
  } catch (error) {
    console.error("Import error:", error);
    return NextResponse.json(
      { message: "An unexpected error occurred during import" },
      { status: 500 }
    );
  }
}
