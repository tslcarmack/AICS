export interface PaginationParams {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
}

export function parsePagination(
  page?: number,
  pageSize?: number,
): PaginationParams {
  const p = Math.max(1, page || 1);
  const ps = Math.min(100, Math.max(1, pageSize || 20));
  return {
    page: p,
    pageSize: ps,
    skip: (p - 1) * ps,
    take: ps,
  };
}

export function paginatedResponse<T>(
  items: T[],
  total: number,
  params: PaginationParams,
) {
  return {
    items,
    total,
    page: params.page,
    pageSize: params.pageSize,
    totalPages: Math.ceil(total / params.pageSize),
  };
}
