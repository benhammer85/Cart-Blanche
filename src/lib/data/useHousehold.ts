"use client";
import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "../supabase/client";
import { loadHouseholdData, type HouseholdData } from "./household";
import { useMembership } from "@/components/AppShell";

/** Client-side household config with a reload() for settings screens. */
export function useHousehold() {
  const { householdId } = useMembership();
  const [data, setData] = useState<HouseholdData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    try {
      setData(await loadHouseholdData(supabaseBrowser(), householdId));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t load");
    }
  }, [householdId]);
  useEffect(() => {
    reload();
  }, [reload]);
  return { data, error, reload, householdId, db: supabaseBrowser() };
}
