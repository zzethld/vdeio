import { reactive } from 'vue';

/** Base pagination fields shared by every list query. */
export interface BasePaginationQuery {
  page: number;
  pageSize: number;
}

/** Full query type: pagination fields + a view's own filter fields. */
export type PaginationQuery<F extends object> = BasePaginationQuery & F;

export interface UsePaginationOptions {
  /** Initial page size. Defaults to 20 (matches existing views). */
  pageSize?: number;
}

/**
 * Generic list-pagination composable.
 *
 * Centralizes the boilerplate `handleSearch` / `handleFilter` /
 * `handlePageChange` / `handleSizeChange` / `reset` handlers that were
 * previously duplicated across CampaignList, DeviceList, StoreList and
 * VideoList. Each view supplies its own filter fields via `initialFilters`
 * and a fetch callback that closes over the returned reactive `query`.
 *
 * The visible UI (Element Plus inputs, pagination layout) is unchanged —
 * only the script-side handlers are de-duplicated.
 */
export function usePagination<F extends Record<string, string | number>>(
  initialFilters: F,
  fetchFn: () => void | Promise<void>,
  options: UsePaginationOptions = {},
) {
  const query = reactive<PaginationQuery<F>>({
    page: 1,
    pageSize: options.pageSize ?? 20,
    ...initialFilters,
  });

  /** Reset to page 1 and refetch. Alias used by search-style filters. */
  const handleSearch = (): void => {
    query.page = 1;
    void fetchFn();
  };

  /** Reset to page 1 and refetch. Alias used by select-style filters. */
  const handleFilter = handleSearch;

  const handlePageChange = (page: number): void => {
    query.page = page;
    void fetchFn();
  };

  const handleSizeChange = (size: number): void => {
    query.pageSize = size;
    query.page = 1;
    void fetchFn();
  };

  /** Restore initial filter values, reset to page 1 and refetch. */
  const reset = (): void => {
    query.page = 1;
    Object.assign(query, initialFilters);
    void fetchFn();
  };

  return {
    query,
    handleSearch,
    handleFilter,
    handlePageChange,
    handleSizeChange,
    reset,
  };
}
