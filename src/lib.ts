import { getCollection } from 'astro:content';
export async function getTales() {
  const all = await getCollection('tales', ({ data }) => !data.draft);
  return all.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}
