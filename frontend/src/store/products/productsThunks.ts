import { createAsyncThunk } from '@reduxjs/toolkit';
import { isAxiosError } from 'axios';
import { api } from '@/api/axios';
import { getApiErrorMessage } from '@/api/errors';
import type { FetchProductsParams, Product, ProductInput, ProductSaveError, ProductsPage } from '@/types/productTypes';

// The page keeps the list itself (like Team Members); these only talk to the server

export const fetchProducts = createAsyncThunk('products/fetch', async (params: FetchProductsParams, { rejectWithValue }) => {
  try {
    const response = await api.get<ProductsPage>('/api/v1/products', { params });
    return response.data;
  } catch (err) {
    return rejectWithValue(getApiErrorMessage(err, "Couldn't load products"));
  }
});

export const fetchProductCategories = createAsyncThunk('products/fetchCategories', async (_, { rejectWithValue }) => {
  try {
    const response = await api.get<{ categories: string[] }>('/api/v1/products/categories');
    return response.data.categories;
  } catch (err) {
    return rejectWithValue(getApiErrorMessage(err, "Couldn't load categories"));
  }
});

// 409 = the name is already used: the form shows it on the Name field
function saveError(err: unknown): ProductSaveError {
  const field = isAxiosError(err) && err.response?.status === 409 ? 'name' : null;
  return { message: getApiErrorMessage(err, 'Failed to save the product'), field };
}

export const createProduct = createAsyncThunk('products/create', async (payload: ProductInput, { rejectWithValue }) => {
  try {
    const response = await api.post<Product>('/api/v1/products', payload);
    return response.data;
  } catch (err) {
    return rejectWithValue(saveError(err));
  }
});

export const updateProduct = createAsyncThunk(
  'products/update',
  async ({ id, ...changes }: Partial<ProductInput> & { id: number }, { rejectWithValue }) => {
    try {
      const response = await api.patch<Product>(`/api/v1/products/${id}`, changes);
      return response.data;
    } catch (err) {
      return rejectWithValue(saveError(err));
    }
  }
);

export const archiveProduct = createAsyncThunk('products/archive', async (id: number, { rejectWithValue }) => {
  try {
    const response = await api.post<Product>(`/api/v1/products/${id}/archive`);
    return response.data;
  } catch (err) {
    return rejectWithValue(getApiErrorMessage(err, 'Failed to archive the product'));
  }
});

export const restoreProduct = createAsyncThunk('products/restore', async (id: number, { rejectWithValue }) => {
  try {
    const response = await api.post<Product>(`/api/v1/products/${id}/restore`);
    return response.data;
  } catch (err) {
    return rejectWithValue(getApiErrorMessage(err, 'Failed to restore the product'));
  }
});

// +1 / -1 from the list; the server never lets stock go below 0
export const adjustStock = createAsyncThunk('products/adjustStock', async ({ id, change }: { id: number; change: number }, { rejectWithValue }) => {
  try {
    const response = await api.post<Product>(`/api/v1/products/${id}/stock`, { change });
    return response.data;
  } catch (err) {
    return rejectWithValue(getApiErrorMessage(err, "Couldn't update the stock"));
  }
});
