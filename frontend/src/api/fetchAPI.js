const BASE_URL = "http://localhost:3000";

export const get = async (path) => {
  const res = await fetch(BASE_URL + path);

  if (!res.ok) throw new Error("API error");

  return res.json();
};
