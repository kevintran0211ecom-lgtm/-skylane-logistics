import "server-only";

/**
 * Lưu ảnh minh chứng lên Supabase Storage (bucket riêng tư "receipt-proofs") qua REST API.
 * Chỉ chạy phía server bằng SUPABASE_SERVICE_ROLE_KEY; người dùng xem ảnh qua signed URL ngắn hạn.
 */
const BUCKET = "receipt-proofs";

function config() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY để lưu ảnh minh chứng.");
  return { base: `${url.replace(/\/$/, "")}/storage/v1`, headers: { Authorization: `Bearer ${key}`, apikey: key } };
}

const encodePath = (p: string) => p.split("/").map(encodeURIComponent).join("/");

export async function uploadProof(path: string, file: File): Promise<void> {
  const { base, headers } = config();
  const res = await fetch(`${base}/object/${BUCKET}/${encodePath(path)}`, {
    method: "POST",
    headers: { ...headers, "Content-Type": file.type || "application/octet-stream", "x-upsert": "false" },
    body: Buffer.from(await file.arrayBuffer()),
  });
  if (!res.ok) throw new Error(`Không tải được ảnh minh chứng lên Storage (${res.status}).`);
}

export async function deleteProofs(paths: string[]): Promise<void> {
  if (!paths.length) return;
  const { base, headers } = config();
  await fetch(`${base}/object/${BUCKET}`, {
    method: "DELETE",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ prefixes: paths }),
  }).catch(() => undefined);
}

export async function signedProofUrl(path: string, expiresIn = 300): Promise<string> {
  const { base, headers } = config();
  const res = await fetch(`${base}/object/sign/${BUCKET}/${encodePath(path)}`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn }),
  });
  if (!res.ok) throw new Error("Không lấy được đường dẫn ảnh.");
  const { signedURL } = (await res.json()) as { signedURL: string };
  return `${base}${signedURL}`;
}
