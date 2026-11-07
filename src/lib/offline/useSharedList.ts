"use client";
// Shared, real-time, offline-tolerant shopping list.
//
// • Every change is applied locally first (optimistic), saved to IndexedDB,
//   and queued as a full-row upsert carrying client_updated_at.
// • The queue flushes immediately when online, on reconnect, when the app
//   comes back to the foreground, and every 15 s while anything is pending.
// • The database ignores writes older than what it has (last-write-wins per
//   item, enforced by a trigger), so replaying a stale queue is safe.
// • Supabase Realtime pushes the other phone's changes; after any reconnect
//   we refetch the whole list to converge.

import { useCallback, useEffect, useRef, useState } from "react";
import { get, set } from "idb-keyval";
import { supabaseBrowser } from "../supabase/client";
import type { ListItem } from "../types";
import type { HouseholdData } from "../data/household";

const COLUMNS =
  "id, household_id, list_id, name, name_norm, qty, unit, display_qty, store_id, section_id, checked, checked_by, added_by, is_manual, note, source_meals, deleted_at, client_updated_at, created_at";

interface Snapshot {
  listId: string | null;
  items: ListItem[];
  savedAt: string;
}

const kSnap = (h: string) => `cb:list:${h}`;
const kQueue = (h: string) => `cb:queue:${h}`;
const kHousehold = (h: string) => `cb:hh:${h}`;

const newer = (a: string, b: string) => new Date(a).getTime() >= new Date(b).getTime();

export function nowIso(): string {
  return new Date().toISOString();
}

export type SyncStatus = "synced" | "syncing" | "offline" | "error";

export function useSharedList(householdId: string) {
  const db = supabaseBrowser();
  const [listId, setListId] = useState<string | null>(null);
  const [items, setItems] = useState<Map<string, ListItem>>(new Map());
  const [household, setHousehold] = useState<HouseholdData | null>(null);
  const [status, setStatus] = useState<SyncStatus>("syncing");
  const [pending, setPending] = useState(0);
  const [loaded, setLoaded] = useState(false);
  // Why the last save failed while online (shown with a Retry button).
  const [syncError, setSyncError] = useState<string | null>(null);

  const itemsRef = useRef(items);
  itemsRef.current = items;
  const listIdRef = useRef(listId);
  listIdRef.current = listId;
  const queueRef = useRef<Map<string, ListItem>>(new Map());
  const flushing = useRef(false);
  const refetchRef = useRef<(() => Promise<void>) | null>(null);
  const syncErrorRef = useRef<string | null>(null);

  const persist = useCallback(
    (map: Map<string, ListItem>) => {
      set(kSnap(householdId), { listId: listIdRef.current, items: [...map.values()], savedAt: nowIso() } satisfies Snapshot).catch(() => {});
    },
    [householdId],
  );

  const persistQueue = useCallback(() => {
    setPending(queueRef.current.size);
    set(kQueue(householdId), [...queueRef.current.values()]).catch(() => {});
  }, [householdId]);

  /** Merge a server row into local state if it is at least as new. */
  const applyRemote = useCallback(
    (row: ListItem) => {
      const local = itemsRef.current.get(row.id);
      const queued = queueRef.current.get(row.id);
      if (queued && !newer(row.client_updated_at, queued.client_updated_at)) return;
      if (local && !newer(row.client_updated_at, local.client_updated_at)) return;
      const next = new Map(itemsRef.current);
      if (row.deleted_at || (listIdRef.current && row.list_id !== listIdRef.current)) next.delete(row.id);
      else next.set(row.id, row);
      itemsRef.current = next;
      setItems(next);
      persist(next);
    },
    [persist],
  );

  const flush = useCallback(async () => {
    if (flushing.current || !queueRef.current.size) {
      if (!queueRef.current.size) setStatus(navigator.onLine ? "synced" : "offline");
      return;
    }
    if (!navigator.onLine) {
      setStatus("offline");
      return;
    }
    flushing.current = true;
    setStatus("syncing");
    const done = (sent: ListItem) => {
      const cur = queueRef.current.get(sent.id);
      if (cur && cur.client_updated_at === sent.client_updated_at) queueRef.current.delete(sent.id);
    };
    // A failure with a database code is the server saying no; without one, we never reached it.
    const isServerNo = (e: { code?: string; message?: string } | null) => !!e && (!!e.code || /permission|violates|invalid|jwt/i.test(e.message ?? ""));
    const isAuth = (e: { code?: string; message?: string } | null) => !!e && (e.code === "PGRST301" || e.code === "42501" || /jwt|expired|not authenticated/i.test(e.message ?? ""));
    try {
      const batch = [...queueRef.current.values()];
      let { error } = await db.from("shopping_list_items").upsert(batch, { onConflict: "id" });
      // Signed out in the background: refresh once and try again.
      if (isAuth(error)) {
        await db.auth.refreshSession().catch(() => {});
        ({ error } = await db.from("shopping_list_items").upsert(batch, { onConflict: "id" }));
      }
      if (!error) {
        batch.forEach(done);
        setSyncError(null);
      } else if (!isServerNo(error) || !navigator.onLine) {
        throw error; // a network problem: keep everything and try again later
      } else {
        // One bad change shouldn't hold up the rest: send them one by one.
        let lastNo: string | null = null;
        for (const row of batch) {
          const { error: e } = await db.from("shopping_list_items").upsert([row], { onConflict: "id" });
          if (!e) done(row);
          else if (isServerNo(e)) {
            lastNo = e.message || "The server turned this change down.";
            console.error("list sync rejected", row.name, e);
            queueRef.current.delete(row.id); // drop it so the rest can sync; the list refetches below
          } else throw e;
        }
        setSyncError(lastNo ? `Some changes couldn’t be saved (${lastNo}). Your list was refreshed.` : null);
        if (lastNo) refetchRef.current?.();
      }
      persistQueue();
      setStatus(queueRef.current.size ? "syncing" : syncErrorRef.current ? "error" : "synced");
    } catch {
      setStatus(navigator.onLine ? "error" : "offline");
      if (navigator.onLine) setSyncError((m) => m ?? "Couldn’t reach the server. Retrying.");
    } finally {
      flushing.current = false;
    }
  }, [db, persistQueue]);

  const refetch = useCallback(async () => {
    if (!navigator.onLine) {
      setStatus("offline");
      return;
    }
    const { data: list, error: le } = await db.from("shopping_lists").select("id").eq("is_active", true).maybeSingle();
    if (le) {
      setStatus("offline");
      return;
    }
    let id = list?.id as string | undefined;
    if (!id) {
      const { data: created } = await db.from("shopping_lists").insert({ household_id: householdId, is_active: true }).select("id").single();
      id = created?.id;
    }
    if (!id) return;
    setListId(id);
    listIdRef.current = id;
    const { data, error } = await db.from("shopping_list_items").select(COLUMNS).eq("list_id", id).is("deleted_at", null);
    if (error) {
      setStatus("offline");
      return;
    }
    // Server truth + anything still queued locally (which is newer by definition).
    const next = new Map<string, ListItem>();
    for (const row of (data ?? []) as ListItem[]) next.set(row.id, row);
    for (const q of queueRef.current.values()) {
      const s = next.get(q.id);
      if (!s || newer(q.client_updated_at, s.client_updated_at)) next.set(q.id, q);
    }
    itemsRef.current = next;
    setItems(next);
    persist(next);
    setStatus(queueRef.current.size ? "syncing" : "synced");
  }, [db, householdId, persist]);

  const refreshHousehold = useCallback(async () => {
    if (!navigator.onLine) return;
    try {
      const { loadHouseholdData } = await import("../data/household");
      const hh = await loadHouseholdData(db, householdId);
      setHousehold(hh);
      set(kHousehold(householdId), hh).catch(() => {});
    } catch {
      /* keep cached */
    }
  }, [db, householdId]);

  // Boot: cached snapshot + queue first (instant, works offline), then network.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [snap, queue, hh] = await Promise.all([
          get<Snapshot>(kSnap(householdId)),
          get<ListItem[]>(kQueue(householdId)),
          get<HouseholdData>(kHousehold(householdId)),
        ]);
        if (cancelled) return;
        if (queue?.length) queueRef.current = new Map(queue.map((q) => [q.id, q]));
        setPending(queueRef.current.size);
        if (hh) setHousehold(hh);
        if (snap) {
          const map = new Map(snap.items.map((i) => [i.id, i]));
          for (const q of queueRef.current.values()) map.set(q.id, q);
          itemsRef.current = map;
          setItems(map);
          setListId(snap.listId);
          listIdRef.current = snap.listId;
        }
      } catch {
        /* private mode etc. */
      }
      setLoaded(true);
      await flush();
      await Promise.all([refetch(), refreshHousehold()]);
    })();
    return () => {
      cancelled = true;
    };
  }, [householdId, flush, refetch, refreshHousehold]);

  // Realtime subscription
  useEffect(() => {
    if (!listId) return;
    const channel = db
      .channel(`list-${listId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "shopping_list_items", filter: `list_id=eq.${listId}` },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const id = (payload.old as { id?: string }).id;
            if (!id) return;
            const next = new Map(itemsRef.current);
            next.delete(id);
            itemsRef.current = next;
            setItems(next);
            persist(next);
          } else {
            applyRemote(payload.new as ListItem);
          }
        },
      )
      .subscribe((s) => {
        if (s === "SUBSCRIBED") {
          // (Re)connected: push our queue, then pull to converge.
          flush().then(refetch);
        }
      });
    return () => {
      db.removeChannel(channel);
    };
  }, [db, listId, applyRemote, flush, refetch, persist]);

  // Connectivity + foreground + periodic retry
  useEffect(() => {
    const online = () => flush().then(refetch);
    const offline = () => setStatus("offline");
    const visible = () => {
      if (document.visibilityState === "visible") online();
    };
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    document.addEventListener("visibilitychange", visible);
    const timer = setInterval(() => {
      if (queueRef.current.size) flush();
    }, 15_000);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      document.removeEventListener("visibilitychange", visible);
      clearInterval(timer);
    };
  }, [flush, refetch]);

  /** Apply local changes to one or more items (optimistic) and queue them. */
  const write = useCallback(
    (rows: ListItem[]) => {
      const stamp = nowIso();
      const next = new Map(itemsRef.current);
      for (const r of rows) {
        const row = { ...r, client_updated_at: stamp };
        if (row.deleted_at) next.delete(row.id);
        else next.set(row.id, row);
        queueRef.current.set(row.id, row);
      }
      itemsRef.current = next;
      setItems(next);
      persist(next);
      persistQueue();
      flush();
    },
    [flush, persist, persistQueue],
  );

  syncErrorRef.current = syncError;
  refetchRef.current = refetch;
  const retry = useCallback(() => {
    setSyncError(null);
    flush().then(refetch);
  }, [flush, refetch]);
  return { listId, items: [...items.values()], household, status, pending, loaded, write, refetch, syncError, retry };
}
