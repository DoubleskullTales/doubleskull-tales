import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const tales = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/tales' }),
  schema: z.object({
    title: z.string(),
    subtitle: z.string().optional(),
    date: z.coerce.date(),
    section: z.enum(['The Daily Skull', 'Team Portraits', 'Orcs Illustrated', 'Coaching Corner']),
    image: z.string().optional(),
    imageCaption: z.string().optional(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { tales };
