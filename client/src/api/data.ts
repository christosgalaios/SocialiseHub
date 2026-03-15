const BASE = '/api/data';

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((body as { error?: string }).error || res.statusText);
  }
  return (await res.json()) as T;
}

export async function clearAllData(): Promise<{ cleared: string[]; message: string }> {
  const res = await fetch(`${BASE}/all`, { method: 'DELETE' });
  return json(res);
}

export async function clearCategory(category: string): Promise<{ cleared: string[]; message: string }> {
  const res = await fetch(`${BASE}/${category}`, { method: 'DELETE' });
  return json(res);
}
