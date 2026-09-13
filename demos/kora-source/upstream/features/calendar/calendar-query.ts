import { keepPreviousData, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { runtime, type CalendarEvent, type CalendarSource } from "../../lib/runtime";

type CalendarStatus = { state: "available" | "partial" | "unavailable"; reason?: string };
export type CalendarSourcePage = {
  sources: CalendarSource[];
  cursor?: string;
  complete: boolean;
  status: CalendarStatus;
};
export type CalendarEventPage = {
  events: CalendarEvent[];
  range: { start: string; end: string };
  cursor?: string;
  complete: boolean;
  status: CalendarStatus;
  sourceErrors: Array<{ calendarId: string; reason: string }>;
};

function mergedStatus(
  pages: Array<{ status: CalendarStatus }>,
  hasUsableData: boolean,
): CalendarStatus {
  const unavailable = pages.find((page) => page.status.state === "unavailable");
  const partial = pages.find((page) => page.status.state === "partial");
  if (unavailable)
    return hasUsableData
      ? { state: "partial", reason: unavailable.status.reason }
      : unavailable.status;
  return partial?.status ?? pages.at(-1)?.status ?? { state: "available" };
}

export function mergeCalendarSourcePages(pages: CalendarSourcePage[]) {
  const sources = [...new Map(
    pages.flatMap((page) => page.sources).map((source) => [source.calendarId, source]),
  ).values()];
  const last = pages.at(-1);
  return {
    sources,
    ...(last?.cursor ? { cursor: last.cursor } : {}),
    complete: last?.complete ?? false,
    status: mergedStatus(pages, sources.length > 0),
  };
}

function calendarEventIdentity(event: CalendarEvent) {
  const original = event.originalStart?.kind === "date"
    ? event.originalStart.date
    : event.originalStart?.instant ?? "";
  return `${event.calendarId}\u0000${event.eventId}\u0000${original}`;
}

function calendarEventOrder(event: CalendarEvent) {
  const start = event.start.kind === "date" ? event.start.date : event.start.instant;
  const end = event.end.kind === "date" ? event.end.date : event.end.instant;
  return `${start}\u0000${end}\u0000${event.calendarId}\u0000${event.eventId}`;
}

export function mergeCalendarEventPages(pages: CalendarEventPage[]) {
  const events = [...new Map(
    pages.flatMap((page) => page.events).map((event) => [calendarEventIdentity(event), event]),
  ).values()].sort((left, right) => calendarEventOrder(left).localeCompare(calendarEventOrder(right)));
  const sourceErrors = [...new Map(
    pages.flatMap((page) => page.sourceErrors).map((error) => [error.calendarId, error]),
  ).values()];
  const first = pages[0], last = pages.at(-1);
  return {
    events,
    range: first?.range ?? { start: "", end: "" },
    ...(last?.cursor ? { cursor: last.cursor } : {}),
    complete: last?.complete ?? false,
    status: sourceErrors.length
      ? { state: "partial" as const, reason: pages.find((page) => page.status.reason)?.status.reason ?? "One or more connected calendars could not be refreshed." }
      : mergedStatus(pages, events.length > 0),
    sourceErrors,
  };
}

export type CalendarQueryServices = Pick<typeof runtime, "calendarSources" | "calendarEvents">;

function staleCalendarEventsResponse(input: { start: string; end: string; calendarIds: string[] }, page: CalendarEventPage) {
  if (page.range.start !== input.start || page.range.end !== input.end) return true;
  const requestedCalendars = new Set(input.calendarIds);
  return page.events.some((event) => !requestedCalendars.has(event.calendarId));
}

export function useCalendarSources(services: CalendarQueryServices = runtime, scope = "live") {
  const query = useInfiniteQuery({
    queryKey: ["calendar", scope, "sources"],
    queryFn: ({ pageParam }) => services.calendarSources(200, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.complete ? undefined : last.cursor,
    staleTime: 60_000,
  });
  useEffect(() => {
    if (query.hasNextPage && !query.isFetchingNextPage && !query.isError)
      void query.fetchNextPage();
  }, [query.fetchNextPage, query.hasNextPage, query.isError, query.isFetchingNextPage]);
  const data = useMemo(
    () => query.data ? mergeCalendarSourcePages(query.data.pages) : undefined,
    [query.data],
  );
  return { ...query, data };
}

export function useCalendarEvents(input: {
  start?: string;
  end?: string;
  calendarIds: string[];
  viewerTimeZone: string;
  autoPage?: boolean;
}, services: CalendarQueryServices = runtime, scope = "live") {
  const queryClient = useQueryClient();
  const configuredRetry = queryClient.getDefaultOptions().queries?.retry;
  const query = useInfiniteQuery({
    queryKey: ["calendar", scope, "events", input.calendarIds, input.start, input.end, input.viewerTimeZone],
    queryFn: async ({ pageParam, signal }) => {
      const request = {
        start: input.start!,
        end: input.end!,
        calendarIds: input.calendarIds,
        viewerTimeZone: input.viewerTimeZone,
        pageSize: 200,
        cursor: pageParam,
      };
      const page = await services.calendarEvents(request, signal);
      if (staleCalendarEventsResponse(request, page)) {
        throw Object.assign(new Error("Calendar returned a response for an older range or source selection."), { code: "stale_response" });
      }
      return page;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.complete ? undefined : last.cursor,
    enabled: Boolean(input.start && input.end && input.calendarIds.length),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    retry: (failureCount, error) => {
      if (error && typeof error === "object" && "code" in error && error.code === "stale_response") return false;
      if (typeof configuredRetry === "function") return configuredRetry(failureCount, error);
      if (configuredRetry === false) return false;
      if (configuredRetry === true) return true;
      if (typeof configuredRetry === "number") return failureCount < configuredRetry;
      return failureCount < 3;
    },
  });
  useEffect(() => {
    if (input.autoPage !== false && query.hasNextPage && !query.isFetchingNextPage && !query.isError)
      void query.fetchNextPage();
  }, [input.autoPage, query.fetchNextPage, query.hasNextPage, query.isError, query.isFetchingNextPage]);
  const data = useMemo(
    () => query.data ? mergeCalendarEventPages(query.data.pages) : undefined,
    [query.data],
  );
  return { ...query, data };
}
