import pkg from "pg";
const { Pool } = pkg;
import dotenv from "dotenv";
dotenv.config();

const pool = new Pool({
  connectionString: process.env.PG_CONNECTION,
});

export async function query(text, params) {
  const res = await pool.query(text, params);
  return res;
}

export default pool;
