import { Op, UniqueConstraintError, WhereOptions, Attributes } from 'sequelize';
import { StoreModel, Store } from '../models';
import { AppError } from '../utils/app-error';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../config/constants';

/**
 * Store service — pure CRUD logic for admin store endpoints.
 *
 * All persistence/throwing lives here; the route layer is a thin validator +
 * serializer. Errors are thrown as `AppError` with appropriate HTTP codes so
 * the global Express error middleware translates them into responses.
 */

export interface ListStoresQuery {
  page: number;
  pageSize: number;
  search?: string;
  status?: string;
}

export interface CreateStoreInput {
  name: string;
  code: string;
  region?: string;
  address?: string;
  status?: number;
}

export interface UpdateStoreInput {
  name?: string;
  code?: string;
  region?: string;
  address?: string;
  status?: number;
}

/**
 * Type guard: narrows a thrown value to Sequelize's unique-constraint error,
 * OR catches the looser "Validation error: Duplicate ..." shapes some Sequelize
 * versions / dialects emit. Used to surface HTTP 409 instead of 500 on
 * duplicate store codes.
 */
function isUniqueViolation(err: unknown): boolean {
  if (err instanceof UniqueConstraintError) return true;
  if (!(err instanceof Error)) return false;
  if (err.message.includes('unique') || err.message.includes('Duplicate')) {
    return true;
  }
  if (Array.isArray((err as { errors?: unknown }).errors)) {
    const errors = (err as unknown as { errors: Array<{ message?: string; type?: string }> }).errors;
    return errors.some(
      (e) =>
        (e.message ?? '').includes('unique') || e.type === 'unique violation',
    );
  }
  return false;
}

export async function listStores(query: ListStoresQuery) {
  const { page: rawPage, pageSize: rawPageSize, search, status } = query;
  const page = Math.max(1, rawPage || 1);
  const pageSize = Math.max(
    1,
    Math.min(MAX_PAGE_SIZE, rawPageSize || DEFAULT_PAGE_SIZE),
  );

  // Build the filter as a list of conditions combined with Op.and. Sequelize's
  // `WhereOptions` is a union that cannot express a single object holding both
  // attribute keys (e.g. `status`) and operator keys (e.g. `Op.or`) — wrapping
  // each condition separately keeps the typing sound without `any`. The
  // generated SQL is identical to the previous inline `where[Op.or]` form.
  const conditions: WhereOptions<Attributes<Store>>[] = [];
  if (status !== undefined) {
    conditions.push({ status: parseInt(status, 10) });
  }
  if (search) {
    conditions.push({
      [Op.or]: [
        { name: { [Op.like]: `%${search}%` } },
        { code: { [Op.like]: `%${search}%` } },
      ],
    });
  }
  const where: WhereOptions<Attributes<Store>> =
    conditions.length > 0 ? { [Op.and]: conditions } : {};

  const { rows, count } = await StoreModel.findAndCountAll({
    where,
    order: [['createdAt', 'DESC']],
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });

  return { rows, count, page, pageSize };
}

export async function getStore(id: number) {
  const store = await StoreModel.findByPk(id);
  if (!store) {
    throw new AppError('Store not found', 404);
  }
  return store;
}

export async function createStore(data: CreateStoreInput) {
  try {
    const store = await StoreModel.create({
      name: data.name,
      code: data.code,
      region: data.region,
      address: data.address,
      status: data.status ?? 1,
    });
    return store;
  } catch (err) {
    // Sequelize's UniqueConstraintError surfaces the wrapped ".message" as
    // "Validation error" — the real hint lives in err.errors[]. Detect any of
    // the known shapes to translate to a 409 rather than 500.
    if (isUniqueViolation(err)) {
      throw new AppError('Store code already exists', 409);
    }
    throw err;
  }
}

export async function updateStore(id: number, data: UpdateStoreInput) {
  const store = await StoreModel.findByPk(id);
  if (!store) {
    throw new AppError('Store not found', 404);
  }
  const { name, code, region, address, status } = data;
  await store.update({ name, code, region, address, status });
  return store;
}

export async function deleteStore(id: number) {
  const store = await StoreModel.findByPk(id);
  if (!store) {
    throw new AppError('Store not found', 404);
  }
  await store.destroy();
  return { success: true };
}
