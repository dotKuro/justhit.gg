import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const reports = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/reports' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    publishDate: z.coerce.date(),
    /** Competitive format, e.g. "VGC Reg M-A". Shown as a header badge. */
    format: z.string().optional(),
    /** Event name, e.g. "Torino Special Event 2026". */
    event: z.string().optional(),
    /** Event tier. Special Events count as Regional. */
    tier: z.enum(['International', 'Regional', 'Local']).optional(),
    /** Final placement, e.g. "Top 128" or "1st". */
    placement: z.string().optional(),
    /** Free-form labels, e.g. "Ladder", "early meta". Shown as filterable chips. */
    tags: z.array(z.string()).default([]),
    /** Poképaste URL of the headline team — drives the team icons on the card. */
    paste: z.string().optional(),
  }),
});

const articles = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/articles' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    publishDate: z.coerce.date(),
    /** Free-form labels. Shown as filterable chips, like on reports. */
    tags: z.array(z.string()).default([]),
    /** Optional external link, e.g. the tool this article announces. */
    link: z.string().optional(),
    /** Label for that link; falls back to a generic UI string. */
    linkLabel: z.string().optional(),
  }),
});

export const collections = { reports, articles };
