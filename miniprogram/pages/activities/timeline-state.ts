import type { Activity } from '../../models';

export interface TimelineViewState {
  items: Activity[];
  nextCursor: string | null;
  loading: boolean;
  refreshing: boolean;
  loadingMore: boolean;
  error: string;
  refreshError: string;
  revision: number;
  loaded: boolean;
}

export function createTimelineViewState(): TimelineViewState {
  return {
    items: [],
    nextCursor: null,
    loading: false,
    refreshing: false,
    loadingMore: false,
    error: '',
    refreshError: '',
    revision: 0,
    loaded: false,
  };
}

export function invalidateTimelineView(state: TimelineViewState): TimelineViewState {
  return {
    ...state,
    loading: false,
    refreshing: false,
    loadingMore: false,
    revision: state.revision + 1,
  };
}

export function appendUniqueActivities(current: Activity[], incoming: Activity[]): Activity[] {
  const seen = new Set(current.map((item) => item.id));
  const result = [...current];
  for (const item of incoming) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    result.push(item);
  }
  return result;
}
