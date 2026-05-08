import { neon } from '@neondatabase/serverless';

export function sql() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is missing');
  return neon(process.env.DATABASE_URL);
}

export async function query(strings, ...values) {
  return sql()(strings, ...values);
}
